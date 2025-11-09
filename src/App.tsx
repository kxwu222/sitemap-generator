import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { Download, Trash2, ChevronDown, ChevronUp, Menu, X, Search, HelpCircle, Edit2, LogIn, LogOut, User, Image, FileText, Layers } from 'lucide-react';
import { SitemapCanvas } from './components/SitemapCanvas';
import { SearchOverlay } from './components/SearchOverlay';
import { AuthModal } from './components/AuthModal';
import { analyzeURLStructure, PageNode, groupByCategory, createNodesFromCsvData } from './utils/urlAnalyzer';
import { applyGroupedFlowLayout } from './utils/forceLayout';
import { exportToPNG, exportToCSV, exportToXMLSitemap } from './utils/exportUtils';
import { parseCsvFile } from './utils/csvParser';
import { SitemapData, SelectionGroup } from './types/sitemap';
import { LinkStyle } from './types/linkStyle';
import { Figure, FreeLine } from './types/drawables';
import { saveSitemap, loadSitemaps, deleteSitemap as deleteSitemapFromSupabase, loadSitemapWithDrawables } from './services/sitemapService';
import { getCurrentUser, signOut, getSession } from './services/authService';
import { supabase } from './lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

type LayoutType = 'grouped';

// Add this type near your other types
type HistorySnapshot = {
  nodes: PageNode[];
  extraLinks: Array<{ sourceId: string; targetId: string }>;
  linkStyles: Record<string, LinkStyle>;
  colorOverrides: Record<string, { customColor?: string; textColor?: string }>;
  figures: Figure[];
  freeLines: FreeLine[];
  selectionGroups: SelectionGroup[];
};

// Tooltip rendered to body to avoid clipping by parent containers
const PortalTooltip = ({ anchorRect, text }: { anchorRect: DOMRect; text: string }) => {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: anchorRect.left,
    top: anchorRect.bottom + 6,
    zIndex: 1000,
    pointerEvents: 'none',
  };
  return createPortal(
    <div style={style}>
      <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap relative">
        {text}
        <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
      </div>
    </div>,
    document.body
  );
};

