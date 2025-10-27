import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { PageNode } from '../utils/urlAnalyzer';
import { LinkStyle, LineDash, LinkPath, ArrowType } from '../types/linkStyle';
import { HoverToolbar } from './HoverToolbar';
import { SelectionToolbar } from './SelectionToolbar';
import { LinkEditorPopover } from './LinkEditorPopover';
import { ColorPickerPopover } from './ColorPickerPopover';
import { TitleEditorPopover } from './TitleEditorPopover';

interface SitemapCanvasProps {
  nodes: PageNode[];
  onNodeClick?: (node: PageNode) => void;
  onNodesUpdate?: (nodes: PageNode[]) => void;
  onNodesPreview?: (nodes: PageNode[]) => void;
  onMoveNodesToGroup?: (nodeIds: string[], group: string, opts?: { includeSubtree?: boolean; relayout?: boolean }) => void;
  onCreateGroupFromSelection?: (nodeIds: string[], groupName: string, opts?: { relayout?: boolean }) => void;
  onDeleteGroup?: (groupName: string) => void;
  // Deprecated: hierarchical re-parenting via connection. We keep it but do not use for Ctrl/Cmd drag.
  onConnectionCreate?: (sourceId: string, targetId: string) => void;
  // New: support extra (non-hierarchical) links that do not change parent
  extraLinks?: { sourceId: string; targetId: string }[];
  onExtraLinkCreate?: (sourceId: string, targetId: string) => void;
  onExtraLinkDelete?: (sourceId: string, targetId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  layoutType: 'grouped';
  searchResults?: PageNode[];
  focusedNode?: PageNode | null;
  onClearFocus?: () => void;
  colorOverrides?: Record<string, { customColor?: string; textColor?: string }>;
  onAddChild?: (parentId: string) => void;
  linkStyles?: Record<string, LinkStyle>;
  onLinkStyleChange?: (linkKey: string, style: LinkStyle) => void;
  onAddNode?: () => void;
}


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

export const SitemapCanvas = forwardRef<any, SitemapCanvasProps>(({ nodes, onNodeClick, onNodesUpdate, onNodesPreview, onMoveNodesToGroup, onCreateGroupFromSelection, onDeleteGroup, onConnectionCreate, extraLinks = [], onExtraLinkCreate, onExtraLinkDelete, onUndo, onRedo, searchResults = [], focusedNode, onClearFocus, colorOverrides = {}, onAddChild, linkStyles = {}, onLinkStyleChange, onAddNode }, ref) => {
  
  // Helper function to create link key
  const linkKey = (sourceId: string, targetId: string) => `${sourceId}-${targetId}`;
  
  // Small SVG preview for a link style option
  const MiniLinkIcon = ({
    dash = 'solid' as LineDash,
    path = 'elbow' as LinkPath,
    width = 2,
    color = '#333',
    arrowStart = false,
    arrowEnd = false,
    arrowType = 'triangle' as ArrowType,
    arrowSize = 10,
  }) => {
    const W = 40, H = 24;
    const x1 = 6, y1 = H - 6, x2 = W - 6, y2 = 6;
    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) - 6;

    const dashArray = dash === 'dashed' ? '6,4' : dash === 'dotted' ? '2,3' : '';

    const ArrowHead = ({ x, y, angle }: { x: number; y: number; angle: number }) => {
      const size = arrowSize;
      const fill = color;
      if (arrowType === 'triangle') {
        // Small triangle arrow
        const p1 = `${x},${y}`;
        const p2 = `${x - size},${y + size * 0.4}`;
        const p3 = `${x - size},${y - size * 0.4}`;
        return (
          <g transform={`rotate(${(angle * 180) / Math.PI} ${x} ${y})`}>
            <polygon points={`${p1} ${p2} ${p3}`} fill={fill} />
          </g>
        );
      }
      // vee
      return (
        <g transform={`rotate(${(angle * 180) / Math.PI} ${x} ${y})`}>
          <line x1={x} y1={y} x2={x - size} y2={y + size * 0.6} stroke={color} strokeWidth={Math.max(1, width)} />
          <line x1={x} y1={y} x2={x - size} y2={y - size * 0.6} stroke={color} strokeWidth={Math.max(1, width)} />
        </g>
      );
    };

    // angle helpers
    const angleStraight = Math.atan2(y2 - y1, x2 - x1);
    const angleElbowEnd = Math.atan2(y2 - y1, x2 - x2); // last segment vertical: (elbowX=x2)
    const angleElbowStart = Math.atan2(y1 - y1, x2 - x1); // first segment horizontal
    const angleCurvedEnd = Math.atan2(y2 - cy, x2 - cx);
    const angleCurvedStart = Math.atan2(cy - y1, cx - x1);

    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* path */}
        {path === 'straight' && (
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dashArray} />
        )}
        {path === 'elbow' && (
          <>
            <line x1={x1} y1={y1} x2={x2} y2={y1} stroke={color} strokeWidth={width} strokeDasharray={dashArray} />
            <line x1={x2} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeDasharray={dashArray} />
          </>
        )}
        {path === 'curved' && (
          <path
            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeDasharray={dashArray}
          />
        )}

