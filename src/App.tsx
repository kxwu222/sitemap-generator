import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { Download, Trash2, ChevronDown, Menu, X, Search, HelpCircle, Edit2, LogIn, LogOut, User, Image, FileText, Layers, Share2, MessageSquare, Link, Lock, Copy } from 'lucide-react';
import { SitemapCanvas } from './components/SitemapCanvas';
import { SearchOverlay } from './components/SearchOverlay';
import { AuthModal } from './components/AuthModal';
import { CommentsPanel } from './components/CommentsPanel';
import { analyzeURLStructure, PageNode, groupByCategory, createNodesFromCsvData } from './utils/urlAnalyzer';
import { applyGroupedFlowLayout } from './utils/forceLayout';
import { exportToPNG, exportToCSV, exportToXMLSitemap } from './utils/exportUtils';
import { parseCsvFile } from './utils/csvParser';
import { SitemapData, SelectionGroup } from './types/sitemap';
import { LinkStyle } from './types/linkStyle';
import { Figure, FreeLine } from './types/drawables';
import { Comment, ShareMode, SharePermission } from './types/comments';
import { saveSitemap, loadSitemaps, deleteSitemap as deleteSitemapFromSupabase, loadSitemapWithDrawables } from './services/sitemapService';
import { getCurrentUser, signOut, getSession } from './services/authService';
import { generateShareToken, getSitemapByShareToken, revokeShareToken, getShareToken, getShareTokenWithPermission, updateSharePermission, sendInvite } from './services/sharingService';
import { createComment, getComments, updateComment, updateCommentPosition, resolveComment, deleteComment, subscribeToComments } from './services/commentsService';
import { supabase } from './lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  comments: Comment[];
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
  const authDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const [exportDropdownPosition, setExportDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [showXmlExportWarning, setShowXmlExportWarning] = useState(false);
  const permissionManuallyUpdatedRef = useRef(false);
  const shareModalPermissionLoadedRef = useRef<string | null>(null); // Track which sitemap's permission was loaded
  
  // Sharing and comments state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<ShareMode>('owner');
  const [sharePermission, setSharePermission] = useState<SharePermission>('view'); // Permission for current share link
  const [sharedSitemapName, setSharedSitemapName] = useState<string | null>(null); // Store original name of shared sitemap
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviteEmailError, setInviteEmailError] = useState('');
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState('');
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [isViewerMode, setIsViewerMode] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentChannel, setCommentChannel] = useState<RealtimeChannel | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [sidebarTab, setSidebarTab] = useState<'sitemap' | 'comments'>('sitemap');
  const [sitemapViewTab, setSitemapViewTab] = useState<'my' | 'shared'>('my');

  const makeSnapshot = useCallback((): HistorySnapshot => ({
    nodes: JSON.parse(JSON.stringify(nodes)),
    extraLinks: JSON.parse(JSON.stringify(extraLinks)),
    linkStyles: JSON.parse(JSON.stringify(linkStyles)),
    colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
    figures: JSON.parse(JSON.stringify(figures)),
    freeLines: JSON.parse(JSON.stringify(freeLines)),
    selectionGroups: JSON.parse(JSON.stringify(selectionGroups)),
    comments: JSON.parse(JSON.stringify(comments)),
  }), [nodes, extraLinks, linkStyles, colorOverrides, figures, freeLines, selectionGroups, comments]);

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

  // Check if running on localhost
  const isLocalhost = useCallback(() => {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' || 
           window.location.hostname === '';
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

  // Check if a sitemap is editable
  const isSitemapEditable = useCallback((sitemap: SitemapData | null): boolean => {
    if (!sitemap) return false;
    // If sitemap is shared with view-only permission, it's not editable
    if (sitemap.isShared === true && sitemap.sharePermission === 'view') {
      return false;
    }
    // Otherwise, it's editable (owned sitemaps or shared with edit permission)
    return true;
  }, []);

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
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        
        if (newUser) {
          // User signed in - close modal and refresh sitemaps
          setShowAuthModal(false);
          await refreshSitemapsFromSupabase();
        } else if (event === 'SIGNED_OUT' || (!newUser && event === 'TOKEN_REFRESHED')) {
          // User signed out - ensure auth modal is shown
          // handleSignOut already shows it, but this ensures it stays visible
          setTimeout(() => {
            setShowAuthModal(true);
          }, 100);
        }
      });

      return () => {
        subscription.unsubscribe();
        // Cleanup dropdown timeout on unmount
        if (authDropdownTimeoutRef.current) {
          clearTimeout(authDropdownTimeoutRef.current);
        }
      };
    }
  }, [isSupabaseConfigured]);

  // Handle share link URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareTokenParam = urlParams.get('share');
    
    if (shareTokenParam) {
      // Load sitemap via share token
      getSitemapByShareToken(shareTokenParam)
        .then(async (result) => {
          if (result) {
            const { sitemap, permission } = result;
            
            // Check if user is authenticated (required for comments)
            if (!user && isSupabaseConfigured()) {
              setShowAuthModal(true);
              return;
            }
            
            // Check if current user is the owner
            const currentUser = await getCurrentUser();
            const isOwner = currentUser && sitemaps.find(s => s.id === sitemap.id)?.id === sitemap.id && 
              sitemaps.find(s => s.id === sitemap.id && s.id === sitemap.id);
            // For shared links, we'll check ownership by comparing user_id from database
            // For now, assume viewer mode unless we can verify ownership
            const mode: ShareMode = isOwner ? 'owner' : 'viewer';
            
            setShareToken(shareTokenParam);
            setShareMode(mode);
            setSharePermission(permission); // Store the permission
            // Viewer mode should reflect whether the user is accessing via a shared link (not ownership)
            setIsViewerMode(mode === 'viewer');
            setSharedSitemapName(sitemap.name); // Store the original name
            
            // Load the shared sitemap
            setActiveSitemapId(sitemap.id);
            setNodes(JSON.parse(JSON.stringify(sitemap.nodes)));
            setExtraLinks(JSON.parse(JSON.stringify(sitemap.extraLinks)));
            setLinkStyles(JSON.parse(JSON.stringify(sitemap.linkStyles)));
            setColorOverrides(JSON.parse(JSON.stringify(sitemap.colorOverrides)));
            setUrls(JSON.parse(JSON.stringify(sitemap.urls)));
            setSelectionGroups(JSON.parse(JSON.stringify(sitemap.selectionGroups || [])));
            
            // Load drawables
            if (isSupabaseConfigured() && supabase) {
              try {
                const { figures: f, freeLines: fl } = await loadSitemapWithDrawables(sitemap.id);
                setFigures(f);
                setFreeLines(fl);
              } catch (err) {
                console.error('Failed to load drawables:', err);
              }
            }
            
            // Load comments
            try {
              const loadedComments = await getComments(sitemap.id);
              setComments(loadedComments);
            } catch (err) {
              console.error('Failed to load comments:', err);
            }
          }
        })
        .catch(err => {
          console.error('Failed to load shared sitemap:', err);
          alert('Invalid or expired share link.');
        });
    } else {
      // Not viewing via share link - reset viewer mode
      setIsViewerMode(false);
      setShareMode('owner');
      setSharedSitemapName(null);
    }
  }, [user, isSupabaseConfigured, sitemaps]);

  // Load comments when active sitemap changes
  useEffect(() => {
    if (!activeSitemapId) return;
    
    // Load from localStorage if on localhost without Supabase
    const isLocal = isLocalhost();
    if (isLocal && !isSupabaseConfigured()) {
      const storageKey = `comments_${activeSitemapId}`;
      const storedComments = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setComments(storedComments);
      return;
    }
    
    if (!isSupabaseConfigured()) return;
    
    // Cleanup previous subscription
    if (commentChannel) {
      supabase?.removeChannel(commentChannel);
      setCommentChannel(null);
    }
    
    // Load comments
    getComments(activeSitemapId)
      .then(setComments)
      .catch(err => console.error('Failed to load comments:', err));
    
    // Subscribe to real-time updates
    if (supabase) {
      const channel = subscribeToComments(activeSitemapId, (comment, eventType) => {
        if (eventType === 'INSERT') {
          setComments(prev => {
            // Check if comment already exists (from optimistic update)
            if (prev.some(c => c.id === comment.id)) {
              return prev;
            }
            return [comment, ...prev];
          });
        } else if (eventType === 'UPDATE') {
          setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
        } else if (eventType === 'DELETE') {
          setComments(prev => prev.filter(c => c.id !== comment.id));
        }
      });
      
      if (channel) {
        setCommentChannel(channel);
      }
    }
    
    return () => {
      if (commentChannel) {
        supabase?.removeChannel(commentChannel);
      }
    };
  }, [activeSitemapId, isSupabaseConfigured, isLocalhost]);

  // Auto-generate share token when modal opens if it doesn't exist
  useEffect(() => {
    if (showShareModal && activeSitemapId && shareMode !== 'viewer') {
      // Only load permission once per modal session for this sitemap
      // This prevents the useEffect from overwriting manual permission changes
      if (shareModalPermissionLoadedRef.current === activeSitemapId) {
        // Permission already loaded for this sitemap in this modal session, skip
        return;
      }
      
      // Reset the manual update flag when modal opens for a new sitemap
      if (shareModalPermissionLoadedRef.current !== activeSitemapId) {
        permissionManuallyUpdatedRef.current = false;
        shareModalPermissionLoadedRef.current = activeSitemapId;
      }
      
      // Load existing token and permission if available
      getShareTokenWithPermission(activeSitemapId)
        .then(({ token, permission }) => {
          // Check ref again at the time the promise resolves (in case it was set during the async operation)
          if (permissionManuallyUpdatedRef.current) {
            // Permission was manually updated, don't overwrite it
            if (token) {
              setShareToken(token);
            }
            return;
          }
          
          if (token) {
            setShareToken(token);
            setSharePermission(permission);
          } else {
            // Generate new token with default 'view' permission
            generateShareToken(activeSitemapId, 'view')
              .then(newToken => {
                // Check ref again at the time this promise resolves
                if (permissionManuallyUpdatedRef.current) {
                  // Permission was manually updated, don't overwrite it
                  if (newToken) {
                    setShareToken(newToken);
                  }
                  return;
                }
                
                if (newToken) {
                  setShareToken(newToken);
                  setSharePermission('view');
                }
              })
              .catch(error => {
                // Silently handle errors - token generation will work with localStorage fallback
                // Only log if it's an unexpected error
                if (error.message !== 'Failed to generate share token') {
                  console.error('Failed to auto-generate share token:', error);
                }
              });
          }
        })
        .catch(error => {
          console.error('Failed to get share token:', error);
        });
    } else if (!showShareModal) {
      // Reset the loaded ref when modal closes
      shareModalPermissionLoadedRef.current = null;
      permissionManuallyUpdatedRef.current = false;
    }
  }, [showShareModal, activeSitemapId, shareMode]);

  const handleAuthSuccess = async () => {
    // Close modal immediately for better UX
    setShowAuthModal(false);
    
    const currentUser = await getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      // Refresh sitemaps in background (don't block UI)
      refreshSitemapsFromSupabase().catch(err => {
        console.error('Failed to refresh sitemaps after login:', err);
      });
    }
  };

  const handleSignOut = async () => {
    // Close dropdown first
    setShowAuthDropdown(false);
    
    // Set user to null and show modal immediately for better UX
    setUser(null);
    setShowAuthModal(true);
    
    try {
      // Call signOut to trigger auth state change event
      const { error } = await signOut();
      if (error) {
        console.error('signOut() failed:', error);
      }
    } catch (e) {
      console.error('signOut() failed:', e);
    }
    
    // Clear Supabase tokens after signOut
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
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleAddEmail = (email: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    // Validate email
    if (!validateEmail(trimmedEmail)) {
      setInviteEmailError('Please enter a valid email address');
      return;
    }

    // Check for duplicates
    if (inviteEmails.includes(trimmedEmail)) {
      setInviteEmailError('This email is already added');
      return;
    }

    // Add email to list
    setInviteEmails(prev => [...prev, trimmedEmail]);
    setInviteEmailInput('');
    setInviteEmailError('');
    setInviteSuccessMessage('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setInviteEmails(prev => prev.filter(email => email !== emailToRemove));
  };

  const handleSendInvite = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (inviteEmails.length === 0 || !activeSitemapId) return;
    
    // Clear any previous error and success message
    setInviteEmailError('');
    setInviteSuccessMessage('');
    
    try {
      // Send invites to all emails
      for (const email of inviteEmails) {
        await sendInvite(activeSitemapId, email);
      }
      // Show success message and keep email pills
      setInviteSuccessMessage('Invite sent!');
      setInviteEmailInput('');
      // Auto-hide success message after 3 seconds
      setTimeout(() => setInviteSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to send invite:', error);
      setInviteEmailError('Failed to send invites. Please try again.');
    }
  };

  const handleExitViewerMode = async () => {
    // If we're viewing a shared sitemap (either in viewer or edit mode), save it to the viewer's storage
    if (shareToken && activeSitemapId) {
      // Check if this sitemap is already in the viewer's sitemaps
      const existingSitemap = sitemaps.find(s => s.id === activeSitemapId);
      
      if (!existingSitemap) {
        // Create a new sitemap with a new ID but keep the original name
        const newSitemapId = `sitemap-${Date.now()}`;
        const now = Date.now();
        
        // Get the original name from the shared sitemap
        // Use the stored name if available, otherwise try to infer from nodes
        let finalName = sharedSitemapName || 'Shared Sitemap';
        
        // If we don't have the stored name, try to infer from nodes
        if (!sharedSitemapName && nodes.length > 0) {
          // Try to get name from the first node's URL or title
          const firstNode = nodes[0];
          if (firstNode.url) {
            try {
              const urlObj = new URL(firstNode.url);
              const domain = urlObj.hostname.replace('www.', '');
              finalName = `${domain} Sitemap`;
            } catch {
              finalName = 'Shared Sitemap';
            }
          } else if (firstNode.title) {
            finalName = `${firstNode.title} Sitemap`;
          }
        }
        
        // Check for name conflicts and append number if needed
        const nameExists = sitemaps.some(s => s.name === finalName);
        if (nameExists) {
          let counter = 1;
          while (sitemaps.some(s => s.name === `${finalName} ${counter}`)) {
            counter++;
          }
          finalName = `${finalName} ${counter}`;
        }
        
        const savedSitemap: SitemapData = {
          id: newSitemapId,
          name: finalName,
          nodes: JSON.parse(JSON.stringify(nodes)),
          extraLinks: JSON.parse(JSON.stringify(extraLinks)),
          linkStyles: JSON.parse(JSON.stringify(linkStyles)),
          colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
          urls: JSON.parse(JSON.stringify(urls)),
          selectionGroups: JSON.parse(JSON.stringify(selectionGroups)),
          lastModified: now,
          createdAt: now,
          isShared: true, // Mark as shared
          sharePermission: sharePermission, // Store the permission level
          originalSitemapId: activeSitemapId // Track original sitemap
        };
        
        // Add to sitemaps array
        setSitemaps(prev => {
          const updated = [...prev, savedSitemap];
          // Save to localStorage immediately
          try {
            localStorage.setItem('sitemaps', JSON.stringify(updated));
            localStorage.setItem('activeSitemapId', newSitemapId);
          } catch (e) {
            console.warn('Failed to save to localStorage:', e);
          }
          return updated;
        });
        
        // Save to Supabase if configured
        if (isSupabaseConfigured() && supabase) {
          try {
            await saveSitemap(savedSitemap, figures, freeLines);
          } catch (error) {
            console.error('Failed to save shared sitemap to Supabase:', error);
            // Already saved to localStorage above, so continue
          }
        }
        
        // Set as active sitemap
        setActiveSitemapId(newSitemapId);
      } else {
        // Sitemap already exists in viewer's list, just switch to it
        // But we should still save any changes made while viewing
        await saveCurrentStateToActiveSitemap();
      }
    }
    
    // Clear URL parameter
    window.history.replaceState({}, '', window.location.pathname);
    
    // Reset viewer mode state
    setIsViewerMode(false);
    setShareMode('owner');
    setShareToken(null);
    setSharePermission('view');
    setSharedSitemapName(null);
    
    // The existing useEffect at line 384-389 will handle resetting when share param is removed
  };

  // Sitemap management functions
  const saveCurrentStateToActiveSitemap = useCallback(async () => {
    if (!activeSitemapId) return;
    
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    // Prevent saving view-only shared sitemaps
    if (!isSitemapEditable(currentSitemap || null)) {
      return;
    }
    
    const updatedSitemap: SitemapData = {
      id: activeSitemapId,
      name: currentSitemap?.name || 'Untitled Sitemap',
      nodes: JSON.parse(JSON.stringify(nodes)),
      extraLinks: JSON.parse(JSON.stringify(extraLinks)),
      linkStyles: JSON.parse(JSON.stringify(linkStyles)),
      colorOverrides: JSON.parse(JSON.stringify(colorOverrides)),
      urls: JSON.parse(JSON.stringify(urls)),
      selectionGroups: JSON.parse(JSON.stringify(selectionGroups)),
      lastModified: Date.now(),
      createdAt: currentSitemap?.createdAt || Date.now(),
      // Preserve shared metadata if present
      isShared: currentSitemap?.isShared,
      sharePermission: currentSitemap?.sharePermission,
      originalSitemapId: currentSitemap?.originalSitemapId,
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
  }, [activeSitemapId, nodes, extraLinks, linkStyles, colorOverrides, urls, figures, freeLines, selectionGroups, sitemaps, isSupabaseConfigured, isSitemapEditable]);

  // Duplicate a sitemap (creates an editable copy)
  const duplicateSitemap = useCallback(async (sitemapId: string) => {
    if (!requireAuth()) return;
    
    const sitemapToDuplicate = sitemaps.find(s => s.id === sitemapId);
    if (!sitemapToDuplicate) return;
    
    const newSitemapId = `sitemap-${Date.now()}`;
    const now = Date.now();
    
    // Create duplicate with same data but new ID and remove shared metadata
    const duplicated: SitemapData = {
      id: newSitemapId,
      name: `${sitemapToDuplicate.name} (Copy)`,
      nodes: JSON.parse(JSON.stringify(sitemapToDuplicate.nodes)),
      extraLinks: JSON.parse(JSON.stringify(sitemapToDuplicate.extraLinks)),
      linkStyles: JSON.parse(JSON.stringify(sitemapToDuplicate.linkStyles)),
      colorOverrides: JSON.parse(JSON.stringify(sitemapToDuplicate.colorOverrides)),
      urls: JSON.parse(JSON.stringify(sitemapToDuplicate.urls)),
      selectionGroups: JSON.parse(JSON.stringify(sitemapToDuplicate.selectionGroups || [])),
      lastModified: now,
      createdAt: now,
      // Remove shared metadata - this becomes an owned sitemap
      // isShared, sharePermission, originalSitemapId are not set (undefined)
    };
    
    // Add to sitemaps array
    setSitemaps(prev => {
      const updated = [...prev, duplicated];
      // Save to localStorage immediately
      try {
        localStorage.setItem('sitemaps', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
      return updated;
    });
    
    // Save to Supabase if configured
    if (isSupabaseConfigured() && supabase) {
      try {
        // Load drawables from original sitemap if available
        let figuresToSave: Figure[] = [];
        let freeLinesToSave: FreeLine[] = [];
        try {
          const { figures: f, freeLines: fl } = await loadSitemapWithDrawables(sitemapId);
          figuresToSave = f;
          freeLinesToSave = fl;
        } catch (err) {
          // Ignore errors - drawables are optional
        }
        await saveSitemap(duplicated, figuresToSave, freeLinesToSave);
      } catch (error) {
        console.error('Failed to save duplicated sitemap to Supabase:', error);
        // Already saved to localStorage above, so continue
      }
    }
    
    // Switch to the duplicated sitemap
    setActiveSitemapId(newSitemapId);
    setNodes(JSON.parse(JSON.stringify(duplicated.nodes)));
    setExtraLinks(JSON.parse(JSON.stringify(duplicated.extraLinks)));
    setLinkStyles(JSON.parse(JSON.stringify(duplicated.linkStyles)));
    setColorOverrides(JSON.parse(JSON.stringify(duplicated.colorOverrides)));
    setUrls(JSON.parse(JSON.stringify(duplicated.urls)));
    setSelectionGroups(JSON.parse(JSON.stringify(duplicated.selectionGroups || [])));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedNode(null);
    
    // Load drawables if available
    if (isSupabaseConfigured() && supabase) {
      try {
        const { figures: f, freeLines: fl } = await loadSitemapWithDrawables(newSitemapId);
        setFigures(f);
        setFreeLines(fl);
      } catch (err) {
        console.error('Failed to load drawables for duplicated sitemap:', err);
        setFigures([]);
        setFreeLines([]);
      }
    } else {
      setFigures([]);
      setFreeLines([]);
    }
    
    try {
      localStorage.setItem('activeSitemapId', newSitemapId);
    } catch (e) {
      console.warn('Failed to save activeSitemapId:', e);
    }
  }, [sitemaps, isSupabaseConfigured, requireAuth]);

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
    
    // Immediate UI update
    const filtered = sitemaps.filter(s => s.id !== sitemapId);
    setSitemaps(filtered);
    try { localStorage.setItem('sitemaps', JSON.stringify(filtered)); } catch {}

    // If deleting active sitemap
    if (activeSitemapId === sitemapId) {
      if (filtered.length > 0) {
        // Switch to first remaining sitemap
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
      } else {
        // No sitemaps remaining - clear all state
        setActiveSitemapId(null);
        setNodes([]);
        setExtraLinks([]);
        setLinkStyles({});
        setColorOverrides({});
        setUrls([]);
        setSelectionGroups([]);
        setFigures([]);
        setFreeLines([]);
        setUndoStack([]);
        setRedoStack([]);
        setSelectedNode(null);
        try { 
          localStorage.setItem('activeSitemapId', '');
          localStorage.removeItem('activeSitemapId');
        } catch {}
      }
    }

    // Background remote delete
    if (isSupabaseConfigured() && supabase) {
      deleteSitemapFromSupabase(sitemapId).catch(err =>
        console.error('Supabase delete failed (UI already updated):', err)
      );
    }
  }, [sitemaps, activeSitemapId, isSupabaseConfigured, requireAuth]);

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
          setComments(prev.comments);
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
          setComments(next.comments);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, extraLinks, linkStyles, colorOverrides, comments, undoStack, redoStack, makeSnapshot]);

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
      if (showExportMenu && 
          !(event.target as Element).closest('.export-menu-container') &&
          !(event.target as Element).closest('[data-export-dropdown]')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);



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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) return;
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    const name = (newGroupName || '').trim();
    if (!name) return;
    handleMoveNodesToGroup(selectedIds, name, { includeSubtree: false, relayout: !!opts?.relayout });
  }

  function handleDeleteGroup(groupName: string) {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    // When deleting a group, reassign all nodes in that group to 'general'
    handleMoveNodesToGroup(
      nodes.filter(n => n.category === groupName).map(n => n.id),
      'general',
      { includeSubtree: false, relayout: false }
    );
  }

  function handleRenameGroup(oldName: string, newName: string) {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    const name = (newName || '').trim();
    if (!name || name === oldName) return;
    const updated = nodes.map(n => n.category === oldName ? { ...n, category: name } : n);
    handleNodesUpdate(updated);
  }

  // ===== Free-form selection groups (nodes + text figures) =====
  const createSelectionGroup = useCallback((memberNodeIds: string[], memberFigureIds: string[], name?: string) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    // Add snapshot before making changes
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    
    const id = `sg-${Date.now()}`;
    const group: SelectionGroup = { id, name: name || `Group ${selectionGroups.length + 1}`, memberNodeIds, memberFigureIds };
    setSelectionGroups(prev => [...prev, group]);
  }, [selectionGroups.length, makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const ungroupSelection = useCallback((memberNodeIds: string[], memberFigureIds: string[]) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    // Add snapshot before making changes
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    
    setSelectionGroups(prev => prev.map(g => ({
      ...g,
      memberNodeIds: g.memberNodeIds.filter(id => !memberNodeIds.includes(id)),
      memberFigureIds: g.memberFigureIds.filter(id => !memberFigureIds.includes(id)),
    })).filter(g => g.memberNodeIds.length > 0 || g.memberFigureIds.length > 0));
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const [snapToGuides, setSnapToGuides] = useState<boolean>(() => {
    const v = localStorage.getItem('snapToGuides');
    return v ? v === '1' : true;
  });
  useEffect(() => { localStorage.setItem('snapToGuides', snapToGuides ? '1' : '0'); }, [snapToGuides]);

  const handleAddNode = (parentId: string | null = null) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
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
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setLinkStyles(prev => ({
      ...prev,
      [linkKey]: { ...prev[linkKey], ...style }
    }));
  }, [requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  // Figure handlers
  const handleCreateFigure = useCallback((figure: Figure) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => [...prev, figure]);
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const handleUpdateFigure = useCallback((id: string, updates: Partial<Figure>) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const handleDeleteFigure = useCallback((id: string) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFigures(prev => prev.filter(f => f.id !== id));
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  // FreeLine handlers
  const handleCreateFreeLine = useCallback((line: FreeLine) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => [...prev, line]);
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const handleUpdateFreeLine = useCallback((id: string, updates: Partial<FreeLine>) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

  const handleDeleteFreeLine = useCallback((id: string) => {
    if (isViewerMode) return; // Disable editing in viewer mode
    if (!requireAuth()) return;
    
    // Check if current sitemap is editable
    const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
    if (!isSitemapEditable(currentSitemap || null)) {
      return; // Prevent editing view-only shared sitemaps
    }
    
    setUndoStack(stack => [...stack, makeSnapshot()]);
    setRedoStack([]);
    setFreeLines(prev => prev.filter(l => l.id !== id));
  }, [makeSnapshot, requireAuth, isViewerMode, sitemaps, activeSitemapId, isSitemapEditable]);

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
    if (format === 'xml') {
      // Check for nodes without URLs
      const nodesWithoutUrls = nodes.filter(node => !node.url || !node.url.trim());
      if (nodesWithoutUrls.length > 0) {
        setShowXmlExportWarning(true);
        return;
      }
    }
    
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
        exportToXMLSitemap(nodes, false);
        break;
    }
  };

  const handleConfirmXmlExport = () => {
    setShowXmlExportWarning(false);
    setShowExportMenu(false);
    exportToXMLSitemap(nodes, false);
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
        .header-gradient-blob-2 {
          background: radial-gradient(circle, rgba(135, 206, 250, 0.5), rgba(74, 144, 226, 0.4));
          width: 350px;
          height: 350px;
          animation: moveHorizontal 8s reverse infinite;
        }
        .header-gradient-blob-3 {
          background: radial-gradient(circle, rgba(255, 192, 203, 0.4), rgba(255, 182, 193, 0.3));
          width: 300px;
          height: 300px;
          animation: moveHorizontal 8s linear infinite;
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
              {nodes.length > 0 && activeSitemapId && (
                <button
                  onClick={async () => {
                    // Load current share token
                    const token = await getShareToken(activeSitemapId);
                    setShareToken(token);
                    setShowShareModal(true);
                  }}
                  className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                  title="Share sitemap"
                >
                  <Share2 className="w-4 h-4" strokeWidth={1.5} />
                  Share
                </button>
              )}
              {nodes.length > 0 && (
                <div className="relative export-menu-container">
                  <button
                    ref={exportButtonRef}
                    onClick={() => {
                      if (exportButtonRef.current) {
                        const rect = exportButtonRef.current.getBoundingClientRect();
                        setExportDropdownPosition({
                          top: rect.bottom + 4,
                          right: window.innerWidth - rect.right
                        });
                      }
                      setShowExportMenu(v => !v);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                    title="Export"
                  >
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Export
                  </button>
                  {showExportMenu && exportDropdownPosition && createPortal(
                    <div 
                      data-export-dropdown
                      className="fixed w-48 bg-white border border-gray-200 shadow-lg z-[100] rounded-lg"
                      style={{
                        top: `${exportDropdownPosition.top}px`,
                        right: `${exportDropdownPosition.right}px`
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => { setShowExportMenu(false); handleExport('png-white'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 rounded-t-lg">
                        <Image className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        PNG
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExport('png'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        PNG (Transparent)
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExport('csv'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 rounded-b-lg">
                        <FileText className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        CSV
                      </button>
                      <button onClick={() => { setShowExportMenu(false); handleExport('xml'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                        XML (Sitemap)
                      </button>
                    </div>,
                    document.body
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
              {!isViewerMode && (
                <button
                  onClick={() => setShowHelp(true)}
                  className="px-3 py-2 text-sm font-medium bg-white border rounded-lg border-gray-300 hover:border-gray-400 transition-colors flex items-center gap-2"
                  title="Help"
                >
                  <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
                  Help
                </button>
              )}
              {isViewerMode && (
                <button
                  onClick={handleExitViewerMode}
                  className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center gap-2 text-white"
                  style={{
                    backgroundColor: '#CB6015',
                    borderColor: '#CB6015',
                  }}
                  title="Exit viewer mode"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                  Exit viewer mode
                </button>
              )}
              
              {/* Auth Section */}
              {(isSupabaseConfigured() || isLocalhost()) && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
                  {user || (isLocalhost() && !isSupabaseConfigured()) ? (
                    <div 
                      className="relative"
                      onMouseEnter={() => {
                        // Clear any pending close timeout
                        if (authDropdownTimeoutRef.current) {
                          clearTimeout(authDropdownTimeoutRef.current);
                          authDropdownTimeoutRef.current = null;
                        }
                        
                        if (authButtonRef.current) {
                          const rect = authButtonRef.current.getBoundingClientRect();
                          setAuthDropdownPosition({
                            top: rect.bottom + 4, // Reduced gap to 4px
                            right: window.innerWidth - rect.right
                          });
                        }
                        setShowAuthDropdown(true);
                      }}
                      onMouseLeave={() => {
                        // Add a small delay before closing to allow mouse to reach dropdown
                        authDropdownTimeoutRef.current = setTimeout(() => {
                          setShowAuthDropdown(false);
                        }, 150);
                      }}
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
                          onMouseEnter={() => {
                            // Clear close timeout when mouse enters dropdown
                            if (authDropdownTimeoutRef.current) {
                              clearTimeout(authDropdownTimeoutRef.current);
                              authDropdownTimeoutRef.current = null;
                            }
                            setShowAuthDropdown(true);
                          }}
                          onMouseLeave={() => {
                            // Close when mouse leaves dropdown
                            setShowAuthDropdown(false);
                          }}
                        >
                          <div className="px-4 py-3 border-b border-gray-200">
                            <p className="text-sm font-medium text-gray-900">Signed in as</p>
                            <p className="text-sm text-gray-600 truncate mt-1">
                              {isLocalhost() && !isSupabaseConfigured() ? 'Local User' : (user?.email || '')}
                            </p>
                          </div>
                          {isSupabaseConfigured() && (
                            <div className="py-1">
                              <button
                                onClick={handleSignOut}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                              >
                                <LogOut className="w-4 h-4" strokeWidth={1.5} />
                                Sign Out
                              </button>
                            </div>
                          )}
                          {isLocalhost() && !isSupabaseConfigured() && (
                            <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                              Local development mode
                            </div>
                          )}
                        </div>,
                        document.body
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (isLocalhost() && !isSupabaseConfigured()) {
                          // On localhost without Supabase, just show a message
                          alert('Authentication is not required in local development mode.');
                          return;
                        }
                        setShowAuthModal(true);
                      }}
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
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64 sm:w-72 lg:w-80'} border-r border-gray-200 flex flex-col overflow-y-auto h-full transition-all duration-300 z-50 relative`} style={{ backgroundColor: '#FFFEFB'}}>
          {/* Collapse/Expand Button */}
          <div className={`${sidebarCollapsed ? 'p-2' : 'p-6'} border-b border-gray-200`}>
            <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-between'} items-center`}>
              {sidebarCollapsed ? null : (
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
                  {sidebarTab === 'sitemap' ? 'Sitemap' : 'Comments'}
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

          {/* Tab Navigation */}
          {!sidebarCollapsed && (
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setSidebarTab('sitemap')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  sidebarTab === 'sitemap'
                    ? 'text-gray-900 border-b-2 border-gray-900 bg-white-100'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white-100'
                }`}
              >
                Sitemap
              </button>
              <button
                onClick={() => setSidebarTab('comments')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  sidebarTab === 'comments'
                    ? 'text-gray-900 border-b-2 border-gray-900 bg-white-100'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white-100'
                }`}
              >
                Comments
                {comments.filter(c => !c.resolved).length > 0 && (
                  <span className="absolute top-2 right-4 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                    {comments.filter(c => !c.resolved).length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* PRIMARY: Upload CSV Section */}
          {!sidebarCollapsed && sidebarTab === 'sitemap' && !isViewerMode && (
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 mb-3">
                Upload
              </h2>
              {/* CSV Upload Button - Primary CTA */}
              <div className="mb-2">
                <label className="flex-1 px-4 py-3 bg-[#CB6015] border border-[#B54407] shadow-md hover:shadow-md hover:bg-[#CC5500] text-white text-sm font-medium rounded-lg cursor-pointer flex items-center justify-center gap-2 transition-colors">
                  <img width="18" height="18" src="https://img.icons8.com/fluency-systems-regular/50/upload--v1.png" alt="upload csv file" style={{filter: 'brightness(0) invert(1)'}}/>
                  Upload CSV file
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
          {!sidebarCollapsed && sidebarTab === 'sitemap' && !isViewerMode && (
            <div className={`${sidebarCollapsed ? 'p-2' : 'p-6'} border-b border-gray-200`}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600 mb-3">
                Sitemaps
              </h2>
              
              {/* Tabs for My Sitemaps vs Shared with Me */}
              <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setSitemapViewTab('my')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    sitemapViewTab === 'my'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  My Sitemaps
                </button>
                <button
                  onClick={() => setSitemapViewTab('shared')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    sitemapViewTab === 'shared'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Shared with Me
                </button>
              </div>
              
              {/* Create New Sitemap Button - only show in "My Sitemaps" tab */}
              {sitemapViewTab === 'my' && (
                <button
                  type="button"
                  onClick={createNewSitemap}
                  className="w-full mb-3 px-3 py-2 bg-white shadow-sm border border-gray-200 hover:shadow-md hover:bg-gray-150 text-gray-700 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                >
                  <img width="16" height="16" src="https://img.icons8.com/puffy/32/add.png" alt="add"/>
                  Create New Sitemap
                </button>
              )}
              
              {/* Dropdown Button */}
              <div className="relative">
                <button
                  onClick={() => setShowSitemapDropdown(!showSitemapDropdown)}
                  className="w-full px-3 py-2 text-left text-sm border rounded-lg border-gray-300 hover:border-gray-400 bg-white rounded flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium truncate">
                      {(() => {
                        const activeSitemap = sitemaps.find(s => s.id === activeSitemapId);
                        // Check if active sitemap matches current tab filter
                        if (activeSitemap) {
                          const matchesTab = sitemapViewTab === 'my' 
                            ? activeSitemap.isShared !== true 
                            : activeSitemap.isShared === true;
                          if (matchesTab) {
                            return activeSitemap.name;
                          }
                        }
                        // If active sitemap doesn't match tab, show first item from filtered list or "No Sitemap"
                        const filteredSitemaps = sitemaps.filter(sitemap => {
                          if (sitemapViewTab === 'my') {
                            return sitemap.isShared !== true;
                          } else {
                            return sitemap.isShared === true;
                          }
                        });
                        return filteredSitemaps[0]?.name || 'No Sitemap';
                      })()}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${showSitemapDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Menu */}
                {showSitemapDropdown && (() => {
                  // Filter sitemaps based on active tab
                  const filteredSitemaps = sitemaps.filter(sitemap => {
                    if (sitemapViewTab === 'my') {
                      // Show owned sitemaps (not shared)
                      return sitemap.isShared !== true;
                    } else {
                      // Show shared sitemaps
                      return sitemap.isShared === true;
                    }
                  });
                  
                  return filteredSitemaps.length > 0 ? (
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
                          {filteredSitemaps.map(sitemap => {
                            const isShared = sitemap.isShared === true;
                            
                            return (
                              <div
                                key={sitemap.id}
                                className={`group px-2 py-2 hover:bg-gray-50 flex items-center justify-between ${
                                  activeSitemapId === sitemap.id ? 'bg-blue-50' : ''
                                } ${isShared ? 'border-l-2 border-orange-400' : ''}`}
                              >
                                <button
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                                  onClick={() => {
                                    switchToSitemap(sitemap.id);
                                    setShowSitemapDropdown(false);
                                  }}
                                >
                                  {/* Icon */}
                                  <div className="flex-shrink-0">
                                    {isShared ? (
                                      <Lock className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                                    ) : (
                                      <FileText className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="font-medium text-sm truncate">{sitemap.name}</div>
                                      {/* Badge for shared sitemaps */}
                                      {isShared && sitemap.sharePermission && (
                                        <span
                                          className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                            sitemap.sharePermission === 'view'
                                              ? 'bg-orange-100 text-orange-600'
                                              : 'bg-blue-100 text-blue-600'
                                          }`}
                                        >
                                          {sitemap.sharePermission === 'view' ? 'View' : 'Edit'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">{sitemap.nodes.length} pages</div>
                                  </div>
                                </button>
                                <div 
                                  className="flex items-center gap-1 opacity-0 group-hover:opacity-100 pl-2"
                                >
                                  {/* Conditional actions based on ownership */}
                                  {!isShared ? (
                                    <>
                                      {/* Owned sitemaps: Rename, Share, Delete */}
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
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setShowSitemapDropdown(false);
                                          // Load current share token and permission
                                          const { token, permission } = await getShareTokenWithPermission(sitemap.id);
                                          setShareToken(token);
                                          setSharePermission(permission);
                                          setShowShareModal(true);
                                        }}
                                        className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                                        title="Share"
                                        type="button"
                                      >
                                        <Share2 className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                                      </button>
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
                                    </>
                                  ) : (
                                    <>
                                      {/* Shared sitemaps: Duplicate only */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowSitemapDropdown(false);
                                          duplicateSitemap(sitemap.id);
                                        }}
                                        className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                                        title="Duplicate to edit"
                                        type="button"
                                      >
                                        <Copy className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div 
                      className="absolute left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-20 p-4"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-gray-500 text-center">
                        {sitemapViewTab === 'my' ? 'No owned sitemaps' : 'No shared sitemaps'}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          {(() => {
            // Check if active sitemap matches current tab filter
            const activeSitemap = activeSitemapId ? sitemaps.find(s => s.id === activeSitemapId) : null;
            const matchesCurrentTab = activeSitemap && (
              (sitemapViewTab === 'my' && activeSitemap.isShared !== true) ||
              (sitemapViewTab === 'shared' && activeSitemap.isShared === true)
            );
            const shouldShowStats = nodes.length > 0 && matchesCurrentTab && !sidebarCollapsed && sidebarTab === 'sitemap';
            
            return shouldShowStats ? (
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
            ) : null;
          })()}

          {/* Comments Panel */}
          {!sidebarCollapsed && sidebarTab === 'comments' && activeSitemapId && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <CommentsPanel
                comments={comments}
                filter={commentFilter}
                onFilterChange={setCommentFilter}
                onCommentClick={() => {
                  // Inline editing is handled by CommentBubble component
                  // This callback is kept for compatibility but doesn't need to do anything
                }}
                onResolve={async (commentId, resolved) => {
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  try {
                    const isLocal = isLocalhost();
                    if (isLocal && !isSupabaseConfigured()) {
                      // Update in localStorage
                      const storageKey = `comments_${activeSitemapId}`;
                      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      const updated = comments.map((c: Comment) => 
                        c.id === commentId ? { ...c, resolved, updatedAt: new Date().toISOString() } : c
                      );
                      localStorage.setItem(storageKey, JSON.stringify(updated));
                      setComments(updated);
                      return;
                    }
                    await resolveComment(commentId, resolved);
                    // Real-time update will handle state update
                  } catch (err) {
                    console.error('Failed to resolve comment:', err);
                  }
                }}
                onDelete={async (commentId) => {
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  // 1. INSTANT UI update (optimistic) - same as nodes/text deletion
                  setComments(prev => prev.filter(c => c.id !== commentId));
                  
                  // 2. Save in background (non-blocking)
                  try {
                    const isLocal = isLocalhost();
                    if (isLocal && !isSupabaseConfigured()) {
                      // localStorage - update storage to match UI
                      const storageKey = `comments_${activeSitemapId}`;
                      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      const filtered = comments.filter((c: Comment) => c.id !== commentId);
                      localStorage.setItem(storageKey, JSON.stringify(filtered));
                      return;
                    }
                    
                    // Supabase - fire and forget (real-time will confirm)
                    deleteComment(commentId, activeSitemapId || undefined).catch(err => {
                      console.error('Failed to delete comment:', err);
                      // Rollback: reload comments if delete failed
                      if (activeSitemapId) {
                        getComments(activeSitemapId).then(setComments).catch(console.error);
                      }
                    });
                  } catch (err) {
                    console.error('Failed to delete comment:', err);
                    // Rollback on error
                    if (activeSitemapId) {
                      getComments(activeSitemapId).then(setComments).catch(console.error);
                    }
                  }
                }}
                currentUserId={isLocalhost() && !isSupabaseConfigured() ? 'localhost-user' : (user?.id)}
                isOwner={shareMode === 'owner' || !isViewerMode}
              />
            </div>
          )}

          {/* Comments empty state */}
          {!sidebarCollapsed && sidebarTab === 'comments' && !activeSitemapId && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-gray-500">No sitemap selected</p>
                <p className="text-xs text-gray-400 mt-1">Select or create a sitemap to view comments</p>
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#FFFEFB' }}>
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
                    setComments(prev.comments);
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
                    setComments(next.comments);
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
                comments={comments}
                onCommentClick={() => {
                  // Inline editing is handled by CommentBubble component
                  // This callback is kept for compatibility but doesn't need to do anything
                }}
                onCommentUpdate={async (commentId, text) => {
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  try {
                    const isLocal = isLocalhost();
                    if (isLocal && !isSupabaseConfigured()) {
                      // Update in localStorage
                      const storageKey = `comments_${activeSitemapId}`;
                      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      const updated = comments.map((c: Comment) => 
                        c.id === commentId ? { ...c, text, updatedAt: new Date().toISOString() } : c
                      );
                      localStorage.setItem(storageKey, JSON.stringify(updated));
                      setComments(updated);
                      return;
                    }
                    await updateComment(commentId, text);
                    // Real-time update will handle state update
                  } catch (err) {
                    console.error('Failed to update comment:', err);
                  }
                }}
                onCommentMove={async (commentId, x, y) => {
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  try {
                    const isLocal = isLocalhost();
                    if (isLocal && !isSupabaseConfigured()) {
                      // Update in localStorage
                      const storageKey = `comments_${activeSitemapId}`;
                      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      const updated = comments.map((c: Comment) => 
                        c.id === commentId ? { ...c, x, y, updatedAt: new Date().toISOString() } : c
                      );
                      localStorage.setItem(storageKey, JSON.stringify(updated));
                      setComments(updated);
                      return;
                    }
                    await updateCommentPosition(commentId, x, y);
                    // Real-time update will handle state update
                  } catch (err) {
                    console.error('Failed to move comment:', err);
                  }
                }}
                onCommentDelete={async (commentId) => {
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  // 1. INSTANT UI update (optimistic) - same as nodes/text deletion
                  setComments(prev => prev.filter(c => c.id !== commentId));
                  
                  // 2. Save in background (non-blocking)
                  try {
                    const isLocal = isLocalhost();
                    if (isLocal && !isSupabaseConfigured()) {
                      // localStorage - update storage to match UI
                      const storageKey = `comments_${activeSitemapId}`;
                      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      const filtered = comments.filter((c: Comment) => c.id !== commentId);
                      localStorage.setItem(storageKey, JSON.stringify(filtered));
                      return;
                    }
                    
                    // Supabase - fire and forget (real-time will confirm)
                    deleteComment(commentId, activeSitemapId || undefined).catch(err => {
                      console.error('Failed to delete comment:', err);
                      // Rollback: reload comments if delete failed
                      if (activeSitemapId) {
                        getComments(activeSitemapId).then(setComments).catch(console.error);
                      }
                    });
                  } catch (err) {
                    console.error('Failed to delete comment:', err);
                    // Rollback on error
                    if (activeSitemapId) {
                      getComments(activeSitemapId).then(setComments).catch(console.error);
                    }
                  }
                }}
                onCommentPlace={async (x, y) => {
                  // Allow comments on localhost without authentication
                  const isLocal = isLocalhost();
                  const allowWithoutAuth = isLocal && !isSupabaseConfigured();
                  
                  if (!activeSitemapId) {
                    return;
                  }
                  
                  if (!user && !allowWithoutAuth) {
                    if (isSupabaseConfigured()) {
                      setShowAuthModal(true);
                    }
                    return;
                  }
                  
                  // Create snapshot before comment operation
                  setUndoStack(stack => [...stack, makeSnapshot()]);
                  setRedoStack([]);
                  
                  try {
                    // For localhost without Supabase, create comment in localStorage
                    if (allowWithoutAuth) {
                      const commentId = crypto.randomUUID();
                      const mockUser = {
                        id: 'localhost-user',
                        email: 'localhost@local.dev',
                        user_metadata: { name: 'Local User' }
                      };
                      
                      const newComment: Comment = {
                        id: commentId,
                        sitemapId: activeSitemapId,
                        userId: mockUser.id,
                        userName: mockUser.user_metadata.name || 'Local User',
                        userEmail: mockUser.email,
                        x,
                        y,
                        text: '',
                        resolved: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      
                      // Store in localStorage
                      const storageKey = `comments_${activeSitemapId}`;
                      const existingComments = JSON.parse(localStorage.getItem(storageKey) || '[]');
                      existingComments.push(newComment);
                      localStorage.setItem(storageKey, JSON.stringify(existingComments));
                      
                      // Optimistically add comment to state immediately
                      setComments(prev => {
                        if (prev.some(c => c.id === newComment.id)) {
                          return prev;
                        }
                        return [newComment, ...prev];
                      });
                      return;
                    }
                    
                    // Normal Supabase flow
                    const newComment = await createComment(activeSitemapId, x, y, '');
                    // Optimistically add comment to state immediately
                    setComments(prev => {
                      // Check if comment already exists (from real-time update)
                      if (prev.some(c => c.id === newComment.id)) {
                        return prev;
                      }
                      return [newComment, ...prev];
                    });
                  } catch (err) {
                    console.error('Failed to create comment:', err);
                    if (isSupabaseConfigured() && !user && !isLocal) {
                      setShowAuthModal(true);
                    }
                  }
                }}
                isViewerMode={isViewerMode}
                currentUserId={isLocalhost() && !isSupabaseConfigured() ? 'localhost-user' : (user?.id)}
                isOwner={shareMode === 'owner' || !isViewerMode}
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
                      keys="Shift + Drag"
                      label="Multi-select"
                    />
                  </div>
                </div>

                {/* Navigation */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Navigation</h3>
                  <div className="space-y-2">
                    <ShortcutItem keys="Ctrl/Cmd + Drag" label="Move nodes" info="Drag selected node with its parent and children" />
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

      {/* Share Modal */}
      {showShareModal && activeSitemapId && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowShareModal(false);
            setInviteEmails([]);
            setInviteEmailInput('');
            setInviteEmailError('');
            setInviteSuccessMessage('');
            setShowCopySuccess(false);
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invite team members</h2>
              <p className="text-gray-600 text-sm">Invite your team and collaborate on your project.</p>
            </div>

            {/* Permission selector */}
            <div className="mb-4">
              {(() => {
                // Check if current sitemap is a view-only shared sitemap
                const currentSitemap = sitemaps.find(s => s.id === activeSitemapId);
                const isViewOnlyShared = currentSitemap?.isShared === true && currentSitemap?.sharePermission === 'view';
                const isViewerSession = shareMode === 'viewer';
                const editDisabled = isViewOnlyShared || isViewerSession;
                const disableMessage = isViewerSession
                  ? 'Only the sitemap owner can change access level.'
                  : 'You can only share with view-only permission since this sitemap was shared with you as view-only';
                return (
                  <div className="inline-flex bg-gray-100 rounded-full p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={async () => {
                        if (activeSitemapId && !isViewerSession && sharePermission !== 'view') {
                          const previousPermission = sharePermission;
                          // Mark that we're manually updating permission BEFORE any state updates
                          permissionManuallyUpdatedRef.current = true;
                          // Update permission immediately in UI
                          setSharePermission('view');
                          // Update permission in database/storage (keep same token)
                          try {
                            await updateSharePermission(activeSitemapId, 'view');
                            // Keep the ref true to prevent useEffect from overwriting
                          } catch (err) {
                            console.error('Failed to update permission:', err);
                            // Revert UI state on error
                            setSharePermission(previousPermission);
                            permissionManuallyUpdatedRef.current = false;
                          }
                        }
                      }}
                      disabled={isViewerSession}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transform ${
                        sharePermission === 'view'
                          ? 'bg-[#8b3503] text-white shadow-sm scale-105'
                          : 'text-gray-400 bg-transparent hover:text-gray-500 scale-100'
                      } ${isViewerSession ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      title={isViewerSession ? 'Access level can only be changed by the owner.' : undefined}
                    >
                      View only
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (activeSitemapId && !editDisabled && sharePermission !== 'edit') {
                          const previousPermission = sharePermission;
                          // Mark that we're manually updating permission BEFORE any state updates
                          permissionManuallyUpdatedRef.current = true;
                          // Update permission immediately in UI
                          setSharePermission('edit');
                          // Update permission in database/storage (keep same token)
                          try {
                            await updateSharePermission(activeSitemapId, 'edit');
                            // Keep the ref true to prevent useEffect from overwriting
                          } catch (err) {
                            console.error('Failed to update permission:', err);
                            // Revert UI state on error
                            setSharePermission(previousPermission);
                            permissionManuallyUpdatedRef.current = false;
                          }
                        }
                      }}
                      disabled={editDisabled}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transform ${
                        sharePermission === 'edit'
                          ? 'bg-[#8b3503] text-white shadow-sm scale-105'
                          : 'text-gray-400 bg-transparent hover:text-gray-500 scale-100'
                      } ${editDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      title={editDisabled ? disableMessage : undefined}
                    >
                      Can edit
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Invite member section */}
            <div className="mb-3">
              <div className="flex flex-col gap-2">
                {/* Email input with pills inside */}
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <div
                      className={`flex flex-wrap items-center gap-1 px-2 py-2 border rounded text-sm min-h-[42px] ${
                        inviteEmailError ? 'border-red-500' : 'border-gray-300'
                      }`}
                      onClick={(e) => {
                        // Only focus if clicking directly on the container (empty space), not on children
                        if (e.target === e.currentTarget) {
                          const input = document.getElementById('email-input') as HTMLInputElement;
                          if (input) {
                            input.focus();
                          }
                        }
                      }}
                    >
                      {/* Email pills inside the input */}
                      {inviteEmails.map((email, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-sm"
                        >
                          <span className="text-gray-700 text-xs">{email}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveEmail(email);
                            }}
                            className="text-gray-500 hover:text-gray-700 ml-0.5"
                            title="Remove email"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                      {/* Email input */}
                      <input
                        id="email-input"
                        type="email"
                        value={inviteEmailInput}
                        onChange={(e) => {
                          e.stopPropagation();
                          setInviteEmailInput(e.target.value);
                          // Clear error and success message when user starts typing
                          if (inviteEmailError) {
                            setInviteEmailError('');
                          }
                          if (inviteSuccessMessage) {
                            setInviteSuccessMessage('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={inviteEmails.length === 0 ? "Enter email address..." : ""}
                        className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' && inviteEmailInput.trim()) {
                            e.preventDefault();
                            handleAddEmail(inviteEmailInput);
                          } else if (e.key === ',' && inviteEmailInput.trim()) {
                            e.preventDefault();
                            handleAddEmail(inviteEmailInput);
                          } else if (e.key === ' ' && inviteEmailInput.trim()) {
                            e.preventDefault();
                            handleAddEmail(inviteEmailInput);
                          } else if (e.key === 'Backspace' && inviteEmailInput === '' && inviteEmails.length > 0) {
                            // Remove last email when backspace is pressed on empty input
                            e.preventDefault();
                            handleRemoveEmail(inviteEmails[inviteEmails.length - 1]);
                          }
                        }}
                      />
                    </div>
                    {inviteEmailError && (
                      <p className="text-sm text-red-600 mt-1">{inviteEmailError}</p>
                    )}
                    {inviteSuccessMessage && (
                      <p className="text-sm text-green-600 mt-1">{inviteSuccessMessage}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSendInvite(e);
                    }}
                    disabled={inviteEmails.length === 0}
                    className="px-4 py-2 text-sm rounded-lg shadow-sm min-h-[42px] transition-colors disabled:cursor-not-allowed flex-shrink-0"
                    style={{
                      backgroundColor: inviteEmails.length === 0 ? '#f5f0e8' : '#CB6015',
                      color: inviteEmails.length === 0 ? '#9ca3af' : '#ffffff',
                    }}
                    onMouseEnter={(e) => {
                      if (inviteEmails.length > 0 && !e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#CB6015';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (inviteEmails.length > 0 && !e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#CB6015';
                      } else if (e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#CB6015';
                      }
                    }}
                  >
                    Send Invite
                  </button>
                </div>
              </div>
            </div>
            {/* Copy link button */}
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => {
                  if (shareToken) {
                    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareToken}`;
                    navigator.clipboard.writeText(shareUrl);
                    setShowCopySuccess(true);
                    setTimeout(() => setShowCopySuccess(false), 2000);
                  }
                }}
                className="px-3 py-1.5 border-2 border-gray-100 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 text-sm"
                disabled={!shareToken}
                title="Copy share link"
              >
                <Link className="w-4 h-4" strokeWidth={1.5} />
                <span>Copy link</span>
              </button>
              {showCopySuccess && (
                <span className="px-2 text-sm text-green-600 transition-opacity duration-200 opacity-100">
                  Copied!
                </span>
              )}
            </div>
            {/* Close button */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setInviteEmails([]);
                  setInviteEmailInput('');
                  setInviteEmailError('');
                  setInviteSuccessMessage('');
                  setShowCopySuccess(false);
                }}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Thread Modal removed - inline editing is now handled by CommentBubble component */}


      {/* XML Export Warning Modal */}
      {showXmlExportWarning && (() => {
        const nodesWithoutUrls = nodes.filter(n => !n.url || !n.url.trim());
        const count = nodesWithoutUrls.length;
        return (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowXmlExportWarning(false)}
          >
            <div 
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Missing URLs Detected</h3>
              {nodesWithoutUrls.length > 0 && (
                <div className="mb-4 max-h-48 overflow-y-auto border border-gray-200 rounded p-3 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {count === 1 ? '1 node is missing URL' : `${count} nodes are missing URLs`}:
                  </p>
                  <ul className="space-y-1">
                    {nodesWithoutUrls.map(node => (
                      <li key={node.id} className="text-sm text-gray-600">
                        • {node.title || 'Untitled Node'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4">
                Only nodes with valid URLs will be included in the exported sitemap.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowXmlExportWarning(false)}
                  className="px-4 py-2 border border-gray-800 shadow-sm rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmXmlExport}
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Confirm Export
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </>
  );
}

export default App;
