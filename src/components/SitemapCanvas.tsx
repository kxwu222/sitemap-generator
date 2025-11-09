import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { PageNode } from '../utils/urlAnalyzer';
import { LinkStyle, LineDash, LinkPath, ArrowType } from '../types/linkStyle';
import { Figure, FreeLine } from '../types/drawables';
import { SelectionGroup } from '../types/sitemap';
import { HoverToolbar } from './HoverToolbar';
import { SelectionToolbar } from './SelectionToolbar';
import { LinkEditorPopover } from './LinkEditorPopover';
import { ConnectionStylePopover } from './ConnectionStylePopover';
import { ColorPickerPopover } from './ColorPickerPopover';
import { TitleEditorPopover } from './TitleEditorPopover';

interface SitemapCanvasProps {
  nodes: PageNode[];
  selectionGroups?: SelectionGroup[];
  onNodeClick?: (node: PageNode) => void;
  onNodesUpdate?: (nodes: PageNode[]) => void;
  onNodesPreview?: (nodes: PageNode[]) => void;
  onCreateSelectionGroup?: (memberNodeIds: string[], memberFigureIds: string[], name?: string) => void;
  onUngroupSelection?: (memberNodeIds: string[], memberFigureIds: string[]) => void;
  snapToGuides?: boolean;
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
  figures?: Figure[];
  freeLines?: FreeLine[];
  onCreateFigure?: (figure: Figure) => void;
  onUpdateFigure?: (id: string, updates: Partial<Figure>) => void;
  onDeleteFigure?: (id: string) => void;
  onCreateFreeLine?: (line: FreeLine) => void;
  onUpdateFreeLine?: (id: string, updates: Partial<FreeLine>) => void;
  onDeleteFreeLine?: (id: string) => void;
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

export const SitemapCanvas = forwardRef((props: SitemapCanvasProps, ref) => {
  
  // Helper function to create link key
  const linkKey = (sourceId: string, targetId: string) => `${sourceId}-${targetId}`;
  
  // Helper function to calculate optimal elbow corner based on relative node positions
  const calculateElbowCorner = (source: PageNode, target: PageNode): { elbowX: number; elbowY: number } => {
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
  };

  // Destructure props inside body to avoid Babel initializer issue
  const {
    nodes,
    selectionGroups = [],
    onNodeClick,
    onNodesUpdate,
    onNodesPreview,
    onMoveNodesToGroup,
    onCreateGroupFromSelection,
    onDeleteGroup,
    onCreateSelectionGroup,
    onUngroupSelection,
    snapToGuides = true,
    // onConnectionCreate,
    extraLinks = [],
    onExtraLinkCreate,
    onExtraLinkDelete,
    onUndo,
    onRedo,
    searchResults = [],
    focusedNode,
    onClearFocus,
    colorOverrides = {},
    onAddChild,
    linkStyles = {},
    onLinkStyleChange,
    onAddNode,
    figures = [],
    freeLines = [],
    onCreateFigure,
    onUpdateFigure,
    onDeleteFigure,
    
    onUpdateFreeLine,
    onDeleteFreeLine,
  } = props;

  // Helper function to get connection anchor position (needs props, so defined after destructuring)
  const getConnectionAnchor = (sourceId: string, targetId: string) => {
    const s = nodes.find(n => n.id === sourceId);
    const t = nodes.find(n => n.id === targetId);
    if (!s || !t || s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) return null;
    let ax = (s.x + t.x) / 2;
    let ay = (s.y + t.y) / 2;
    const style = linkStyles[linkKey(sourceId, targetId)] || {};
    if ((style.path ?? 'elbow') === 'elbow') {
      // place near elbow corner using dynamic calculation
      const { elbowX, elbowY } = calculateElbowCorner(s, t);
      ax = elbowX;
      ay = elbowY;
    }
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.left + (ax * transform.scale) + transform.x;
    const sy = rect.top + (ay * transform.scale) + transform.y - 8;
    return { x: sx, y: sy };
  };

  
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
    // removed unused elbow angles
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

  // Compact presets for line styling in hover toolbar
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
  // legacy removed: cursorMode
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
  // legacy removed: pendingLineStart/pendingLineStyle
  const [hoveredFreeLineId, setHoveredFreeLineId] = useState<string | null>(null);
  const [connectionPopover, setConnectionPopover] = useState<null | { linkKey: string; sourceId: string; targetId: string; x: number; y: number }>(null);
  const [draggingLineEnd, setDraggingLineEnd] = useState<{ id: string; end: 'start' | 'end' } | null>(null);
  const [lineEndpointDragMoved, setLineEndpointDragMoved] = useState(false);
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [selectedFigureIds, setSelectedFigureIds] = useState<Set<string>>(new Set());
  const [draggingFigureId, setDraggingFigureId] = useState<string | null>(null);
  const [figureDragStart, setFigureDragStart] = useState<{ sx: number; sy: number; fx: number; fy: number } | null>(null);
  const [hoveredFigureId, setHoveredFigureId] = useState<string | null>(null);
  const [figureToolbar, setFigureToolbar] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showShapesPopover, setShowShapesPopover] = useState(false);
  const [editingTextFigureId, setEditingTextFigureId] = useState<string | null>(null);
  const [textEditorPosition, setTextEditorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [textEditorText, setTextEditorText] = useState('');
  const isEditingTextRef = useRef(false);
  const isDraggingTextEditorRef = useRef(false);
  const textEditorDragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [guideV, setGuideV] = useState<number | null>(null); // canvas X
  const [guideH, setGuideH] = useState<number | null>(null); // canvas Y
  const [guideVRefY, setGuideVRefY] = useState<number | null>(null); // reference node Y for vertical guide span
  const [guideHRefX, setGuideHRefX] = useState<number | null>(null); // reference node X for horizontal guide span
  const [dragCanvasPos, setDragCanvasPos] = useState<{ x: number; y: number } | null>(null);
  const textClipboardRef = useRef<null | { figures: Array<{ x: number; y: number; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold' }> }>(null);
  const pasteBumpRef = useRef<number>(0);
  // Track initial positions of selected text figures when node drag starts (for live move)
  const [selectedFiguresStartPositions, setSelectedFiguresStartPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [didLiveFigureDrag, setDidLiveFigureDrag] = useState(false);
  // Unified draw tool state
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'draw'>('select');
  const [drawKind, setDrawKind] = useState<'rect' | 'square' | 'ellipse' | 'circle' | 'line' | null>(null);
  const [newLinePath, setNewLinePath] = useState<'straight' | 'elbow'>('straight');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [draftCurrent, setDraftCurrent] = useState<{ x: number; y: number } | null>(null);
  // legacy removed: pendingSquare/pendingCircle
  const [resizingShape, setResizingShape] = useState<null | { id: string; corner: 0 | 1 | 2 | 3; startX: number; startY: number; startW: number; startH: number }>(null);

  // Close hover toolbar when any editor opens
  useEffect(() => {
    if (showLinkEditor || showColorPicker || showTitleEditor) {
      setHoverToolbarNode(null);
    }
  }, [showLinkEditor, showColorPicker, showTitleEditor]);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showShapesPopover) {
        setShowShapesPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShapesPopover]);

  // Ensure pan/drag state is cleared when switching to draw tool (crosshair immediately)
  useEffect(() => {
    if (activeTool === 'draw') {
      setIsDragging(false);
      setDraggedNode(null);
      setIsSpacePressed(false);
      backgroundDownRef.current = null;
    }
  }, [activeTool, drawKind]);

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

  // Keyboard shortcuts and global paste handler for canvas selections
  useEffect(() => {
    const pasteBumpRef = { current: 0 } as { current: number };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setHighlightedLink(null);
        setHoverToolbarNode(null);
        setShowLinkEditor(false);
        setShowColorPicker(false);
        setShowTitleEditor(false);
      }
      // Space key for panning (but not when typing in input fields)
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.hasAttribute('contenteditable')
      );
      
      if (e.code === 'Space' && !isSpacePressed && !isTyping) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      // V key for select mode (but not when typing in input fields)
      if ((e.key === 'v' || e.key === 'V') && !isTyping) {
        setActiveTool('select');
        setDrawKind(null);
      }
      // T key for text mode
      if ((e.key === 't' || e.key === 'T') && !isTyping) {
        setActiveTool('text');
        setDrawKind(null);
        setIsSpacePressed(false);
      }
      // L key for line mode
      if ((e.key === 'l' || e.key === 'L') && !isTyping) {
        setActiveTool('draw');
        setDrawKind('line');
        setIsSpacePressed(false);
      }
      // Delete key for selected nodes (but not when typing in input fields)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !isTyping) {
        e.preventDefault();
        handleDeleteSelectedNodes();
      }
      // A key for add child (when a single node is selected, but not when typing)
      if ((e.key === 'a' || e.key === 'A') && selectedIds.size === 1 && onAddChild && !isTyping) {
        const selectedNode = nodes.find(n => selectedIds.has(n.id));
        if (selectedNode) {
          onAddChild(selectedNode.id);
        }
      }
      // C key for color picker (when nodes are selected, but not when typing) - ignore Cmd/Ctrl (copy)
      if (!e.metaKey && !e.ctrlKey && (e.key === 'c' || e.key === 'C') && selectedIds.size > 0 && !isTyping) {
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

      // Copy selected text figures or nodes (Cmd/Ctrl + C)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !isTyping && !editingTextFigureId) {
        const selectedText = (figures?.filter(f => f.type === 'text' && (selectedFigureIds.has(f.id) || selectedFigureId === f.id)) || []);
        const hasNodes = selectedIds.size > 0;
        if (selectedText.length > 0 && hasNodes) {
          e.preventDefault();
          const ids = new Set(Array.from(selectedIds));
          const copiedNodes = nodes.filter(n => ids.has(n.id));
          const copiedExtraLinks = (extraLinks || []).filter(l => ids.has(l.sourceId) && ids.has(l.targetId));
          const styles: Record<string, any> = {};
          copiedNodes.forEach(n => { if (n.parent && ids.has(n.parent)) { const key = linkKey(n.parent, n.id); if (linkStyles[key]) styles[key] = linkStyles[key]; } });
          copiedExtraLinks.forEach(l => { const key = linkKey(l.sourceId, l.targetId); if (linkStyles[key]) styles[key] = linkStyles[key]; });
          const payload = {
            type: 'sitemap-mixed',
            nodes: copiedNodes,
            extraLinks: copiedExtraLinks,
            linkStyles: styles,
            figures: selectedText.map(f => ({ x: f.x, y: f.y, text: f.text, textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight }))
          };
          (async () => { try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch {} })();
          pasteBumpRef.current = 0;
          return;
        }
        if (selectedText && selectedText.length > 0) {
          e.preventDefault();
          const payload = {
            type: 'sitemap-text-figures',
            figures: selectedText.map(f => ({ x: f.x, y: f.y, text: f.text, textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight }))
          };
          const json = JSON.stringify(payload);
          (async () => {
            try { await navigator.clipboard.writeText(json); }
            catch { textClipboardRef.current = { figures: payload.figures }; }
          })();
          pasteBumpRef.current = 0;
          return;
        }
        if (selectedIds.size > 0) {
          e.preventDefault();
          const ids = new Set(Array.from(selectedIds));
          const copiedNodes = nodes.filter(n => ids.has(n.id));
          const copiedExtraLinks = (extraLinks || []).filter(l => ids.has(l.sourceId) && ids.has(l.targetId));
          const styles: Record<string, any> = {};
          copiedNodes.forEach(n => {
            if (n.parent && ids.has(n.parent)) {
              const key = linkKey(n.parent, n.id);
              if (linkStyles[key]) styles[key] = linkStyles[key];
            }
          });
          copiedExtraLinks.forEach(l => {
            const key = linkKey(l.sourceId, l.targetId);
            if (linkStyles[key]) styles[key] = linkStyles[key];
          });
          const payload = { type: 'sitemap-nodes', nodes: copiedNodes, extraLinks: copiedExtraLinks, linkStyles: styles };
          (async () => { try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch {} })();
          pasteBumpRef.current = 0;
          return;
        }
        // Create free-form selection group with G when not using modifiers
      } else if ((e.key === 'g' || e.key === 'G') && !isTyping && !e.metaKey && !e.ctrlKey) {
        const nodeIds = Array.from(selectedIds);
        const figureIds = Array.from(selectedFigureIds);
        if ((nodeIds.length + figureIds.length) > 0 && onCreateSelectionGroup) {
          onCreateSelectionGroup(nodeIds, figureIds);
        }
      } else if ((e.key === 'u' || e.key === 'U') && !isTyping && !e.metaKey && !e.ctrlKey) {
        const nodeIds = Array.from(selectedIds);
        const figureIds = Array.from(selectedFigureIds);
        if ((nodeIds.length + figureIds.length) > 0 && onUngroupSelection) {
          onUngroupSelection(nodeIds, figureIds);
        }
      }

      // Paste copied items (Cmd/Ctrl + V)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !isTyping) {
        e.preventDefault();
        (async () => {
          let parsed: any = null;
          try { const txt = await navigator.clipboard.readText(); parsed = JSON.parse(txt); }
          catch { parsed = textClipboardRef.current ? { type: 'sitemap-text-figures', figures: textClipboardRef.current.figures } : null; }
          if (parsed && parsed.type === 'sitemap-mixed' && Array.isArray(parsed.nodes) && Array.isArray(parsed.figures)) {
            if (!onNodesUpdate || !onCreateFigure) return;
            const bump = 160 + 32 * (pasteBumpRef.current++);
            const idMap = new Map<string, string>();
            const time = Date.now();
            parsed.nodes.forEach((n: any, idx: number) => idMap.set(n.id, `node-${time}-${idx}-${Math.random().toString(36).slice(2,6)}`));
            const newNodes = parsed.nodes.map((n: any) => {
              const id = idMap.get(n.id)!;
              const parent = n.parent && idMap.has(n.parent) ? idMap.get(n.parent)! : null;
              const children = Array.isArray(n.children) ? n.children.filter((cid: string) => idMap.has(cid)).map((cid: string) => idMap.get(cid)!) : [];
              return { ...n, id, parent, children, x: (n.x ?? 0) + bump, y: (n.y ?? 0) + bump, fx: (n.x ?? 0) + bump, fy: (n.y ?? 0) + bump };
            });
            onNodesUpdate([...nodes, ...newNodes]);
            const newFigIds: string[] = [];
            parsed.figures.forEach((f: any) => {
              const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              newFigIds.push(id);
              onCreateFigure({ id, type: 'text', x: (f.x ?? 0) + bump, y: (f.y ?? 0) + bump, text: f.text ?? 'Text', textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight });
            });
            if (parsed.extraLinks && Array.isArray(parsed.extraLinks) && onExtraLinkCreate) {
              parsed.extraLinks.forEach((l: any) => {
                const s = idMap.get(l.sourceId); const t = idMap.get(l.targetId);
                if (s && t) onExtraLinkCreate(s, t);
              });
            }
            if (parsed.linkStyles && onLinkStyleChange) {
              Object.entries(parsed.linkStyles as Record<string, any>).forEach(([oldKey, style]) => {
                const [sOld, tOld] = oldKey.split('-');
                const sNew = idMap.get(sOld || '');
                const tNew = idMap.get(tOld || '');
                if (sNew && tNew) onLinkStyleChange(`${sNew}-${tNew}`, style);
              });
            }
            setSelectedIds(new Set(newNodes.map((n: any) => n.id)));
            setSelectedFigureIds(new Set(newFigIds));
            setSelectedFigureId(newFigIds[0] || null);
            return;
          }
          if (parsed && parsed.type === 'sitemap-text-figures' && Array.isArray(parsed.figures)) {
            if (!onCreateFigure) return;
            const bump = 160 + 32 * (pasteBumpRef.current++);
            const newIds: string[] = [];
            parsed.figures.forEach((f: any) => {
              const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              newIds.push(id);
              onCreateFigure({ id, type: 'text', x: (f.x ?? 0) + bump, y: (f.y ?? 0) + bump, text: f.text ?? 'Text', textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight });
            });
            if (newIds.length > 0) {
              setSelectedFigureIds(new Set(newIds));
              setSelectedFigureId(newIds[0]);
            }
            return;
          }
          if (parsed && parsed.type === 'sitemap-nodes' && Array.isArray(parsed.nodes)) {
            if (!onNodesUpdate) return;
            const bump = 160 + 32 * (pasteBumpRef.current++);
            const idMap = new Map<string, string>();
            const time = Date.now();
            parsed.nodes.forEach((n: any, idx: number) => idMap.set(n.id, `node-${time}-${idx}-${Math.random().toString(36).slice(2,6)}`));
            const newNodes = parsed.nodes.map((n: any) => {
              const id = idMap.get(n.id)!;
              const parent = n.parent && idMap.has(n.parent) ? idMap.get(n.parent)! : null;
              const children = Array.isArray(n.children) ? n.children.filter((cid: string) => idMap.has(cid)).map((cid: string) => idMap.get(cid)!) : [];
              return { ...n, id, parent, children, x: (n.x ?? 0) + bump, y: (n.y ?? 0) + bump, fx: (n.x ?? 0) + bump, fy: (n.y ?? 0) + bump };
            });
            onNodesUpdate([...nodes, ...newNodes]);
            // Select newly pasted nodes as a group for immediate dragging
            setSelectedIds(new Set(newNodes.map((n: any) => n.id)));
            // Clear any text figure selection to avoid mixed selection states
            setSelectedFigureIds(new Set());
            if (parsed.extraLinks && Array.isArray(parsed.extraLinks) && onExtraLinkCreate) {
              parsed.extraLinks.forEach((l: any) => {
                const s = idMap.get(l.sourceId); const t = idMap.get(l.targetId);
                if (s && t) onExtraLinkCreate(s, t);
              });
            }
            if (parsed.linkStyles && onLinkStyleChange) {
              Object.entries(parsed.linkStyles as Record<string, any>).forEach(([oldKey, style]) => {
                const [sOld, tOld] = oldKey.split('-');
                const sNew = idMap.get(sOld || '');
                const tNew = idMap.get(tOld || '');
                if (sNew && tNew) onLinkStyleChange(`${sNew}-${tNew}`, style);
              });
            }
            return;
          }
        })();
        return;
      }
    };

