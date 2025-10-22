import { useRef, useEffect, useState } from 'react';
import { PageNode } from '../utils/urlAnalyzer';

interface SitemapCanvasProps {
  nodes: PageNode[];
  onNodeClick?: (node: PageNode) => void;
  layoutType: 'force' | 'hierarchical';
}

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

export function SitemapCanvas({ nodes, onNodeClick }: SitemapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    drawLinks(ctx, nodes);
    drawNodes(ctx, nodes, hoveredNode);

    ctx.restore();
  }, [nodes, transform, hoveredNode]);

  const drawLinks = (ctx: CanvasRenderingContext2D, nodes: PageNode[]) => {
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
  };

  const drawNodes = (ctx: CanvasRenderingContext2D, nodes: PageNode[], hoveredId: string | null) => {
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;

      const isHovered = node.id === hoveredId;
      const radius = isHovered ? 45 : 40;

      ctx.fillStyle = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
      ctx.strokeStyle = isHovered ? '#000000' : '#ffffff';
      ctx.lineWidth = isHovered ? 3 : 2;

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
        let displayLine = textLine;
        if (i === 1 && lines.length > 2) {
          displayLine = textLine.substring(0, 8) + '...';
        }
        ctx.fillText(displayLine, node.x ?? 0, startY + i * lineHeight);
      });

      if (isHovered) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const urlText = node.url.length > 40 ? node.url.substring(0, 40) + '...' : node.url;
        const metrics = ctx.measureText(urlText);
        const padding = 8;

        ctx.fillRect(
          (node.x ?? 0) - metrics.width / 2 - padding,
          (node.y ?? 0) + radius + 10,
          metrics.width + padding * 2,
          20
        );

        ctx.fillStyle = '#ffffff';
        ctx.fillText(urlText, node.x ?? 0, (node.y ?? 0) + radius + 20);
      }
    });
  };

  const getNodeAtPosition = (x: number, y: number): PageNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const canvasX = (x - rect.left - transform.x) / transform.scale;
    const canvasY = (y - rect.top - transform.y) / transform.scale;

    return nodes.find(node => {
      if (node.x === undefined || node.y === undefined) return false;
      const dx = node.x - canvasX;
      const dy = node.y - canvasY;
      return Math.sqrt(dx * dx + dy * dy) <= 40;
    }) || null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const node = getNodeAtPosition(e.clientX, e.clientY);
    if (node && onNodeClick) {
      onNodeClick(node);
      return;
    }

    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const node = getNodeAtPosition(e.clientX, e.clientY);
    setHoveredNode(node ? node.id : null);

    if (isDragging) {
      setTransform({
        ...transform,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(3, transform.scale * delta));

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
    const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

    setTransform({ x: newX, y: newY, scale: newScale });
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const centerX = (container.clientWidth - canvas.width) / 2;
    const centerY = (container.clientHeight - canvas.height) / 2;
    setTransform({ x: centerX, y: centerY, scale: 1 });
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-white">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="cursor-move"
      />
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={() => setTransform({ ...transform, scale: Math.min(3, transform.scale * 1.2) })}
          className="px-3 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          +
        </button>
        <button
          onClick={() => setTransform({ ...transform, scale: Math.max(0.1, transform.scale * 0.8) })}
          className="px-3 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
