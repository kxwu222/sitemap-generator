import { PageNode } from './urlAnalyzer';
import { LinkStyle } from '../types/linkStyle';

export async function exportToPNG(
  nodes: PageNode[],
  extraLinks?: Array<{ sourceId: string; targetId: string }>,
  linkStyles?: Record<string, LinkStyle>,
  scale: number = 1.8,
  figures: Array<{ id: string; type: 'text'; x: number; y: number; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold' }> = [],
  backgroundColor?: string
): Promise<void> {
  // Calculate bounds to include all nodes with proper padding
  const bounds = calculateNodeBounds(nodes);
  const padding = 300; // Extra padding around the content for safety
  const width = bounds.width + (padding * 2);
  const height = bounds.height + (padding * 2);
  
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  
  // Fill background if specified (otherwise transparent)
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Offset all nodes by padding to center them
  const offsetNodes = nodes.map(node => ({
    ...node,
    x: node.x !== undefined ? node.x - bounds.minX + padding : undefined,
    y: node.y !== undefined ? node.y - bounds.minY + padding : undefined,
  }));

  // Offset extra links
  const offsetExtraLinks = (extraLinks || []).map(link => {
    const source = offsetNodes.find(n => n.id === link.sourceId);
    const target = offsetNodes.find(n => n.id === link.targetId);
    return { sourceId: link.sourceId, targetId: link.targetId, source, target };
  });

  drawSitemapToContext(ctx, offsetNodes, offsetExtraLinks, linkStyles);

  // Draw text figures
  const offsetText = (figures || [])
    .filter(f => f.type === 'text')
    .map(f => ({
      ...f,
      x: f.x - bounds.minX + padding,
      y: f.y - bounds.minY + padding,
    }));

  ctx.save();
  offsetText.forEach(f => {
    const color = f.textColor || '#000000';
    const fontSize = f.fontSize ?? 18;
    const fontWeight = f.fontWeight ?? 'bold';
    ctx.fillStyle = color;
    ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (f.text && f.text.trim()) {
      ctx.fillText(f.text, f.x, f.y);
    }
  });
  ctx.restore();

  canvas.toBlob(blob => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `sitemap-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  });
}

// SVG export removed per request

export function exportToCSV(nodes: PageNode[]): void {
  // Helper function to properly escape CSV fields
  const escapeCSV = (cell: string): string => {
    if (!cell) return '';
    const needsQuotes = cell.includes(',') || 
                       cell.includes('"') || 
                       cell.includes('\n') || 
                       cell.includes('\r');
    
    if (needsQuotes) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  // Helper function to get parent URL
  const getParentURL = (node: PageNode, nodeMap: Map<string, PageNode>): string => {
    if (!node.parent) return '';
    const parent = nodeMap.get(node.parent);
    return parent ? parent.url : '';
  };

  // Create node map for efficient lookups
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nowDate = new Date();
  const dd = String(nowDate.getDate()).padStart(2, '0');
  const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
  const yyyy = nowDate.getFullYear();
  const now = `${dd}-${mm}-${yyyy}`;

  // Professional headers for business use
  const headers = [
    'URL',
    'Title',
    'Parent URL',
    'Category',
    'Content Type',
    'Last Updated',
    'Depth Level'
  ];

  const rows = nodes.map(node => [
    node.url || '',
    node.title || '',
    getParentURL(node, nodeMap),
    node.category || '',
    node.contentType || '',
    node.lastUpdated || '',
    node.depth.toString()
  ]);

  // Add BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => escapeCSV(cell)).join(',')),
  ].join('\r\n'); // Use \r\n for Windows/Excel compatibility

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap-export-${now}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToXMLSitemap(nodes: PageNode[], preview: boolean = false): void {
  // Helper function to escape XML special characters
  const escapeXML = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper function to normalize and validate URLs
  const normalizeURL = (url: string): string | null => {
    if (!url || !url.trim()) {
      return null;
    }
    
    const trimmed = url.trim();
    
    // If URL already has a protocol, validate it
    if (trimmed.match(/^https?:\/\//i)) {
      try {
        new URL(trimmed);
        return trimmed;
      } catch {
        return null;
      }
    }
    
    // If URL doesn't have a protocol, try adding https://
    try {
      const normalized = trimmed.startsWith('//') 
        ? `https:${trimmed}` 
        : `https://${trimmed}`;
      new URL(normalized); // Validate it can be parsed
      return normalized;
    } catch {
      // If it still fails, return the original if it looks like a URL
      // This allows relative URLs or other formats to be exported
      return trimmed.length > 0 ? trimmed : null;
    }
  };

  // Helper function to calculate priority based on depth
  const calculatePriority = (depth: number): number => {
    const priority = Math.max(0.1, Math.min(1.0, 1.0 - (depth * 0.1)));
    return Math.round(priority * 10) / 10; // Round to 1 decimal place
  };

  // Helper function to format lastmod date
  const formatLastmod = (lastUpdated?: string): string => {
    if (lastUpdated) {
      // Validate and use the provided date (YYYY-MM-DD format is valid for XML sitemaps)
      const dateMatch = lastUpdated.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        return dateMatch[0]; // Return YYYY-MM-DD format
      }
    }
    // Use current date if lastUpdated is not available or invalid
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to get changefreq (default: monthly)
  const getChangefreq = (): string => {
    return 'monthly';
  };

  // Generate URL entries with all optional elements for Drupal compatibility
  const urlEntries = nodes
    .filter(node => node.url && node.url.trim())
    .map(node => {
      const normalized = normalizeURL(node.url);
      return normalized ? { node, url: normalized } : null;
    })
    .filter((entry): entry is { node: PageNode; url: string } => entry !== null)
    .map(({ node, url }) => {
      const escaped = escapeXML(url);
      const lastmod = formatLastmod(node.lastUpdated);
      const changefreq = getChangefreq();
      const priority = calculatePriority(node.depth);
      
      return `  <url>
    <loc>${escaped}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    });

  if (urlEntries.length === 0) {
    console.warn('No valid URLs found for sitemap export');
    return;
  }

  // Construct XML sitemap (compliant with sitemaps.org protocol and Drupal-compatible)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const blobUrl = URL.createObjectURL(blob);
  
  if (preview) {
    // Open in new tab for preview
    const previewWindow = window.open(blobUrl, '_blank');
    if (previewWindow) {
      // Clean up the blob URL after a delay to allow the browser to load it
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } else {
      // If popup was blocked, fall back to download
      const link = document.createElement('a');
      link.download = `sitemap.xml`;
      link.href = blobUrl;
      link.click();
      URL.revokeObjectURL(blobUrl);
    }
  } else {
    // Download as before
    const link = document.createElement('a');
    link.download = `sitemap.xml`;
    link.href = blobUrl;
    link.click();
    URL.revokeObjectURL(blobUrl);
  }
}

function calculateNodeBounds(nodes: PageNode[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    if (node.x !== undefined && node.y !== undefined) {
      // Account for node dimensions - use generous estimate to avoid clipping
      // Calculate based on actual content
      const titleLength = node.title.length;
      const subtitle = node.contentType ? `(${node.contentType}) ${node.url}` : node.url;
      const subtitleLength = subtitle.length;
      const maxTextLength = Math.max(titleLength, subtitleLength);
      // Be more generous with width calculation to account for longer URLs and titles
      const maxWidth = 380; // Maximum width to prevent nodes from becoming too wide
      const nodeWidth = Math.min(maxWidth, Math.max(150, maxTextLength * 8 + 60)); // 3:2 ratio - width, capped at maxWidth
      const nodeHeight = 100; // 3:2 ratio - height (150:100 = 3:2)
      
      minX = Math.min(minX, node.x - nodeWidth / 2);
      minY = Math.min(minY, node.y - nodeHeight / 2);
      maxX = Math.max(maxX, node.x + nodeWidth / 2);
      maxY = Math.max(maxY, node.y + nodeHeight / 2);
    }
  });

  // Ensure we have valid bounds
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// Helper function to calculate optimal elbow corner based on relative node positions
function calculateElbowCorner(source: PageNode, target: PageNode): { elbowX: number; elbowY: number } {
  if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) {
    // Fallback to original behavior if positions are undefined
    return { elbowX: source.x ?? 0, elbowY: target.y ?? 0 };
  }

  const dx = Math.abs(target.x - source.x);
  const dy = Math.abs(target.y - source.y);

  // Choose path direction based on which distance is greater
  // If horizontal distance is greater, go horizontal first (elbow at target.x, source.y)
  // If vertical distance is greater, go vertical first (elbow at source.x, target.y)
  // If equal, default to horizontal-first for consistency
  if (dx >= dy) {
    // Go horizontal first: source -> (target.x, source.y) -> target
    return { elbowX: target.x, elbowY: source.y };
  } else {
    // Go vertical first: source -> (source.x, target.y) -> target
    return { elbowX: source.x, elbowY: target.y };
  }
}

function drawSitemapToContext(
  ctx: CanvasRenderingContext2D,
  nodes: PageNode[],
  offsetExtraLinks?: Array<{ sourceId: string; targetId: string; source?: PageNode; target?: PageNode }>,
  linkStyles?: Record<string, LinkStyle>
): void {
  const CATEGORY_COLORS: Record<string, string> = {
    root: '#ffffff',
    content: '#ffffff',
    products: '#ffffff',
    company: '#ffffff',
    support: '#ffffff',
    technical: '#ffffff',
    users: '#ffffff',
    general: '#ffffff',
  };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Helper function to get link key
  const linkKey = (sourceId: string, targetId: string) => `${sourceId}-${targetId}`;

  // Draw parent-child hierarchical links first (match on-canvas behavior)
  nodes.forEach(node => {
    if (!node.parent) return;
    const parent = nodeMap.get(node.parent);
    if (!parent || node.x === undefined || node.y === undefined || parent.x === undefined || parent.y === undefined) return;

    const key = linkKey(parent.id, node.id);
    const style = linkStyles?.[key] || {};

    // Apply styling (same defaults as canvas)
    ctx.strokeStyle = style.color ?? '#111827';
    ctx.lineWidth = style.width ?? 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dash = style.dash ?? 'solid';
    if (dash === 'dashed') {
      ctx.setLineDash([6, 4]);
    } else if (dash === 'dotted') {
      ctx.setLineDash([2, 3]);
    } else {
      ctx.setLineDash([]);
    }

    const path = style.path || 'elbow';
    const { elbowX, elbowY } = path === 'elbow' ? calculateElbowCorner(parent, node) : { elbowX: parent.x, elbowY: node.y };

    ctx.beginPath();
    if (path === 'straight') {
      ctx.moveTo(parent.x, parent.y);
      ctx.lineTo(node.x, node.y);
    } else if (path === 'elbow') {
      ctx.moveTo(parent.x, parent.y);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(node.x, node.y);
    } else if (path === 'curved') {
      const cx = (parent.x + node.x) / 2;
      const cy = Math.min(parent.y, node.y) - 50;
      ctx.moveTo(parent.x, parent.y);
      ctx.quadraticCurveTo(cx, cy, node.x, node.y);
    }
    ctx.stroke();
    ctx.setLineDash([]); // reset
  });

  // Draw extra (non-hierarchical) links on top
  if (offsetExtraLinks) {
    offsetExtraLinks.forEach(linkObj => {
      const source = linkObj.source || nodeMap.get(linkObj.sourceId);
      const target = linkObj.target || nodeMap.get(linkObj.targetId);
      
      if (!source || !target || source.x === undefined || source.y === undefined || 
          target.x === undefined || target.y === undefined) return;
      
      const key = linkKey(linkObj.sourceId, linkObj.targetId);
      const style = linkStyles?.[key] || {};
      
      // Apply styling
      ctx.strokeStyle = style.color ?? '#111827';
      ctx.lineWidth = style.width ?? 2;
      
      // Apply dash pattern
      const dash = style.dash ?? 'solid';
      if (dash === 'dashed') {
        ctx.setLineDash([6, 4]);
      } else if (dash === 'dotted') {
        ctx.setLineDash([2, 3]);
      } else {
        ctx.setLineDash([]);
      }
      
      const path = style.path || 'straight';
      const { elbowX, elbowY } = path === 'elbow' ? calculateElbowCorner(source, target) : { elbowX: source.x, elbowY: target.y };
      
      ctx.beginPath();
      if (path === 'straight') {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      } else if (path === 'elbow') {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(elbowX, elbowY);
        ctx.lineTo(target.x, target.y);
      } else if (path === 'curved') {
        const cx = (source.x + target.x) / 2;
        const cy = Math.min(source.y, target.y) - 50;
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(cx, cy, target.x, target.y);
      }
      
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash
    });
  }

  // Draw nodes
  nodes.forEach(node => {
    if (node.x === undefined || node.y === undefined) return;

    const dimensions = calculateNodeDimensions(node, ctx);
    
    // Draw rounded rectangle background
    const nodeColor = node.customColor || CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
    ctx.fillStyle = nodeColor;
    ctx.strokeStyle = '#000000'; // Black border
    ctx.lineWidth = 2;

    drawRoundedRect(
      ctx,
      node.x - dimensions.width / 2,
      node.y - dimensions.height / 2,
      dimensions.width,
      dimensions.height,
      8
    );
    ctx.fill();
    ctx.stroke();

    // Calculate consistent width for title and URL containers
    const textContainerWidth = dimensions.width - 20;
    
    // Draw content type (if exists) at the top
    if (node.contentType) {
      const contentTypeColor = node.textColor ? `${node.textColor}AA` : 'rgba(0, 0, 0, 0.6)';
      ctx.fillStyle = contentTypeColor;
      ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const contentTypeY = node.y - 25; // Top position
      const contentTypeText = truncateText(ctx, node.contentType, textContainerWidth);
      ctx.fillText(contentTypeText, node.x, contentTypeY);
    }

    // Draw title text in the middle
    const titleColor = node.textColor || '#000000'; // Default to black text
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleY = node.y - 5; // Middle position (adjusted for content type above)
    const titleText = truncateText(ctx, node.title, textContainerWidth);
    ctx.fillText(titleText, node.x, titleY);

    // Draw URL at the bottom
    const urlColor = node.textColor ? `${node.textColor}CC` : 'rgba(0, 0, 0, 0.8)'; // Default to black with transparency
    ctx.fillStyle = urlColor;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    const urlY = node.y + 15; // Bottom position
    const urlText = truncateText(ctx, node.url, textContainerWidth);
    ctx.fillText(urlText, node.x, urlY);
  });
}

function calculateNodeDimensions(node: PageNode, ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const padding = 24;
  const minWidth = 150; // 3:2 ratio - width
  const maxWidth = 280; // Maximum width to prevent nodes from becoming too wide
  const minHeight = 100; // 3:2 ratio - height (150:100 = 3:2)

  // Measure title text
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const titleWidth = ctx.measureText(node.title).width;

  // Measure URL (now separate from content type)
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const urlWidth = ctx.measureText(node.url).width;

  // Measure content type if it exists (displayed separately above title)
  let contentTypeWidth = 0;
  if (node.contentType) {
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    contentTypeWidth = ctx.measureText(node.contentType).width;
  }

  // Use the maximum width of title, URL, and content type
  const contentWidth = Math.max(titleWidth, urlWidth, contentTypeWidth);
  const width = Math.min(maxWidth, Math.max(minWidth, contentWidth + padding));
  const height = minHeight;

  return { width, height };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