// Shortcut display component
const ShortcutItem = ({ keys, label, info }: { keys: string; label: string; info?: string }) => {
  const helpRef = useRef<HTMLSpanElement | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!showTip || !helpRef.current) return;
    const update = () => {
      if (helpRef.current) setRect(helpRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showTip]);

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors group">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">{label}</span>
        {info && (
          <span
            ref={helpRef}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            className="inline-flex items-center"
          >
            <HelpCircle className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.5} />
            {showTip && rect && <PortalTooltip anchorRect={rect} text={info} />}
          </span>
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
};

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
  const isUploadingCsvRef = useRef(false);
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
  const [figures, setFigures] = useState<Figure[]>([]);
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [selectionGroups, setSelectionGroups] = useState<SelectionGroup[]>([]);
  const sitemapCanvasRef = useRef<any>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastUsedGroup, setLastUsedGroup] = useState<string>('general');
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthDropdown, setShowAuthDropdown] = useState(false);
  const authButtonRef = useRef<HTMLButtonElement | null>(null);
  const [authDropdownPosition, setAuthDropdownPosition] = useState<{ top: number; right: number } | null>(null);

  const makeSnapshot = useCallback((): HistorySnapshot => ({
    nodes: JSON.parse(JSON.stringify(nodes)),
    extraLinks: JSON.parse(JSON.stringify(extraLinks)),
    linkStyles: JSON.parse(JSON.stringify(linkStyles)),
    colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
    figures: JSON.parse(JSON.stringify(figures)),
    freeLines: JSON.parse(JSON.stringify(freeLines)),
    selectionGroups: JSON.parse(JSON.stringify(selectionGroups)),
  }), [nodes, extraLinks, linkStyles, colorOverrides, figures, freeLines, selectionGroups]);

  // Refresh sitemaps after auth changes. Merge local sitemaps with remote so nothing disappears post-login.
  const refreshSitemapsFromSupabase = useCallback(async () => {
    try {
      const remote = await loadSitemaps();
      const savedActiveId = localStorage.getItem('activeSitemapId');

      // Merge local sitemaps not present on server (e.g., created pre-login)
      let merged = remote;
      try {
        const localStr = localStorage.getItem('sitemaps');
        if (localStr) {
          const localList = JSON.parse(localStr) as SitemapData[];
          const remoteIds = new Set(remote.map(s => s.id));
          const toMerge = localList.filter(s => !remoteIds.has(s.id));
          if (toMerge.length) merged = [...toMerge, ...remote];
        }
      } catch (err) {
        console.warn('Failed to read local sitemaps for merge:', err);
      }

      if (merged.length === 0) return; // keep current state

      setSitemaps(merged);
      const activeId = savedActiveId && merged.find(s => s.id === savedActiveId)
        ? savedActiveId
        : merged[0].id;
      const active = merged.find(s => s.id === activeId) || merged[0];

      const { figures: figs, freeLines: lines } = await loadSitemapWithDrawables(activeId);
      setFigures(figs);
      setFreeLines(lines);
      setActiveSitemapId(activeId);
      setNodes(JSON.parse(JSON.stringify(active.nodes)));
      setExtraLinks(JSON.parse(JSON.stringify(active.extraLinks)));
      setLinkStyles(JSON.parse(JSON.stringify(active.linkStyles)));
      setColorOverrides(JSON.parse(JSON.stringify(active.colorOverrides)));
      setUrls(JSON.parse(JSON.stringify(active.urls)));
      setSelectionGroups(JSON.parse(JSON.stringify(active.selectionGroups || [])));

      // Persist merged immediately for reliability across refresh
      try {
        localStorage.setItem('sitemaps', JSON.stringify(merged));
        localStorage.setItem('activeSitemapId', activeId);
      } catch {}
    } catch (e) {
      console.error('Failed to refresh sitemaps after auth change:', e);
    }
  }, []);

  // Check if Supabase is configured
  const isSupabaseConfigured = useCallback(() => {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY && supabase);
  }, []);

  // Require authentication for actions (only if Supabase is configured)
  const requireAuth = useCallback((): boolean => {
    if (!isSupabaseConfigured()) {
      // If Supabase is not configured, allow all actions (localStorage mode)
      return true;
    }
    if (!user) {
      // User not logged in, show auth modal
      setShowAuthModal(true);
      return false;
    }
    return true;
  }, [isSupabaseConfigured, user]);

  // Treat auth as ready if Supabase isn't configured or client isn't initialized (kept for future use)
  // const authReady = !isSupabaseConfigured() || !supabase || !authLoading;

  // Initialize auth state (auto-prompt sign-in if configured but no session)
  useEffect(() => {
    const initAuth = async () => {
      // Always show local immediately to avoid blank UI on refresh
      try {
        const localStrEarly = localStorage.getItem('sitemaps');
        const localActiveEarly = localStorage.getItem('activeSitemapId');
        if (localStrEarly) {
          const localList = JSON.parse(localStrEarly) as SitemapData[];
          setSitemaps(localList);
          if (localActiveEarly) setActiveSitemapId(localActiveEarly);
        }
      } catch {}

      if (!isSupabaseConfigured()) {
        setAuthLoading(false);
        return;
      }

      // Set loading to false immediately so canvas can render
      setAuthLoading(false);

      try {
        const session = await getSession();
        if (session?.user) {
          setUser(session.user);
        } else {
          setShowAuthModal(true);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      }
    };

    initAuth();

    // Listen for auth changes
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await refreshSitemapsFromSupabase();
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isSupabaseConfigured]);

  const handleAuthSuccess = async () => {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      setShowAuthModal(false);
      await refreshSitemapsFromSupabase();
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        console.error('signOut() failed:', error);
      }
    } catch (e) {
      console.error('signOut() failed:', e);
    } finally {
      setUser(null);
      // Show auth modal immediately after logout to remind users they need to log in
      setShowAuthModal(true);

      // Clear Supabase tokens so the auth listener doesn't immediately repopulate user
      try {
        const toClear: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) as string;
          if (/^sb-.*-(auth-token|csrf-token)$/i.test(k) || k.toLowerCase().includes('supabase')) {
            toClear.push(k);
          }
        }
        toClear.forEach(k => localStorage.removeItem(k));
      } catch {}

      // Restore local sitemaps (no wipe)
      try {
        const str = localStorage.getItem('sitemaps');
        if (str) {
          const list = JSON.parse(str) as SitemapData[];
          setSitemaps(list);
          const savedActiveId = localStorage.getItem('activeSitemapId');
          const activeId = savedActiveId && list.find(s => s.id === savedActiveId)
            ? savedActiveId
            : (list[0]?.id ?? null);

          if (activeId) {
            const active = list.find(s => s.id === activeId)!;
            setActiveSitemapId(activeId);
            setNodes(JSON.parse(JSON.stringify(active.nodes)));
            setExtraLinks(JSON.parse(JSON.stringify(active.extraLinks)));
            setLinkStyles(JSON.parse(JSON.stringify(active.linkStyles)));
            setColorOverrides(JSON.parse(JSON.stringify(active.colorOverrides)));
            setUrls(JSON.parse(JSON.stringify(active.urls)));
            setSelectionGroups(JSON.parse(JSON.stringify(active.selectionGroups || [])));
          } else {
            setActiveSitemapId(null);
            setNodes([]); setExtraLinks([]); setLinkStyles({}); setColorOverrides({});
            setUrls([]); setSelectionGroups([]); setFigures([]); setFreeLines([]);
          }
        } else {
          setSitemaps([]);
          setActiveSitemapId(null);
          setNodes([]); setExtraLinks([]); setLinkStyles({}); setColorOverrides({});
          setUrls([]); setSelectionGroups([]); setFigures([]); setFreeLines([]);
        }
        setUndoStack([]); setRedoStack([]); setSelectedNode(null);
      } catch (e) {
        console.error('Restore local sitemaps after sign-out failed:', e);
      }
    }
  };

  // Sitemap management functions
  const saveCurrentStateToActiveSitemap = useCallback(async () => {
    if (!activeSitemapId) return;
    
    const updatedSitemap: SitemapData = {
      id: activeSitemapId,
      name: sitemaps.find(s => s.id === activeSitemapId)?.name || 'Untitled Sitemap',
      nodes: JSON.parse(JSON.stringify(nodes)),
      extraLinks: JSON.parse(JSON.stringify(extraLinks)),
      linkStyles: JSON.parse(JSON.stringify(linkStyles)),
      colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
      urls: JSON.parse(JSON.stringify(urls)),
      selectionGroups: JSON.parse(JSON.stringify(selectionGroups)),
      lastModified: Date.now(),
      createdAt: sitemaps.find(s => s.id === activeSitemapId)?.createdAt || Date.now()
    };

    // Update local state
    setSitemaps(prev => prev.map(sitemap => 
      sitemap.id === activeSitemapId ? updatedSitemap : sitemap
    ));

    // Save to Supabase if configured and client exists
    if (isSupabaseConfigured() && supabase) {
      try {
        await saveSitemap(updatedSitemap, figures, freeLines);
      } catch (error) {
        console.error('Failed to save to Supabase:', error);
        // Fallback to localStorage
        localStorage.setItem('sitemaps', JSON.stringify(sitemaps.map(s => 
          s.id === activeSitemapId ? updatedSitemap : s
        )));
      }
    } else {
      // Fallback to localStorage
      localStorage.setItem('sitemaps', JSON.stringify(sitemaps.map(s => 
        s.id === activeSitemapId ? updatedSitemap : s
      )));
    }
  }, [activeSitemapId, nodes, extraLinks, linkStyles, colorOverrides, urls, figures, freeLines, selectionGroups, sitemaps, isSupabaseConfigured]);

  const createNewSitemap = useCallback(async () => {
    if (!requireAuth()) return;
    
    console.log('Create New Sitemap: start');
    
    // Don't await save - do it in background to avoid blocking
    if (activeSitemapId) {
      saveCurrentStateToActiveSitemap().catch(error => {
        console.error('Failed to save current sitemap before creating new one:', error);
      });
    }

    // Create new sitemap immediately
    const newSitemapId = `sitemap-${Date.now()}`;
    const now = Date.now();

    setSitemaps(prev => {
      // Find the highest number used in "Untitled Sitemap" names
      const untitledPattern = /^Untitled Sitemap (\d+)$/;
      let maxNumber = 0;
      
      prev.forEach(sitemap => {
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

      const next = [...prev, newSitemap];
      
      // Save to localStorage immediately
      try {
        localStorage.setItem('sitemaps', JSON.stringify(next));
        localStorage.setItem('activeSitemapId', newSitemapId);
      } catch (e) {
        console.warn('Create New Sitemap: failed to write localStorage backup', e);
      }

      // Save to Supabase in background (don't block)
      if (isSupabaseConfigured() && supabase) {
        saveSitemap(newSitemap, [], []).catch(error => {
          console.error('Failed to save new sitemap to Supabase:', error);
        });
      }

      return next;
    });

    // Set the new sitemap as active and reset state immediately
    setActiveSitemapId(newSitemapId);
    setNodes([]);
    setExtraLinks([]);
    setLinkStyles({});
    setColorOverrides({});
    setUrls([]);
    setFigures([]);
    setFreeLines([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectionGroups([]);
    setSelectedNode(null);
    
    console.log('Create New Sitemap: completed', newSitemapId);
  }, [activeSitemapId, saveCurrentStateToActiveSitemap, isSupabaseConfigured]);

  const switchToSitemap = useCallback(async (sitemapId: string) => {
    const sitemap = sitemaps.find(s => s.id === sitemapId);
    if (!sitemap) return;

    // Save current in background (don't block)
    if (activeSitemapId && activeSitemapId !== sitemapId) {
      saveCurrentStateToActiveSitemap().catch(err =>
        console.error('Save before switch failed:', err)
      );
    }

    // Immediate UI update
    setActiveSitemapId(sitemapId);
    setNodes(JSON.parse(JSON.stringify(sitemap.nodes)));
    setExtraLinks(JSON.parse(JSON.stringify(sitemap.extraLinks)));
    setLinkStyles(JSON.parse(JSON.stringify(sitemap.linkStyles)));
    setColorOverrides(JSON.parse(JSON.stringify(sitemap.colorOverrides)));
    setUrls(JSON.parse(JSON.stringify(sitemap.urls)));
    setSelectionGroups(JSON.parse(JSON.stringify(sitemap.selectionGroups || [])));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedNode(null);
    try { localStorage.setItem('activeSitemapId', sitemapId); } catch {}

    // Load drawables in background
    if (isSupabaseConfigured() && supabase) {
      loadSitemapWithDrawables(sitemapId)
        .then(({ figures: f, freeLines: fl }) => { setFigures(f); setFreeLines(fl); })
        .catch(err => { console.error('Load drawables on switch:', err); setFigures([]); setFreeLines([]); });
    } else {
      setFigures([]);
      setFreeLines([]);
    }
  }, [sitemaps, activeSitemapId, saveCurrentStateToActiveSitemap, isSupabaseConfigured]);

  const deleteSitemap = useCallback(async (sitemapId: string) => {
    if (!requireAuth()) return;
    
    if (sitemaps.length <= 1) {
      createNewSitemap();
      return;
    }

    // Immediate UI update
    const filtered = sitemaps.filter(s => s.id !== sitemapId);
    setSitemaps(filtered);
    try { localStorage.setItem('sitemaps', JSON.stringify(filtered)); } catch {}

    // If deleting active, switch instantly to first remaining
    if (activeSitemapId === sitemapId && filtered.length > 0) {
      const next = filtered[0];
      setActiveSitemapId(next.id);
      setNodes(JSON.parse(JSON.stringify(next.nodes)));
      setExtraLinks(JSON.parse(JSON.stringify(next.extraLinks)));
      setLinkStyles(JSON.parse(JSON.stringify(next.linkStyles)));
      setColorOverrides(JSON.parse(JSON.stringify(next.colorOverrides)));
      setUrls(JSON.parse(JSON.stringify(next.urls)));
      setSelectionGroups(JSON.parse(JSON.stringify(next.selectionGroups || [])));
      setFigures([]);
      setFreeLines([]);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedNode(null);
      try { localStorage.setItem('activeSitemapId', next.id); } catch {}

      if (isSupabaseConfigured() && supabase) {
        loadSitemapWithDrawables(next.id)
          .then(({ figures: loadedFigures, freeLines: loadedFreeLines }) => {
            setFigures(loadedFigures);
            setFreeLines(loadedFreeLines);
          })
          .catch(err => console.error('Load drawables after delete:', err));
      }
    }

    // Background remote delete
    if (isSupabaseConfigured() && supabase) {
      deleteSitemapFromSupabase(sitemapId).catch(err =>
        console.error('Supabase delete failed (UI already updated):', err)
      );
    }
  }, [sitemaps, activeSitemapId, createNewSitemap, isSupabaseConfigured, requireAuth]);

  const renameSitemap = useCallback(async (sitemapId: string, newName: string) => {
    if (!requireAuth()) return;
    if (!newName.trim()) return; // Still validate non-empty
    
    const updatedSitemap = sitemaps.find(s => s.id === sitemapId);
    if (!updatedSitemap) return;

    const renamed: SitemapData = {
      ...updatedSitemap,
      name: newName,
      lastModified: Date.now()
    };

    setSitemaps(prev => {
      const next = prev.map(s => s.id === sitemapId ? renamed : s);
      try { localStorage.setItem('sitemaps', JSON.stringify(next)); } catch {}
      return next;
    });

    // Save to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        await saveSitemap(renamed, figures, freeLines);
      } catch (error) {
        console.error('Failed to save renamed sitemap to Supabase:', error);
      }
    }
  }, [sitemaps, isSupabaseConfigured, figures, freeLines]);

  // Load sitemaps on mount (from Supabase or localStorage)
  useEffect(() => {
    const loadData = async () => {
      // Show local immediately to avoid blank UI on refresh
      try {
        const localStrEarly = localStorage.getItem('sitemaps');
        const localActiveEarly = localStorage.getItem('activeSitemapId');
        if (localStrEarly) {
          const localList = JSON.parse(localStrEarly) as SitemapData[];
          setSitemaps(localList);
          if (localActiveEarly) setActiveSitemapId(localActiveEarly);
        }
      } catch {}

      if (isSupabaseConfigured()) {
        try {
          const loadedSitemaps = await loadSitemaps();
          const savedActiveId = localStorage.getItem('activeSitemapId');

          // Merge local sitemaps not present on server (e.g., created before login)
          let merged = loadedSitemaps;
          try {
            const localStr = localStorage.getItem('sitemaps');
            if (localStr) {
              const localList = JSON.parse(localStr) as SitemapData[];
              const remoteIds = new Set(loadedSitemaps.map(s => s.id));
              const toMerge = localList.filter(s => !remoteIds.has(s.id));
              if (toMerge.length) merged = [...toMerge, ...loadedSitemaps];
            }
          } catch (e) {
            console.warn('Failed to read local sitemaps for merge:', e);
          }

          if (merged.length > 0) {
            setSitemaps(merged);

            // Use saved active ID if it exists in merged sitemaps, otherwise first
            const activeId = savedActiveId && merged.find(s => s.id === savedActiveId)
              ? savedActiveId
              : merged[0].id;

            const activeSitemap = merged.find(s => s.id === activeId) || merged[0];

            // Load the active sitemap's drawables
            const { figures: loadedFigures, freeLines: loadedFreeLines } = await loadSitemapWithDrawables(activeId);
            setFigures(loadedFigures);
            setFreeLines(loadedFreeLines);
            setActiveSitemapId(activeId);
            setNodes(JSON.parse(JSON.stringify(activeSitemap.nodes)));
            setExtraLinks(JSON.parse(JSON.stringify(activeSitemap.extraLinks)));
            setLinkStyles(JSON.parse(JSON.stringify(activeSitemap.linkStyles)));
            setColorOverrides(JSON.parse(JSON.stringify(activeSitemap.colorOverrides)));
            setUrls(JSON.parse(JSON.stringify(activeSitemap.urls)));
            setSelectionGroups(JSON.parse(JSON.stringify(activeSitemap.selectionGroups || [])));
          } else {
            // No sitemaps in Supabase, initialize with empty one
            const initialSitemap: SitemapData = {
              id: `sitemap-${Date.now()}`,
              name: 'Untitled Sitemap 1',
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
        } catch (error) {
          console.error('Failed to load from Supabase, falling back to localStorage:', error);
          // Fallback to localStorage
          const savedSitemaps = localStorage.getItem('sitemaps');
          const savedActiveId = localStorage.getItem('activeSitemapId');
          
          if (savedSitemaps) {
            const parsedSitemaps = JSON.parse(savedSitemaps) as SitemapData[];
            setSitemaps(parsedSitemaps);
            if (savedActiveId) {
              setActiveSitemapId(savedActiveId);
            }
          } else {
            const initialSitemap: SitemapData = {
              id: `sitemap-${Date.now()}`,
              name: 'Untitled Sitemap 1',
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
        }
      } else {
        // Use localStorage fallback
        const savedSitemaps = localStorage.getItem('sitemaps');
        const savedActiveId = localStorage.getItem('activeSitemapId');
        
        if (savedSitemaps) {
          const parsedSitemaps = JSON.parse(savedSitemaps) as SitemapData[];
          setSitemaps(parsedSitemaps);
          if (savedActiveId) {
            setActiveSitemapId(savedActiveId);
          }
        } else {
          const initialSitemap: SitemapData = {
            id: `sitemap-${Date.now()}`,
            name: 'Untitled Sitemap 1',
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
      }
      setInitialized(true);
    };

    loadData();
  }, [isSupabaseConfigured]);

  // Sync nodes from sitemap when activeSitemapId changes (but only if nodes are empty to avoid overwriting CSV upload)
  useEffect(() => {
    if (!initialized || !activeSitemapId || isUploadingCsvRef.current) {
      return;
    }
    
    const activeSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!activeSitemap) {
      return;
    }
    
    // Only sync if nodes are currently empty (to avoid overwriting during CSV upload or manual edits)
    if (nodes.length === 0 && activeSitemap.nodes.length > 0) {
      setNodes(JSON.parse(JSON.stringify(activeSitemap.nodes)));
      setExtraLinks(JSON.parse(JSON.stringify(activeSitemap.extraLinks)));
      setLinkStyles(JSON.parse(JSON.stringify(activeSitemap.linkStyles)));
      setColorOverrides(JSON.parse(JSON.stringify(activeSitemap.colorOverrides)));
      setUrls(JSON.parse(JSON.stringify(activeSitemap.urls)));
      setSelectionGroups(JSON.parse(JSON.stringify(activeSitemap.selectionGroups || [])));
    }
  }, [activeSitemapId, sitemaps, initialized]);

  // Save to localStorage as backup whenever sitemaps or activeId changes
  useEffect(() => {
    if (initialized && sitemaps.length > 0) {
      // Always save to localStorage as backup
      localStorage.setItem('sitemaps', JSON.stringify(sitemaps));
      if (activeSitemapId) {
        localStorage.setItem('activeSitemapId', activeSitemapId);
      }
    }
  }, [sitemaps, activeSitemapId, initialized]);

  // Auto-save current state to active sitemap periodically and on changes
  useEffect(() => {
    if (!initialized || !activeSitemapId) return;
    // Skip auto-save during CSV upload to prevent overwriting nodes
    if (isUploadingCsvRef.current) {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      saveCurrentStateToActiveSitemap();
    }, 1000); // Debounce auto-save

    return () => clearTimeout(timeoutId);
  }, [nodes, extraLinks, linkStyles, colorOverrides, urls, figures, freeLines, initialized, activeSitemapId, saveCurrentStateToActiveSitemap]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search - support both Ctrl (Windows/Linux) and Cmd (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
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
          setFigures(prev.figures);
          setFreeLines(prev.freeLines);
          setSelectionGroups(prev.selectionGroups);
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
          setFigures(next.figures);
          setFreeLines(next.freeLines);
          setSelectionGroups(next.selectionGroups);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, extraLinks, linkStyles, colorOverrides, undoStack, redoStack, makeSnapshot]);

  useEffect(() => {
    // Skip URL analysis if we're in the middle of a CSV upload
    if (isUploadingCsvRef.current) {
      return;
    }
    
    // Only analyze URLs if we don't already have nodes (e.g., from CSV upload)
    // This prevents overwriting nodes that were set from CSV or other sources
    if (urls.length > 0 && nodes.length === 0) {
      const hierarchy = analyzeURLStructure(urls);
      let layoutNodes: PageNode[];

      // Only apply layout if nodes don't have manual positions
      const hasManualPositions = hierarchy.nodes.some(node => node.x !== undefined && node.y !== undefined);
      
      if (!hasManualPositions) {
        // Apply grouped layout algorithm
        layoutNodes = applyGroupedFlowLayout(hierarchy.nodes, { width: 1800, height: 900 });
        setNodes(layoutNodes);
        setSidebarCollapsed(true);
      } else {
        setNodes(hierarchy.nodes);
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

    if (!requireAuth()) {
      e.target.value = '';
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvErrors(['Please select a CSV file']);
      setShowCsvErrors(true);
      return;
    }

    // Set flag to prevent URL analysis useEffect from interfering
    isUploadingCsvRef.current = true;

    try {
      const result = await parseCsvFile(file);
      
      if (result.errors.length > 0) {
        setCsvErrors(result.errors);
        setShowCsvErrors(true);
        isUploadingCsvRef.current = false;
        return;
      }

      if (result.data.length === 0) {
        setCsvErrors(['No valid data found in CSV file']);
        setShowCsvErrors(true);
        isUploadingCsvRef.current = false;
        return;
      }

      // Convert CSV data to nodes
      const hierarchy = createNodesFromCsvData(result.data);
      const layoutNodes = applyGroupedFlowLayout(hierarchy.nodes, {
        width: 1800,
        height: 900,
      });

      // Check if we should use the active sitemap (if it's empty) or create a new one
      const activeSitemap = activeSitemapId ? sitemaps.find(s => s.id === activeSitemapId) : null;
      const isActiveSitemapEmpty = activeSitemap && 
        activeSitemap.nodes.length === 0 && 
        activeSitemap.urls.length === 0 &&
        activeSitemap.extraLinks.length === 0;

      let targetSitemapId: string;
      let next: SitemapData[];
      const now = Date.now();

      if (isActiveSitemapEmpty && activeSitemap) {
        // Use the existing empty sitemap
        targetSitemapId = activeSitemapId!;
        
        // Update the existing sitemap
        next = sitemaps.map(s => 
          s.id === targetSitemapId
            ? {
                ...s,
                nodes: JSON.parse(JSON.stringify(layoutNodes)),
                urls: JSON.parse(JSON.stringify(result.data.map(row => row.url))),
                extraLinks: [],
                linkStyles: {},
                colorOverrides: {},
                lastModified: now
              }
            : s
        );
      } else {
        // Create a new sitemap with the CSV data
        const newSitemapId = `sitemap-${Date.now()}`;
        targetSitemapId = newSitemapId;

        // Save current sitemap if it exists (non-blocking)
        if (activeSitemapId) {
          // Don't await - run in background to avoid blocking CSV upload
          saveCurrentStateToActiveSitemap()
            .catch(error => {
              console.error('Failed to save current sitemap before CSV upload:', error);
              // Continue anyway - don't block CSV upload
            });
        }

        // Find the highest number used in "Untitled Sitemap" names
        const untitledPattern = /^Untitled Sitemap (\d+)$/;
        let maxNumber = 0;
        
        sitemaps.forEach(sitemap => {
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

        next = [...sitemaps, newSitemap];
      }
      
      // Persist immediately to survive refresh
      try {
        localStorage.setItem('sitemaps', JSON.stringify(next));
        localStorage.setItem('activeSitemapId', targetSitemapId);
      } catch (e) {
        console.error(`Failed to save to localStorage:`, e);
      }

      // Save to Supabase in background (do not block)
      if (isSupabaseConfigured() && supabase) {
        const sitemapToSave = next.find(s => s.id === targetSitemapId);
        if (sitemapToSave) {
          saveSitemap(sitemapToSave, [], []).catch(error => {
            console.error('Failed to save sitemap to Supabase:', error);
          });
        }
      }

      // Ensure all nodes have positive coordinates (fix negative x values from relaxOverlaps)
      const minX = Math.min(...layoutNodes.map(n => n.x ?? 0));
      const fixedNodes = layoutNodes.map(n => {
        if (n.x !== undefined && n.x < 0) {
          const offset = Math.abs(minX) + 100;
          n.x = n.x + offset;
        }
        return n;
      });
      
      // Set nodes FIRST so the canvas renders immediately and blocks URL-analysis overwrite
      const nodesCopy = JSON.parse(JSON.stringify(fixedNodes));
      flushSync(() => {
        setNodes(nodesCopy);
      });
      
      // Now update sitemaps and activate the target one
      flushSync(() => {
        setSitemaps(next);
        setActiveSitemapId(targetSitemapId);
      });
      // Set URLs after nodes to avoid triggering the URL analysis useEffect that would overwrite nodes
      // Use setTimeout to ensure nodes are set first
      setTimeout(() => {
        setUrls(result.data.map(row => row.url));
      }, 0);
      setExtraLinks([]);
      setLinkStyles({});
      setColorOverrides({});
      setFigures([]);
      setFreeLines([]);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedNode(null);
      setSelectionGroups([]);
      setSidebarCollapsed(true);
      setCsvErrors([]);
      setShowCsvErrors(false);
      
      // Reset file input
      e.target.value = '';
      
      // Clear the flag after a short delay to allow state updates to complete
      setTimeout(() => {
        isUploadingCsvRef.current = false;
      }, 100);
    } catch (error) {
      setCsvErrors([`Error processing CSV file: ${error}`]);
      setShowCsvErrors(true);
      // Clear flag on error too
      isUploadingCsvRef.current = false;
    }
  };



  const handleNodesUpdate = (updatedNodes: PageNode[]) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setNodes(updatedNodes);
    
    // Sync colorOverrides with node colors - if a node has customColor/textColor, 
    // ensure colorOverrides matches (or clear it if node colors are removed)
    setColorOverrides(prev => {
      const next = { ...prev };
      updatedNodes.forEach(node => {
        if (node.customColor || node.textColor) {
          // Update colorOverrides to match node colors
          next[node.id] = {
            customColor: node.customColor,
            textColor: node.textColor,
          };
        } else {
          // Clear colorOverrides if node colors are removed
          delete next[node.id];
        }
      });
      return next;
    });
  };

  const handleNodesPreview = (updatedNodes: PageNode[]) => {
    setNodes(updatedNodes);
  };

  const handleExtraLinkCreate = (sourceId: string, targetId: string) => {
    if (!requireAuth()) return;
    
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
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setExtraLinks(prev => prev.filter(l => !(l.sourceId === sourceId && l.targetId === targetId)));
  };

  const handleNodeEdit = (nodeId: string, updates: Partial<PageNode>) => {
    if (!requireAuth()) return;
    
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
    if (!requireAuth()) return;
    
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
    if (!requireAuth()) return;
    
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
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
    const name = (newGroupName || '').trim();
    if (!name) return;
    handleMoveNodesToGroup(selectedIds, name, { includeSubtree: false, relayout: !!opts?.relayout });
  }

  function handleDeleteGroup(groupName: string) {
    if (!requireAuth()) return;
    // When deleting a group, reassign all nodes in that group to 'general'
    handleMoveNodesToGroup(
      nodes.filter(n => n.category === groupName).map(n => n.id),
      'general',
      { includeSubtree: false, relayout: false }
    );
  }

  function handleRenameGroup(oldName: string, newName: string) {
    if (!requireAuth()) return;
    const name = (newName || '').trim();
    if (!name || name === oldName) return;
    const updated = nodes.map(n => n.category === oldName ? { ...n, category: name } : n);
    handleNodesUpdate(updated);
  }

  // ===== Free-form selection groups (nodes + text figures) =====
  const createSelectionGroup = useCallback((memberNodeIds: string[], memberFigureIds: string[], name?: string) => {
    if (!requireAuth()) return;
    // Add snapshot before making changes
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    
    const id = `sg-${Date.now()}`;
    const group: SelectionGroup = { id, name: name || `Group ${selectionGroups.length + 1}`, memberNodeIds, memberFigureIds };
    setSelectionGroups(prev => [...prev, group]);
  }, [selectionGroups.length, makeSnapshot, requireAuth]);

  const ungroupSelection = useCallback((memberNodeIds: string[], memberFigureIds: string[]) => {
    if (!requireAuth()) return;
    // Add snapshot before making changes
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    
    setSelectionGroups(prev => prev.map(g => ({
      ...g,
      memberNodeIds: g.memberNodeIds.filter(id => !memberNodeIds.includes(id)),
      memberFigureIds: g.memberFigureIds.filter(id => !memberFigureIds.includes(id)),
    })).filter(g => g.memberNodeIds.length > 0 || g.memberFigureIds.length > 0));
  }, [makeSnapshot, requireAuth]);

  const [snapToGuides, setSnapToGuides] = useState<boolean>(() => {
    const v = localStorage.getItem('snapToGuides');
    return v ? v === '1' : true;
  });
  useEffect(() => { localStorage.setItem('snapToGuides', snapToGuides ? '1' : '0'); }, [snapToGuides]);

  const handleAddNode = (parentId: string | null = null) => {
    if (!requireAuth()) return;
    
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
    if (!requireAuth()) return;
    
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
    setSearchResults([]);
    // Don't clear focusedNode here - it should only be cleared when user explicitly clears search
    // setFocusedNode(null); // Clear focused node when clearing search
  }, []);

  const handleClearFocus = useCallback(() => {
    setFocusedNode(null);
  }, []);

  const handleLinkStyleChange = useCallback((linkKey: string, style: LinkStyle) => {
    if (!requireAuth()) return;
    
    setLinkStyles(prev => ({
      ...prev,
      [linkKey]: { ...prev[linkKey], ...style }
    }));
  }, [requireAuth]);

  // Figure handlers
  const handleCreateFigure = useCallback((figure: Figure) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => [...prev, figure]);
  }, [makeSnapshot, requireAuth]);

  const handleUpdateFigure = useCallback((id: string, updates: Partial<Figure>) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, [makeSnapshot, requireAuth]);

  const handleDeleteFigure = useCallback((id: string) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => prev.filter(f => f.id !== id));
  }, [makeSnapshot, requireAuth]);

  // FreeLine handlers
  const handleCreateFreeLine = useCallback((line: FreeLine) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => [...prev, line]);
  }, [makeSnapshot, requireAuth]);

  const handleUpdateFreeLine = useCallback((id: string, updates: Partial<FreeLine>) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, [makeSnapshot, requireAuth]);

  const handleDeleteFreeLine = useCallback((id: string) => {
    if (!requireAuth()) return;
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => prev.filter(l => l.id !== id));
  }, [makeSnapshot, requireAuth]);

  const handleFocusNode = useCallback((node: PageNode) => {
    // Set the focused node for visual highlighting FIRST using flushSync
    flushSync(() => {
      setFocusedNode(node);
    });
    
    // Then center the view on the selected node using ref
    if (sitemapCanvasRef.current && sitemapCanvasRef.current.centerOnNode) {
      sitemapCanvasRef.current.centerOnNode(node);
    }
  }, []);

  const handleExport = async (format: 'png' | 'png-white' | 'csv' | 'xml') => {
    switch (format) {
      case 'png':
        await exportToPNG(
          nodes,
          extraLinks,
          linkStyles,
          1,
          figures.filter((f): f is Figure & { type: 'text' } => f.type === 'text'),
          undefined // transparent background
        );
        break;
      case 'png-white':
        await exportToPNG(
          nodes,
          extraLinks,
          linkStyles,
          1,
          figures.filter((f): f is Figure & { type: 'text' } => f.type === 'text'),
          '#ffffff' // white background
        );
        break;
      case 'csv':
        exportToCSV(nodes);
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
    <>
      <style>{`
        @keyframes moveHorizontal {
          0% {
            transform: translateX(-50%) translateY(-10%);
          }
          50% {
            transform: translateX(50%) translateY(10%);
          }
          100% {
            transform: translateX(-50%) translateY(-10%);
          }
        }
        @keyframes moveInCircle {
          0% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(180deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        @keyframes moveVertical {
          0% {
            transform: translateY(-50%);
          }
          50% {
            transform: translateY(50%);
          }
          100% {
            transform: translateY(-50%);
          }
        }
        .header-gradient-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.6;
          pointer-events: none;
        }
        .header-gradient-blob-1 {
          background: radial-gradient(circle, rgba(255, 165, 0, 0.5), rgba(255, 140, 105, 0.4));
          width: 400px;
          height: 400px;
          animation: moveVertical 25s ease infinite;
        }
        .header-gradient-blob-2 {
          background: radial-gradient(circle, rgba(135, 206, 250, 0.5), rgba(74, 144, 226, 0.4));
          width: 350px;
          height: 350px;
          animation: moveInCircle 18s reverse infinite;
        }
        .header-gradient-blob-3 {
          background: radial-gradient(circle, rgba(255, 192, 203, 0.4), rgba(255, 182, 193, 0.3));
          width: 300px;
          height: 300px;
          animation: moveInCircle 35s linear infinite;
        }
        .header-gradient-background {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 248, 240, 0.95), rgba(240, 248, 255, 0.95));
        }
      `}</style>
      <div className="h-screen bg-white flex flex-col overflow-hidden">
        {/* Auth Modal will auto-open on first load if Supabase is configured and no session */}
        <header className="border-b border-gray-200 flex-shrink-0 relative z-50 overflow-hidden" style={{ backgroundColor: '#FFF8F0' }}>
          {/* Base warm light background */}
          <div className="header-gradient-background"></div>
          
          {/* Multiple moving gradient blobs */}
          <div className="header-gradient-blob header-gradient-blob-1" style={{ top: '-20%', left: '5%' }}></div>
          <div className="header-gradient-blob header-gradient-blob-2" style={{ top: '-15%', right: '10%' }}></div>
          <div className="header-gradient-blob header-gradient-blob-3" style={{ top: '-10%', left: '50%', transform: 'translateX(-50%)' }}></div>
          
          {/* Soft warm overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-50/20 to-blue-50/20"></div>
          
          {/* Header content - overflow-visible to allow dropdowns */}
          <div className="max-w-screen-5xl mx-auto px-6 py-5 relative z-10 overflow-visible">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 relative">
              <img width="28" height="28" src="https://img.icons8.com/?size=100&id=1rQZ4drGQD6F&format=png&color=000000" alt="Sitemap Generator"/>
              <h1 className="text-2xl font-semibold tracking-tight">Sitemap Generator</h1>
            </div>
            <div className="flex items-center gap-3">
              {nodes.length > 0 && (
                <button
                  onClick={() => setShowSearch(true)}
                  className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
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
                    className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                    title="Export"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Export
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 shadow-lg z-50" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setShowExportMenu(false); handleExport('png-white'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <Image className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        PNG
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExport('png'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        PNG (Transparent)
                      </button>
                      {/* <button onClick={() => { setShowExportMenu(false); handleExport('xml'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">XML (Sitemap)</button> */}
                      <button onClick={() => { setShowExportMenu(false); handleExport('csv'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        CSV
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Align Guides toggle removed per request */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" className="text-gray-700" viewBox="0 0 16 16">
                  <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a2 2 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139q.323-.119.684-.12h5.396z"/>
                </svg>
                Groups
              </button>
              {/* AI organize button removed per request */}
              <button
                onClick={() => setShowHelp(true)}
                className="px-3 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                title="Help"
              >
                <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
                Help
              </button>
              
              {/* Auth Section */}
              {isSupabaseConfigured() && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                  {user ? (
                    <div 
                      className="relative"
                      onMouseEnter={() => {
                        if (authButtonRef.current) {
                          const rect = authButtonRef.current.getBoundingClientRect();
                          setAuthDropdownPosition({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right
                          });
                        }
                        setShowAuthDropdown(true);
                      }}
                      onMouseLeave={() => setShowAuthDropdown(false)}
                    >
                      <button
                        ref={authButtonRef}
                        className="p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="User account"
                      >
                        <User className="w-5 h-5" strokeWidth={1.5} />
                      </button>
                      
                      {showAuthDropdown && authDropdownPosition && createPortal(
                        <div 
                          className="fixed w-56 bg-white border border-gray-200 shadow-lg rounded-lg z-[100]"
                          style={{
                            top: `${authDropdownPosition.top}px`,
                            right: `${authDropdownPosition.right}px`
                          }}
                          onMouseEnter={() => setShowAuthDropdown(true)}
                          onMouseLeave={() => setShowAuthDropdown(false)}
                        >
                          <div className="px-4 py-3 border-b border-gray-200">
                            <p className="text-sm font-medium text-gray-900">Signed in as</p>
                            <p className="text-sm text-gray-600 truncate mt-1">{user.email}</p>
                          </div>
                          <div className="py-1">
                            <button
                              onClick={handleSignOut}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                              <LogOut className="w-4 h-4" strokeWidth={1.5} />
                              Sign Out
                            </button>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 text-gray-700 transition-colors flex items-center gap-2"
                      title="Sign In / Sign Up"
                    >
                      <LogIn className="w-4 h-4" strokeWidth={1.5} />
                      Sign In
                    </button>
                  )}
                </div>
              )}
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
              <p className="text-xs text-gray-500 mb-2">
                CSV should have columns: Page Title, Page URL, Group/Category. 
              </p>
              <p className="text-xs text-gray-500 mb-2">Optional: Content Type, Last Updated (DD-MM-YYYY).</p>

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
                type="button"
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
                  Upload a CSV file to generate a sitemap with hierarchy detection
                  and professional export formats.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative h-full">
              <SitemapCanvas
                ref={sitemapCanvasRef}
                nodes={nodes}
                selectionGroups={selectionGroups}
                onCreateSelectionGroup={(nodeIds, figureIds, name) => createSelectionGroup(nodeIds, figureIds, name)}
                onUngroupSelection={(nodeIds, figureIds) => ungroupSelection(nodeIds, figureIds)}
                snapToGuides={snapToGuides}
                layoutType={layoutType}
                extraLinks={extraLinks}
                onNodeClick={node => {
                  setSelectedNode(node);
                  // Only clear focus if it's a different node
                  if (focusedNode && focusedNode.id !== node.id) {
                    setFocusedNode(null);
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
                    setFigures(prev.figures);
                    setFreeLines(prev.freeLines);
                    setSelectionGroups(prev.selectionGroups);
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
                    setFigures(next.figures);
                    setFreeLines(next.freeLines);
                    setSelectionGroups(next.selectionGroups);
                  }
                }}
                searchResults={searchResults}
                focusedNode={focusedNode}
                onClearFocus={handleClearFocus}
                colorOverrides={colorOverrides}
                linkStyles={linkStyles}
                onLinkStyleChange={handleLinkStyleChange}
                figures={figures}
                freeLines={freeLines}
                onCreateFigure={handleCreateFigure}
                onUpdateFigure={handleUpdateFigure}
                onDeleteFigure={handleDeleteFigure}
                onCreateFreeLine={handleCreateFreeLine}
                onUpdateFreeLine={handleUpdateFreeLine}
                onDeleteFreeLine={handleDeleteFreeLine}
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
          <div className="bg-white rounded-lg shadow-lg w-1/3 max-w-2xl max-h-[85vh] overflow-visible flex flex-col" onClick={(e) => e.stopPropagation()}>
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
            <div className="overflow-y-auto overflow-x-visible flex-1 p-6">
              <div className="space-y-6">
                {/* Essential Shortcuts */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Essential</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="V" label="Select mode" />
                    <ShortcutItem keys="A" label="Add child node" info="Requires a node to be selected first" />
                    <ShortcutItem keys="C" label="Change color" info="Requires a node to be selected first" />
                    <ShortcutItem keys="L" label="Connection line" info="Drag from node to node" />
                  </div>
                </div>

                {/* Selection */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Selection</h3>
                  <div className="space-y-2">
                    <ShortcutItem
                      keys="Shift + Drag (background)"
                      label="Multi-select"
                    />
                  </div>
                </div>

                {/* Navigation */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Navigation</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="Ctrl/Cmd + Drag" label="Move connected nodes" info="Drag selected node with its parent and children" />
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
                  <p className="text-xs text-gray-500 mb-3">Source: CSV "Group/Category" column. Otherwise inferred from URL path.</p>
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

      {/* Auth Modal */}
      {isSupabaseConfigured() && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
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
    </>
  );
}

export default App;
