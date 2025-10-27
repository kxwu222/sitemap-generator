import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Download, Trash2, ChevronDown, ChevronUp, Menu, X, Search, HelpCircle, Edit2 } from 'lucide-react';
import { SitemapCanvas } from './components/SitemapCanvas';
import { SearchOverlay } from './components/SearchOverlay';
import { analyzeURLStructure, PageNode, groupByCategory, createNodesFromCsvData } from './utils/urlAnalyzer';
import { applyGroupedFlowLayout } from './utils/forceLayout';
import { exportToPNG, exportToCSV, exportToHTML, exportToXMLSitemap } from './utils/exportUtils';
import { parseCsvFile } from './utils/csvParser';
import { SitemapData } from './types/sitemap';
import { LinkStyle } from './types/linkStyle';

type LayoutType = 'grouped';

// Add this type near your other types
type HistorySnapshot = {
  nodes: PageNode[];
  extraLinks: Array<{ sourceId: string; targetId: string }>;
  linkStyles: Record<string, LinkStyle>;
  colorOverrides: Record<string, { customColor?: string; textColor?: string }>;
};

// Shortcut display component
const ShortcutItem = ({ keys, label, info }: { keys: string; label: string; info?: string }) => (
  <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors group">
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">{label}</span>
      {info && (
        <div className="relative inline-block">
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
          <div className="hidden group-hover:block absolute left-0 top-6 z-10 pointer-events-none">
            <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap relative">
              {info}
              <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
            </div>
          </div>
        </div>
      )}
    </div>
    <div className="flex items-center gap-1">
      {keys.split(' + ').map((key, idx) => (
        <span key={idx}>
          {idx > 0 && <span className="text-gray-400 mx-1">+</span>}
          <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-700 group-hover:bg-gray-200 transition-colors min-w-[32px] text-center">
            {key}
          </kbd>
        </span>
      ))}
    </div>
  </div>
);

