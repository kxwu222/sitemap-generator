import { PageNode } from './urlAnalyzer';

export async function exportToPNG(
  nodes: PageNode[],
  width: number = 2400,
  height: number = 1600,
  scale: number = 2
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  drawSitemapToContext(ctx, nodes);

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

export function exportToSVG(nodes: PageNode[], width: number = 1200, height: number = 800): void {
  const svg = generateSVG(nodes, width, height);
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

export function exportToHTML(nodes: PageNode[]): void {
  const svg = generateSVG(nodes, 1200, 800);

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
          <div class="legend-color" style="background: #000000"></div>
          <span>Root</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #1a1a1a"></div>
          <span>Content</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #333333"></div>
          <span>Products</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #4d4d4d"></div>
          <span>Company</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #666666"></div>
          <span>Support</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #808080"></div>
          <span>Technical</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #999999"></div>
          <span>Users</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #b3b3b3"></div>
          <span>General</span>
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

function drawSitemapToContext(
  ctx: CanvasRenderingContext2D,
  nodes: PageNode[]
): void {
  const CATEGORY_COLORS: Record<string, string> = {
    root: '#000000',
    content: '#1a1a1a',
    products: '#333333',
    company: '#4d4d4d',
    support: '#666666',
    technical: '#808080',
    users: '#999999',
    general: '#b3b3b3',
  };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

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

  nodes.forEach(node => {
    if (node.x === undefined || node.y === undefined) return;

    const radius = 40;

    ctx.fillStyle = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = radius * 1.5;
    const words = node.title.split(' ');
    let line = '';
    const lines: string[] = [];

    words.forEach(word => {
      const testLine = line + (line ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    lines.push(line);

    const lineHeight = 14;
    const startY = node.y - ((lines.length - 1) * lineHeight) / 2;

    lines.slice(0, 2).forEach((textLine, i) => {
      ctx.fillText(textLine, node.x ?? 0, startY + i * lineHeight);
    });
  });
}

function generateSVG(nodes: PageNode[], width = 1200, height = 800): string {
  const CATEGORY_COLORS: Record<string, string> = {
    root: '#000000',
    content: '#1a1a1a',
    products: '#333333',
    company: '#4d4d4d',
    support: '#666666',
    technical: '#808080',
    users: '#999999',
    general: '#b3b3b3',
  };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  let svgContent = '';

  nodes.forEach(node => {
    if (node.parent) {
      const parent = nodeMap.get(node.parent);
      if (parent && node.x !== undefined && node.y !== undefined && parent.x !== undefined && parent.y !== undefined) {
        svgContent += `<line x1="${parent.x}" y1="${parent.y}" x2="${node.x}" y2="${node.y}" stroke="#e0e0e0" stroke-width="2" />`;
      }
    }
  });

  nodes.forEach(node => {
    if (node.x === undefined || node.y === undefined) return;

    const color = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
    const radius = 40;

    svgContent += `
      <circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${color}" stroke="#ffffff" stroke-width="2" />
      <text x="${node.x}" y="${node.y}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12" font-weight="bold">
        ${escapeXml(node.title)}
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