        {/* arrowheads */}
        {arrowEnd &&
          (path === 'straight' ? (
            <ArrowHead x={x2} y={y2} angle={angleStraight} />
          ) : path === 'elbow' ? (
            <ArrowHead x={x2} y={y2} angle={Math.PI / 2} />
          ) : (
            <ArrowHead x={x2} y={y2} angle={angleCurvedEnd} />
          ))}
        {arrowStart &&
          (path === 'straight' ? (
            <ArrowHead x={x1} y={y1} angle={angleStraight + Math.PI} />
          ) : path === 'elbow' ? (
            <ArrowHead x={x1} y={y1} angle={0} />
          ) : (
            <ArrowHead x={x1} y={y1} angle={angleCurvedStart} />
          ))}
      </svg>
    );
  };

  // Active style helper for icon buttons
  const iconBtn = (active: boolean) =>
    `p-1.5 rounded border ${active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backgroundDownRef = useRef<{ x: number; y: number } | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false); // background panning (kept for compatibility)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragThreshold] = useState(5); // Minimum pixels to consider it a drag
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<PageNode | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSelectionIds, setDragSelectionIds] = useState<string[] | null>(null);
  const [dragStartPositions, setDragStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [highlightedLink, setHighlightedLink] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [cursorMode, setCursorMode] = useState<'select' | 'marquee'>('select');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    link: { sourceId: string; targetId: string } | null;
  } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isContextMenuDragging, setIsContextMenuDragging] = useState(false);
  const [contextMenuDragOffset, setContextMenuDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [showZoomDropdown, setShowZoomDropdown] = useState(false);
  const [marqueeSelection, setMarqueeSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    isActive: boolean;
  } | null>(null);
  const [initialTransform, setInitialTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // expose selection to parent (for sidebar interactions)
  useImperativeHandle(ref, () => ({
    getSelectedNodeIds: () => Array.from(selectedIds),
  }), [selectedIds]);
  const [connectionDraft, setConnectionDraft] = useState<{
    sourceId: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  
  // New toolbar states
  const [hoverToolbarNode, setHoverToolbarNode] = useState<PageNode | null>(null);
  const [hoverToolbarPosition, setHoverToolbarPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoverGraceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [linkEditorNode, setLinkEditorNode] = useState<string | null>(null);
  const [linkEditorPosition, setLinkEditorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerNodeIds, setColorPickerNodeIds] = useState<string[]>([]);
  const [colorPickerPosition, setColorPickerPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [originalColors, setOriginalColors] = useState<Record<string, { customColor?: string; textColor?: string }>>({});
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [titleEditorNode, setTitleEditorNode] = useState<string | null>(null);
  const [titleEditorPosition, setTitleEditorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [animationTime, setAnimationTime] = useState(0);

  // Close hover toolbar when any editor opens
  useEffect(() => {
    if (showLinkEditor || showColorPicker || showTitleEditor) {
      setHoverToolbarNode(null);
    }
  }, [showLinkEditor, showColorPicker, showTitleEditor]);

  // Close hover toolbar when nodes are selected
  useEffect(() => {
    if (selectedIds.size > 0) {
      setHoverToolbarNode(null);
    }
  }, [selectedIds]);

  // Grace period function for hover toolbar
  const clearHoverToolbarWithGrace = () => {
    if (hoverGraceTimeoutRef.current) {
      clearTimeout(hoverGraceTimeoutRef.current);
    }
    
    hoverGraceTimeoutRef.current = setTimeout(() => {
      setHoverToolbarNode(null);
    }, 300); // 300ms grace period
  };

  // Add native wheel event listener to prevent passive event issues
  // Rebind on transform changes to avoid stale closure
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [onClearFocus, transform]);

  // Click outside to close zoom dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showZoomDropdown) return;
      const target = event.target as Element;
      if (!target.closest('.zoom-dropdown-container')) {
        setShowZoomDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomDropdown]);

  // Animate the Deep Pink glow effect for focused nodes
  useEffect(() => {
    if (!focusedNode) {
      setAnimationTime(0);
      return;
    }

    let animationFrame: number;
    let startTime = performance.now();

    const animate = () => {
      const currentTime = performance.now();
      setAnimationTime(currentTime - startTime);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [focusedNode]);

  // Keyboard shortcuts for canvas selections only (no undo/redo here)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setHighlightedLink(null);
        setHoverToolbarNode(null);
        setShowLinkEditor(false);
        setShowColorPicker(false);
        setShowTitleEditor(false);
      }
      // Space key for panning
      if (e.code === 'Space' && !isSpacePressed) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      // V key for select mode
      if (e.key === 'v' || e.key === 'V') {
        setCursorMode('select');
      }
      // M key for marquee mode
      if (e.key === 'm' || e.key === 'M') {
        setCursorMode('marquee');
      }
      // Delete key for selected nodes (but not when typing in input fields)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        // Don't trigger if user is typing in an input field
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.hasAttribute('contenteditable')
        );
        
        if (!isTyping) {
          e.preventDefault();
          handleDeleteSelectedNodes();
        }
      }
      // A key for add child (when a single node is selected)
      if ((e.key === 'a' || e.key === 'A') && selectedIds.size === 1 && onAddChild) {
        const selectedNode = nodes.find(n => selectedIds.has(n.id));
        if (selectedNode) {
          onAddChild(selectedNode.id);
        }
      }
      // C key for color picker (when nodes are selected)
      if ((e.key === 'c' || e.key === 'C') && selectedIds.size > 0) {
        const selectedNode = nodes.find(n => selectedIds.has(n.id));
        if (selectedNode) {
          // Use center of canvas as position
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            handleColorClickForKeyboard(rect.width / 2, rect.height / 2);
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isSpacePressed, selectedIds, nodes, onAddChild]);


  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas size to match container with proper scaling for crisp text
    const rect = container.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Use effective node positions during drag for real-time link movement
    const effectiveNodes: PageNode[] = (draggedNode && dragDelta && dragSelectionIds)
      ? nodes.map(n => {
          if (!dragSelectionIds.includes(n.id)) return n;
          const start = dragStartPositions[n.id];
          if (!start) return n;
          const nx = start.x + dragDelta.dx;
          const ny = start.y + dragDelta.dy;
          return { ...n, x: nx, y: ny };
        })
      : nodes;

    drawLinks(ctx, effectiveNodes);
    drawNodes(ctx, effectiveNodes, hoveredNode);
    drawConnectionDraft(ctx, connectionDraft);
    drawMarqueeSelection(ctx, marqueeSelection);

    ctx.restore();
  }, [nodes, transform, hoveredNode, connectionDraft, searchResults, focusedNode, colorOverrides, selectedIds, marqueeSelection, highlightedLink, draggedNode, dragDelta, dragSelectionIds, dragStartPositions, animationTime]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const devicePixelRatio = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper function to draw arrowheads
  const drawArrowhead = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, style: LinkStyle) => {
    const size = style.arrowSize || 10;
    const type = style.arrowType || 'triangle';
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    if (type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size * 0.4);
      ctx.lineTo(-size, -size * 0.4);
      ctx.closePath();
      ctx.fillStyle = style.color || '#333';
      ctx.fill();
    } else if (type === 'vee') {
      ctx.strokeStyle = style.color || '#333';
      ctx.lineWidth = style.width || 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size * 0.6);
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size * 0.6);
      ctx.stroke();
    }
    
    ctx.restore();
  };

  // Helper function to calculate end angle for different path types
  const endAngleForPath = (path: LinkPath, x1: number, y1: number, x2: number, y2: number, elbowX?: number, elbowY?: number) => {
    if (path === 'straight') {
      return Math.atan2(y2 - y1, x2 - x1);
    } else if (path === 'elbow') {
      return Math.atan2(y2 - (elbowY || y1), x2 - (elbowX || x2));
    } else if (path === 'curved') {
      const cx = (x1 + x2) / 2;
      const cy = Math.min(y1, y2) - 50;
      return Math.atan2(y2 - cy, x2 - cx);
    }
    return 0;
  };

  const drawLinks = (ctx: CanvasRenderingContext2D, nodes: PageNode[]) => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Draw hierarchical links (parent-child) with orthogonal elbows for clearer vertical chart
    nodes.forEach(node => {
      if (!node.parent) return;
      const parent = nodeMap.get(node.parent);
      if (!parent || node.x === undefined || node.y === undefined || parent.x === undefined || parent.y === undefined) return;

      const isHighlighted = highlightedLink && highlightedLink.sourceId === parent.id && highlightedLink.targetId === node.id;
      const key = linkKey(parent.id, node.id);
      const style = linkStyles[key] || {};

      // Apply styling (for single node click highlighted color)
      ctx.strokeStyle = isHighlighted ? '#172038' : (style.color || '#333333');
      ctx.lineWidth = isHighlighted ? 3 : (style.width || 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Apply dash pattern
      const dash = style.dash || 'solid';
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
      ctx.setLineDash([]); // Reset dash
      
      // Draw arrowheads
      if (style.arrowStart) {
        const startAngle = endAngleForPath(path, node.x, node.y, parent.x, parent.y, elbowX, elbowY) + Math.PI;
        drawArrowhead(ctx, parent.x, parent.y, startAngle, style);
      }
      if (style.arrowEnd) {
        const endAngle = endAngleForPath(path, parent.x, parent.y, node.x, node.y, elbowX, elbowY);
        drawArrowhead(ctx, node.x, node.y, endAngle, style);
      }
    });

    // Draw extra (non-hierarchical) links on top
    extraLinks.forEach(link => {
      const s = nodeMap.get(link.sourceId), t = nodeMap.get(link.targetId);
      if (!s || !t || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) return;
      
      const isHighlighted = highlightedLink && highlightedLink.sourceId === link.sourceId && highlightedLink.targetId === link.targetId;
      const key = linkKey(link.sourceId, link.targetId);
      const style = linkStyles[key] || {};
      
      // Apply styling
      ctx.strokeStyle = isHighlighted ? '#172038' : (style.color || '#999999');
      ctx.lineWidth = isHighlighted ? 3 : (style.width || 1.5);
      
      // Apply dash pattern
      const dash = style.dash || 'dashed'; // Extra links default to dashed
      if (dash === 'dashed') {
      ctx.setLineDash(isHighlighted ? [] : [6, 4]);
      } else if (dash === 'dotted') {
        ctx.setLineDash([2, 3]);
      } else {
        ctx.setLineDash([]);
      }
      
      const path = style.path || 'straight';
      
      ctx.beginPath();
      if (path === 'straight') {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      } else if (path === 'elbow') {
        const elbowX = s.x;
        const elbowY = t.y;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(elbowX, elbowY);
        ctx.lineTo(t.x, t.y);
      } else if (path === 'curved') {
        const cx = (s.x + t.x) / 2;
        const cy = Math.min(s.y, t.y) - 50;
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(cx, cy, t.x, t.y);
      }
      
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash
      
      // Draw arrowheads
      if (style.arrowStart) {
        const startAngle = endAngleForPath(path, t.x, t.y, s.x, s.y) + Math.PI;
        drawArrowhead(ctx, s.x, s.y, startAngle, style);
      }
      if (style.arrowEnd) {
        const endAngle = endAngleForPath(path, s.x, s.y, t.x, t.y);
        drawArrowhead(ctx, t.x, t.y, endAngle, style);
      }
    });
  };

  const drawNodes = (ctx: CanvasRenderingContext2D, nodes: PageNode[], hoveredId: string | null) => {
    nodes.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;

      const isHovered = node.id === hoveredId;
      const isSearchResult = searchResults.some(result => result.id === node.id);
      const isSelected = selectedIds.has(node.id);
      
      // Don't highlight endpoint nodes when a link is highlighted
      const isLinkEndpoint = highlightedLink && 
        (node.id === highlightedLink.sourceId || node.id === highlightedLink.targetId);
      
      const dimensions = calculateNodeDimensions(node, ctx);

      // Draw shadow for hovered nodes
      if (isHovered) {
        ctx.save();
        ctx.shadowColor = 'rgba(123, 118, 118, 0.3)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 5;
      }

      // Highlight focused node with vibrant orange outline and shadow
      const isFocused = focusedNode && node.id === focusedNode.id;

      // Draw shadow and outline for focused nodes with pulsing animation
      if (isFocused && !isLinkEndpoint) {
        // Calculate pulsing opacity based on animation time
        const pulseSpeed = 2000; // 2 seconds per cycle (was 1.5s) - faster pulse
        // Less dramatic pulse: goes from 0.6 to 1.0 (was 0.2 to 1.0)
        const pulseValue = Math.sin((animationTime / pulseSpeed) * Math.PI * 2) * 0.2 + 0.8;
        const glowIntensity = pulseValue;
        const fadeIntensity = Math.abs(Math.sin((animationTime / pulseSpeed) * Math.PI)); // Fade from 0 to 1
        
        // Save context before drawing focus outline
        ctx.save();
        
        // Draw outer shadow with less dramatic glow effect
        ctx.shadowColor = `rgba(255, 20, 147, ${0.3 * fadeIntensity})`; // Reduced shadow opacity from 0.8 to 0.3
        ctx.shadowBlur = 4 + glowIntensity * 4; // Reduced blur: pulsing between 4-8 (was 8-16)
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw a slightly larger rectangle for the glow
        drawRoundedRect(
          ctx,
          node.x - dimensions.width / 2 - 4,
          node.y - dimensions.height / 2 - 4,
          dimensions.width + 8,
          dimensions.height + 8,
          20
        );
        
        // Animated border with less dramatic pulse - from 'Search' function
        ctx.strokeStyle = '#8BD3E6'; // Light blue color
        ctx.lineWidth = 3 + glowIntensity * 1; // Pulsing line width between 3-4px
        
        ctx.stroke();
        ctx.restore();
      }

      // Draw rounded rectangle background
      const override = colorOverrides[node.id] || {};
      const nodeColor = override.customColor || node.customColor || CATEGORY_COLORS[node.category] || CATEGORY_COLORS.general;
      ctx.fillStyle = nodeColor;
      
      // Apply border styling (but not for focused nodes, they get special treatment above)
      if (isFocused && !isLinkEndpoint) {
        // Skip normal border for focused nodes (already drawn with glow above)
      } else if ((isSearchResult || isSelected) && !isLinkEndpoint) {
        // Regular blue border for search results and selected nodes
        ctx.strokeStyle = '#172038';
        ctx.lineWidth = 4;
      } else if (isHovered) {
        ctx.strokeStyle = '#172038';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
      }

      drawRoundedRect(
        ctx,
        node.x - dimensions.width / 2,
        node.y - dimensions.height / 2,
        dimensions.width,
        dimensions.height,
        16
      );
      ctx.fill();
      ctx.stroke();

      // Restore shadow context for hovered nodes
      if (isHovered) {
        ctx.restore();
      }


      // Do not outline endpoints when a link is highlighted

      // Draw title text with improved typography - centered in node
      const titleColor = override.textColor || node.textColor || '#000000'; // Default to black text
      ctx.fillStyle = titleColor;
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const titleY = node.y; // Center vertically in node
      const maxTitleWidth = dimensions.width - 32; // More padding
      const titleText = truncateText(ctx, node.title, maxTitleWidth);
      ctx.fillText(titleText, node.x, titleY);

      // Removed hover tooltip to avoid overlay with HoverToolbar
      // URL editing now handled by HoverToolbar -> Link button
    });
  };


  const calculateNodeDimensions = (node: PageNode, ctx: CanvasRenderingContext2D): { width: number; height: number } => {
    const padding = 32; // Increased padding to match reference image
    const minWidth = 160; // Larger minimum width for better readability
    const minHeight = 50; // Reduced height since we only show title

    // Measure title text only
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const titleWidth = ctx.measureText(node.title).width;

    const width = Math.max(minWidth, titleWidth + padding);
    const height = minHeight;

    return { width, height };
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
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
  };

  const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  };

  const drawHoverTooltip = (ctx: CanvasRenderingContext2D, node: PageNode, dimensions: { width: number; height: number }) => {
    if (node.x === undefined || node.y === undefined) return;
    
    const tooltipPadding = 16;
    
    // Create tooltip with URL only
    const urlText = node.url;
    
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const urlMetrics = ctx.measureText(urlText);
    
    const tooltipWidth = urlMetrics.width + tooltipPadding * 2;
    const tooltipHeight = 24 + tooltipPadding * 2;

    // Position tooltip above the node
    const tooltipX = node.x - tooltipWidth / 2;
    const tooltipY = node.y - dimensions.height / 2 - tooltipHeight - 10;

    // Draw tooltip background with shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(tooltipX + 2, tooltipY + 2, tooltipWidth, tooltipHeight);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // Draw tooltip border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // Draw URL text only
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(urlText, node.x, tooltipY + tooltipHeight / 2);
  };

  const drawMarqueeSelection = (ctx: CanvasRenderingContext2D, marquee: typeof marqueeSelection) => {
    if (!marquee?.isActive) return;

    const left = Math.min(marquee.startX, marquee.endX);
    const right = Math.max(marquee.startX, marquee.endX);
    const top = Math.min(marquee.startY, marquee.endY);
    const bottom = Math.max(marquee.startY, marquee.endY);

    // Draw marquee rectangle
    ctx.strokeStyle = '#172038';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(left, top, right - left, bottom - top);

    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(left, top, right - left, bottom - top);

    ctx.setLineDash([]);
  };

  const drawConnectionDraft = (ctx: CanvasRenderingContext2D, draft: { sourceId: string; mouseX: number; mouseY: number } | null) => {
    if (!draft) return;

    const sourceNode = nodes.find(n => n.id === draft.sourceId);
    if (!sourceNode || sourceNode.x === undefined || sourceNode.y === undefined) return;

    ctx.strokeStyle = '#8BD3E6';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(draft.mouseX, draft.mouseY);
    ctx.stroke();
    
    ctx.setLineDash([]);
  };

  const getLinks = () => {
    const treeLinks = nodes.filter(n => n.parent).map(n => ({ sourceId: n.parent!, targetId: n.id }));
    const merged = [...treeLinks, ...extraLinks];
    // Deduplicate
    const seen = new Set<string>();
    const unique: { sourceId: string; targetId: string }[] = [];
    for (const l of merged) {
      const k = `${l.sourceId}->${l.targetId}`;
      if (!seen.has(k)) { unique.push(l); seen.add(k); }
    }
    return unique;
  };

  const pointToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left - transform.x) / transform.scale;
    const cy = (clientY - rect.top - transform.y) / transform.scale;
    return { cx, cy };
  };

  const distPointToSegment = (px:number, py:number, x1:number, y1:number, x2:number, y2:number) => {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A*C + B*D, lenSq = C*C + D*D;
    let t = lenSq ? dot / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const x = x1 + t * C, y = y1 + t * D;
    const dx = px - x, dy = py - y;
    return Math.sqrt(dx*dx + dy*dy);
  };

  const getLinkAtPosition = (clientX: number, clientY: number, tol = 6) => {
    const { cx, cy } = pointToCanvas(clientX, clientY);
    let best: { sourceId: string; targetId: string } | null = null;
    let bestDist = Infinity;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    for (const link of getLinks()) {
      const s = nodeMap.get(link.sourceId), t = nodeMap.get(link.targetId);
      if (!s || !t || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
      
      const key = linkKey(link.sourceId, link.targetId);
      const style = linkStyles[key] || {};
      const path = style.path || (link.sourceId === t.parent ? 'elbow' : 'straight'); // Default to elbow for hierarchical links
      
      let d = Infinity;
      
      if (path === 'straight') {
        d = distPointToSegment(cx, cy, s.x, s.y, t.x, t.y);
      } else if (path === 'elbow') {
        // For elbow paths, check distance to both segments
        const elbowX = s.x;
        const elbowY = t.y;
        const d1 = distPointToSegment(cx, cy, s.x, s.y, elbowX, elbowY);
        const d2 = distPointToSegment(cx, cy, elbowX, elbowY, t.x, t.y);
        d = Math.min(d1, d2);
      } else if (path === 'curved') {
        // For curved paths, approximate with multiple line segments
        const segments = 20;
        let minDist = Infinity;
        for (let i = 0; i < segments; i++) {
          const t1 = i / segments;
          const t2 = (i + 1) / segments;
          
          // Approximate quadratic curve with line segments
          const x1 = s.x + t1 * (t.x - s.x);
          const y1 = s.y + t1 * (t.y - s.y);
          const x2 = s.x + t2 * (t.x - s.x);
          const y2 = s.y + t2 * (t.y - s.y);
          
          const dist = distPointToSegment(cx, cy, x1, y1, x2, y2);
          minDist = Math.min(minDist, dist);
        }
        d = minDist;
      }
      
      if (d < tol && d < bestDist) { 
        best = link; 
        bestDist = d; 
      }
    }
    return best;
  };

  const getNodeAtPosition = (x: number, y: number): PageNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const canvasX = (x - rect.left - transform.x) / transform.scale;
    const canvasY = (y - rect.top - transform.y) / transform.scale;

    return nodes.find(node => {
      if (node.x === undefined || node.y === undefined) return false;
      
      // Calculate node dimensions for hit testing
      const tempCtx = canvas.getContext('2d');
      if (!tempCtx) return false;
      
      const dimensions = calculateNodeDimensions(node, tempCtx);
      const nodeLeft = node.x - dimensions.width / 2;
      const nodeRight = node.x + dimensions.width / 2;
      const nodeTop = node.y - dimensions.height / 2;
      const nodeBottom = node.y + dimensions.height / 2;

      return canvasX >= nodeLeft && canvasX <= nodeRight && 
             canvasY >= nodeTop && canvasY <= nodeBottom;
    }) || null;
  };

  // history is managed by App; no-op retained for compatibility
  const saveToHistory = (_nodesToSave: PageNode[]) => {};

  const handleZoomToPercentage = (percentage: number) => {
    const newScale = Math.max(0.1, Math.min(2.0, percentage / 100));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setTransform(prev => {
      const newX = centerX - (centerX - prev.x) * (newScale / prev.scale);
      const newY = centerY - (centerY - prev.y) * (newScale / prev.scale);
      return { x: newX, y: newY, scale: newScale };
    });
    setShowZoomDropdown(false);
  };


  // Toolbar handler functions
  const handleDeleteSelectedNodes = () => {
    if (selectedIds.size === 0 || !onNodesUpdate) return;
    
    const nodesToDelete = Array.from(selectedIds);
    const confirmMsg = nodesToDelete.length === 1
      ? `Delete "${nodes.find(n => n.id === nodesToDelete[0])?.title}"?`
      : `Delete ${nodesToDelete.length} nodes?`;
    
    if (window.confirm(confirmMsg)) {
      const updatedNodes = nodes.filter(n => !nodesToDelete.includes(n.id));
      onNodesUpdate(updatedNodes);
      setSelectedIds(new Set());
    }
  };

  const handleColorClickForKeyboard = (x: number, y: number) => {
    const nodeIds = Array.from(selectedIds);
    if (nodeIds.length === 0) return;
    
    // Store original colors before opening picker (with defaults if not set)
    // If a single node is selected, also capture its entire category so Cancel can restore group previews
    const originals: Record<string, { customColor?: string; textColor?: string }> = {};
    const captureIds = (() => {
      if (nodeIds.length === 1) {
        const first = nodes.find(n => n.id === nodeIds[0]);
        if (first) {
          const sameCategory = nodes.filter(n => n.category === first.category).map(n => n.id);
          return Array.from(new Set([...nodeIds, ...sameCategory]));
        }
      }
      return nodeIds;
    })();

    captureIds.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        // Store exact originals (including undefined) so Cancel can truly restore
        originals[id] = {
          customColor: node.customColor,
          textColor: node.textColor,
        };
      }
    });
    setOriginalColors(originals);
    
    setColorPickerNodeIds(nodeIds);
    setColorPickerPosition({ x, y });
    setShowColorPicker(true);
  };

  const handleAddChildFromToolbar = (parentId: string) => {
    if (onAddChild) {
      onAddChild(parentId);
      // Don't clear hover toolbar or selection - allow multiple children
    }
  };

  const handleColorClickFromToolbar = (nodeIds: string[], event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    
    // Store original colors before opening picker (with defaults if not set)
    // If a single node is chosen, also capture its entire category so Cancel can restore group previews
    const originals: Record<string, { customColor?: string; textColor?: string }> = {};
    const captureIds = (() => {
      if (nodeIds.length === 1) {
        const first = nodes.find(n => n.id === nodeIds[0]);
        if (first) {
          const sameCategory = nodes.filter(n => n.category === first.category).map(n => n.id);
          return Array.from(new Set([...nodeIds, ...sameCategory]));
        }
      }
      return nodeIds;
    })();

    captureIds.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        // Store exact originals (including undefined) so Cancel can truly restore
        originals[id] = {
          customColor: node.customColor,
          textColor: node.textColor,
        };
      }
    });
    setOriginalColors(originals);
    
    setColorPickerNodeIds(nodeIds);
    setColorPickerPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    setShowColorPicker(true);
    setHoverToolbarNode(null);
  };

  const handleLinkClickFromToolbar = (nodeId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLinkEditorNode(nodeId);
    setLinkEditorPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    setShowLinkEditor(true);
    setHoverToolbarNode(null);
  };

  const handleColorChange = (nodeIds: string[], bgColor: string, textColor: string) => {
    if (!onNodesUpdate) return;
    
    const updatedNodes = nodes.map(node => {
      if (nodeIds.includes(node.id)) {
        return {
          ...node,
          customColor: bgColor,
          textColor: textColor,
        };
      }
      return node;
    });
    
    onNodesUpdate(updatedNodes);
    setShowColorPicker(false);
    // Clear original colors after successful apply
    setOriginalColors({});
  };

  const handleLinkSave = (nodeId: string, url: string) => {
    if (!onNodesUpdate) return;
    
    const updatedNodes = nodes.map(node => {
      if (node.id === nodeId) {
        return { ...node, url };
      }
      return node;
    });
    
    onNodesUpdate(updatedNodes);
    setShowLinkEditor(false);
  };

  const handleEditTitle = (nodeId: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Close hover toolbar when opening title editor
    setHoverToolbarNode(null);
    
    if (event) {
      const rect = event.currentTarget.getBoundingClientRect();
      setTitleEditorNode(nodeId);
      setTitleEditorPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
      setShowTitleEditor(true);
    } else {
      // Fallback: center of screen
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      setTitleEditorNode(nodeId);
      setTitleEditorPosition({ x: centerX, y: centerY });
      setShowTitleEditor(true);
    }
  };

  const handleTitleSave = (nodeId: string, title: string) => {
    if (!onNodesUpdate) return;
    
    const updatedNodes = nodes.map(node => {
      if (node.id === nodeId) {
        return { ...node, title };
      }
      return node;
    });
    
    onNodesUpdate(updatedNodes);
    setShowTitleEditor(false);
  };

  // Get toolbar position from node
  const getToolbarPosition = (node: PageNode): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas || node.x === undefined || node.y === undefined) {
      return { x: 0, y: 0 };
    }
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return { x: 0, y: 0 };
    
    const dimensions = calculateNodeDimensions(node, ctx);
    const screenX = rect.left + (node.x * transform.scale) + transform.x;
    const screenY = rect.top + (node.y * transform.scale) + transform.y;
    const nodeTop = screenY - (dimensions.height / 2) * transform.scale;
    
    return {
      x: screenX,
      y: nodeTop - 10, // 10px above the node
    };
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const link = getLinkAtPosition(e.clientX, e.clientY, 12);
    if (link) {
      setContextMenu({ x: e.clientX, y: e.clientY, link });
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
      setHighlightedLink(link);
    } else {
      setContextMenu(null);
    }
  };

  const handleContextMenuMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsContextMenuDragging(true);
      setContextMenuDragOffset({
        x: e.clientX - contextMenuPosition.x,
        y: e.clientY - contextMenuPosition.y,
      });
      e.preventDefault();
    }
  };

  // Context menu dragging effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isContextMenuDragging) {
        const newX = e.clientX - contextMenuDragOffset.x;
        const newY = e.clientY - contextMenuDragOffset.y;
        
        setContextMenuPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsContextMenuDragging(false);
    };

    if (isContextMenuDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isContextMenuDragging, contextMenuDragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('SitemapCanvas: handleMouseDown called');
    
    // Only handle left mouse button for drag/select
    if (e.button !== 0) return;
    
    // Close context menu if clicking elsewhere
    if (contextMenu) {
      setContextMenu(null);
      setHighlightedLink(null);
    }
    
    // Detect link, but do not highlight/select here; defer to mouseup to avoid interfering with drags
    const link = getLinkAtPosition(e.clientX, e.clientY);

    // Detect node first and prefer node interactions over links
    const node = getNodeAtPosition(e.clientX, e.clientY);
    
    if (onClearFocus) {
      console.log('SitemapCanvas: handleMouseDown calling onClearFocus');
      onClearFocus();
    }
    
    if (node) {
      if (e.ctrlKey || e.metaKey) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
          const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
          setConnectionDraft({ sourceId: node.id, mouseX: canvasX, mouseY: canvasY });
        }
        return;
      }

      // Check if we have a selection from marquee mode - if so, enable dragging
      if (selectedIds.size > 0 && selectedIds.has(node.id)) {
        // We have selected nodes and clicked on one of them - enable dragging all selected nodes
        const selectionIds = Array.from(selectedIds);
        
        setDragSelectionIds(selectionIds);
        const pos: Record<string, { x: number; y: number }> = {};
        selectionIds.forEach(id => {
          const n = nodes.find(x => x.id === id);
          if (n && n.x !== undefined && n.y !== undefined) pos[id] = { x: n.x, y: n.y };
        });
        setDragStartPositions(pos);

        setDraggedNode(node);
        setDragStart({ x: e.clientX, y: e.clientY });
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
          const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDragOffset({ x: canvasX - (node.x || 0), y: canvasY - (node.y || 0) });
        }
        return;
      }

      // Only allow node selection in select mode
      if (cursorMode === 'select') {
        // Determine which nodes to drag
        let selectionIds: string[];
        
        if (selectedIds.has(node.id)) {
          // If clicking on already selected node, drag all selected nodes
          selectionIds = Array.from(selectedIds);
        } else {
          // If clicking on unselected node, select and drag based on modifier keys
          selectionIds = e.shiftKey
          ? nodes.filter(n => n.category === node.category).map(n => n.id)
          : (e.altKey ? (() => {
              const visited = new Set<string>();
              const queue: string[] = [node.id];
              visited.add(node.id);
              const parentMap = new Map(nodes.map(n => [n.id, n.parent]));
              const childrenMap = new Map<string, string[]>();
              nodes.forEach(n => n.children.forEach(c => { if (!childrenMap.has(n.id)) childrenMap.set(n.id, []); childrenMap.get(n.id)!.push(c); }));
              while (queue.length) {
                const id = queue.shift()!;
                const p = parentMap.get(id);
                if (p && !visited.has(p)) { visited.add(p); queue.push(p); }
                (childrenMap.get(id) || []).forEach(c => { if (!visited.has(c)) { visited.add(c); queue.push(c); } });
              }
              return Array.from(visited);
            })() : [node.id]);
        }

        setDragSelectionIds(selectionIds);
        const pos: Record<string, { x: number; y: number }> = {};
        selectionIds.forEach(id => {
          const n = nodes.find(x => x.id === id);
          if (n && n.x !== undefined && n.y !== undefined) pos[id] = { x: n.x, y: n.y };
        });
        setDragStartPositions(pos);

        setDraggedNode(node);
        setDragStart({ x: e.clientX, y: e.clientY });
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
          const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
          setDragOffset({ x: canvasX - (node.x || 0), y: canvasY - (node.y || 0) });
        }
        return;
      }
    }

    // Background down → start marquee selection or canvas panning
    // If Space is pressed, always pan regardless of other modes
    if (isSpacePressed) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
      backgroundDownRef.current = { x: e.clientX, y: e.clientY };
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    } else if (cursorMode === 'marquee') {
        // Start marquee selection
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
          const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
          setMarqueeSelection({
            startX: canvasX,
            startY: canvasY,
            endX: canvasX,
            endY: canvasY,
            isActive: true
          });
        }
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    } else if (!node && !link) {
      // Start canvas panning (only when not over nodes or links)
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialTransform(transform);
        backgroundDownRef.current = { x: e.clientX, y: e.clientY };
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    } else {
      // Over a link but not node: do nothing on mousedown; handle link selection on mouseup
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const node = getNodeAtPosition(e.clientX, e.clientY);
    setHoveredNode(node ? node.id : null);

    // Handle hover toolbar with improved logic
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Clear hover toolbar immediately if nodes are selected, but do not return;
    // dragging and other interactions should still work while selection toolbar is open
    if (selectedIds.size > 0) {
      setHoverToolbarNode(null);
    }

    if (node && selectedIds.size === 0 && !draggedNode && !isDragging && !marqueeSelection?.isActive && 
        !connectionDraft && !showLinkEditor && !showColorPicker && !showTitleEditor) {
      // Clear any pending grace timeout
      if (hoverGraceTimeoutRef.current) {
        clearTimeout(hoverGraceTimeoutRef.current);
        hoverGraceTimeoutRef.current = null;
      }
      
      // Show hover toolbar with delay
      hoverTimeoutRef.current = setTimeout(() => {
        setHoverToolbarNode(node);
        setHoverToolbarPosition(getToolbarPosition(node));
      }, 200);
    } else if (hoverToolbarNode) {
      // Start grace period before clearing
      clearHoverToolbarWithGrace();
    }

    if (connectionDraft) {
      // Update connection draft line
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        setConnectionDraft(prev => prev ? {
          ...prev,
          mouseX: canvasX,
          mouseY: canvasY
        } : null);
      }
    } else if (marqueeSelection?.isActive) {
      // Update marquee selection
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        setMarqueeSelection(prev => prev ? {
          ...prev,
          endX: canvasX,
          endY: canvasY
        } : null);
      }
    } else if (draggedNode) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        const newX = canvasX - dragOffset.x;
        const newY = canvasY - dragOffset.y;

        const origin = dragStartPositions[draggedNode.id];
        const dx = origin ? newX - origin.x : 0;
        const dy = origin ? newY - origin.y : 0;

        // Only set a visual delta here; commit on mouse up
        setDragDelta({ dx, dy });
      }
    } else if (isDragging) {
      // Canvas panning - use initial transform as base
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      setTransform({
        x: initialTransform.x + deltaX,
        y: initialTransform.y + deltaY,
        scale: initialTransform.scale
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (connectionDraft) {
      // Check if we're dropping on a target node
      const targetNode = getNodeAtPosition(e.clientX, e.clientY);
      if (targetNode && targetNode.id !== connectionDraft.sourceId) {
        // Prefer creating extra (non-hierarchical) link if supported
        if (onExtraLinkCreate) {
          onExtraLinkCreate(connectionDraft.sourceId, targetNode.id);
        } else if (onConnectionCreate) {
          // Fallback to hierarchical parent assignment
          onConnectionCreate(connectionDraft.sourceId, targetNode.id);
        }
      }
      setConnectionDraft(null);
    } else if (marqueeSelection?.isActive) {
      // Complete marquee selection
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        
        // Find nodes within marquee area
        const selectedNodes = nodes.filter(node => {
          if (node.x === undefined || node.y === undefined) return false;
          
          const left = Math.min(marqueeSelection.startX, canvasX);
          const right = Math.max(marqueeSelection.startX, canvasX);
          const top = Math.min(marqueeSelection.startY, canvasY);
          const bottom = Math.max(marqueeSelection.startY, canvasY);
          
          return node.x >= left && node.x <= right && node.y >= top && node.y <= bottom;
        });
        
        // Update selection and clear any highlighted links
        setSelectedIds(new Set(selectedNodes.map(n => n.id)));
        setHighlightedLink(null); // Clear link highlighting when nodes are selected
      }
      setMarqueeSelection(null);
    } else if (draggedNode) {
      // Commit drag if any significant movement; otherwise treat as click
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2)
      );
      
      if (dragDelta && dragSelectionIds && onNodesUpdate) {
        const updatedNodes = nodes.map(n => {
          if (!dragSelectionIds.includes(n.id)) return n;
          const start = dragStartPositions[n.id];
          if (!start) return n;
          const nx = start.x + dragDelta.dx;
          const ny = start.y + dragDelta.dy;
          return { ...n, x: nx, y: ny, fx: nx, fy: ny };
        });
        onNodesUpdate(updatedNodes);
      } else if (dragDistance < dragThreshold && onNodeClick) {
      // Only trigger click if it wasn't a significant drag
        onNodeClick(draggedNode);
        setSelectedIds(new Set([draggedNode.id]));
        setHighlightedLink(null);
      }
    } else if (isDragging && !draggedNode) {
      // Handle canvas panning end - check if it was a click or drag
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2)
      );
      
      if (dragDistance < dragThreshold) {
        // Small movement = background click - clear selection
        console.log('SitemapCanvas: Background click detected, clearing selection');
        setSelectedIds(new Set());
        setHighlightedLink(null);
        if (onClearFocus) onClearFocus();
      }
      // Large movement = canvas pan, no action needed
    } else if (!isDragging && !draggedNode) {
      // Handle click when no node was being dragged and no canvas panning
    const dragDistance = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dragDistance < dragThreshold) {
      // 1) Try link first for reliable link highlighting
      const link = getLinkAtPosition(e.clientX, e.clientY, 7); // slightly higher tolerance for click
      if (link) {
        if (highlightedLink && highlightedLink.sourceId === link.sourceId && highlightedLink.targetId === link.targetId) {
          setHighlightedLink(null);
        } else {
          setHighlightedLink(link);
        }
        // Force immediate redraw
        setTransform(t => ({ ...t }));
        return;
      }

      // 2) Fallback to node click
      const clickedNode = getNodeAtPosition(e.clientX, e.clientY);
      if (clickedNode && onNodeClick) {
        onNodeClick(clickedNode);
        setSelectedIds(new Set([clickedNode.id]));
        setHighlightedLink(null);
      }
      }
    }
    
    // Always reset these states
    setIsDragging(false);
    setDraggedNode(null);
    setDragSelectionIds(null);
    setDragStartPositions({});
    setDragDelta(null);
    setDragStart({ x: 0, y: 0 });
    setInitialTransform({ x: 0, y: 0, scale: 1 });
    backgroundDownRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setConnectionDraft(null);
      setHighlightedLink(null);
      if (onClearFocus) onClearFocus();
    }

    // Delegate undo/redo to App
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) { if (onRedo) onRedo(); } else { if (onUndo) onUndo(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); if (onRedo) onRedo(); return;
    }

    // Cursor mode shortcuts
    switch (e.key) {
      case 'v':
        setCursorMode('select');
        break;
      case 'm':
        setCursorMode('marquee');
        break;
      case 'Delete':
      case 'Backspace':
        if (highlightedLink && onNodesUpdate) {
          const updatedNodes = nodes.map(node => node.id === highlightedLink.targetId ? { ...node, parent: null } : node);
          onNodesUpdate(updatedNodes);
          setHighlightedLink(null);
        }
        break;
    }
  };

  const handleMouseLeave = () => {
    // Reset all mouse states when leaving the canvas
    setIsDragging(false);
    setDraggedNode(null);
    setConnectionDraft(null);
    setDragSelectionIds(null);
    setDragStartPositions({});
    setMarqueeSelection(null);
    setHoveredNode(null);
    setDragStart({ x: 0, y: 0 });
    setInitialTransform({ x: 0, y: 0, scale: 1 });
    backgroundDownRef.current = null;
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    
    // Clear focus when zooming/panning
    if (onClearFocus) {
      console.log('SitemapCanvas: handleWheel calling onClearFocus');
      onClearFocus();
    }
    
    // Check if Ctrl/Cmd key is pressed for zoom, otherwise pan
    if (e.ctrlKey || e.metaKey) {
      // Zoom behavior in discrete 5% steps snapping to 0.1..2.0 for finer traversal
      const step = 0.05;
      const dir = e.deltaY > 0 ? -1 : 1;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setTransform(prev => {
        const raw = prev.scale + dir * step;
        const snapped = Math.round(raw / step) * step;
        const newScale = Math.max(0.1, Math.min(2.0, snapped));
        const newX = mouseX - (mouseX - prev.x) * (newScale / prev.scale);
        const newY = mouseY - (mouseY - prev.y) * (newScale / prev.scale);
        return { x: newX, y: newY, scale: Number(newScale.toFixed(2)) };
      });
    } else {
      // Pan behavior
      const panSpeed = 1;
      const deltaX = e.deltaX * panSpeed;
      const deltaY = e.deltaY * panSpeed;
      
      setTransform(prev => ({
        ...prev,
        x: prev.x - deltaX,
        y: prev.y - deltaY
      }));
    }
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Calculate center position
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    setTransform({ x: centerX, y: centerY, scale: 1 });
  };

  const centerOnNode = (node: PageNode) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || node.x === undefined || node.y === undefined) {
      return;
    }

    // Calculate center position
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    // Calculate transform to center the node
    const newX = centerX - node.x;
    const newY = centerY - node.y;
    
    setTransform({ x: newX, y: newY, scale: 1 });
  };

  // Determine cursor based on current state
  const getCursorClass = () => {
    if (isSpacePressed) return "cursor-grab"; // Space key panning
    if (draggedNode) return "cursor-grabbing";
    if (isDragging) return "cursor-grabbing";
    if (connectionDraft) return "cursor-crosshair";
    if (marqueeSelection?.isActive) return "cursor-crosshair";
    if (cursorMode === 'marquee') return "cursor-crosshair";
    return "cursor-default";
  };

  // Remove the old window-based approach
  // useEffect(() => {
  //   (window as any).focusOnNode = centerOnNode;
  // }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-white">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={-1}
        className={getCursorClass()}
      />
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.link && (() => {
            const selectedKey = linkKey(contextMenu.link.sourceId, contextMenu.link.targetId);
            const cur = linkStyles[selectedKey] || {};
            
            const applyLinkStyle = (style: LinkStyle) => {
              if (onLinkStyleChange) {
                onLinkStyleChange(selectedKey, style);
                // Force immediate redraw for snappy feedback
                const canvas = canvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    // Trigger sync redraw via state noop on transform
                    setTransform(t => ({ ...t }));
                  }
                }
              }
            };
            
            return (
              <>
                {/* Draggable Header */}
                <div
                  className="px-3 py-2 border-b bg-gray-50 cursor-move select-none flex items-center justify-between"
                  onMouseDown={handleContextMenuMouseDown}
                >
                  <span className="text-xs text-gray-600 font-medium">Link Style</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                    <path d="M8 6h8M8 12h8M8 18h8"/>
                  </svg>
                </div>

                {/* Line Style */}
                <div className="px-3 py-2 border-b">
                  <div className="text-xs text-gray-500 mb-1">Line</div>
                  <div className="flex gap-1">
                    <button className={iconBtn(cur.dash === 'solid' || !cur.dash)} onClick={(e) => {
                      e.stopPropagation();
                      applyLinkStyle({ dash: 'solid' });
                    }}>
                      <MiniLinkIcon dash="solid" path="elbow" width={cur.width ?? 2} color={cur.color ?? '#333'} />
                    </button>
                    <button className={iconBtn(cur.dash === 'dashed')} onClick={(e) => {
                      e.stopPropagation();
                      applyLinkStyle({ dash: 'dashed' });
                    }}>
                      <MiniLinkIcon dash="dashed" path="elbow" width={cur.width ?? 2} color={cur.color ?? '#333'} />
                    </button>
                  </div>
                </div>

                {/* Path Style */}
                <div className="px-3 py-4 border-b">
                  <div className="text-xs text-gray-500 mb-1">Path</div>
                  <div className="flex gap-1">
                    <button className={iconBtn((cur.path ?? 'elbow') === 'elbow')} onClick={(e) => {
                      e.stopPropagation();
                      applyLinkStyle({ path: 'elbow' });
                    }}>
                      <MiniLinkIcon path="elbow" dash="solid" width={cur.width ?? 2} color={cur.color ?? '#333'} />
                    </button>
                    <button className={iconBtn(cur.path === 'straight')} onClick={(e) => {
                      e.stopPropagation();
                      applyLinkStyle({ path: 'straight' });
                    }}>
                      <MiniLinkIcon path="straight" dash="solid" width={cur.width ?? 2} color={cur.color ?? '#333'} />
                    </button>
                  </div>
                </div>

                {/* Delete Link */}
          <button
            onClick={() => {
              if (contextMenu.link) {
                // Check if it's an extra link or hierarchical link
                const targetNode = nodes.find(n => n.id === contextMenu.link!.targetId);
                const isExtraLink = extraLinks.some(l => 
                  l.sourceId === contextMenu.link!.sourceId && 
                  l.targetId === contextMenu.link!.targetId
                );
                const isHierarchicalLink = targetNode?.parent === contextMenu.link!.sourceId;
                
                if (isExtraLink && onExtraLinkDelete) {
                  // Delete extra link
                  onExtraLinkDelete(contextMenu.link.sourceId, contextMenu.link.targetId);
                } else if (isHierarchicalLink && onNodesUpdate) {
                  // Delete hierarchical link
                  const updatedNodes = nodes.map(node => {
                    if (node.id === contextMenu.link!.targetId) {
                      return { ...node, parent: null };
                    } else if (node.id === contextMenu.link!.sourceId) {
                      // Remove from parent's children array
                      return { ...node, children: node.children.filter(id => id !== contextMenu.link!.targetId) };
                    }
                    return node;
                  });
                  onNodesUpdate(updatedNodes);
                }
              }
              setContextMenu(null);
              setHighlightedLink(null);
            }}
            className="w-full text-sm px-4 py-2 text-left hover:bg-gray-50 text-red-600"
          >
            Delete Link
          </button>
              </>
            );
          })()}
        </div>
      )}
      
      {/* Center Toolbar */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-white border border-gray-300 rounded-lg shadow-lg px-2 py-1 z-50">
        <button
          onClick={() => setCursorMode('select')}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors group relative ${
            cursorMode === 'select' 
              ? 'bg-orange-100 text-orange-600 border border-orange-200' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11 L22 2 L13 21 L11 13 L3 11 Z" />
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Select (V)
          </span>
        </button>
        
        <button
          onClick={() => setCursorMode('marquee')}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors group relative ${
            cursorMode === 'marquee' 
              ? 'bg-orange-100 text-orange-600 border border-orange-200'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Multi select (M)
          </span>
        </button>
        
        <button
          onClick={() => {
            if (selectedIds.size === 1 && onAddChild) {
              const id = Array.from(selectedIds)[0];
              onAddChild(id);
            } else if (onAddNode) {
              onAddNode();
            }
          }}
          className="w-8 h-8 flex items-center justify-center rounded transition-colors group relative bg-gray-100 hover:bg-gray-200 text-gray-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Add Node (A)
          </span>
        </button>
        
        <div className="w-px h-6 bg-gray-300 mx-1"></div>
        
        <button
          onClick={() => { if (onUndo) onUndo(); }}
          disabled={!onUndo}
          className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors group relative"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Undo (Ctrl+Z)
          </span>
        </button>
        
        <button
          onClick={() => { if (onRedo) onRedo(); }}
          disabled={!onRedo}
          className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors group relative"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Redo (Ctrl+Y)
          </span>
        </button>
      </div>
      <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 z-50">
        <button
          onClick={() => {
            const newScale = Math.min(2.0, transform.scale + 0.1);
            setTransform({ ...transform, scale: newScale });
          }}
          className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors group relative"
          title="Zoom In"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Zoom In
          </span>
        </button>
        <div 
          className="px-3 py-1 text-sm font-medium text-gray-700 min-w-[60px] text-center cursor-pointer hover:bg-gray-100 rounded transition-colors relative zoom-dropdown-container group"
          onClick={() => setShowZoomDropdown(!showZoomDropdown)}
          title="Set zoom level"
        >
          {Math.round(transform.scale * 100)}%
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Set Zoom Level
          </span>
          {showZoomDropdown && (
            <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg shadow-lg py-1 min-w-[80px]">
              <button onClick={() => handleZoomToPercentage(50)} className="w-full px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 text-left">50%</button>
              <button onClick={() => handleZoomToPercentage(80)} className="w-full px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 text-left">80%</button>
              <button onClick={() => handleZoomToPercentage(100)} className="w-full px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 text-left">100%</button>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            const newScale = Math.max(0.1, transform.scale - 0.1);
            setTransform({ ...transform, scale: newScale });
          }}
          className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors group relative"
          title="Zoom Out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Zoom Out
          </span>
        </button>
        {/* Fit removed per request; use dropdown presets instead */}
      </div>

      {/* Hover Toolbar - appears when hovering over a node */}
      {hoverToolbarNode && selectedIds.size === 0 && (
        <HoverToolbar
          node={hoverToolbarNode}
          position={hoverToolbarPosition}
          onAddChild={handleAddChildFromToolbar}
          onColorClick={(nodeId, event) => handleColorClickFromToolbar([nodeId], event)}
          onLinkClick={handleLinkClickFromToolbar}
          onMouseEnter={() => {
            // Clear any pending grace timeout when mouse enters toolbar
            if (hoverGraceTimeoutRef.current) {
              clearTimeout(hoverGraceTimeoutRef.current);
              hoverGraceTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            // Start grace period when mouse leaves toolbar
            clearHoverToolbarWithGrace();
          }}
        />
      )}

      {/* Selection Toolbar - appears when nodes are selected */}
      {selectedIds.size > 0 && (() => {
        const selectedNodesArray = Array.from(selectedIds).map(id => nodes.find(n => n.id === id)).filter(Boolean) as PageNode[];
        if (selectedNodesArray.length === 0) return null;
        
        // Calculate bounding box center for multi-selection
        const avgX = selectedNodesArray.reduce((sum, n) => sum + (n.x || 0), 0) / selectedNodesArray.length;
        const avgY = selectedNodesArray.reduce((sum, n) => sum + (n.y || 0), 0) / selectedNodesArray.length;
        
        const canvas = canvasRef.current;
        if (!canvas) return null;
        
        const rect = canvas.getBoundingClientRect();
        const screenX = rect.left + (avgX * transform.scale) + transform.x;
        const screenY = rect.top + (avgY * transform.scale) + transform.y;
        
        return (
          <SelectionToolbar
            selectedNodes={selectedNodesArray}
            position={{ x: screenX, y: screenY - 50 }}
            onEditTitle={handleEditTitle}
            onAddChild={handleAddChildFromToolbar}
            onColorClick={handleColorClickFromToolbar}
            onLinkClick={handleLinkClickFromToolbar}
            onDelete={(nodeIds) => {
              if (!onNodesUpdate) return;
              const idsToDelete = new Set(nodeIds);
              // Remove the nodes, and also clean up parent/children references
              const filtered = nodes.filter(n => !idsToDelete.has(n.id));
              const cleaned = filtered.map(n => {
                const newChildren = n.children.filter(cid => !idsToDelete.has(cid));
                const newParent = n.parent && idsToDelete.has(n.parent) ? null : n.parent;
                if (newChildren.length !== n.children.length || newParent !== n.parent) {
                  return { ...n, children: newChildren, parent: newParent };
                }
                return n;
              });
              onNodesUpdate(cleaned);
              setSelectedIds(new Set());
            }}
            groups={Array.from(new Set(nodes.map(n => n.category))).filter(Boolean).sort()}
            onMoveToGroup={(group, opts) => {
              if (onMoveNodesToGroup) {
                onMoveNodesToGroup(selectedNodesArray.map(n => n.id), group, opts);
              }
            }}
            onGroup={(nodeIds: string[]) => {
              // This is for single node move (existing functionality)
              // For grouping, we'll use a simple prompt for now
              if (onCreateGroupFromSelection) {
                const groupName = prompt('Enter group name:');
                if (groupName) {
                  onCreateGroupFromSelection(nodeIds, groupName, { relayout: false });
                }
              }
            }}
            onMoveMultiSelectionToGroup={(groupName: string) => {
              // Move selected nodes to existing group
              if (onMoveNodesToGroup) {
                onMoveNodesToGroup(selectedNodesArray.map(n => n.id), groupName, { relayout: false });
              }
            }}
            onCreateGroupFromMultiSelection={(nodeIds: string[], groupName: string) => {
              // Create new group from multi-selection
              if (onCreateGroupFromSelection) {
                onCreateGroupFromSelection(nodeIds, groupName, { relayout: false });
              }
            }}
            onDeleteGroup={(groupName: string) => {
              // Delete group - reassign all nodes in this group to 'general' or another default
              if (onDeleteGroup) {
                onDeleteGroup(groupName);
              }
            }}
          />
        );
      })()}

      {/* Link Editor Popover */}
      {showLinkEditor && linkEditorNode && (() => {
        const node = nodes.find(n => n.id === linkEditorNode);
        if (!node) return null;
        
        return (
          <LinkEditorPopover
            nodeId={linkEditorNode}
            currentUrl={node.url}
            anchorPosition={linkEditorPosition}
            onSave={handleLinkSave}
            onClose={() => setShowLinkEditor(false)}
          />
        );
      })()}

      {/* Color Picker Popover */}
      {showColorPicker && colorPickerNodeIds.length > 0 && (
        <ColorPickerPopover
          nodeIds={colorPickerNodeIds}
          allNodes={nodes}
          anchorPosition={colorPickerPosition}
          onColorChange={handleColorChange}
          onClose={() => {
            // Restore original colors for preview only (no history change)
            if (onNodesPreview && Object.keys(originalColors).length > 0) {
              const restored = nodes.map(node => {
                const orig = originalColors[node.id];
                return orig
                  ? { ...node, customColor: orig.customColor, textColor: orig.textColor }
                  : node;
              });
              onNodesPreview(restored);
            }
            setShowColorPicker(false);
            setOriginalColors({});
          }}
          onPreview={(previewNodeIds, bgColor, textColor) => {
            // Real-time preview without history
            if (onNodesPreview) {
              const updatedNodes = nodes.map(node => (
                previewNodeIds.includes(node.id)
                  ? { ...node, customColor: bgColor, textColor }
                  : node
              ));
              onNodesPreview(updatedNodes);
            }
          }}
        />
      )}

      {/* Title Editor Popover */}
      {showTitleEditor && titleEditorNode && (() => {
        const node = nodes.find(n => n.id === titleEditorNode);
        if (!node) return null;
        
        return (
          <TitleEditorPopover
            nodeId={titleEditorNode}
            currentTitle={node.title}
            anchorPosition={titleEditorPosition}
            onSave={handleTitleSave}
            onClose={() => setShowTitleEditor(false)}
          />
        );
      })()}
    </div>
  );
});
