import { PageNode } from './urlAnalyzer';
import { LinkStyle } from '../types/linkStyle';

export async function exportToPNG(
  nodes: PageNode[],
  extraLinks?: Array<{ sourceId: string; targetId: string }>,
  linkStyles?: Record<string, LinkStyle>,
  scale: number = 2,
  figures: Array<{ id: string; type: 'text'; x: number; y: number; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold' }> = []
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

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

export function exportToXMLSitemap(nodes: PageNode[]): void {
  // Helper function to escape XML special characters
  const escapeXML = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper function to validate URLs (only HTTP/HTTPS)
  const isValidURL = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  // Generate minimal URL entries (only required <loc> element)
  const urlEntries = nodes
    .filter(node => node.url && node.url.trim())
    .filter(node => isValidURL(node.url.trim()))
    .map(node => {
      const url = escapeXML(node.url.trim());
      return `  <url>
    <loc>${url}</loc>
  </url>`;
    });

  if (urlEntries.length === 0) {
    console.warn('No valid URLs found for sitemap export');
    return;
  }

  // Construct minimal XML sitemap (compliant with sitemaps.org protocol)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap.xml`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/* Removed unused exportToHTML()
  // Calculate bounds to include all nodes with proper padding
  const bounds = calculateNodeBounds(nodes);
  const padding = 300; // Extra padding around the content for safety
  const width = bounds.width + (padding * 2);
  const height = bounds.height + (padding * 2);
  
  // Offset all nodes by padding to center them
  // const offsetNodes = nodes.map(node => ({
  //   ...node,
  //   x: node.x !== undefined ? node.x - bounds.minX + padding : undefined,
  //   y: node.y !== undefined ? node.y - bounds.minY + padding : undefined,
  // }));
  
  // Note: SVG generation removed; exporting a static HTML with no embedded SVG
  const svg = '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Sitemap</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border: 1px solid #e0e0e0;
      padding: 20px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #000;
    }
    .controls {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 8px 16px;
      background: #000;
      color: #fff;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #333;
    }
    .svg-container {
      width: 100%;
      overflow: auto;
      border: 1px solid #e0e0e0;
    }
    svg {
      display: block;
    }
    .legend {
      margin-top: 20px;
      padding: 15px;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
    }
    .legend-title {
      font-weight: 600;
      margin-bottom: 10px;
    }
    .legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border: 1px solid #ccc;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Interactive Sitemap</h1>
    <div class="controls">
      <button onclick="zoomIn()">Zoom In</button>
      <button onclick="zoomOut()">Zoom Out</button>
      <button onclick="resetZoom()">Reset</button>
    </div>
    <div class="svg-container" id="svgContainer">
      ${svg}
    </div>
    <div class="legend">
      <div class="legend-title">Categories</div>
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-color" style="background: #ffffff; border: 1px solid #000000;"></div>
          <span>All Categories</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    let scale = 1;
    const svg = document.querySelector('svg');

    function zoomIn() {
      scale = Math.min(3, scale * 1.2);
      updateScale();
    }

    function zoomOut() {
      scale = Math.max(0.5, scale * 0.8);
      updateScale();
    }

    function resetZoom() {
      scale = 1;
      updateScale();
    }

    function updateScale() {
      if (svg) {
        svg.style.transform = \`scale(\${scale})\`;
        svg.style.transformOrigin = 'top left';
      }
    }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap-${Date.now()}.html`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
*/

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
      const nodeWidth = Math.max(180, maxTextLength * 8 + 60); // Increased margin
      const nodeHeight = 60; // Enough for title + subtitle
      
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
    const elbowX = parent.x;
    const elbowY = node.y;

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
      
      ctx.beginPath();
      if (path === 'straight') {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      } else if (path === 'elbow') {
        const elbowX = source.x;
        const elbowY = target.y;
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

    // Draw title text
    const titleColor = node.textColor || '#000000'; // Default to black text
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleY = node.y - 8;
    const maxTitleWidth = dimensions.width - 20;
    const titleText = truncateText(ctx, node.title, maxTitleWidth);
    ctx.fillText(titleText, node.x, titleY);

    // Draw subtitle: URL + optional content type
    const urlColor = node.textColor ? `${node.textColor}CC` : 'rgba(0, 0, 0, 0.8)'; // Default to black with transparency
    ctx.fillStyle = urlColor;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    const urlY = node.y + 8;
    const maxUrlWidth = dimensions.width - 20;
    const subtitleRaw = node.contentType ? `(${node.contentType}) ${node.url}` : node.url;
    const urlText = truncateText(ctx, subtitleRaw, maxUrlWidth);
    ctx.fillText(urlText, node.x, urlY);
  });
}

function calculateNodeDimensions(node: PageNode, ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const padding = 20;
  const minWidth = 120;
  const minHeight = 50;

  // Measure title text
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const titleWidth = ctx.measureText(node.title).width;

  // Measure subtitle text (URL + optional content type)
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const subtitleRaw = node.contentType ? `(${node.contentType}) ${node.url}` : node.url;
  const urlWidth = ctx.measureText(subtitleRaw).width;

  const contentWidth = Math.max(titleWidth, urlWidth);
  const width = Math.max(minWidth, contentWidth + padding);
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

// SVG generation helpers removed per request