    const onPasteEvent = (ev: ClipboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping = !!activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.hasAttribute('contenteditable'));
      if (isTyping && editingTextFigureId) return; // editor handles its own paste
      const txt = ev.clipboardData?.getData('text/plain') || '';
      if (!txt) return;
      try {
        const parsed = JSON.parse(txt);
        if (parsed && parsed.type === 'sitemap-mixed' && Array.isArray(parsed.nodes) && Array.isArray(parsed.figures)) {
          ev.preventDefault();
          if (!onNodesUpdate || !onCreateFigure) return;
          const bump = 160 + 32 * (pasteBumpRef.current++);
          const idMap = new Map<string, string>();
          const time = Date.now();
          parsed.nodes.forEach((n: any, idx: number) => idMap.set(n.id, `node-${time}-${idx}-${Math.random().toString(36).slice(2,6)}`));
          const newNodes = parsed.nodes.map((n: any) => {
            const id = idMap.get(n.id)!;
            const parent = n.parent && idMap.has(n.parent) ? idMap.get(n.parent)! : null;
            const children = Array.isArray(n.children) ? n.children.filter((cid: string) => idMap.has(cid)).map((cid: string) => idMap.get(cid)!) : [];
            return { ...n, id, parent, children, x: (n.x ?? 0) + bump, y: (n.y ?? 0) + bump, fx: (n.x ?? 0) + bump, fy: (n.y ?? 0) + bump };
          });
          onNodesUpdate([...nodes, ...newNodes]);
          const newFigIds: string[] = [];
          parsed.figures.forEach((f: any) => {
            const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            newFigIds.push(id);
            onCreateFigure({ id, type: 'text', x: (f.x ?? 0) + bump, y: (f.y ?? 0) + bump, text: f.text ?? 'Text', textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight });
          });
          if (parsed.extraLinks && Array.isArray(parsed.extraLinks) && onExtraLinkCreate) {
            parsed.extraLinks.forEach((l: any) => {
              const s = idMap.get(l.sourceId); const t = idMap.get(l.targetId);
              if (s && t) onExtraLinkCreate(s, t);
            });
          }
          if (parsed.linkStyles && onLinkStyleChange) {
            Object.entries(parsed.linkStyles as Record<string, any>).forEach(([oldKey, style]) => {
              const [sOld, tOld] = oldKey.split('-');
              const sNew = idMap.get(sOld || '');
              const tNew = idMap.get(tOld || '');
              if (sNew && tNew) onLinkStyleChange(`${sNew}-${tNew}`, style);
            });
          }
          setSelectedIds(new Set(newNodes.map((n: any) => n.id)));
          setSelectedFigureIds(new Set(newFigIds));
          setSelectedFigureId(newFigIds[0] || null);
          return;
        }
        if (parsed && parsed.type === 'sitemap-text-figures' && Array.isArray(parsed.figures)) {
          ev.preventDefault();
          if (!onCreateFigure) return;
          const bump = 160 + 32 * (pasteBumpRef.current++);
          const newIds: string[] = [];
          parsed.figures.forEach((f: any) => {
            const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            newIds.push(id);
            onCreateFigure({ id, type: 'text', x: (f.x ?? 0) + bump, y: (f.y ?? 0) + bump, text: f.text ?? 'Text', textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight });
          });
          if (newIds.length > 0) {
            setSelectedFigureIds(new Set(newIds));
            setSelectedFigureId(newIds[0]);
          }
          return;
        }
        if (parsed && parsed.type === 'sitemap-nodes' && Array.isArray(parsed.nodes)) {
          ev.preventDefault();
          if (!onNodesUpdate) return;
          const bump = 160 + 32 * (pasteBumpRef.current++);
          const idMap = new Map<string, string>();
          const time = Date.now();
          parsed.nodes.forEach((n: any, idx: number) => idMap.set(n.id, `node-${time}-${idx}-${Math.random().toString(36).slice(2,6)}`));
          const newNodes = parsed.nodes.map((n: any) => {
            const id = idMap.get(n.id)!;
            const parent = n.parent && idMap.has(n.parent) ? idMap.get(n.parent)! : null;
            const children = Array.isArray(n.children) ? n.children.filter((cid: string) => idMap.has(cid)).map((cid: string) => idMap.get(cid)!) : [];
            return { ...n, id, parent, children, x: (n.x ?? 0) + bump, y: (n.y ?? 0) + bump, fx: (n.x ?? 0) + bump, fy: (n.y ?? 0) + bump };
          });
          onNodesUpdate([...nodes, ...newNodes]);
          setSelectedIds(new Set(newNodes.map((n: any) => n.id)));
          setSelectedFigureIds(new Set());
          if (parsed.extraLinks && Array.isArray(parsed.extraLinks) && onExtraLinkCreate) {
            parsed.extraLinks.forEach((l: any) => {
              const s = idMap.get(l.sourceId); const t = idMap.get(l.targetId);
              if (s && t) onExtraLinkCreate(s, t);
            });
          }
          if (parsed.linkStyles && onLinkStyleChange) {
            Object.entries(parsed.linkStyles as Record<string, any>).forEach(([oldKey, style]) => {
              const [sOld, tOld] = oldKey.split('-');
              const sNew = idMap.get(sOld || '');
              const tNew = idMap.get(tOld || '');
              if (sNew && tNew) onLinkStyleChange(`${sNew}-${tNew}`, style);
            });
          }
          return;
        }
      } catch {
        // not our payload — allow native paste
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.hasAttribute('contenteditable')
      );
      
