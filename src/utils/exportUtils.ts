import { PageNode } from './urlAnalyzer';

export async function exportToPNG(
  nodes: PageNode[],
  scale: number = 2
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

  drawSitemapToContext(ctx, offsetNodes);

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

export function exportToSVG(nodes: PageNode[]): void {
  // Calculate bounds to include all nodes with proper padding
  const bounds = calculateNodeBounds(nodes);
  const padding = 300; // Extra padding around the content for safety
  const width = bounds.width + (padding * 2);
  const height = bounds.height + (padding * 2);
  
  // Offset all nodes by padding to center them
  const offsetNodes = nodes.map(node => ({
    ...node,
    x: node.x !== undefined ? node.x - bounds.minX + padding : undefined,
    y: node.y !== undefined ? node.y - bounds.minY + padding : undefined,
  }));
  
  const svg = generateSVG(offsetNodes, width, height);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap-${Date.now()}.svg`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToCSV(nodes: PageNode[]): void {
  const headers = ['ID', 'URL', 'Title', 'Depth', 'Parent', 'Category', 'X', 'Y'];
  const rows = nodes.map(node => [
    node.id,
    node.url,
    node.title,
    node.depth.toString(),
    node.parent || '',
    node.category,
    (node.x || 0).toFixed(2),
    (node.y || 0).toFixed(2),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap-${Date.now()}.csv`;
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

  // Get current date in ISO 8601 format for lastmod
  const now = new Date().toISOString();

  // Generate URL entries for each node that has a URL
  const urlEntries = nodes
    .filter(node => node.url && node.url.trim())
    .map(node => {
      const url = escapeXML(node.url.trim());
      // Set priority based on depth (root pages get 1.0, deeper pages get lower priority)
      const priority = Math.max(0.1, Math.min(1.0, 1.0 - (node.depth * 0.2)));
      
      return `  <url>
    <loc>${url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
    });

  // Construct the XML sitemap
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `sitemap-${Date.now()}.xml`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToHTML(nodes: PageNode[]): void {
  // Calculate bounds to include all nodes with proper padding
  const bounds = calculateNodeBounds(nodes);
  const padding = 300; // Extra padding around the content for safety
  const width = bounds.width + (padding * 2);
  const height = bounds.height + (padding * 2);
  
  // Offset all nodes by padding to center them
  const offsetNodes = nodes.map(node => ({
    ...node,
    x: node.x !== undefined ? node.x - bounds.minX + padding : undefined,
    y: node.y !== undefined ? node.y - bounds.minY + padding : undefined,
  }));
  
  const svg = generateSVG(offsetNodes, width, height);

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
      const urlLength = node.url.length;
      const maxTextLength = Math.max(titleLength, urlLength);
      // Be more generous with width calculation to account for longer URLs and titles
      const nodeWidth = Math.max(180, maxTextLength * 8 + 60); // Increased margin
      const nodeHeight = 60; // Increased to account for both title and URL lines
      
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
  nodes: PageNode[]
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

  // Draw links first
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 2;

  nodes.forEach(node => {
    if (node.parent) {
      const parent = nodeMap.get(node.parent);
      if (parent && node.x !== undefined && node.y !== undefined && parent.x !== undefined && parent.y !== undefined) {
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
      }
    }
  });

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

    // Draw URL subtitle
    const urlColor = node.textColor ? `${node.textColor}CC` : 'rgba(0, 0, 0, 0.8)'; // Default to black with transparency
    ctx.fillStyle = urlColor;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    const urlY = node.y + 8;
    const maxUrlWidth = dimensions.width - 20;
    const urlText = truncateText(ctx, node.url, maxUrlWidth);
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

  // Measure URL text
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const urlWidth = ctx.measureText(node.url).width;

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

function generateSVG(nodes: PageNode[], width = 1200, height = 800): string {
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

  let svgContent = '';

  // Draw links first
  nodes.forEach(node => {
    if (node.parent) {
      const parent = nodeMap.get(node.parent);
      if (parent && node.x !== undefined && node.y !== undefined && parent.x !== undefined && parent.y !== undefined) {
        svgContent += `<line x1="${parent.x}" y1="${parent.y}" x2="${node.x}" y2="${node.y}" stroke="#e0e0e0" stroke-width="2" />`;
      }
    }
  });

  // Draw nodes
  nodes.forEach(node => {
    if (node.x === undefined || node.y === undefined) return;

    const color = node.customColor || CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
    const textColor = node.textColor || '#000000'; // Default to black text
    
    // Calculate dimensions (simplified for SVG)
    const titleLength = node.title.length;
    const urlLength = node.url.length;
    const maxTextLength = Math.max(titleLength, urlLength);
    const nodeWidth = Math.max(180, maxTextLength * 8 + 60); // Match bounds calculation
    const nodeHeight = 60; // Match bounds calculation

    const x = node.x - nodeWidth / 2;
    const y = node.y - nodeHeight / 2;

    svgContent += `
      <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" ry="8" fill="${color}" stroke="#000000" stroke-width="2" />
      <text x="${node.x}" y="${node.y - 8}" text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="13" font-weight="bold">
        ${escapeXml(node.title)}
      </text>
      <text x="${node.x}" y="${node.y + 8}" text-anchor="middle" dominant-baseline="middle" fill="${textColor}CC" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="10">
        ${escapeXml(node.url)}
      </text>
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#ffffff" />
    ${svgContent}
  </svg>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