function App() {
  // Sitemap management state
  const [sitemaps, setSitemaps] = useState<SitemapData[]>([]);
  const [activeSitemapId, setActiveSitemapId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showSitemapDropdown, setShowSitemapDropdown] = useState(false);
  const [editingSitemapId, setEditingSitemapId] = useState<string | null>(null);
  const [editingSitemapName, setEditingSitemapName] = useState('');
  const [sitemapToDelete, setSitemapToDelete] = useState<string | null>(null);

  // Local working state (synced with active sitemap)
  const [urls, setUrls] = useState<string[]>([]);
  const [nodes, setNodes] = useState<PageNode[]>([]);
  const [extraLinks, setExtraLinks] = useState<Array<{ sourceId: string; targetId: string }>>([]);
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [layoutType] = useState<LayoutType>('grouped');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedNode, setSelectedNode] = useState<PageNode | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [showCsvErrors, setShowCsvErrors] = useState(false);
  const [showAllUrls, setShowAllUrls] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<PageNode[]>([]);
  const [focusedNode, setFocusedNode] = useState<PageNode | null>(null);
  const [colorOverrides, setColorOverrides] = useState<Record<string, { customColor?: string; textColor?: string }>>({});
  const [linkStyles, setLinkStyles] = useState<Record<string, LinkStyle>>({});
  const sitemapCanvasRef = useRef<any>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastUsedGroup, setLastUsedGroup] = useState<string>('general');

  const makeSnapshot = useCallback((): HistorySnapshot => ({
    nodes: JSON.parse(JSON.stringify(nodes)),
    extraLinks: JSON.parse(JSON.stringify(extraLinks)),
    linkStyles: JSON.parse(JSON.stringify(linkStyles)),
    colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
  }), [nodes, extraLinks, linkStyles, colorOverrides]);

  // Sitemap management functions
  const saveCurrentStateToActiveSitemap = useCallback(() => {
    if (!activeSitemapId) return;
    setSitemaps(prev => prev.map(sitemap => 
      sitemap.id === activeSitemapId 
        ? {
            ...sitemap,
            nodes: JSON.parse(JSON.stringify(nodes)),
            extraLinks: JSON.parse(JSON.stringify(extraLinks)),
            linkStyles: JSON.parse(JSON.stringify(linkStyles)),
            colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
            urls: JSON.parse(JSON.stringify(urls)),
            lastModified: Date.now()
          }
        : sitemap
    ));
  }, [activeSitemapId, nodes, extraLinks, linkStyles, colorOverrides, urls]);

  const createNewSitemap = useCallback(() => {
    // Save current state before creating a new sitemap
    const newSitemapId = `sitemap-${Date.now()}`;
    const now = Date.now();

    setSitemaps(prev => {
      // First, save current sitemap state if it exists
      const updated = prev.map(sitemap => 
        sitemap.id === activeSitemapId 
          ? {
              ...sitemap,
              nodes: JSON.parse(JSON.stringify(nodes)),
              extraLinks: JSON.parse(JSON.stringify(extraLinks)),
              linkStyles: JSON.parse(JSON.stringify(linkStyles)),
              colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
              urls: JSON.parse(JSON.stringify(urls)),
              lastModified: now
            }
          : sitemap
      );

      // Find the highest number used in "Untitled Sitemap" names
      const untitledPattern = /^Untitled Sitemap (\d+)$/;
      let maxNumber = 0;
      
      updated.forEach(sitemap => {
        const match = sitemap.name.match(untitledPattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      });

      const newSitemap: SitemapData = {
        id: newSitemapId,
        name: `Untitled Sitemap ${maxNumber + 1}`,
        nodes: [],
        extraLinks: [],
        linkStyles: {},
        colorOverrides: {},
        urls: [],
        lastModified: now,
        createdAt: now
      };

      return [...updated, newSitemap];
    });

    // Set the new sitemap as active
    setActiveSitemapId(newSitemapId);
    
    // Reset all state
    setNodes([]);
    setExtraLinks([]);
    setLinkStyles({});
    setColorOverrides({});
    setUrls([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedNode(null);
  }, [activeSitemapId, nodes, extraLinks, linkStyles, colorOverrides, urls]);

  const switchToSitemap = useCallback((sitemapId: string) => {
    // Save current state before switching
    if (activeSitemapId) {
      saveCurrentStateToActiveSitemap();
    }
    
    const sitemap = sitemaps.find(s => s.id === sitemapId);
    if (sitemap) {
      setActiveSitemapId(sitemapId);
      setNodes(JSON.parse(JSON.stringify(sitemap.nodes)));
      setExtraLinks(JSON.parse(JSON.stringify(sitemap.extraLinks)));
      setLinkStyles(JSON.parse(JSON.stringify(sitemap.linkStyles)));
      setColorOverrides(JSON.parse(JSON.stringify(sitemap.colorOverrides)));
      setUrls(JSON.parse(JSON.stringify(sitemap.urls)));
      // Clear history on switch
      setUndoStack([]);
      setRedoStack([]);
      setSelectedNode(null);
    }
  }, [sitemaps, activeSitemapId, saveCurrentStateToActiveSitemap]);

  const deleteSitemap = useCallback((sitemapId: string) => {
    if (sitemaps.length <= 1) {
      // Can't delete the last sitemap - just create a new empty one
      createNewSitemap();
      return;
    }
    
    const filtered = sitemaps.filter(s => s.id !== sitemapId);
    setSitemaps(filtered);
    
    // If deleting active, switch to first remaining
    if (activeSitemapId === sitemapId) {
      switchToSitemap(filtered[0].id);
    }
  }, [sitemaps, activeSitemapId, createNewSitemap, switchToSitemap]);

  const renameSitemap = useCallback((sitemapId: string, newName: string) => {
    if (!newName.trim()) return; // Still validate non-empty
    setSitemaps(prev => prev.map(s => 
      s.id === sitemapId ? { ...s, name: newName, lastModified: Date.now() } : s
    ));
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const savedSitemaps = localStorage.getItem('sitemaps');
    const savedActiveId = localStorage.getItem('activeSitemapId');
    
    if (savedSitemaps) {
      const parsedSitemaps = JSON.parse(savedSitemaps) as SitemapData[];
      setSitemaps(parsedSitemaps);
      if (savedActiveId) {
        setActiveSitemapId(savedActiveId);
      }
    } else {
      // Initialize with one empty sitemap
      const initialSitemap: SitemapData = {
        id: `sitemap-${Date.now()}`,
        name: 'Untitled Sitemap 1',  // Changed from 'Untitled Sitemap'
        nodes: [],
        extraLinks: [],
        linkStyles: {},
        colorOverrides: {},
        urls: [],
        lastModified: Date.now(),
        createdAt: Date.now()
      };
      setSitemaps([initialSitemap]);
      setActiveSitemapId(initialSitemap.id);
    }
    setInitialized(true);
  }, []);

  // Save to localStorage whenever sitemaps or activeId changes
  useEffect(() => {
    if (initialized && sitemaps.length > 0) {
      localStorage.setItem('sitemaps', JSON.stringify(sitemaps));
      if (activeSitemapId) {
        localStorage.setItem('activeSitemapId', activeSitemapId);
      }
    }
  }, [sitemaps, activeSitemapId, initialized]);

  // Auto-save current state to active sitemap periodically and on changes
  useEffect(() => {
    if (!initialized || !activeSitemapId) return;
    
    const timeoutId = setTimeout(() => {
      saveCurrentStateToActiveSitemap();
    }, 1000); // Debounce auto-save

    return () => clearTimeout(timeoutId);
  }, [nodes, extraLinks, linkStyles, colorOverrides, urls, initialized, activeSitemapId, saveCurrentStateToActiveSitemap]);

  // Debug focusedNode changes
  useEffect(() => {
    console.log('App: focusedNode changed to:', focusedNode);
    if (focusedNode === null) {
      console.log('App: focusedNode set to null - call stack:', new Error().stack);
    }
  }, [focusedNode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      // Undo (Cmd/Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.length > 0) {
          const prev = undoStack[undoStack.length - 1];
          setUndoStack(stack => stack.slice(0, -1));
          setRedoStack(stack => [...stack, makeSnapshot()]);
          setNodes(prev.nodes);
          setExtraLinks(prev.extraLinks);
          setLinkStyles(prev.linkStyles);
          setColorOverrides(prev.colorOverrides);
        }
        return;
      }
      // Redo (Cmd/Ctrl+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        if (redoStack.length > 0) {
          const next = redoStack[redoStack.length - 1];
          setRedoStack(stack => stack.slice(0, -1));
          setUndoStack(stack => [...stack, makeSnapshot()]);
          setNodes(next.nodes);
          setExtraLinks(next.extraLinks);
          setLinkStyles(next.linkStyles);
          setColorOverrides(next.colorOverrides);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, extraLinks, linkStyles, colorOverrides, undoStack, redoStack, makeSnapshot]);

  useEffect(() => {
    if (urls.length > 0) {
      const hierarchy = analyzeURLStructure(urls);
      let layoutNodes: PageNode[];

      // Only apply layout if nodes don't have manual positions
      const hasManualPositions = nodes.some(node => node.x !== undefined && node.y !== undefined);
      
      if (!hasManualPositions) {
        // Apply grouped layout algorithm
        layoutNodes = applyGroupedFlowLayout(hierarchy.nodes, { width: 1800, height: 900 });
        setNodes(layoutNodes);
        setSidebarCollapsed(true);
      }
    }
  }, [urls, layoutType]); // Remove 'nodes' from dependencies

  // Re-apply layout when switching layout type, even after manual dragging
  useEffect(() => {
    if (nodes.length === 0) return;

    // Clear manual/fixed positions to allow a fresh layout
    const baseNodes = nodes.map(n => ({
      ...n,
      x: undefined,
      y: undefined,
      fx: null,
      fy: null,
    }));

    // Apply grouped layout
    const relaidNodes = applyGroupedFlowLayout(baseNodes, { width: 2000, height: 1000 });

    setNodes(relaidNodes);
  }, [layoutType]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportMenu && !(event.target as Element).closest('.export-menu-container')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);


  const handleClearAll = () => {
    setUrls([]);
    setNodes([]);
    setSelectedNode(null);
    setCsvErrors([]);
    setShowCsvErrors(false);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvErrors(['Please select a CSV file']);
      setShowCsvErrors(true);
      return;
    }

    try {
      const result = await parseCsvFile(file);
      
      if (result.errors.length > 0) {
        setCsvErrors(result.errors);
        setShowCsvErrors(true);
        return;
      }

      if (result.data.length === 0) {
        setCsvErrors(['No valid data found in CSV file']);
        setShowCsvErrors(true);
        return;
      }

      // Convert CSV data to nodes
      const hierarchy = createNodesFromCsvData(result.data);
      const layoutNodes = applyGroupedFlowLayout(hierarchy.nodes, {
        width: 1800,
        height: 900,
      });

      // Create a new sitemap with the CSV data
      const newSitemapId = `sitemap-${Date.now()}`;
      const now = Date.now();

      setSitemaps(prev => {
        // First, save current sitemap state if it exists
        const updated = prev.map(sitemap => 
          sitemap.id === activeSitemapId 
            ? {
                ...sitemap,
                nodes: JSON.parse(JSON.stringify(nodes)),
                extraLinks: JSON.parse(JSON.stringify(extraLinks)),
                linkStyles: JSON.parse(JSON.stringify(linkStyles)),
                colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
                urls: JSON.parse(JSON.stringify(urls)),
                lastModified: now
              }
            : sitemap
        );

        // Find the highest number used in "Untitled Sitemap" names
        const untitledPattern = /^Untitled Sitemap (\d+)$/;
        let maxNumber = 0;
        
        updated.forEach(sitemap => {
          const match = sitemap.name.match(untitledPattern);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) maxNumber = num;
          }
        });

        const newSitemap: SitemapData = {
          id: newSitemapId,
          name: `Untitled Sitemap ${maxNumber + 1}`,
          nodes: JSON.parse(JSON.stringify(layoutNodes)),
          extraLinks: [],
          linkStyles: {},
          colorOverrides: {},
          urls: JSON.parse(JSON.stringify(result.data.map(row => row.url))),
          lastModified: now,
          createdAt: now
        };

        return [...updated, newSitemap];
      });

      // Set the new sitemap as active and load its data
      setActiveSitemapId(newSitemapId);
      setNodes(layoutNodes);
      setUrls(result.data.map(row => row.url));
      setExtraLinks([]);
      setLinkStyles({});
      setColorOverrides({});
      setUndoStack([]);
      setRedoStack([]);
      setSelectedNode(null);
      setSidebarCollapsed(true);
      setCsvErrors([]);
      setShowCsvErrors(false);
      
      // Reset file input
      e.target.value = '';
    } catch (error) {
      setCsvErrors([`Error processing CSV file: ${error}`]);
      setShowCsvErrors(true);
    }
  };



  const handleNodesUpdate = (updatedNodes: PageNode[]) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(updatedNodes);
  };

  const handleNodesPreview = (updatedNodes: PageNode[]) => {
    setNodes(updatedNodes);
  };

  const handleExtraLinkCreate = (sourceId: string, targetId: string) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);

    setExtraLinks(prev => {
      const key = `${sourceId}->${targetId}`;
      const exists = prev.some(l => `${l.sourceId}->${l.targetId}` === key);
      if (exists) return prev;
      return [...prev, { sourceId, targetId }];
    });

    // Mirror "Add node" styling: solid, width 2, #333; pick elbow/straight smartly
    const styleKey = `${sourceId}-${targetId}`;
    const s = nodes.find(n => n.id === sourceId);
    const t = nodes.find(n => n.id === targetId);
    let path: 'straight' | 'elbow' = 'straight';
    if (s && t && s.x != null && s.y != null && t.x != null && t.y != null) {
      const dx = Math.abs(t.x - s.x);
      const dy = Math.abs(t.y - s.y);
      path = (dx > 160 && dy > 80) ? 'elbow' : 'straight';
    }

    setLinkStyles(prev => {
      if (prev[styleKey]) return prev; // don't overwrite existing
      return {
        ...prev,
        [styleKey]: {
          dash: 'solid',
          path,
          width: 2,
          color: '#333333',
        },
      };
    });
  };

  const handleExtraLinkDelete = (sourceId: string, targetId: string) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setExtraLinks(prev => prev.filter(l => !(l.sourceId === sourceId && l.targetId === targetId)));
  };

  const handleNodeEdit = (nodeId: string, updates: Partial<PageNode>) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    ));
    
    // Update selected node if it's the one being edited
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleGroupEdit = (category: string, updates: Partial<PageNode>) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(prev => prev.map(node => 
      node.category === category ? { ...node, ...updates } : node
    ));
    
    // Update selected node if it's in the same category
    if (selectedNode && selectedNode.category === category) {
      setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Temporary preview color overrides (do not persist until Save)
  const handlePreviewColor = useCallback((nodeId: string, override: { customColor?: string; textColor?: string }) => {
    setColorOverrides(prev => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] || {}), ...override },
    }));
  }, []);

  const handlePreviewGroup = useCallback((category: string, override: { customColor?: string; textColor?: string } | null) => {
    setColorOverrides(prev => {
      const next = { ...prev } as Record<string, { customColor?: string; textColor?: string }>;
      nodes.forEach(n => {
        if (n.category === category) {
          if (override) {
            next[n.id] = { ...(next[n.id] || {}), ...override };
          } else {
            // clear override for this node
            delete next[n.id];
          }
        }
      });
      return next;
    });
  }, [nodes]);

  const handleClearPreview = useCallback(() => {
    setColorOverrides({});
  }, []);

  const handleNodeDelete = (nodeId: string) => {
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(prev => {
      const updatedNodes = prev.filter(node => node.id !== nodeId);
      
      // Update parent-child relationships
      return updatedNodes.map(node => ({
        ...node,
        children: node.children.filter(childId => childId !== nodeId),
        parent: node.parent === nodeId ? null : node.parent
      }));
    });
    
    // Clear selected node if it was deleted
    if (selectedNode && selectedNode.id === nodeId) {
    setSelectedNode(null);
    }
  };

  // ===== Group operations =====
  function relayoutGroup(group: string) {
    const inGroup = nodes.filter(n => n.category === group);
    if (inGroup.length === 0) return;

    const marginX = 200, marginY = 100;
    const minX = Math.min(...inGroup.map(n => n.x || 0));
    const minY = Math.min(...inGroup.map(n => n.y || 0));
    const cols = Math.ceil(Math.sqrt(inGroup.length));

    const posById = new Map<string, { x: number; y: number }>();
    inGroup.forEach((n, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      posById.set(n.id, { x: minX + c * marginX, y: minY + r * marginY });
    });

    const updated = nodes.map(n => {
      if (posById.has(n.id)) {
        const p = posById.get(n.id)!;
        return { ...n, x: p.x, y: p.y, fx: p.x, fy: p.y };
      }
      return n;
    });
    handleNodesUpdate(updated);
  }

  function handleMoveNodesToGroup(nodeIds: string[], targetGroup: string, opts?: { includeSubtree?: boolean; relayout?: boolean }) {
    if (nodeIds.length === 0) return;
    const include = new Set<string>(nodeIds);
    if (opts?.includeSubtree) {
      const byId = new Map(nodes.map(n => [n.id, n] as const));
      const q = [...nodeIds];
      while (q.length) {
        const id = q.shift()!;
        const n = byId.get(id);
        if (!n) continue;
        n.children.forEach(cid => {
          if (!include.has(cid)) {
            include.add(cid);
            q.push(cid);
          }
        });
      }
    }
    const updated = nodes.map(n => include.has(n.id) ? { ...n, category: targetGroup } : n);
    setLastUsedGroup(targetGroup);
    handleNodesUpdate(updated);
    if (opts?.relayout) {
      relayoutGroup(targetGroup);
    }
  }

  function handleCreateGroupFromSelection(selectedIds: string[], newGroupName: string, opts?: { relayout?: boolean }) {
    const name = (newGroupName || '').trim();
    if (!name) return;
    handleMoveNodesToGroup(selectedIds, name, { includeSubtree: false, relayout: !!opts?.relayout });
  }

  function handleDeleteGroup(groupName: string) {
    // When deleting a group, reassign all nodes in that group to 'general'
    handleMoveNodesToGroup(
      nodes.filter(n => n.category === groupName).map(n => n.id),
      'general',
      { includeSubtree: false, relayout: false }
    );
  }

  function handleRenameGroup(oldName: string, newName: string) {
    const name = (newName || '').trim();
    if (!name || name === oldName) return;
    const updated = nodes.map(n => n.category === oldName ? { ...n, category: name } : n);
    handleNodesUpdate(updated);
  }

  const handleAddNode = (parentId: string | null = null) => {
    const newNodeId = `node-${Date.now()}`;
    const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
    
    // Compute a non-overlapping position for the new node
    const dx = 300;
    const dyBase = 120;
    const verticalSpacing = 90;
    const childIndex = parentNode ? parentNode.children.length : 0; // index among siblings
    const offsetY = dyBase + childIndex * verticalSpacing; // stack children downward

    const newNode: PageNode = {
      id: newNodeId,
      url: '',
      title: 'New Page',
      depth: parentNode ? parentNode.depth + 1 : 0,
      parent: parentId,
      children: [],
      category: parentNode ? parentNode.category : (lastUsedGroup || 'general'),
      customTitle: true,
      // Place new child offset from parent; additional children stack with spacing
      x: parentNode ? (parentNode.x || 0) + dx : 600,
      y: parentNode ? (parentNode.y || 0) + offsetY : 300,
    };

    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(prev => {
      const updatedNodes = [...prev, newNode];
      
      // Update parent's children array
      if (parentId) {
        return updatedNodes.map(node => 
          node.id === parentId 
            ? { ...node, children: [...node.children, newNodeId] }
            : node
        );
      }
      
      return updatedNodes;
    });

    // Select the new node for editing
    setSelectedNode(newNode);
    setLastUsedGroup(newNode.category);
  };

  const handleConnectionCreate = (sourceId: string, targetId: string) => {
    setNodes(prev => {
      const updated = prev.map(node => {
        if (node.id === targetId) {
          return { ...node, parent: sourceId };
        } else if (node.id === sourceId) {
          return { ...node, children: [...node.children, targetId] };
        }
        return node;
      });
      return recomputeDepths(updated);
    });
  };

  function recomputeDepths(list: PageNode[]): PageNode[] {
    const idMap = new Map(list.map(n => [n.id, n]));
    const roots = list.filter(n => !n.parent);
    const depthMap = new Map<string, number>();
    const q: string[] = [];
    roots.forEach(r => { depthMap.set(r.id, 0); q.push(r.id); });
    while (q.length) {
      const id = q.shift()!;
      const d = depthMap.get(id)!;
      const n = idMap.get(id)!;
      n.children.forEach(cid => {
        if (!depthMap.has(cid)) { depthMap.set(cid, d + 1); q.push(cid); }
      });
    }
    return list.map(n => ({ ...n, depth: depthMap.get(n.id) ?? 0 }));
  }

  const handleSearchResults = useCallback((results: PageNode[]) => {
    setSearchResults(results);
  }, []);

  const handleClearSearch = useCallback(() => {
    console.log('App: handleClearSearch called - clearing search results only (keeping focusedNode)');
    setSearchResults([]);
    // Don't clear focusedNode here - it should only be cleared when user explicitly clears search
    // setFocusedNode(null); // Clear focused node when clearing search
  }, []);

  const handleClearFocus = useCallback(() => {
    console.log('App: handleClearFocus called - clearing focusedNode');
    setFocusedNode(null);
  }, []);

  const handleLinkStyleChange = useCallback((linkKey: string, style: LinkStyle) => {
    setLinkStyles(prev => ({
      ...prev,
      [linkKey]: { ...prev[linkKey], ...style }
    }));
  }, []);

  const handleFocusNode = useCallback((node: PageNode) => {
    console.log('App: handleFocusNode called with:', node.title, node.id);
    
    // Set the focused node for visual highlighting FIRST using flushSync
    console.log('App: Setting focusedNode to:', node.title);
    console.log('App: About to call setFocusedNode with flushSync');
    flushSync(() => {
      setFocusedNode(node);
    });
    console.log('App: setFocusedNode called with flushSync');
    
    // Then center the view on the selected node using ref
    if (sitemapCanvasRef.current && sitemapCanvasRef.current.centerOnNode) {
      console.log('App: Calling centerOnNode');
      sitemapCanvasRef.current.centerOnNode(node);
    } else {
      console.log('App: Ref or centerOnNode not available');
    }
  }, []);

  const handleExport = async (format: 'png' | 'csv' | 'html' | 'xml') => {
    switch (format) {
      case 'png':
        await exportToPNG(nodes);
        break;
      case 'csv':
        exportToCSV(nodes);
        break;
      case 'html':
        exportToHTML(nodes);
        break;
      case 'xml':
        exportToXMLSitemap(nodes);
        break;
    }
  };

  const categoryGroups = groupByCategory(nodes);
  const stats = {
    total: nodes.length,
    categories: categoryGroups.size,
    maxDepth: Math.max(...nodes.map(n => n.depth), 0),
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <header className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="max-w-screen-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 relative">
              <img width="28" height="28" src="https://img.icons8.com/?size=100&id=1rQZ4drGQD6F&format=png&color=000000" alt="Sitemap Generator"/>
              <h1 className="text-2xl font-semibold tracking-tight">Sitemap Generator</h1>
            </div>
            <div className="flex items-center gap-3">
              {nodes.length > 0 && (
                <button
                  onClick={() => setShowSearch(true)}
                  className="px-4 py-2 text-sm font-medium border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                  title="Search nodes (Ctrl+F)"
                >
                  <Search className="w-4 h-4" strokeWidth={1.5} />
                  Search URL
                </button>
              )}
              {nodes.length > 0 && (
                <div className="relative export-menu-container">
                  <button
                    onClick={() => setShowExportMenu(v => !v)}
                    className="px-4 py-2 text-sm font-medium border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                    title="Export"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Export
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 shadow-lg z-50" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setShowExportMenu(false); handleExport('png'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">PNG</button>
                      {/* <button onClick={() => { setShowExportMenu(false); handleExport('xml'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">XML (Sitemap)</button> */}
                      <button onClick={() => { setShowExportMenu(false); handleExport('csv'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">CSV (Data)</button>
                      <button onClick={() => { setShowExportMenu(false); handleExport('html'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">HTML (Interactive)</button>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 text-sm font-medium border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="text-gray-700" viewBox="0 0 16 16">
                  <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z"/>
                </svg>
                Groups
              </button>
              {/* AI organize button removed per request */}
              <button
                onClick={() => setShowHelp(true)}
                className="px-3 py-2 text-sm font-medium border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                title="Help"
              >
                <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
                Help
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex h-0 min-h-0">
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64 sm:w-72 lg:w-80'} border-r border-gray-200 bg-white flex flex-col overflow-y-auto h-full transition-all duration-300 z-50 relative`}>
          {/* Collapse/Expand Button */}
          <div className={`${sidebarCollapsed ? 'p-2' : 'p-6'} border-b border-gray-200`}>
            <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-between'} items-center`}>
              {sidebarCollapsed ? null : (
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
                  Workspace
                </h2>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <Menu className="w-5 h-8" strokeWidth={1.5} /> : <X className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {/* PRIMARY: Upload CSV Section */}
          {!sidebarCollapsed && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-3">
                Upload CSV
              </h2>
              {/* CSV Upload Button - Primary CTA */}
              <div className="mb-2">
                <label className="flex-1 px-4 py-3 bg-[#CB6015] border border-[#B54407] shadow-sm hover:shadow-md hover:bg-[#CC5500] text-white text-sm font-medium rounded-lg cursor-pointer flex items-center justify-center gap-2 transition-colors">
                  <img width="18" height="18" src="https://img.icons8.com/fluency-systems-regular/50/upload--v1.png" alt="upload csv file" style={{filter: 'brightness(0) invert(1)'}}/>
                  Upload CSV File
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                CSV should have columns: Page Title, Page URL, Group/Category
              </p>

              {/* CSV Error Display */}
              {showCsvErrors && csvErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-red-800">CSV Upload Errors</h4>
                    <button
                      onClick={() => setShowCsvErrors(false)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </div>
                  <ul className="text-xs text-red-700 space-y-1">
                    {csvErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* SECONDARY: Sitemap Switcher Section */}
          {!sidebarCollapsed && (
            <div className={`${sidebarCollapsed ? 'p-2' : 'p-6'} border-b border-gray-200`}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600 mb-3">
                Sitemaps
              </h2>
              
              {/* Create New Sitemap Button */}
              <button
                onClick={createNewSitemap}
                className="w-full mb-3 px-3 py-2 bg-gray-100 shadow-sm border border-gray-200 hover:shadow-md hover:bg-gray-150 text-gray-700 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
              >
                <img width="16" height="16" src="https://img.icons8.com/puffy/32/add.png" alt="add"/>
                Create New Sitemap
              </button>
              
              {/* Dropdown Button */}
              <div className="relative">
                <button
                  onClick={() => setShowSitemapDropdown(!showSitemapDropdown)}
                  className="w-full px-3 py-2 text-left text-sm border rounded-lg border-gray-300 hover:border-gray-400 bg-white rounded flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate">
                      {sitemaps.find(s => s.id === activeSitemapId)?.name || 'No Sitemap'}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${showSitemapDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showSitemapDropdown && sitemaps.length > 0 && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowSitemapDropdown(false)}
                    />
                    <div 
                      className="absolute left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-20 max-h-64 overflow-y-auto"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Sitemap List */}
                      <div className="py-1">
                        {sitemaps.map(sitemap => (
                          <div
                            key={sitemap.id}
                            className={`group px-2 py-2 hover:bg-gray-50 flex items-center justify-between ${
                              activeSitemapId === sitemap.id ? 'bg-blue-50' : ''
                            }`}
                          >
                            <button
                              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                              onClick={() => {
                                switchToSitemap(sitemap.id);
                                setShowSitemapDropdown(false);
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{sitemap.name}</div>
                                <div className="text-xs text-gray-500">{sitemap.nodes.length} pages</div>
                              </div>
                            </button>
                            <div 
                              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 pl-2"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowSitemapDropdown(false);
                                  setEditingSitemapId(sitemap.id);
                                  setEditingSitemapName(sitemap.name);
                                }}
                                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                title="Rename"
                                type="button"
                              >
                                <Edit2 className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                              </button>
                              {sitemaps.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSitemapDropdown(false);
                                    setSitemapToDelete(sitemap.id);
                                  }}
                                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                  title="Delete"
                                  type="button"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* URLs Section */}
          {!sidebarCollapsed && (
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
                URLs ({urls.length})
              </h2>
              {urls.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Clear
                </button>
              )}
            </div>
              <div className={`overflow-y-auto space-y-1 transition-all duration-300 ${showAllUrls ? 'max-h-48' : 'max-h-32'}`}>
              {urls.length === 0 ? (
                <p className="text-sm text-gray-400">No URLs added yet</p>
              ) : (
                urls.map((url, index) => (
                  <div key={index} className="text-xs font-mono text-gray-600 truncate">
                    {url}
                  </div>
                ))
              )}
            </div>
              {urls.length > 6 && (
                <button
                  onClick={() => setShowAllUrls(!showAllUrls)}
                  className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showAllUrls ? (
                    <>
                      <ChevronUp className="w-3 h-3" strokeWidth={1.5} />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                      Show More
                    </>
                  )}
                </button>
              )}
          </div>
          )}

          {nodes.length > 0 && !sidebarCollapsed && (
            <>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-4">
                  Statistics
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Pages</span>
                    <span className="font-medium">{stats.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Groups</span>
                    <span className="font-medium">{stats.categories}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Max Depth</span>
                    <span className="font-medium">{stats.maxDepth}</span>
                  </div>
                </div>
              </div>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-3">Groups</h2>
                <div className="space-y-1">
                  {Array.from(groupByCategory(nodes).keys()).map(group => (
                    <div
                      key={group}
                      className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200"
                      title="Click to move current selection; drop selected nodes to move"
                      onClick={() => {
                        const ids: string[] = sitemapCanvasRef.current?.getSelectedNodeIds?.() || [];
                        if (ids.length) handleMoveNodesToGroup(ids, group);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const ids: string[] = sitemapCanvasRef.current?.getSelectedNodeIds?.() || [];
                        if (ids.length) handleMoveNodesToGroup(ids, group);
                      }}
                    >
                      <span className="capitalize">{group}</span>
                      <span className="text-gray-500">{nodes.filter(n => n.category === group).length}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        <main className="flex-1 bg-gray-50 flex flex-col h-full overflow-hidden">
          {nodes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-lg">
                <img className="w-16 h-16 mx-auto mb-4 opacity-30" src="https://img.icons8.com/?size=100&id=82795&format=png&color=000000" alt="No sitemap yet"/>
                <h2 className="text-xl font-semibold mb-2">No Sitemap Yet</h2>
                <p className="text-gray-500 mb-6">
                  Upload a CSV file to generate an intelligent, auto-layout sitemap with hierarchy detection
                  and professional export formats.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative h-full">
              <SitemapCanvas
                ref={sitemapCanvasRef}
                nodes={nodes}
                layoutType={layoutType}
                extraLinks={extraLinks}
                onNodeClick={node => {
                  console.log('App: onNodeClick called with:', node.title, 'clearing focusedNode');
                  setSelectedNode(node);
                  // Only clear focus if it's a different node
                  if (focusedNode && focusedNode.id !== node.id) {
                    console.log('App: Clearing focus because different node clicked');
                    setFocusedNode(null);
                  } else {
                    console.log('App: Keeping focus because same node clicked');
                  }
                }}
                onNodesUpdate={handleNodesUpdate}
                onNodesPreview={handleNodesPreview}
                onConnectionCreate={handleConnectionCreate}
                onExtraLinkCreate={handleExtraLinkCreate}
                onExtraLinkDelete={handleExtraLinkDelete}
                onAddChild={handleAddNode}
                onAddNode={() => handleAddNode(null)}
                onMoveNodesToGroup={handleMoveNodesToGroup}
                onCreateGroupFromSelection={handleCreateGroupFromSelection}
                onDeleteGroup={handleDeleteGroup}
                onUndo={() => {
                  if (undoStack.length > 0) {
                    const prev = undoStack[undoStack.length - 1];
                    setUndoStack(stack => stack.slice(0, -1));
                    setRedoStack(stack => [...stack, makeSnapshot()]);
                    setNodes(prev.nodes);
                    setExtraLinks(prev.extraLinks);
                    setLinkStyles(prev.linkStyles);
                    setColorOverrides(prev.colorOverrides);
                  }
                }}
                onRedo={() => {
                  if (redoStack.length > 0) {
                    const next = redoStack[redoStack.length - 1];
                    setRedoStack(stack => stack.slice(0, -1));
                    setUndoStack(stack => [...stack, makeSnapshot()]);
                    setNodes(next.nodes);
                    setExtraLinks(next.extraLinks);
                    setLinkStyles(next.linkStyles);
                    setColorOverrides(next.colorOverrides);
                  }
                }}
                searchResults={searchResults}
                focusedNode={focusedNode}
                onClearFocus={handleClearFocus}
                colorOverrides={colorOverrides}
                linkStyles={linkStyles}
                onLinkStyleChange={handleLinkStyleChange}
              />
            </div>
          )}
        </main>
                </div>

      {/* Search Overlay */}
      <SearchOverlay
        nodes={nodes}
        onSearchResults={handleSearchResults}
        onClearSearch={handleClearSearch}
        isVisible={showSearch}
        onClose={() => setShowSearch(false)}
        onFocusNode={handleFocusNode}
      />

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999] p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg shadow-lg w-1/3 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Minimal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
              <button 
                onClick={() => setShowHelp(false)} 
                className="text-gray-400 hover:text-gray-900 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Single Column Layout */}
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-6">
                {/* Essential Shortcuts */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Essential</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="V / M" label="Select / Multi-select mode" />
                    <ShortcutItem keys="A" label="Add child node" info="Requires a node to be selected first" />
                    <ShortcutItem keys="C" label="Change color" info="Requires a node to be selected first" />
                    {/* <ShortcutItem keys="Ctrl/Cmd + Z" label="Undo" />
                    <ShortcutItem keys="Ctrl/Cmd + Y" label="Redo" /> */}
                    {/* <ShortcutItem keys="Delete / Backspace" label="Delete" /> */}
                  </div>
                </div>

                {/* Links */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Links</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="Ctrl/Cmd + Drag" label="Create link" />
                    <ShortcutItem keys="Right-click link" label="Style link" />
                  </div>
                </div>

                {/* Navigation */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Navigation</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="Option/Alt + Drag" label="Drag parent nodes" info="Drag all connected parent and child nodes" />
                    <ShortcutItem keys="Ctrl/Cmd + Wheel" label="Zoom" />
                    <ShortcutItem keys="Ctrl/Cmd + F" label="Search" />
                  </div>
                </div>
              </div>
            </div>

            {/* Minimal Footer */}
            <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
              <button 
                onClick={() => setShowHelp(false)} 
                className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Panel for Node Editing */}

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg border border-gray-300">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Groups</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-1">
                    Groups
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Source: CSV “Group/Category” column. Otherwise inferred from URL path.</p>
                  <div className="space-y-2">
                    {Array.from(categoryGroups.entries()).map(([category, categoryNodes]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 border border-gray-300"
                            style={{
                              background:
                                category === 'root'
                                  ? '#000000'
                                  : category === 'content'
                                  ? '#1a1a1a'
                                  : category === 'products'
                                  ? '#333333'
                                  : category === 'company'
                                  ? '#4d4d4d'
                                  : category === 'support'
                                  ? '#666666'
                                  : category === 'technical'
                                  ? '#808080'
                                  : category === 'users'
                                  ? '#999999'
                                  : '#b3b3b3',
                            }}
                          />
                          <span className="capitalize">{category}</span>
                        </div>
                        <span className="text-gray-500">{categoryNodes.length} pages</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-6 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Sitemap Modal */}
      {editingSitemapId && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setEditingSitemapId(null);
            setEditingSitemapName('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Rename Sitemap</h3>
            <input
              type="text"
              value={editingSitemapName}
              onChange={(e) => setEditingSitemapName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editingSitemapName.trim()) {
                    renameSitemap(editingSitemapId, editingSitemapName);
                  }
                  setEditingSitemapId(null);
                  setEditingSitemapName('');
                } else if (e.key === 'Escape') {
                  setEditingSitemapId(null);
                  setEditingSitemapName('');
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setEditingSitemapId(null);
                  setEditingSitemapName('');
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editingSitemapName.trim()) {
                    renameSitemap(editingSitemapId, editingSitemapName);
                  }
                  setEditingSitemapId(null);
                  setEditingSitemapName('');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {sitemapToDelete && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSitemapToDelete(null)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Delete Sitemap</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "{sitemaps.find(s => s.id === sitemapToDelete)?.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSitemapToDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteSitemap(sitemapToDelete);
                  setSitemapToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