      if (e.code === 'Space' && !isTyping) {
        e.preventDefault();
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPasteEvent);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPasteEvent);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isSpacePressed, selectedIds, nodes, onAddChild, editingTextFigureId, figures, onCreateFigure, onNodesUpdate]);

  // Clear pan/drag state when entering draw/text tool so cursor reflects tool use
  useEffect(() => {
    const isDrawTool = activeTool === 'draw' || activeTool === 'text';
    if (isDrawTool) {
      setIsDragging(false);
      setDraggedNode(null);
      backgroundDownRef.current = null;
      setIsSpacePressed(false);
    }
  }, [activeTool]);

  // Global cursor override to reflect tool immediately (even before moving over canvas)
  useEffect(() => {
    if (activeTool === 'draw') {
      document.body.style.cursor = 'crosshair';
    } else if (activeTool === 'text') {
      document.body.style.cursor = 'text';
    } else if (isSpacePressed) {
      document.body.style.cursor = 'grab';
    } else if (isDragging) {
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = '';
    }
    return () => { document.body.style.cursor = ''; };
  }, [activeTool, isSpacePressed, isDragging]);


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
    drawFreeLines(ctx, freeLines || []);
    drawFigures(ctx, figures || []);
    drawNodes(ctx, effectiveNodes, hoveredNode);
    // Faint selection bounding box for mixed selections (nodes + texts)
    // Only show when not marquee-selecting and not editing text
    const selectionCount = selectedIds.size + selectedFigureIds.size;
    // Only draw the union box when the selection includes at least one text figure,
    // to avoid duplicating any nodes-only selection visuals from other paths
    if (selectionCount >= 2 && selectedFigureIds.size > 0 && !(marqueeSelection?.isActive) && !editingTextFigureId) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      // Include nodes
      effectiveNodes.forEach(n => {
        if (!selectedIds.has(n.id) || n.x == null || n.y == null) return;
        const dims = calculateNodeDimensions(n, ctx);
        const left = n.x - dims.width / 2;
        const top = n.y - dims.height / 2;
        const right = n.x + dims.width / 2;
        const bottom = n.y + dims.height / 2;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      });
      // Include text figures
      if (figures) {
        const canvas = canvasRef.current;
        const cctx = canvas ? canvas.getContext('2d') : null;
        figures.forEach(f => {
          if (!selectedFigureIds.has(f.id) || f.type !== 'text') return;
          const b = getTextFigureBounds(f as any, cctx);
          minX = Math.min(minX, b.left);
          minY = Math.min(minY, b.top);
          maxX = Math.max(maxX, b.right);
          maxY = Math.max(maxY, b.bottom);
        });
      }
      if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
        const pad = 6;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        ctx.restore();
      }
    }
    // Draw alignment guides (after content, inside transform)
    if (guideV != null && dragCanvasPos) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#8BD3E6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const y1 = Math.min(dragCanvasPos.y, guideVRefY ?? dragCanvasPos.y) - 40;
      const y2 = Math.max(dragCanvasPos.y, guideVRefY ?? dragCanvasPos.y) + 40;
      ctx.moveTo(guideV, y1);
      ctx.lineTo(guideV, y2);
      ctx.stroke();
      ctx.restore();
    }
    if (guideH != null && dragCanvasPos) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#8BD3E6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const x1 = Math.min(dragCanvasPos.x, guideHRefX ?? dragCanvasPos.x) - 40;
      const x2 = Math.max(dragCanvasPos.x, guideHRefX ?? dragCanvasPos.x) + 40;
      ctx.moveTo(x1, guideH);
      ctx.lineTo(x2, guideH);
      ctx.stroke();
      ctx.restore();
    }
    // Drafting preview (ghost)
    if (isDrafting && activeTool === 'draw' && drawKind && draftStart && draftCurrent) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2;
      if (drawKind === 'line') {
        if (newLinePath === 'straight') {
          ctx.beginPath();
          ctx.moveTo(draftStart.x, draftStart.y);
          ctx.lineTo(draftCurrent.x, draftCurrent.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(draftStart.x, draftStart.y);
          ctx.lineTo(draftCurrent.x, draftStart.y);
          ctx.lineTo(draftCurrent.x, draftCurrent.y);
          ctx.stroke();
        }
        // Draw a small start-point dot for immediate feedback
        ctx.setLineDash([]);
        ctx.fillStyle = '#2563EB';
        ctx.beginPath();
        ctx.arc(draftStart.x, draftStart.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const dx = draftCurrent.x - draftStart.x;
        const dy = draftCurrent.y - draftStart.y;
        let w = Math.abs(dx);
        let h = Math.abs(dy);
        if (w < 2 && h < 2) { w = 160; h = 80; }
        if (drawKind === 'square' || drawKind === 'circle') {
          const side = Math.max(w, h);
          w = side; h = side;
        }
        const cx = draftStart.x + dx / 2;
        const cy = draftStart.y + dy / 2;
        const x = cx - w / 2;
        const y = cy - h / 2;
        if (drawKind === 'rect' || drawKind === 'square') {
          ctx.strokeRect(x, y, w, h);
        } else {
          ctx.beginPath();
          ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawMarqueeSelection(ctx, marqueeSelection);

    ctx.restore();
  }, [nodes, transform, hoveredNode, searchResults, focusedNode, colorOverrides, selectedIds, marqueeSelection, highlightedLink, draggedNode, dragDelta, dragSelectionIds, dragStartPositions, animationTime, figures, freeLines, isDrafting, draftStart, draftCurrent, activeTool, drawKind, newLinePath, linkStyles, extraLinks]);

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

      // Apply styling (consistent defaults with new connections)
      ctx.strokeStyle = isHighlighted ? '#172038' : (style.color ?? '#111827');
      ctx.lineWidth = isHighlighted ? 3 : (style.width ?? 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Default to solid when not specified
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
      
      // Apply styling (consistent defaults with new connections)
      ctx.strokeStyle = isHighlighted ? '#172038' : (style.color ?? '#111827');
      ctx.lineWidth = isHighlighted ? 3 : (style.width ?? 2);
      
      // Apply dash pattern (default solid)
      const dash = style.dash ?? 'solid';
      if (dash === 'dashed') {
      ctx.setLineDash(isHighlighted ? [] : [6, 4]);
      } else if (dash === 'dotted') {
        ctx.setLineDash([2, 3]);
      } else {
        ctx.setLineDash([]);
      }
      
      const path = style.path || 'straight';
      const { elbowX, elbowY } = path === 'elbow' ? calculateElbowCorner(s, t) : { elbowX: s.x, elbowY: t.y };
      
      ctx.beginPath();
      if (path === 'straight') {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      } else if (path === 'elbow') {
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
        const startAngle = endAngleForPath(path, t.x, t.y, s.x, s.y, elbowX, elbowY) + Math.PI;
        drawArrowhead(ctx, s.x, s.y, startAngle, style);
      }
      if (style.arrowEnd) {
        const endAngle = endAngleForPath(path, s.x, s.y, t.x, t.y, elbowX, elbowY);
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

      // Calculate consistent width for title and URL containers
      const textContainerWidth = dimensions.width - 32;
      
      // Draw content type (if exists) at the top
      if (node.contentType) {
        const contentTypeColor = (override.textColor || node.textColor)
          ? `${(override.textColor || node.textColor)}AA`
          : 'rgba(0, 0, 0, 0.6)';
        ctx.fillStyle = contentTypeColor;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const contentTypeY = node.y - 30; // Top position
        const contentTypeText = truncateText(ctx, node.contentType, textContainerWidth);
        ctx.fillText(contentTypeText, node.x, contentTypeY);
      }

      // Draw title text in the middle
      const titleColor = override.textColor || node.textColor || '#000000';
      ctx.fillStyle = titleColor;
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const titleY = node.y - 8; // Middle position (adjusted for content type above)
      const titleText = truncateText(ctx, node.title, textContainerWidth);
      ctx.fillText(titleText, node.x, titleY);

      // Draw URL at the bottom
      const urlColor = (override.textColor || node.textColor)
        ? `${(override.textColor || node.textColor)}CC`
        : 'rgba(0, 0, 0, 0.8)';
      ctx.fillStyle = urlColor;
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

      const urlY = node.y + 18; // Bottom position
      const urlText = truncateText(ctx, node.url, textContainerWidth);
      ctx.fillText(urlText, node.x, urlY);
    });
  };


  const calculateNodeDimensions = (node: PageNode, ctx: CanvasRenderingContext2D): { width: number; height: number } => {
    const padding = 24;
    const minWidth = 200; 
    const maxWidth = 380; // Maximum width to prevent nodes from becoming too wide
    const minHeight = 100;

    // Measure title
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const titleWidth = ctx.measureText(node.title).width;

    // Measure URL (now separate from content type)
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const urlWidth = ctx.measureText(node.url).width;

    // Measure content type if it exists (displayed separately above title)
    let contentTypeWidth = 0;
    if (node.contentType) {
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      contentTypeWidth = ctx.measureText(node.contentType).width;
    }

    // Use the maximum width of title, URL, and content type
    const contentWidth = Math.max(titleWidth, urlWidth, contentTypeWidth);
    const width = Math.min(maxWidth, Math.max(minWidth, contentWidth + padding));
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

  // removed unused drawHoverTooltip

  const drawFigures = (ctx: CanvasRenderingContext2D, figs: Figure[]) => {
    figs.forEach(fig => {
      // Do not draw the figure while it's being edited (prevent double render)
      if (editingTextFigureId === fig.id) {
        return;
      }

      // Draw text
      if (fig.type === 'text') {
        ctx.fillStyle = fig.textColor || '#000000';
        const fontSize = (fig as any).fontSize ?? 18;
        const fontWeight = (fig as any).fontWeight === 'bold' ? 'bold' : '600';
        ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = fig.text || 'Text';
        const metrics = ctx.measureText(text);
        const ascent = (metrics as any).actualBoundingBoxAscent ?? fontSize * 0.85;
        const descent = (metrics as any).actualBoundingBoxDescent ?? fontSize * 0.25;
        const textWidth = metrics.width;
        // box metrics removed

        // No selection-only box; editing overlay handles the box

        ctx.fillText(text, fig.x, fig.y);

        if ((fig as any).underline) {
          const underlineY = fig.y + (ascent - (ascent + descent) / 2) + 10; // slightly lower underline
          const startX = fig.x - textWidth / 2;
          const endX = fig.x + textWidth / 2;
          ctx.save();
          ctx.lineWidth = Math.max(1, Math.round(fontSize / 12));
          ctx.strokeStyle = fig.textColor || '#000000';
          ctx.beginPath();
          ctx.moveTo(startX, underlineY);
          ctx.lineTo(endX, underlineY);
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      
      // For shapes, draw background
      const w = fig.width ?? 160;
      const h = fig.height ?? 80;
      const halfW = w / 2;
      const halfH = h / 2;

      ctx.fillStyle = fig.fill || '#ffffff';

      if (fig.type === 'rect' || fig.type === 'square') {
        // square is same as rect but w === h is maintained by resize logic
        ctx.fillRect(fig.x - halfW, fig.y - halfH, w, h);
      } else if (fig.type === 'ellipse' || fig.type === 'circle') {
        ctx.beginPath();
        ctx.ellipse(fig.x, fig.y, halfW, halfH, 0, 0, 2 * Math.PI);
        ctx.fill();
      }
      
      // Draw border
      if (fig.stroke) {
        ctx.strokeStyle = fig.stroke;
        ctx.lineWidth = Math.max(1, fig.strokeWidth ?? 2);
        if (fig.type === 'rect' || fig.type === 'square') {
          ctx.strokeRect(fig.x - halfW, fig.y - halfH, w, h);
        } else if (fig.type === 'ellipse' || fig.type === 'circle') {
          ctx.beginPath();
          ctx.ellipse(fig.x, fig.y, halfW, halfH, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
      
      // Show resize handles on hover/select (only for shapes, not text)
      const isActive = hoveredFigureId === fig.id || selectedFigureId === fig.id;
      if (isActive) {
        const handleR = 5;
        const corners = [
          { x: fig.x - halfW, y: fig.y - halfH }, // TL
          { x: fig.x + halfW, y: fig.y - halfH }, // TR
          { x: fig.x + halfW, y: fig.y + halfH }, // BR
          { x: fig.x - halfW, y: fig.y + halfH }, // BL
        ];
        ctx.fillStyle = '#3B82F6';
        corners.forEach(c => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, handleR, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      
      // Draw text inside shape if present
      if (fig.text && fig.text.trim()) {
        ctx.fillStyle = fig.textColor || '#000000';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fig.text, fig.x, fig.y);
      }
    });
  };

  const drawFreeLines = (ctx: CanvasRenderingContext2D, lines: FreeLine[]) => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    lines.forEach(line => {
      // Resolve endpoints to node edges if anchored
      const s = resolveEndpoint({ nodeId: line.startNodeId, x: line.x1, y: line.y1 }, line.x2, line.y2, nodeMap);
      const t = resolveEndpoint({ nodeId: line.endNodeId, x: line.x2, y: line.y2 }, s.x, s.y, nodeMap);
      const x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y;

      ctx.strokeStyle = line.style.color;
      ctx.lineWidth = line.style.width;
      ctx.setLineDash(line.style.dash === 'dashed' ? [6, 4] : []);

      ctx.beginPath();
      if (line.style.path === 'straight') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else if (line.style.path === 'elbow') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      ctx.setLineDash([]);

      // Draw arrows if needed (segment-aware for elbow)
      if (line.style.arrowStart) {
        const angleStart = line.style.path === 'elbow'
          ? (x2 >= x1 ? 0 : Math.PI)
          : Math.atan2(y2 - y1, x2 - x1) + Math.PI;
        const style: LinkStyle = { arrowSize: 8, color: line.style.color, arrowType: 'triangle' };
        drawArrowhead(ctx, x1, y1, angleStart, style);
      }
      if (line.style.arrowEnd) {
        const angleEnd = line.style.path === 'elbow'
          ? (y2 >= y1 ? Math.PI / 2 : -Math.PI / 2)
          : Math.atan2(y2 - y1, x2 - x1);
        const style: LinkStyle = { arrowSize: 8, color: line.style.color, arrowType: 'triangle' };
        drawArrowhead(ctx, x2, y2, angleEnd, style);
      }

      // Endpoint handles (visible on hover/drag), on resolved endpoints
      const showHandles = hoveredFreeLineId === line.id || (draggingLineEnd && draggingLineEnd.id === line.id);
      if (showHandles) {
        const r = 5;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 2 / transform.scale;
        ctx.beginPath(); ctx.arc(x1, y1, r / transform.scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x2, y2, r / transform.scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // Show magnetic ports on nodes while dragging an endpoint
      if (draggingLineEnd && draggingLineEnd.id === line.id) {
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          const towardX = draggingLineEnd.end === 'start' ? x2 : x1;
          const towardY = draggingLineEnd.end === 'start' ? y2 : y1;
          const p = getConnectionPoint({ x: n.x as number, y: n.y as number, width: (n as any).width, height: (n as any).height }, towardX, towardY);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5 / transform.scale, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#3B82F6';
          ctx.lineWidth = 2 / transform.scale;
          ctx.fill();
          ctx.stroke();
        }
      }
    });
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

  // Guard: detect if a client click is inside any node's bounding box (with small padding)
  const isInsideNodeBox = (clientX: number, clientY: number, padPx = 6) => {
    const canvas = canvasRef.current; if (!canvas) return false;
    const ctx = canvas.getContext('2d'); if (!ctx) return false;
    const { cx, cy } = pointToCanvas(clientX, clientY);
    const pad = padPx / transform.scale;
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      const { width, height } = calculateNodeDimensions(n, ctx);
      const left = n.x - width / 2 - pad;
      const right = n.x + width / 2 + pad;
      const top = n.y - height / 2 - pad;
      const bottom = n.y + height / 2 + pad;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) return true;
    }
    return false;
  };

  // Convert canvas coordinates back to client (screen) coordinates
  const canvasToClient = (cx: number, cy: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + transform.x + cx * transform.scale;
    const y = rect.top + transform.y + cy * transform.scale;
    return { x, y };
  };

  // Drag handlers for inline Text editor overlay
  const beginTextEditorDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingTextEditorRef.current = true;
    textEditorDragOffsetRef.current = {
      dx: e.clientX - textEditorPosition.x,
      dy: e.clientY - textEditorPosition.y,
    };
    // Snapshot group selection (nodes + texts) so the whole group moves together
    if (editingTextFigureId) {
      const group = selectionGroups.find(g => g.memberFigureIds.includes(editingTextFigureId));
      const nodeIds = group ? group.memberNodeIds : Array.from(selectedIds);
      const figIds = group ? group.memberFigureIds : Array.from(selectedFigureIds);

      if (group) {
        setSelectedIds(new Set(group.memberNodeIds));
        setSelectedFigureIds(new Set(group.memberFigureIds));
      }

      if (nodeIds.length > 0) {
        const starts: Record<string, { x: number; y: number }> = {};
        nodeIds.forEach(id => {
          const n = nodes.find(nn => nn.id === id);
          if (n && n.x != null && n.y != null) starts[id] = { x: n.x, y: n.y };
        });
        setDragSelectionIds(nodeIds);
        setDragStartPositions(starts);
      }

      if (figIds.length > 0) {
        const fstarts: Record<string, { x: number; y: number }> = {};
        figIds.forEach(fid => {
          const f = figures.find(ff => ff.id === fid);
          if (f) fstarts[fid] = { x: f.x, y: f.y };
        });
        setSelectedFiguresStartPositions(fstarts);
        setDidLiveFigureDrag(false);
      }
    }
    window.addEventListener('mousemove', onTextEditorDrag as any);
    window.addEventListener('mouseup', endTextEditorDrag as any);
  };

  const onTextEditorDrag = (e: MouseEvent) => {
    if (!isDraggingTextEditorRef.current || !editingTextFigureId) return;

    const nx = e.clientX - textEditorDragOffsetRef.current.dx;
    const ny = e.clientY - textEditorDragOffsetRef.current.dy;
    setTextEditorPosition({ x: nx, y: ny });

    const { cx, cy } = pointToCanvas(e.clientX, e.clientY);
    const start = selectedFiguresStartPositions[editingTextFigureId];
    const dx = start ? (cx - start.x) : 0;
    const dy = start ? (cy - start.y) : 0;

    // Move all selected/group figures using their snapshot
    Object.entries(selectedFiguresStartPositions).forEach(([fid, fstart]) => {
      onUpdateFigure?.(fid, { x: fstart.x + dx, y: fstart.y + dy });
    });

    // Move all selected/group nodes using their snapshot
    if (onNodesUpdate && dragSelectionIds && Object.keys(dragStartPositions).length > 0) {
      const updated = nodes.map(n => {
        const s = dragStartPositions[n.id];
        if (!s) return n;
        return { ...n, x: s.x + dx, y: s.y + dy, fx: s.x + dx, fy: s.y + dy };
      });
      onNodesUpdate(updated);
    }

    setFigureToolbar({ id: editingTextFigureId, x: nx, y: ny - 30 });
  };

  const endTextEditorDrag = () => {
    isDraggingTextEditorRef.current = false;
    window.removeEventListener('mousemove', onTextEditorDrag as any);
    window.removeEventListener('mouseup', endTextEditorDrag as any);
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

  // Find the closest point on a segment to a given point (in canvas coords)
  const closestPointOnSegment = (px:number, py:number, x1:number, y1:number, x2:number, y2:number) => {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const lenSq = vx*vx + vy*vy;
    const t = lenSq ? Math.max(0, Math.min(1, (wx*vx + wy*vy) / lenSq)) : 0;
    return { x: x1 + t * vx, y: y1 + t * vy, t };
  };

  // Magnetic snap radius (in screen pixels)
  const MAGNET_RADIUS = 18;

  // Compute connection point on node boundary toward a given target (canvas coords)
  type NodePort = 'top' | 'right' | 'bottom' | 'left';
  function getConnectionPoint(
    node: { x:number; y:number; width?:number; height?:number },
    towardX: number, towardY: number
  ) {
    const w = node.width ?? 150;
    const h = node.height ?? 60;
    const left = node.x - w/2, top = node.y - h/2, right = node.x + w/2, bottom = node.y + h/2;

    const dx = towardX - node.x, dy = towardY - node.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      const x = dx > 0 ? right : left;
      const y = node.y + (h/2) * (dy / Math.max(1, Math.abs(dx)));
      return { x, y, port: (dx > 0 ? 'right' : 'left') as NodePort };
    } else {
      const y = dy > 0 ? bottom : top;
      const x = node.x + (w/2) * (dx / Math.max(1, Math.abs(dy)));
      return { x, y, port: (dy > 0 ? 'bottom' : 'top') as NodePort };
    }
  }

  // Resolve a line endpoint either to free coords or to a node-edge anchor (canvas coords)
  function resolveEndpoint(
    end: { nodeId?:string; x:number; y:number },
    otherX:number, otherY:number,
    nodeMap: Map<string, any>
  ) {
    if (!end.nodeId) return { x: end.x, y: end.y };
    const n = nodeMap.get(end.nodeId);
    if (!n || n.x == null || n.y == null) return { x: end.x, y: end.y };
    const p = getConnectionPoint({ x: n.x as number, y: n.y as number, width: (n as any).width, height: (n as any).height }, otherX, otherY);
    return { x: p.x, y: p.y };
  }

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
        const cp = closestPointOnSegment(cx, cy, s.x, s.y, t.x, t.y);
        const mid = cp.t > 0.15 && cp.t < 0.85; // ignore near endpoints
        d = mid ? distPointToSegment(cx, cy, s.x, s.y, t.x, t.y) : Infinity;
      } else if (path === 'elbow') {
        const { elbowX, elbowY } = calculateElbowCorner(s, t);
        const cp1 = closestPointOnSegment(cx, cy, s.x, s.y, elbowX, elbowY);
        const cp2 = closestPointOnSegment(cx, cy, elbowX, elbowY, t.x, t.y);
        const d1 = (cp1.t > 0.15 && cp1.t < 0.85) ? distPointToSegment(cx, cy, s.x, s.y, elbowX, elbowY) : Infinity;
        const d2 = (cp2.t > 0.15 && cp2.t < 0.85) ? distPointToSegment(cx, cy, elbowX, elbowY, t.x, t.y) : Infinity;
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
  // removed unused saveToHistory

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
    const tolPx = 14;
    const tolCanvas = tolPx / transform.scale;
    const link = getLinkAtPosition(e.clientX, e.clientY, tolCanvas);
    if (link) {
      const k = linkKey(link.sourceId, link.targetId);
      const anchor = getConnectionAnchor(link.sourceId, link.targetId);
      if (anchor) setConnectionPopover({ linkKey: k, sourceId: link.sourceId, targetId: link.targetId, x: anchor.x, y: anchor.y });
      setContextMenu(null);
      setHighlightedLink(null);
    } else {
      setContextMenu(null);
      setHighlightedLink(null);
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
    // If editing text, finish edit via blur and consume click to avoid panning
    if (isEditingTextRef.current) {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Only handle left mouse button for drag/select
    if (e.button !== 0) return;

    // NOTE: Do NOT start drafting yet; we want to allow handle resize or figure drag first

    // Check for resize handle first (takes precedence over drag)
    const handleHit = getShapeHandleAtPosition(e.clientX, e.clientY);
    if (handleHit && onUpdateFigure) {
      const fig = figures.find(f => f.id === handleHit.id);
      if (fig) {
        setSelectedFigureId(fig.id);
        setFigureToolbar(null);
        setResizingShape({
          id: fig.id,
          corner: handleHit.corner,
          startX: fig.x,
          startY: fig.y,
          startW: fig.width ?? 160,
          startH: fig.height ?? 80,
        });
        return;
      }
    }
    
    // Figure select/drag (allowed in select and draw modes)
    if (activeTool === 'select' || activeTool === 'draw') {
      const f = getFigureAtPosition(e.clientX, e.clientY);
      if (f && !editingTextFigureId) {
        setSelectedFigureId(f.id);
        setFigureToolbar(null); // Close toolbar on new click
        setDraggingFigureId(f.id);
        setFigureDragStart({ sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y });
        // If grouped or multi-selected with nodes, prepare node drag context too
        const group = selectionGroups.find(g => g.memberFigureIds.includes(f.id));
        const nodeIdsToDrag = group ? group.memberNodeIds : Array.from(selectedIds);
        if (nodeIdsToDrag.length > 0) {
          setDragSelectionIds(nodeIdsToDrag);
          const starts: Record<string, { x: number; y: number }> = {};
          nodeIdsToDrag.forEach(id => {
            const n = nodes.find(nn => nn.id === id);
            if (n && n.x != null && n.y != null) starts[id] = { x: n.x, y: n.y };
          });
          setDragStartPositions(starts);
        }
        // Snapshot figure start positions for all selected figures
        const figIds = group ? group.memberFigureIds : (selectedFigureIds.size > 0 ? Array.from(selectedFigureIds) : [f.id]);
        const figStarts: Record<string, { x: number; y: number }> = {};
        figIds.forEach(fid => {
          const ff = figures.find(x => x.id === fid);
          if (ff) figStarts[fid] = { x: ff.x, y: ff.y };
        });
        setSelectedFiguresStartPositions(figStarts);
        setDidLiveFigureDrag(false);
        // Don't return - allow normal drag flow
      }
    }
    console.log('SitemapCanvas: handleMouseDown called');
    
    // Close context menu if clicking elsewhere
    if (contextMenu) {
      setContextMenu(null);
      setHighlightedLink(null);
    }
    
    // Detect link first; clicking a connection opens the connection style popover and stops further handling
    const tolPxMd = 14; const tolCanvasMd = tolPxMd / transform.scale;
    if (!isInsideNodeBox(e.clientX, e.clientY)) {
      const link = getLinkAtPosition(e.clientX, e.clientY, tolCanvasMd);
      if (link) {
        const k = linkKey(link.sourceId, link.targetId);
        const anchor = getConnectionAnchor(link.sourceId, link.targetId);
        if (anchor) setConnectionPopover({ linkKey: k, sourceId: link.sourceId, targetId: link.targetId, x: anchor.x, y: anchor.y });
        return;
      }
    }

    // Detect node first and prefer node interactions over links
    const node = getNodeAtPosition(e.clientX, e.clientY);
    // If clicking on a node/figure that is in a selection group, auto-select the whole group for easier dragging
    if (node) {
      const group = selectionGroups.find(g => g.memberNodeIds.includes(node.id));
      if (group) {
        setSelectedIds(new Set(group.memberNodeIds));
        setSelectedFigureIds(new Set(group.memberFigureIds));
      }
    } else {
      const fig = getFigureAtPosition(e.clientX, e.clientY);
      if (fig) {
        const group = selectionGroups.find(g => g.memberFigureIds.includes(fig.id));
        if (group) {
          setSelectedIds(new Set(group.memberNodeIds));
          setSelectedFigureIds(new Set(group.memberFigureIds));
        }
      }
    }

    // If draw tool is active, start drafting
    if (activeTool === 'draw' && drawKind) {
      const figUnderMouse = getFigureAtPosition(e.clientX, e.clientY);
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left - transform.x) / transform.scale;
        const cy = (e.clientY - rect.top - transform.y) / transform.scale;
        // For line connections: allow starting on nodes and figures; only block if clicking an existing link (handled above)
        if (drawKind === 'line' || (!figUnderMouse && !node)) {
          // Begin at node center if mouse down on a node for a crisp drag-out
          const hit = getNodeAtPosition(e.clientX, e.clientY);
          const sx = hit && hit.x != null ? hit.x : cx;
          const sy = hit && hit.y != null ? hit.y : cy;
          setIsDragging(false);
          setDraggedNode(null);
          setDraftStart({ x: sx, y: sy });
          setDraftCurrent({ x: sx, y: sy });
          setIsDrafting(true);
          backgroundDownRef.current = null;
          return;
        }
      }
    }

    // Check free line endpoint hover for inline editing (use resolved endpoints)
    if (activeTool === 'select' && freeLines && freeLines.length > 0) {
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left - transform.x) / transform.scale;
        const cy = (e.clientY - rect.top - transform.y) / transform.scale;
        const hitRadius = 7 / transform.scale;
        for (const fl of freeLines) {
          const s = resolveEndpoint({ nodeId: fl.startNodeId, x: fl.x1, y: fl.y1 }, fl.x2, fl.y2, nodeMap);
          const t = resolveEndpoint({ nodeId: fl.endNodeId, x: fl.x2, y: fl.y2 }, s.x, s.y, nodeMap);
          const d1 = Math.hypot(cx - s.x, cy - s.y);
          const d2 = Math.hypot(cx - t.x, cy - t.y);
          if (d1 <= hitRadius) { setDraggingLineEnd({ id: fl.id, end: 'start' }); setLineEndpointDragMoved(false); return; }
          if (d2 <= hitRadius) { setDraggingLineEnd({ id: fl.id, end: 'end' }); setLineEndpointDragMoved(false); return; }
        }
      }
    }
    
    if (onClearFocus) {
      console.log('SitemapCanvas: handleMouseDown calling onClearFocus');
      onClearFocus();
    }
    
    if (node) {
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
        // Snapshot selected text figures positions for live drag
        if (selectedFigureIds.size > 0 && figures) {
          const map: Record<string, { x: number; y: number }> = {};
          Array.from(selectedFigureIds).forEach(fid => {
            const f = figures.find(ff => ff.id === fid);
            if (f) map[f.id] = { x: f.x, y: f.y };
          });
          setSelectedFiguresStartPositions(map);
          setDidLiveFigureDrag(false);
        } else {
          setSelectedFiguresStartPositions({});
          setDidLiveFigureDrag(false);
        }
        return;
      }

      // Only allow node selection in select mode
      if (activeTool === 'select') {
        // Determine which nodes to drag
        let selectionIds: string[];
        
        // If node belongs to a free-form group, prefer the group's members
        const group = selectionGroups.find(g => g.memberNodeIds.includes(node.id));
        if (group) {
          // Ensure full group is selected (nodes + figures)
          selectionIds = [...group.memberNodeIds];
          setSelectedIds(new Set(group.memberNodeIds));
          setSelectedFigureIds(new Set(group.memberFigureIds));
        } else if (selectedIds.has(node.id)) {
          // If clicking on already selected node, drag all selected nodes
          selectionIds = Array.from(selectedIds);
        } else {
          // If clicking on unselected node, select and drag based on modifier keys
          // Ctrl/Cmd/Alt now expands to connected graph
          const connectedDrag = e.altKey || e.ctrlKey || e.metaKey;
          selectionIds = e.shiftKey
          ? nodes.filter(n => n.category === node.category).map(n => n.id)
          : (connectedDrag ? (() => {
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
        // Snapshot selected/group figures (for grouped node + text moves)
        const figureIdsToDrag = group ? group.memberFigureIds : Array.from(selectedFigureIds);
        if (figureIdsToDrag.length > 0) {
          const starts: Record<string, { x: number; y: number }> = {};
          figureIdsToDrag.forEach(fid => {
            const f = figures.find(ff => ff.id === fid);
            if (f) starts[fid] = { x: f.x, y: f.y };
          });
          setSelectedFiguresStartPositions(starts);
          setDidLiveFigureDrag(false);
        }
        return;
      }
    }

    // Background down → start marquee selection or canvas panning
    // If Space is pressed, always pan regardless of other modes
    const isDrawMode = activeTool === 'draw' || activeTool === 'text';

    if (isSpacePressed) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
      backgroundDownRef.current = { x: e.clientX, y: e.clientY };
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    } else if (e.shiftKey && !node) {
      // Start marquee selection when holding Shift on empty background
      const canvas = canvasRef.current;
      if (canvas) {
        // Prevent native text selection while marquee-selecting
        e.preventDefault();
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
    } else if (!node) {
      // If editing text, do not pan; allow blur/save without moving canvas
      if (isEditingTextRef.current) {
        setHighlightedLink(null);
        if (onClearFocus) { onClearFocus(); }
        return;
      }
      if (isDrawMode) {
        // In draw modes, treat background click as placement start without entering pan
        setIsDragging(false);
        setDraggedNode(null);
        setDragStart({ x: e.clientX, y: e.clientY });
        backgroundDownRef.current = null;
      } else {
        // Start canvas panning (only when not over nodes or links)
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialTransform(transform);
        backgroundDownRef.current = { x: e.clientX, y: e.clientY };
      }
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    } else {
      // Over a link but not node: do nothing on mousedown; handle link selection on mouseup
      setHighlightedLink(null);
      if (onClearFocus) { onClearFocus(); }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Suppress hover-driven line toolbar; it will open on click instead
    // Keep existing marquee, dragging, drafting logic below
    // Unified Draw Tool drafting move
    if (isDrafting && activeTool === 'draw' && drawKind) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left - transform.x) / transform.scale;
        const cy = (e.clientY - rect.top - transform.y) / transform.scale;
        setDraftCurrent({ x: cx, y: cy });
      }
      return;
    }

    // Hover figure
    const figUnderMouse = getFigureAtPosition(e.clientX, e.clientY);
    setHoveredFigureId(figUnderMouse?.id || null);

    // No threshold panning per request

    // Resize shape (takes precedence over drag)
    if (resizingShape && onUpdateFigure) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX - rect.left - transform.x) / transform.scale;
        const cy = (e.clientY - rect.top - transform.y) / transform.scale;
        const fig = figures.find(f => f.id === resizingShape.id);
        if (fig) {
          const updates = resizeShapeFromCorner(
            fig,
            resizingShape.corner,
            cx,
            cy,
            resizingShape.startW,
            resizingShape.startH
          );
          onUpdateFigure(fig.id, updates);
        }
      }
      return;
    }

    // Drag figure
    if (draggingFigureId && figureDragStart && onUpdateFigure) {
      const dxScreen = e.clientX - figureDragStart.sx;
      const dyScreen = e.clientY - figureDragStart.sy;
      const dx = dxScreen / transform.scale;
      const dy = dyScreen / transform.scale;
      // Move all selected figures together based on their snapshot positions
      const figIds = selectedFigureIds.size > 0 ? Array.from(selectedFigureIds) : [draggingFigureId];
      figIds.forEach(fid => {
        const start = selectedFiguresStartPositions[fid];
        if (start) onUpdateFigure(fid, { x: start.x + dx, y: start.y + dy });
      });
      // If nodes are part of selection/group, move nodes as well
      if (onNodesUpdate && dragStartPositions && Object.keys(dragStartPositions).length > 0) {
        const updated = nodes.map(n => {
          if (!dragStartPositions[n.id]) return n;
          const start = dragStartPositions[n.id];
          return { ...n, x: start.x + dx, y: start.y + dy, fx: start.x + dx, fy: start.y + dy };
        });
        onNodesUpdate(updated);
      }
      return;
    }
    const node = getNodeAtPosition(e.clientX, e.clientY);
    setHoveredNode(node ? node.id : null);

    // Show toolbar on hover for shapes or selected texts (not during resize/drag)
    if (figUnderMouse && figUnderMouse.type !== 'text' && !resizingShape && !draggingFigureId && !draggedNode && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const sx = rect.left + (figUnderMouse.x * transform.scale) + transform.x;
      const sy = rect.top + (figUnderMouse.y * transform.scale) + transform.y - 40;
      setFigureToolbar({ id: figUnderMouse.id, x: sx, y: sy });
    } else if (figUnderMouse && figUnderMouse.type === 'text' && !resizingShape && !draggingFigureId && !draggedNode && canvasRef.current) {
      // If hovering a text figure and we have any text selected, keep/show toolbar near the hovered text
      if (selectedFigureIds.size > 0) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + (figUnderMouse.x * transform.scale) + transform.x;
        const sy = rect.top + (figUnderMouse.y * transform.scale) + transform.y - 40;
        setFigureToolbar({ id: figUnderMouse.id, x: sx, y: sy });
      }
    } else {
      // Only clear when nothing is hovered and no text figures are selected
      if (!figUnderMouse && selectedFigureIds.size === 0) {
        setFigureToolbar(null);
      }
    }

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
        !showLinkEditor && !showColorPicker && !showTitleEditor) {
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

    if (draggingLineEnd && onUpdateFreeLine) {
      // Dragging a free line endpoint
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        const { id, end } = draggingLineEnd;
        setLineEndpointDragMoved(true);
        if (end === 'start') {
          onUpdateFreeLine(id, { x1: canvasX, y1: canvasY, startNodeId: undefined });
        } else {
          onUpdateFreeLine(id, { x2: canvasX, y2: canvasY, endNodeId: undefined });
        }
      }
      // Keep hover toolbar from fighting during drag
      clearHoverToolbarWithGrace();
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
        let newX = canvasX - dragOffset.x;
        let newY = canvasY - dragOffset.y;

    // Alignment guides against other nodes (center and edges)
    const threshold = 8; // px in canvas space
    let v: number | null = null; // guide x
    let h: number | null = null; // guide y
    let vRefY: number | null = null; // reference node center y
    let hRefX: number | null = null; // reference node center x
    const others = nodes.filter(n => n.id !== draggedNode.id && n.x != null && n.y != null);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dDims = calculateNodeDimensions(draggedNode, ctx);
      const dHalfW = dDims.width / 2;
      const dHalfH = dDims.height / 2;
      const cx = newX; const cy = newY;
      let bestDx = Infinity; let bestDy = Infinity;
      for (const n of others) {
        const oDims = calculateNodeDimensions(n, ctx);
        const oHalfW = oDims.width / 2; const oHalfH = oDims.height / 2;
        const ocx = n.x!; const ocy = n.y!;
        // vertical: centers
        const dxCenter = Math.abs(cx - ocx);
        if (dxCenter <= threshold && dxCenter < bestDx) {
          v = ocx; vRefY = ocy; bestDx = dxCenter;
          if (snapToGuides) newX = ocx;
        }
        // vertical: left edges
        const dLeft = cx - dHalfW; const oLeft = ocx - oHalfW;
        const dxLeft = Math.abs(dLeft - oLeft);
        if (dxLeft <= threshold && dxLeft < bestDx) {
          v = oLeft; vRefY = ocy; bestDx = dxLeft;
          if (snapToGuides) newX = oLeft + dHalfW;
        }
        // vertical: right edges
        const dRight = cx + dHalfW; const oRight = ocx + oHalfW;
        const dxRight = Math.abs(dRight - oRight);
        if (dxRight <= threshold && dxRight < bestDx) {
          v = oRight; vRefY = ocy; bestDx = dxRight;
          if (snapToGuides) newX = oRight - dHalfW;
        }
        // horizontal: centers
        const dyCenter = Math.abs(cy - ocy);
        if (dyCenter <= threshold && dyCenter < bestDy) {
          h = ocy; hRefX = ocx; bestDy = dyCenter;
          if (snapToGuides) newY = ocy;
        }
        // horizontal: top edges
        const dTop = cy - dHalfH; const oTop = ocy - oHalfH;
        const dyTop = Math.abs(dTop - oTop);
        if (dyTop <= threshold && dyTop < bestDy) {
          h = oTop; hRefX = ocx; bestDy = dyTop;
          if (snapToGuides) newY = oTop + dHalfH;
        }
        // horizontal: bottom edges
        const dBottom = cy + dHalfH; const oBottom = ocy + oHalfH;
        const dyBottom = Math.abs(dBottom - oBottom);
        if (dyBottom <= threshold && dyBottom < bestDy) {
          h = oBottom; hRefX = ocx; bestDy = dyBottom;
          if (snapToGuides) newY = oBottom - dHalfH;
        }
      }
    }
        setGuideV(v);
        setGuideH(h);
        setGuideVRefY(vRefY);
        setGuideHRefX(hRefX);
        setDragCanvasPos({ x: newX, y: newY });

        const origin = dragStartPositions[draggedNode.id];
        const dx = origin ? newX - origin.x : 0;
        const dy = origin ? newY - origin.y : 0;

        // Only set a visual delta here; commit on mouse up
        setDragDelta({ dx, dy });
        // Live move selected text figures along with nodes
        if (onUpdateFigure && Object.keys(selectedFiguresStartPositions).length > 0) {
          Object.entries(selectedFiguresStartPositions).forEach(([fid, start]) => {
            onUpdateFigure(fid, { x: start.x + dx, y: start.y + dy });
          });
          if (!didLiveFigureDrag) setDidLiveFigureDrag(true);
        }
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
    // Unified Draw Tool commit on mouse up
    if (isDrafting && activeTool === 'draw' && drawKind && draftStart && draftCurrent) {
      const dx = draftCurrent.x - draftStart.x;
      const dy = draftCurrent.y - draftStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const small = Math.max(absDx, absDy) < 2;
      if (drawKind === 'line') {
        const x1 = draftStart.x;
        const y1 = draftStart.y;
        const x2 = small ? draftStart.x + 1 : draftCurrent.x;
        const y2 = small ? draftStart.y + 1 : draftCurrent.y;
        // Require a drag to create a line; ignore click-only
        if (small) {
          setIsDrafting(false);
          setDraftStart(null);
          setDraftCurrent(null);
          setActiveTool('select'); setDrawKind(null);
          return;
        }
        // Zoom‑aware, box‑aware snapping to nodes
        const findNodeNear = (x: number, y: number) => {
          const canvas = canvasRef.current; if (!canvas) return null;
          const ctx = canvas.getContext('2d'); if (!ctx) return null;
          const paddingPx = 16; const pad = paddingPx / transform.scale;
          let best: PageNode | null = null; let bestDist = Infinity;
          for (const n of nodes) {
            if (n.x == null || n.y == null) continue;
            const { width, height } = calculateNodeDimensions(n, ctx);
            const left = n.x - width / 2 - pad;
            const right = n.x + width / 2 + pad;
            const top = n.y - height / 2 - pad;
            const bottom = n.y + height / 2 + pad;
            if (x >= left && x <= right && y >= top && y <= bottom) {
              const d = Math.hypot(x - n.x, y - n.y);
              if (d < bestDist) { best = n; bestDist = d; }
            }
          }
          if (!best) {
            const tolPx = 18, tol = tolPx / transform.scale;
            for (const n of nodes) {
              if (n.x == null || n.y == null) continue;
              const d = Math.hypot(x - n.x, y - n.y);
              if (d <= tol && d < bestDist) { best = n; bestDist = d; }
            }
          }
          return best;
        };
        const startNode = findNodeNear(x1, y1);
        const endNode = findNodeNear(x2, y2);
        // Only create a connection if both endpoints are on nodes; otherwise save a FreeLine
        if (startNode && endNode && onExtraLinkCreate) {
          onExtraLinkCreate(startNode.id, endNode.id);
          const k = linkKey(startNode.id, endNode.id);
          onLinkStyleChange?.(k, { path: newLinePath, dash: 'solid', color: '#111827', width: 2 });
        }
        // After creation, switch to Select to allow endpoint editing without starting a new line
        setActiveTool('select'); setDrawKind(null);
        // Auto-open connection popover for the new link
        if (startNode && endNode) {
          const k = linkKey(startNode.id, endNode.id);
          const anchor = getConnectionAnchor(startNode.id, endNode.id);
          if (anchor) setConnectionPopover({ linkKey: k, sourceId: startNode.id, targetId: endNode.id, x: anchor.x, y: anchor.y });
        }
      } else {
        // Shapes
        let w = small ? 160 : absDx;
        let h = small ? 80 : absDy;
        if (drawKind === 'square' || drawKind === 'circle') {
          const side = small ? 120 : Math.max(w, h);
          w = side; h = side;
        }
        const cx = draftStart.x + (small ? 0 : dx / 2);
        const cy = draftStart.y + (small ? 0 : dy / 2);
        const type = (drawKind === 'rect' || drawKind === 'square') ? (drawKind === 'square' ? 'square' : 'rect') : (drawKind === 'circle' ? 'circle' : 'ellipse');
        if (onCreateFigure) {
          onCreateFigure({
            id: `fig-${Date.now()}`,
            type: type as any,
            x: cx,
            y: cy,
            width: w,
            height: h,
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 2,
            textColor: '#000000',
          });
        }
      }
      setIsDrafting(false);
      setDraftStart(null);
      setDraftCurrent(null);
      // Keep activeTool='draw' for multiple placements
      return;
    }

    // Ignore right-click - only left-click should trigger text editing
    if (e.button === 2) return;
    
    // No threshold/stop override; allow normal flow
    
    // Handle draw mode creation FIRST (before other interactions that might set isDragging)
    // Check if we're in a draw mode and there was minimal movement (click, not drag)
    const dragDistance = Math.sqrt(
      Math.pow(e.clientX - dragStart.x, 2) + Math.pow(e.clientY - dragStart.y, 2)
    );
    const isClick = dragDistance < dragThreshold;
    
    if (isClick && activeTool === 'text' && onCreateFigure) {
      const canvas = canvasRef.current;
      if (!canvas) {
        setActiveTool('select'); setDrawKind(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      // Calculate canvas coordinates (where text will be drawn)
      const cx = (e.clientX - rect.left - transform.x) / transform.scale;
      const cy = (e.clientY - rect.top - transform.y) / transform.scale;
      const figure: Figure = {
        id: `fig-${Date.now()}`,
        type: 'text',
        x: cx,
        y: cy,
        text: 'Text',
        textColor: '#000000',
        fontSize: 18, // Initialize with default font size
      };
      // Use click coordinates directly for editor to avoid precision loss from double conversion
      // screenX = rect.left + (cx * transform.scale) + transform.x simplifies to e.clientX
      const screenX = e.clientX;
      const screenY = e.clientY;

      // Set editor immediately and mark editing active
      setEditingTextFigureId(figure.id);
      setTextEditorPosition({ x: screenX, y: screenY });
      setTextEditorText('Text');
      isEditingTextRef.current = true;

      // Set toolbar immediately (positioned above the editor)
      setFigureToolbar({ id: figure.id, x: screenX, y: screenY - 60 });
      setSelectedFigureId(figure.id);
      
      // Create the figure (editor already showing)
      onCreateFigure(figure);
      setActiveTool('select'); setDrawKind(null);
      
      // Reset drag states
      setIsDragging(false);
      setDraggedNode(null);
      return;
    }
    
    // End shape resize and show toolbar
    if (resizingShape) {
      const f = figures?.find(ff => ff.id === resizingShape.id);
      const canvas = canvasRef.current;
      if (f && canvas) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + (f.x * transform.scale) + transform.x;
        const sy = rect.top + (f.y * transform.scale) + transform.y - 40;
        setFigureToolbar({ id: f.id, x: sx, y: sy });
        setSelectedFigureId(f.id);
        setSelectedFigureIds(new Set([f.id]));
      }
      setResizingShape(null);
      return;
    }
    
    // End figure drag and open toolbar
    if (draggingFigureId) {
      const id = draggingFigureId;
      setDraggingFigureId(null);
      setFigureDragStart(null);
      const f = figures?.find(ff => ff.id === id);
      const canvas = canvasRef.current;
      if (f && canvas) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + (f.x * transform.scale) + transform.x;
        const sy = rect.top + (f.y * transform.scale) + transform.y - 40;
        setFigureToolbar({ id: f.id, x: sx, y: sy });
        setSelectedFigureId(f.id);
        setSelectedFigureIds(new Set([f.id]));
        
        // Only open text editor for text figures
        if (f.type === 'text') {
          openFigureTextEditor(f);
        }
      }
      return;
    }
    // Single click on figure => open editor and toolbar
    if (!isDragging && !draggedNode && !marqueeSelection?.isActive) {
      const fig = getFigureAtPosition(e.clientX, e.clientY);
      if (fig) {
        const canvas = canvasRef.current;
        if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.left + (fig.x * transform.scale) + transform.x;
        const sy = rect.top + (fig.y * transform.scale) + transform.y - 60;
        // Only open editor for text figures
        if (fig.type === 'text') {
          openFigureTextEditor(fig);
        }
        // show formatting toolbar above it
        setFigureToolbar({ id: fig.id, x: sx, y: sy });
        setSelectedFigureId(fig.id);
        setSelectedFigureIds(new Set([fig.id]));
        }
        return;
      } else {
        setFigureToolbar(null);
        setSelectedFigureId(null);
        setSelectedFigureIds(new Set());
      }
    }
    // End endpoint drag: snap to nearest node if moved; if click-only, toggle arrow
    if (draggingLineEnd) {
      const wasMoved = lineEndpointDragMoved;
      const { id, end } = draggingLineEnd;
      setDraggingLineEnd(null);
      setLineEndpointDragMoved(false);
      if (!onUpdateFreeLine || !freeLines) return;

      const fl = freeLines.find(l => l.id === id);
      if (!fl) return;

      if (wasMoved) {
        // Find nearest node by screen distance to the endpoint final position
        const fx = end === 'start' ? (fl.x1 ?? 0) : (fl.x2 ?? 0);
        const fy = end === 'start' ? (fl.y1 ?? 0) : (fl.y2 ?? 0);
        const fp = canvasToClient(fx, fy);
        let nearest: { id: string; dist: number } | null = null;
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          const np = canvasToClient(n.x, n.y);
          const d = Math.hypot(fp.x - np.x, fp.y - np.y);
          if (d <= MAGNET_RADIUS && (!nearest || d < nearest.dist)) nearest = { id: n.id, dist: d };
        }
        if (nearest) {
          if (end === 'start') {
            onUpdateFreeLine(id, { startNodeId: nearest.id });
          } else {
            onUpdateFreeLine(id, { endNodeId: nearest.id });
          }
        }
      } else {
        // Click-only: toggle one end and clear the other when turning on
        const style = { ...fl.style } as any;
        if (end === 'start') {
          const next = !style.arrowStart;
          style.arrowStart = next;
          if (next) style.arrowEnd = false;
        } else {
          const next = !style.arrowEnd;
          style.arrowEnd = next;
          if (next) style.arrowStart = false;
        }
        onUpdateFreeLine(id, { style });
      }
      return;
    }

    if (marqueeSelection?.isActive) {
      // Complete marquee selection
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale;
        
        const left = Math.min(marqueeSelection.startX, canvasX);
        const right = Math.max(marqueeSelection.startX, canvasX);
        const top = Math.min(marqueeSelection.startY, canvasY);
        const bottom = Math.max(marqueeSelection.startY, canvasY);
        
        // Find nodes within marquee area
        const selectedNodes = nodes.filter(node => {
          if (node.x === undefined || node.y === undefined) return false;
          return node.x >= left && node.x <= right && node.y >= top && node.y <= bottom;
        });
        
        // Find text figures within marquee area using dynamic bounds
        const selectedTextFigures: string[] = [];
        if (figures) {
          const canvas = canvasRef.current;
          const ctx = canvas ? canvas.getContext('2d') : null;
          figures.forEach(fig => {
            if (fig.type === 'text') {
              const b = getTextFigureBounds(fig, ctx);
              const overlaps = !(b.right < left || b.left > right || b.bottom < top || b.top > bottom);
              if (overlaps) selectedTextFigures.push(fig.id);
            }
          });
        }
        
        // Update selection and clear any highlighted links
        const newSelectedNodeIds = selectedNodes.map(n => n.id);
        setSelectedIds(new Set(newSelectedNodeIds));
        
        // Find and select text figures overlapping with selected nodes (using helper function)
        const overlappingTextFigures = newSelectedNodeIds.length > 0 
          ? findTextFiguresOverlappingNodes(newSelectedNodeIds)
          : selectedTextFigures;
        
        // Select text figures if any were found
        if (overlappingTextFigures.length > 0) {
          setSelectedFigureId(overlappingTextFigures[0]); // Select first one for toolbar
          setSelectedFigureIds(new Set(overlappingTextFigures));
          // Show toolbar for the first selected text figure
          const firstFig = figures?.find(f => f.id === overlappingTextFigures[0]);
          if (firstFig && canvas) {
            const rect = canvas.getBoundingClientRect();
            const sx = rect.left + (firstFig.x * transform.scale) + transform.x;
            const sy = rect.top + (firstFig.y * transform.scale) + transform.y - 60;
            setFigureToolbar({ id: firstFig.id, x: sx, y: sy });
          }
        } else {
          setSelectedFigureId(null);
          setSelectedFigureIds(new Set());
          setFigureToolbar(null);
        }
        
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
        // Move selected text figures by the same delta only if we didn't live move already
        if (!didLiveFigureDrag && selectedFigureIds.size > 0 && onUpdateFigure) {
          const dx = dragDelta.dx;
          const dy = dragDelta.dy;
          const ids = Array.from(selectedFigureIds);
          ids.forEach(fid => {
            const f = figures?.find(ff => ff.id === fid);
            if (f) onUpdateFigure(fid, { x: f.x + dx, y: f.y + dy });
          });
        }
        // After dragging, keep the selection and find overlapping text figures
        const newSelectedIds = Array.from(dragSelectionIds);
        setSelectedIds(new Set(newSelectedIds));
        
        // Find and select text figures overlapping with selected nodes
        const overlappingTextFigures = findTextFiguresOverlappingNodes(newSelectedIds);
        if (overlappingTextFigures.length > 0 && figures && canvasRef.current) {
          const firstFig = figures.find(f => f.id === overlappingTextFigures[0]);
          if (firstFig) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const sx = rect.left + (firstFig.x * transform.scale) + transform.x;
            const sy = rect.top + (firstFig.y * transform.scale) + transform.y - 60;
            setSelectedFigureId(overlappingTextFigures[0]);
            setSelectedFigureIds(new Set(overlappingTextFigures));
            setFigureToolbar({ id: firstFig.id, x: sx, y: sy });
          }
        }
      } else if (dragDistance < dragThreshold) {
        // Only trigger click if it wasn't a significant drag
        // Use dragSelectionIds if available (for Shift/Ctrl+click), otherwise just the dragged node
        const nodeIdsToSelect = dragSelectionIds && dragSelectionIds.length > 0 
          ? dragSelectionIds 
          : [draggedNode.id];
        
        if (onNodeClick) {
          onNodeClick(draggedNode);
        }
        
        const newSelectedIds = new Set(nodeIdsToSelect);
        setSelectedIds(newSelectedIds);
        
        // Find and select text figures overlapping with selected nodes
        const overlappingTextFigures = findTextFiguresOverlappingNodes(nodeIdsToSelect);
        if (overlappingTextFigures.length > 0 && figures && canvasRef.current) {
          const firstFig = figures.find(f => f.id === overlappingTextFigures[0]);
          if (firstFig) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const sx = rect.left + (firstFig.x * transform.scale) + transform.x;
            const sy = rect.top + (firstFig.y * transform.scale) + transform.y - 60;
            setSelectedFigureId(overlappingTextFigures[0]);
            setSelectedFigureIds(new Set(overlappingTextFigures));
            setFigureToolbar({ id: firstFig.id, x: sx, y: sy });
          }
        } else {
          setSelectedFigureId(null);
          setSelectedFigureIds(new Set());
          setFigureToolbar(null);
        }
        
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
        setSelectedFigureIds(new Set());
        setHighlightedLink(null);
        if (onClearFocus) onClearFocus();
      }
      // Large movement = canvas pan, no action needed
    } else if (!isDragging && !draggedNode) {
      // Handle click when no node was being dragged and no canvas panning
    const dragDistance = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    if (dragDistance < dragThreshold) {
      // 1) Try link first, but ignore clicks inside node boxes to avoid edge misclicks
      const tolPxUp = 14; const tolCanvasUp = tolPxUp / transform.scale;
      if (!isInsideNodeBox(e.clientX, e.clientY)) {
        const link = getLinkAtPosition(e.clientX, e.clientY, tolCanvasUp);
        if (link) {
          const k = linkKey(link.sourceId, link.targetId);
          const anchor = getConnectionAnchor(link.sourceId, link.targetId);
          if (anchor) setConnectionPopover({ linkKey: k, sourceId: link.sourceId, targetId: link.targetId, x: anchor.x, y: anchor.y });
          setHighlightedLink(null);
          return;
        }
      }

      // 2) Otherwise try free line: open the inline pill toolbar at closest point (zoom-aware)
      if (freeLines && freeLines.length > 0) {
        const { cx, cy } = pointToCanvas(e.clientX, e.clientY);
        const tolPx = 14; // screen px tolerance
        const tolCanvas = tolPx / transform.scale; // convert to canvas distance

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        let best: { id: string; d: number; anchorX: number; anchorY: number } | null = null;

        for (const line of freeLines) {
          const sNode = line.startNodeId ? nodeMap.get(line.startNodeId) : undefined;
          const tNode = line.endNodeId ? nodeMap.get(line.endNodeId) : undefined;
          const x1 = (sNode && sNode.x !== undefined) ? sNode.x : line.x1;
          const y1 = (sNode && sNode.y !== undefined) ? sNode.y : line.y1;
          const x2 = (tNode && tNode.x !== undefined) ? tNode.x : line.x2;
          const y2 = (tNode && tNode.y !== undefined) ? tNode.y : line.y2;

          if (line.style.path === 'straight') {
            const cp = closestPointOnSegment(cx, cy, x1, y1, x2, y2);
            const d = Math.hypot(cx - cp.x, cy - cp.y);
            if (d <= tolCanvas && (!best || d < best.d)) best = { id: line.id, d, anchorX: cp.x, anchorY: cp.y };
          } else {
            const cp1 = closestPointOnSegment(cx, cy, x1, y1, x2, y1);
            const cp2 = closestPointOnSegment(cx, cy, x2, y1, x2, y2);
            const d1 = Math.hypot(cx - cp1.x, cy - cp1.y);
            const d2 = Math.hypot(cx - cp2.x, cy - cp2.y);
            if (d1 <= tolCanvas && (!best || d1 < best.d)) best = { id: line.id, d: d1, anchorX: cp1.x, anchorY: cp1.y };
            if (d2 <= tolCanvas && (!best || d2 < best.d)) best = { id: line.id, d: d2, anchorX: cp2.x, anchorY: cp2.y };
          }
        }

        // Fallback: still anchor to the nearest segment midpoint if click is near a line but outside tolerance
        if (!best) {
          let nearest: { id: string; d: number; anchorX: number; anchorY: number } | null = null;
          for (const line of freeLines) {
            const sNode = line.startNodeId ? nodeMap.get(line.startNodeId) : undefined;
            const tNode = line.endNodeId ? nodeMap.get(line.endNodeId) : undefined;
            const x1 = (sNode && sNode.x !== undefined) ? sNode.x : line.x1;
            const y1 = (sNode && sNode.y !== undefined) ? sNode.y : line.y1;
            const x2 = (tNode && tNode.x !== undefined) ? tNode.x : line.x2;
            const y2 = (tNode && tNode.y !== undefined) ? tNode.y : line.y2;

            if (line.style.path === 'straight') {
              const cp = closestPointOnSegment(cx, cy, x1, y1, x2, y2);
              const d = Math.hypot(cx - cp.x, cy - cp.y);
              if (!nearest || d < nearest.d) nearest = { id: line.id, d, anchorX: cp.x, anchorY: cp.y };
            } else {
              const mx = x2, my = y1; // elbow corner midpoint
              const d = Math.hypot(cx - mx, cy - my);
              if (!nearest || d < nearest.d) nearest = { id: line.id, d, anchorX: mx, anchorY: my };
            }
          }
          best = nearest || null;
        }

        if (best) {
          // Free line inline editing removed; no UI on click for free lines
          return;
        }
      }

      // 2) Fallback to node click
      const clickedNode = getNodeAtPosition(e.clientX, e.clientY);
      if (clickedNode && onNodeClick) {
        onNodeClick(clickedNode);
        const newSelectedIds = new Set([clickedNode.id]);
        setSelectedIds(newSelectedIds);
        
        // Find and select text figures overlapping with this node
        const overlappingTextFigures = findTextFiguresOverlappingNodes([clickedNode.id]);
        if (overlappingTextFigures.length > 0 && figures) {
          const firstFig = figures.find(f => f.id === overlappingTextFigures[0]);
          if (firstFig && canvasRef.current) {
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const sx = rect.left + (firstFig.x * transform.scale) + transform.x;
            const sy = rect.top + (firstFig.y * transform.scale) + transform.y - 60;
            setSelectedFigureId(overlappingTextFigures[0]);
            setFigureToolbar({ id: firstFig.id, x: sx, y: sy });
          }
        } else {
          setSelectedFigureId(null);
          setFigureToolbar(null);
        }
        
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
    setSelectedFiguresStartPositions({});
    // Clear alignment guides when mouse up
    setGuideV(null);
    setGuideH(null);
    setGuideVRefY(null);
    setGuideHRefX(null);
    setDragCanvasPos(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
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
        setActiveTool('select');
        setDrawKind(null);
        break;
      case 'Delete':
      case 'Backspace':
        if (hoveredFreeLineId && onDeleteFreeLine) {
          e.preventDefault();
          onDeleteFreeLine(hoveredFreeLineId);
          setHoveredFreeLineId(null);
          setConnectionPopover(null);
        } else if (highlightedLink && onNodesUpdate) {
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
    setDragSelectionIds(null);
    setDragStartPositions({});
    setMarqueeSelection(null);
    setHoveredNode(null);
    setDragStart({ x: 0, y: 0 });
    setInitialTransform({ x: 0, y: 0, scale: 1 });
    backgroundDownRef.current = null;
    setDraggingLineEnd(null);
    setLineEndpointDragMoved(false);
    setGuideV(null);
    setGuideH(null);
    setGuideVRefY(null);
    setGuideHRefX(null);
    setDragCanvasPos(null);
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
      // Zoom behavior in discrete 1% steps snapping to 0.1..2.0 for finer traversal
      const step = 0.01;
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

  // removed unused handleReset

  // removed unused centerOnNode

  // Determine cursor based on current state
  const getCursorClass = () => {
    if (activeTool === 'text') return 'cursor-text';
    if (activeTool === 'draw') return 'cursor-crosshair';
    if (isSpacePressed) return 'cursor-grab';
    if (draggedNode || isDragging) return 'cursor-grabbing';
    if (marqueeSelection?.isActive) return 'cursor-crosshair';
    return 'cursor-default';
  };

  // Compute bounds for text figures using font size and content; fallback to fig.width/height
  function getTextFigureBounds(fig: Figure, ctx: CanvasRenderingContext2D | null): { left: number; right: number; top: number; bottom: number } {
    const fontSize = fig.fontSize ?? 18;
    if (fig.width && fig.height) {
      const halfW = fig.width / 2;
      const halfH = fig.height / 2;
      return { left: fig.x - halfW, right: fig.x + halfW, top: fig.y - halfH, bottom: fig.y + halfH };
    }
    let textWidth = 120;
    if (ctx) {
      try {
        ctx.save();
        ctx.font = `${Math.max(10, fontSize)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const metrics = ctx.measureText(fig.text ?? 'Text');
        textWidth = Math.max(40, metrics.width);
        ctx.restore();
      } catch {}
    }
    const paddingX = 28;
    const paddingY = 16;
    const width = textWidth + paddingX;
    const height = Math.max(fontSize * 1.2 + paddingY, 24);
    const halfW = width / 2;
    const halfH = height / 2;
    return { left: fig.x - halfW, right: fig.x + halfW, top: fig.y - halfH, bottom: fig.y + halfH };
  }

  // Figure hit testing for text re-editing
  const getFigureAtPosition = (clientX: number, clientY: number): Figure | null => {
    if (!figures || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left - transform.x) / transform.scale;
    const cy = (clientY - rect.top - transform.y) / transform.scale;
    const ctx = canvas.getContext('2d');
    for (let i = figures.length - 1; i >= 0; i--) {
      const fig = figures[i];
      const w = fig.width ?? 160;
      const h = fig.height ?? 80;

      if (fig.type === 'text') {
        const b = getTextFigureBounds(fig, ctx);
        if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
          return fig;
        }
      } else if (fig.type === 'rect' || fig.type === 'square') {
        if (cx >= fig.x - w / 2 && cx <= fig.x + w / 2 && cy >= fig.y - h / 2 && cy <= fig.y + h / 2) {
          return fig;
        }
      } else if (fig.type === 'ellipse' || fig.type === 'circle') {
        const rx = (w / 2), ry = (h / 2);
        const norm = Math.pow((cx - fig.x) / rx, 2) + Math.pow((cy - fig.y) / ry, 2);
        if (norm <= 1) return fig;
      }
    }
    return null;
  };

  

  // Get shape resize handle at position
  const getShapeHandleAtPosition = (clientX: number, clientY: number): null | { id: string; corner: 0 | 1 | 2 | 3 } => {
    if (!figures || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left - transform.x) / transform.scale;
    const cy = (clientY - rect.top - transform.y) / transform.scale;

    for (let i = figures.length - 1; i >= 0; i--) {
      const fig = figures[i];
      if (fig.type === 'text') continue;
      const w = fig.width ?? 160, h = fig.height ?? 80;
      const halfW = w / 2, halfH = h / 2;
      const corners = [
        { x: fig.x - halfW, y: fig.y - halfH }, // TL
        { x: fig.x + halfW, y: fig.y - halfH }, // TR
        { x: fig.x + halfW, y: fig.y + halfH }, // BR
        { x: fig.x - halfW, y: fig.y + halfH }, // BL
      ];
      for (let c = 0; c < 4; c++) {
        if (Math.hypot(cx - corners[c].x, cy - corners[c].y) <= 8) {
          return { id: fig.id, corner: c as 0 | 1 | 2 | 3 };
        }
      }
    }
    return null;
  };

  // Resize shape from corner
  const resizeShapeFromCorner = (fig: Figure, corner: 0 | 1 | 2 | 3, cx: number, cy: number, startW: number, startH: number): Partial<Figure> => {
    const w0 = fig.width ?? startW ?? 160, h0 = fig.height ?? startH ?? 80;
    const halfW0 = w0 / 2, halfH0 = h0 / 2;
    const corners0 = [
      { x: fig.x - halfW0, y: fig.y - halfH0 }, // TL
      { x: fig.x + halfW0, y: fig.y - halfH0 }, // TR
      { x: fig.x + halfW0, y: fig.y + halfH0 }, // BR
      { x: fig.x - halfW0, y: fig.y + halfH0 }, // BL
    ];
    const opp = (corner + 2) % 4;
    const fixed = corners0[opp];
    const newMinX = Math.min(fixed.x, cx);
    const newMaxX = Math.max(fixed.x, cx);
    const newMinY = Math.min(fixed.y, cy);
    const newMaxY = Math.max(fixed.y, cy);
    let newW = newMaxX - newMinX;
    let newH = newMaxY - newMinY;

    // Enforce aspect ratio for square/circle
    const isLocked = fig.type === 'square' || fig.type === 'circle';
    if (isLocked) {
      const side = Math.max(20, Math.max(newW, newH));
      newW = side;
      newH = side;
    }

    const centerX = (newMinX + newMaxX) / 2;
    const centerY = (newMinY + newMaxY) / 2;

    return { x: centerX, y: centerY, width: Math.max(20, newW), height: Math.max(20, newH) };
  };

  const openFigureTextEditor = (fig: Figure) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Use exact figure position without applying any offset
    const screenX = rect.left + (fig.x * transform.scale) + transform.x;
    const screenY = rect.top + (fig.y * transform.scale) + transform.y;
    setEditingTextFigureId(fig.id);
    setTextEditorPosition({ x: screenX, y: screenY });
    setTextEditorText(fig.text ?? '');
    isEditingTextRef.current = true;
  };

  // Helper function to find text figures that overlap with selected nodes
  const findTextFiguresOverlappingNodes = (nodeIds: string[]): string[] => {
    if (!figures || nodeIds.length === 0 || !canvasRef.current) return [];
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    // Calculate bounding box of all selected nodes using true node sizes
    const nodesOfInterest = nodes.filter(n => nodeIds.includes(n.id) && n.x !== undefined && n.y !== undefined);
    if (nodesOfInterest.length === 0) return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodesOfInterest.forEach(n => {
      const { width, height } = calculateNodeDimensions(n, ctx);
      const left = (n.x || 0) - width / 2;
      const right = (n.x || 0) + width / 2;
      const top = (n.y || 0) - height / 2;
      const bottom = (n.y || 0) + height / 2;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    });
    const overlappingTextFigures: string[] = [];
    figures.forEach(fig => {
      if (fig.type === 'text') {
        const b = getTextFigureBounds(fig, ctx);
        const overlaps = !(b.right < minX || b.left > maxX || b.bottom < minY || b.top > maxY);
        if (overlaps) overlappingTextFigures.push(fig.id);
      }
    });
    return overlappingTextFigures;
  };

  // Remove the old window-based approach
  // useEffect(() => {
  //   (window as any).focusOnNode = centerOnNode;
  // }, []);

  // Keep inline text editor anchored to figure during pan/zoom or figure move
  useEffect(() => {
    if (!editingTextFigureId || !canvasRef.current) return;
    const fig = figures.find(f => f.id === editingTextFigureId);
    if (!fig) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const screenX = rect.left + (fig.x * transform.scale) + transform.x;
    const screenY = rect.top + (fig.y * transform.scale) + transform.y;
    setTextEditorPosition({ x: screenX, y: screenY });
  }, [editingTextFigureId, figures, transform]);

  // Ensure text toolbar appears for multi-selected text figures by anchoring to the top-most text
  useEffect(() => {
    if (!figures || !canvasRef.current) return;
    if (editingTextFigureId) return; // editor has its own UI
    if (selectedIds.size > 0) return; // node selection owns toolbar
    if (selectedFigureIds.size === 0) return;

    const selectedTexts = Array.from(selectedFigureIds)
      .map(id => figures.find(f => f.id === id))
      .filter((f): f is Figure & { type: 'text' } => !!f && f.type === 'text');
    if (selectedTexts.length === 0) return;

    // Find the top-most by y (smallest y); if tie, pick the left-most by x
    const topMost = selectedTexts.reduce((best, f) => {
      if (!best) return f;
      if (f.y < best.y) return f;
      if (f.y === best.y && f.x < best.x) return f;
      return best;
    }, selectedTexts[0]);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const screenX = rect.left + (topMost.x * transform.scale) + transform.x;
    const screenY = rect.top + (topMost.y * transform.scale) + transform.y - 60;
    setFigureToolbar({ id: topMost.id, x: screenX, y: screenY });
  }, [selectedFigureIds, figures, transform, editingTextFigureId, selectedIds]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-white select-none outline-none focus:outline-none focus-visible:outline-none focus-within:outline-none`}
      style={{
        cursor:
          activeTool === 'text' ? 'text' :
          (activeTool === 'draw' ? 'crosshair' :
          (isSpacePressed ? 'grab' : ((draggedNode || isDragging) ? 'grabbing' : (marqueeSelection?.isActive ? 'crosshair' : 'default')))),
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      {/* {showLineHint && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[260] px-3 py-1.5 rounded bg-gray-900 text-white text-xs shadow-lg">
          Drag from one node to another. Lines aren’t saved unless both ends snap to nodes.
        </div>
      )} */}
      <canvas
        ref={canvasRef}
        style={{
          cursor:
            activeTool === 'text' ? 'text' :
            (activeTool === 'draw' ? 'crosshair' :
            (isSpacePressed ? 'grab' : ((draggedNode || isDragging) ? 'grabbing' : (marqueeSelection?.isActive ? 'crosshair' : 'default'))))
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={(e) => {
          // Double-click disabled - single click already handles text editing
          // Prevent accidental re-trigger of editor
          e.preventDefault();
        }}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={-1}
        className={`${getCursorClass()} outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0`}
        onClick={(e) => {
          // Only close when clicking empty background and not editing
          if (editingTextFigureId) return;
          const fig = getFigureAtPosition(e.clientX, e.clientY);
          if (!fig) {
            setFigureToolbar(null);
          }
        }}
      />
      
      {/* Selected text figures overlay outlines (hide while editing) */}
      {selectedFigureIds.size > 0 && !editingTextFigureId && figures && canvasRef.current && (() => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const boxes = Array.from(selectedFigureIds).map(fid => {
          const f = figures.find(ff => ff.id === fid);
          if (!f) return null;
          const b = getTextFigureBounds(f, ctx);
          const left = rect.left + (b.left * transform.scale) + transform.x;
          const top = rect.top + (b.top * transform.scale) + transform.y;
          const width = (b.right - b.left) * transform.scale;
          const height = (b.bottom - b.top) * transform.scale;
          return (
            <div
              key={`sel-box-${fid}`}
              className="fixed pointer-events-none z-20"
              style={{ left, top, width, height, border: '2px solid #3B82F6', borderRadius: 8, boxShadow: '0 0 0 2px rgba(59,130,246,0.25) inset' }}
            />
          );
        });
        return <>{boxes}</>;
      })()}

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
          onClick={() => { setActiveTool('select'); setDrawKind(null); }}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors group relative ${
            activeTool === 'select' 
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
        
        {/* Text (T) */}
        <button
          onClick={() => {
            if (!onCreateFigure || !canvasRef.current) return;
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Screen center to canvas coords
            const cx = (centerX - transform.x) / transform.scale;
            const cy = (centerY - transform.y) / transform.scale;

            const figure: Figure = {
              id: `fig-${Date.now()}`,
              type: 'text',
              x: cx,
              y: cy,
              text: 'Text',
              textColor: '#000000',
              fontSize: 18, // Initialize with default font size
            };
            onCreateFigure(figure);

            // Open editor at screen center
            setEditingTextFigureId(figure.id);
        setTextEditorPosition({ x: rect.left + centerX, y: rect.top + centerY });
            setTextEditorText('Text');
          }}
          className={"w-8 h-8 flex items-center justify-center rounded transition-colors group relative bg-gray-100 hover:bg-gray-200 text-gray-600"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M12 7v10"/>
          </svg>
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Text
          </span>
        </button>

        {/* Shapes (S) - hidden per request
        <div className="relative">
          ... Shapes UI commented out ...
        </div>
        */}

        {/* Line (L) */}
        <div className="relative">
          <button
            onClick={() => {
          // Default to straight; immediately enter draw mode
          setNewLinePath('straight');
          setActiveTool('draw');
          setDrawKind('line');
              setIsSpacePressed(false);
              setIsDragging(false);
              setDraggedNode(null);
              backgroundDownRef.current = null;
              setTimeout(() => { try { canvasRef.current?.focus(); } catch {} }, 0);
            }}
            aria-pressed={activeTool === 'draw' && drawKind === 'line'}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors group relative ${
              activeTool === 'draw' && drawKind === 'line'
                ? 'bg-orange-100 text-orange-600 border border-orange-200 ring-orange-400 ring-offset-1'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600 focus-visible: focus-visible:ring-blue-500'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18L18 4"/>
            </svg>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Connection line (L) - drag from node to node
            </span>
          </button>
          {/* Line popover removed - clicking Line switches to draw immediately */}
        </div>
        
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
      {hoverToolbarNode && selectedIds.size === 0 && !draggedNode && (
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
      {selectedIds.size > 0 && !draggedNode && (() => {
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
        // Determine if current selection matches a free-form selection group
        const selNodeIds = new Set(Array.from(selectedIds));
        const selFigureIds = new Set(Array.from(selectedFigureIds));
        const isGrouped = selectionGroups.some(g => {
          if (g.memberNodeIds.length !== selNodeIds.size || g.memberFigureIds.length !== selFigureIds.size) return false;
          return g.memberNodeIds.every(id => selNodeIds.has(id)) && g.memberFigureIds.every(id => selFigureIds.has(id));
        });
        
        return (
          <SelectionToolbar
            selectedNodes={selectedNodesArray}
            position={{ x: screenX, y: screenY - 50 }}
            onEditTitle={handleEditTitle}
            onAddChild={handleAddChildFromToolbar}
            onColorClick={handleColorClickFromToolbar}
            onLinkClick={handleLinkClickFromToolbar}
            onGroupSelection={() => onCreateSelectionGroup?.(Array.from(selectedIds), Array.from(selectedFigureIds))}
            onUngroupSelection={() => onUngroupSelection?.(Array.from(selectedIds), Array.from(selectedFigureIds))}
            isGrouped={isGrouped}
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
          onClose={(applied) => {
            // Only restore original colors if color was NOT applied (cancelled or backdrop clicked)
            if (!applied && onNodesPreview && Object.keys(originalColors).length > 0) {
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

      {/* Text Figure Editor - modern inline contenteditable with dynamic box */}
      {editingTextFigureId && (
        <div
          className="fixed z-20"
          style={{
            left: `${textEditorPosition.x}px`,
            top: `${textEditorPosition.y}px`,
            transform: `translate(-50%, -50%) scale(${transform.scale})`,
            transformOrigin: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handles (top and bottom) for easier grabbing */}
          <div
            className="w-full h-8 cursor-move"
            onMouseDown={beginTextEditorDrag}
          />
          <div
            ref={(el) => {
              if (el) {
                el.focus(); // ensure the editor is focused so blur will fire
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(el);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Edit text"
            className="min-w-[120px] max-w-[480px] outline-none text-gray-900 relative inline-block"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textDecoration: (figures.find(f => f.id === editingTextFigureId)?.underline ? 'underline' : 'none'),
              textAlign: 'center' as any,
              fontWeight: (figures.find(f => f.id === editingTextFigureId)?.fontWeight === 'bold' ? 'bold' : '600') as any,
              fontSize: (figures.find(f => f.id === editingTextFigureId)?.fontSize ?? 18) as any,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight: '1.2',
              padding: '8px 14px',
              background: '#ffffff',
              border: '1.5px solid #3B82F6',
              borderRadius: '8px',
            }}
            dangerouslySetInnerHTML={{ __html: (textEditorText || '').replace(/\n/g, '<br/>') }}
            onCopy={(e) => {
              // If actual text is selected, allow native copy. Otherwise, copy figure payload for duplication
              const sel = window.getSelection();
              const hasSelection = !!sel && (sel.toString() || '').length > 0;
              if (hasSelection) return;
              try {
                const fig = figures.find(f => f.id === editingTextFigureId);
                if (!fig) return;
                const payload = {
                  type: 'sitemap-text-figures',
                  figures: [{ x: fig.x, y: fig.y, text: fig.text, textColor: fig.textColor, fontSize: fig.fontSize, fontWeight: fig.fontWeight }],
                };
                e.preventDefault();
                e.clipboardData?.setData('text/plain', JSON.stringify(payload));
                pasteBumpRef.current = 0;
              } catch {}
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = (e.currentTarget.textContent || '').trim();
                if (onUpdateFigure && editingTextFigureId) {
                  onUpdateFigure(editingTextFigureId, { text });
                }
                endTextEditorDrag();
                setEditingTextFigureId(null);
                setFigureToolbar(null);
                isEditingTextRef.current = false;
              } else if (e.key === 'Escape') {
                e.preventDefault();
                endTextEditorDrag();
                setEditingTextFigureId(null);
                setFigureToolbar(null);
                isEditingTextRef.current = false;
              }
            }}
            onBlur={(e) => {
              const text = (e.currentTarget.textContent || '').trim();
              if (onUpdateFigure && editingTextFigureId) {
                onUpdateFigure(editingTextFigureId, { text });
              }
              endTextEditorDrag();
              setEditingTextFigureId(null);
              setFigureToolbar(null); // also close toolbar on background click
              isEditingTextRef.current = false;
            }}
            onPaste={(e) => {
              const raw = (e.clipboardData || (window as any).clipboardData).getData('text/plain');
              // If clipboard contains our figure payload, duplicate figures instead of inserting text
              try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.type === 'sitemap-text-figures' && Array.isArray(parsed.figures)) {
                  e.preventDefault();
                  if (!onCreateFigure) return;
                  const bump = 40 + 24 * (pasteBumpRef.current++);
                  const newIds: string[] = [];
                  parsed.figures.forEach((f: any) => {
                    const id = `fig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    newIds.push(id);
                    onCreateFigure({ id, type: 'text', x: (f.x ?? 0) + bump, y: (f.y ?? 0) + bump, text: f.text ?? 'Text', textColor: f.textColor, fontSize: f.fontSize, fontWeight: f.fontWeight });
                  });
                  if (newIds.length > 0) {
                    setSelectedFigureIds(new Set(newIds));
                    setSelectedFigureId(newIds[0]);
                    setFigureToolbar(null);
                  }
                  return;
                }
              } catch {}
              // Default: insert plain text into editor
              e.preventDefault();
              document.execCommand('insertText', false, raw);
            }}
          />
          <div
            className="w-full h-6 cursor-move"
            onMouseDown={beginTextEditorDrag}
          />
        </div>
      )}

      {/* Hover pill removed */}

      {/* Connection Style Popover */}
      {connectionPopover && (() => {
        const { linkKey: lk, sourceId, targetId, x, y } = connectionPopover;
        const style = linkStyles[lk] || {};
        const curPath: 'straight' | 'elbow' = style.path === 'elbow' ? 'elbow' : 'straight';
        const curDash: 'solid' | 'dashed' = style.dash === 'dashed' ? 'dashed' : 'solid';
        const change = (key: string, s: any) => { onLinkStyleChange?.(key, s); };
        const del = (sid: string, tid: string) => {
          const isExtra = (extraLinks || []).some(l => l.sourceId === sid && l.targetId === tid);
          if (isExtra) {
            onExtraLinkDelete?.(sid, tid);
          } else if (onNodesUpdate) {
            const updated = nodes.map(n => n.id === tid ? { ...n, parent: null } : n);
            onNodesUpdate(updated);
          }
          setConnectionPopover(null);
        };
        return (
          <ConnectionStylePopover
            linkKey={lk}
            sourceId={sourceId}
            targetId={targetId}
            currentStyle={{ path: curPath, dash: curDash }}
            anchorPosition={{ x, y }}
            onChange={change}
            onDelete={del}
            onClose={() => setConnectionPopover(null)}
          />
        );
      })()}

      {/* Inline Formatting Toolbar while editing */}
      {editingTextFigureId && (() => {
        const f = figures.find(ff => ff.id === editingTextFigureId) || ({ id: editingTextFigureId } as any);
        const currentFontSize = f.fontSize ?? 18;
        return (
            <div
              className="fixed z-20 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1 flex items-center gap-1"
            style={{ left: textEditorPosition.x, top: textEditorPosition.y - 30, transform: 'translate(-50%, -100%)' }}
            onClick={(e) => e.stopPropagation()}
            >
      <button 
        className="px-2 py-1 text-xs rounded hover:bg-gray-100" 
        onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpdateFigure?.(f.id, { fontSize: Math.max(10, currentFontSize - 2) });
                }}
              >–</button>
      <span className="px-1 tabular-nums text-[11px] text-gray-600">{currentFontSize}</span>
      <button 
        className="px-2 py-1 text-xs rounded hover:bg-gray-100" 
        onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpdateFigure?.(f.id, { fontSize: Math.min(64, currentFontSize + 2) });
                }}
              >+</button>
      <button 
        className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${f.fontWeight === 'bold' ? 'bg-gray-100' : ''}`} 
        onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpdateFigure?.(f.id, { fontWeight: f.fontWeight === 'bold' ? 'normal' : 'bold' });
                }}
              >B</button>
      <button 
        className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${f.underline ? 'bg-gray-100' : ''}`} 
        onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpdateFigure?.(f.id, { underline: !f.underline });
                }}
              ><span style={{ textDecoration: 'underline' }}>U</span></button>
             <button
               className="ml-1 px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600"
               onMouseDown={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 const id = editingTextFigureId || f.id;
                 onDeleteFigure?.(id);
                 setEditingTextFigureId(null);
                 setFigureToolbar(null);
                 isEditingTextRef.current = false;
               }}
          >Delete</button>
          </div>
        );
      })()}

      {/* Figure Formatting Toolbar (text or shapes) */}
      {figureToolbar && !editingTextFigureId && selectedFigureIds.size >= 1 && selectedIds.size === 0 && !draggedNode && (() => {
        const f = figures.find(ff => ff.id === figureToolbar.id);
        if (!f) return null;

        const isText = f.type === 'text';

        if (isText) {
          const selectedTextIds = Array.from(selectedFigureIds).filter(id => (figures.find(ff => ff.id === id)?.type === 'text'));
          const targetIds = selectedTextIds.length > 0 ? selectedTextIds : [f.id];
          const currentFontSize = f.fontSize ?? 18;
          return (
            <div
              className="fixed z-20 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1 flex items-center gap-1"
              style={{ left: figureToolbar.x, top: figureToolbar.y, transform: 'translate(-50%, -100%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Group/Ungroup removed from text toolbar to avoid confusion */}
              <button 
                className="px-2 py-1 text-xs rounded hover:bg-gray-100" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  targetIds.forEach(id => onUpdateFigure?.(id, { fontSize: Math.max(10, (figures.find(ff => ff.id === id)?.fontSize ?? currentFontSize) - 2) }));
                }}
              >–</button>
              <span className="px-1 tabular-nums text-[11px] text-gray-600">{currentFontSize}</span>
              <button 
                className="px-2 py-1 text-xs rounded hover:bg-gray-100" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  targetIds.forEach(id => onUpdateFigure?.(id, { fontSize: Math.min(64, (figures.find(ff => ff.id === id)?.fontSize ?? currentFontSize) + 2) }));
                }}
              >+</button>
              <button 
                className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${f.fontWeight === 'bold' ? 'bg-gray-100' : ''}`} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  targetIds.forEach(id => {
                    const cur = figures.find(ff => ff.id === id)?.fontWeight === 'bold' ? 'bold' : 'normal';
                    onUpdateFigure?.(id, { fontWeight: cur === 'bold' ? 'normal' : 'bold' });
                  });
                }}
              >B</button>
              <button 
                className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${f.underline ? 'bg-gray-100' : ''}`} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  targetIds.forEach(id => {
                    const cur = !!figures.find(ff => ff.id === id)?.underline;
                    onUpdateFigure?.(id, { underline: !cur });
                  });
                }}
              ><span style={{ textDecoration: 'underline' }}>U</span></button>
              <button 
                className="ml-1 px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  targetIds.forEach(id => onDeleteFigure?.(id)); 
                  setFigureToolbar(null); 
                  setEditingTextFigureId(null);
                }}
              >Delete</button>
            </div>
          );
        }

        // Shapes toolbar
        const fillColors = ['#ffffff', '#FDE68A', '#BFDBFE', '#C7F9E9', '#FBCFE8', '#FECACA', '#E5E7EB'];
        const strokeColors = ['#000000', '#1F2937', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#6B7280'];
        const widths = [1, 2, 3, 4, 6];

        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-2 flex flex-col gap-2"
            style={{ left: figureToolbar.x, top: figureToolbar.y, transform: 'translate(-50%, -100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 min-w-[40px]">Fill</span>
              <div className="flex gap-1">
                {fillColors.map(c => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded border-2 transition-all ${
                      (f.fill || '#ffffff') === c ? 'ring-2 ring-blue-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdateFigure?.(f.id, { fill: c });
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 min-w-[40px]">Stroke</span>
              <div className="flex gap-1">
                {strokeColors.map(c => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded border-2 transition-all ${
                      (f.stroke || '#000000') === c ? 'ring-2 ring-blue-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdateFigure?.(f.id, { stroke: c });
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 min-w-[40px]">Width</span>
              <div className="flex gap-1">
                {widths.map(w => (
                  <button
                    key={w}
                    className={`px-2 py-0.5 text-xs rounded transition-all ${
                      w === (f.strokeWidth ?? 2) ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdateFigure?.(f.id, { strokeWidth: w });
                    }}
                    title={`${w}px`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="mt-1 px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600 text-center w-full"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteFigure?.(f.id);
                setFigureToolbar(null);
              }}
            >Delete</button>
          </div>
        );
      })()}
    </div>
  );
});
