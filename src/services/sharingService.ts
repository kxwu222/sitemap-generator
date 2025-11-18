import { supabase } from '../lib/supabase';
import { SitemapData } from '../types/sitemap';
import { Comment } from '../types/comments';
import { Figure, FreeLine } from '../types/drawables';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const SHARE_PAYLOAD_VERSION = 1;
const EMBEDDED_SHARE_PREFIX = 'embed:';
const MAX_SHARE_URL_LENGTH = 2000;

type SharePayload = {
  v: number;
  ts: number;
  sitemap: Pick<
    SitemapData,
    | 'id'
    | 'name'
    | 'nodes'
    | 'extraLinks'
    | 'linkStyles'
    | 'colorOverrides'
    | 'urls'
    | 'selectionGroups'
    | 'lastModified'
    | 'createdAt'
  >;
  figures: Figure[];
  freeLines: FreeLine[];
  comments: Comment[];
};

function generateToken(): string {
  return crypto.randomUUID();
}

function createShareUrl(value: string, options?: { origin?: string; path?: string }): string {
  const origin =
    options?.origin ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  const path =
    options?.path ??
    (typeof window !== 'undefined' ? window.location.pathname : '');
  const base = `${origin}${path}`;
  const separator = base.includes('?') ? '&' : '?';
  const url = `${base}${separator}share=${value}`;
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error('Share link is too long to be embedded. Please configure Supabase for large sitemaps.');
  }
  return url;
}

function clearStoredSharePayloads(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('share_payload_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Failed to clear cached share payloads:', err);
  }
}

function parseCompressedPayload(compressed: string | null): {
  sitemap: SitemapData;
  comments: Comment[];
  figures: Figure[];
  freeLines: FreeLine[];
  timestamp: number;
  version: number;
} | null {
  if (!compressed) return null;

  try {
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    const payload = JSON.parse(json) as SharePayload;
    if (!payload?.sitemap) {
      return null;
    }

    const sitemap: SitemapData = {
      ...payload.sitemap,
      isShared: true,
      sharePermission: 'view',
    };

    return {
      sitemap,
      comments: payload.comments || [],
      figures: payload.figures || [],
      freeLines: payload.freeLines || [],
      timestamp: payload.ts,
      version: payload.v,
    };
  } catch (error: unknown) {
    console.error('Failed to parse embedded share payload:', error);
    return null;
  }
}

function cloneSitemapForShare(sitemap: SitemapData): SharePayload['sitemap'] {
  return {
    id: sitemap.id,
    name: sitemap.name,
    nodes: JSON.parse(JSON.stringify(sitemap.nodes)),
    extraLinks: JSON.parse(JSON.stringify(sitemap.extraLinks)),
    linkStyles: JSON.parse(JSON.stringify(sitemap.linkStyles)),
    colorOverrides: JSON.parse(JSON.stringify(sitemap.colorOverrides)),
    urls: JSON.parse(JSON.stringify(sitemap.urls)),
    selectionGroups: JSON.parse(JSON.stringify(sitemap.selectionGroups || [])),
    lastModified: sitemap.lastModified,
    createdAt: sitemap.createdAt,
  };
}

function toSharePayload(
  sitemap: SitemapData,
  comments: Comment[],
  figures: Figure[] = [],
  freeLines: FreeLine[] = []
): SharePayload {
  return {
    v: SHARE_PAYLOAD_VERSION,
    ts: Date.now(),
    sitemap: cloneSitemapForShare(sitemap),
    figures: JSON.parse(JSON.stringify(figures)),
    freeLines: JSON.parse(JSON.stringify(freeLines)),
    comments: JSON.parse(JSON.stringify(comments)),
  };
}

// Get existing share token for a sitemap (if one exists)
async function getExistingShareToken(sitemapId: string): Promise<string | null> {
  // Try Supabase first
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sitemaps')
        .select('share_token')
        .eq('id', sitemapId)
        .single();
      
      if (!error && data?.share_token) {
        return data.share_token;
      }
    } catch (err) {
      console.warn('Failed to get share token from Supabase, trying localStorage:', err);
    }
  }
  
  // Fallback to localStorage
  try {
    const storedToken = localStorage.getItem(`share_token_${sitemapId}`);
    if (storedToken) {
      return storedToken;
    }
  } catch (err) {
    console.warn('Failed to get share token from localStorage:', err);
  }
  
  return null;
}

// Store share payload in Supabase and return a short token
export async function buildShareLink(
  sitemap: SitemapData,
  comments: Comment[],
  options?: { origin?: string; path?: string },
  figures: Figure[] = [],
  freeLines: FreeLine[] = []
): Promise<string> {
  const payload = toSharePayload(sitemap, comments, figures, freeLines);
  const json = JSON.stringify(payload);
  const compressed = compressToEncodedURIComponent(json);
  
  // Check for existing share token first (reuse if exists)
  // Add timeout to prevent hanging
  let token: string;
  try {
    const existingToken = await Promise.race([
      getExistingShareToken(sitemap.id),
      new Promise<string | null>((_, reject) => 
        setTimeout(() => reject(new Error('Token lookup timeout')), 2000)
      )
    ]) as string | null;
    if (existingToken) {
      token = existingToken;
    } else {
      // Generate new token only if one doesn't exist
      token = generateToken();
    }
  } catch (err) {
    // If token lookup fails or times out, generate a new one
    console.warn('Failed to get existing share token, generating new one:', err);
    token = generateToken();
  }
  
  // Store token in localStorage for quick lookup
  try {
    localStorage.setItem(`share_token_${sitemap.id}`, token);
  } catch (err) {
    // Ignore localStorage errors (quota exceeded, etc.)
    console.warn('Failed to store share token in localStorage:', err);
  }
  
  // Try Supabase first (handles large payloads and works across devices)
  if (supabase) {
    try {
      // Add timeout to prevent hanging on slow networks (deployment)
      const supabaseTimeout = 10000; // 10 seconds
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase operation timeout')), supabaseTimeout)
      );

      // First, try to update existing sitemap's share_token and share_payload
      // This avoids conflicts with the id field
      const updatePromise = supabase
        .from('sitemaps')
        .update({
          share_token: token,
          share_permission: 'view',
          data: {
            // Store the full sitemap data
            nodes: sitemap.nodes,
            extraLinks: sitemap.extraLinks,
            linkStyles: sitemap.linkStyles,
            colorOverrides: sitemap.colorOverrides,
            urls: sitemap.urls,
            selectionGroups: sitemap.selectionGroups,
            // Store compressed payload separately
            share_payload: compressed,
          },
          last_modified: sitemap.lastModified || Date.now(),
        })
        .eq('id', sitemap.id);
      
      const { error: updateError } = await Promise.race([updatePromise, timeoutPromise]);
      
      // If update failed, check if it's a type mismatch error (don't retry)
      if (updateError) {
        // Check if it's a type mismatch error (22P02 is PostgreSQL invalid input syntax)
        if (updateError.code === '22P02' || updateError.message?.includes('invalid input syntax')) {
          // Don't try insert - it will fail with the same error
          throw new Error('Database schema mismatch: timestamps must be BIGINT, not strings.');
        }
      }
      
      // If update failed (sitemap doesn't exist), try insert
      if (updateError) {
        const insertPromise = supabase
          .from('sitemaps')
          .insert({
            id: sitemap.id,
            share_token: token,
            share_permission: 'view',
            data: {
              nodes: sitemap.nodes,
              extraLinks: sitemap.extraLinks,
              linkStyles: sitemap.linkStyles,
              colorOverrides: sitemap.colorOverrides,
              urls: sitemap.urls,
              selectionGroups: sitemap.selectionGroups,
              share_payload: compressed,
            },
            name: sitemap.name,
            created_at: sitemap.createdAt || Date.now(),
            last_modified: sitemap.lastModified || Date.now(),
          });
        
        const { error: insertError } = await Promise.race([insertPromise, timeoutPromise]);
        
        if (insertError) {
          throw insertError;
        }
      }
      
      // Success - return the share link
      return createShareUrl(token, options);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('Supabase operation timeout');
      
      if (isTimeout) {
        // If Supabase times out, use embedded payload instead of localStorage
        // localStorage won't work for cross-device sharing
        console.warn('Supabase timeout, using embedded payload for share link:', err);
        const embeddedValue = `${EMBEDDED_SHARE_PREFIX}${compressed}`;
        try {
          return createShareUrl(embeddedValue, options);
        } catch (embeddedErr) {
          // If embedded is too large, fall through to localStorage as last resort
          console.warn('Embedded payload too large, falling back to localStorage:', embeddedErr);
        }
      } else {
        // For other errors, try localStorage as fallback
        console.warn('Error storing share payload in Supabase, trying localStorage:', err);
      }
    }
  }
  
  // Fallback to localStorage (only works on same device - not ideal for sharing)
  // But use embedded payload if possible for cross-device compatibility
  const storeInLocalStorage = () => {
    localStorage.setItem(`share_payload_${token}`, compressed);
    return createShareUrl(token, options);
  };

  // Try embedded payload first (works across devices)
  try {
    const embeddedValue = `${EMBEDDED_SHARE_PREFIX}${compressed}`;
    return createShareUrl(embeddedValue, options);
  } catch (embeddedErr) {
    // If embedded is too large, try localStorage
    console.warn('Embedded payload too large, trying localStorage:', embeddedErr);
    
    try {
      // Check if payload is too large (localStorage limit is ~5-10MB)
      if (compressed.length > 4 * 1024 * 1024) { // 4MB threshold
        throw new Error('Share payload is too large for localStorage. Please configure Supabase for large sitemaps.');
      }
      
      return storeInLocalStorage();
    } catch (err) {
      console.error('Failed to store share payload in localStorage:', err);
      const message = err instanceof Error ? err.message : '';
      const isQuotaError =
        message.includes('QuotaExceededError') ||
        (err instanceof DOMException && err.name === 'QuotaExceededError');
      
      if (isQuotaError) {
        // Attempt to clear previous share payloads and retry once
        clearStoredSharePayloads();
        try {
          return storeInLocalStorage();
        } catch (retryErr) {
          throw new Error(
            'Share payload is too large. Please configure Supabase for large sitemaps.'
          );
        }
      }
      
      // If both embedded and localStorage fail, throw error
      throw new Error(message || 'Failed to generate share link');
    }
  }
}

// Retrieve share payload by token from Supabase or localStorage
export async function decodeSharePayload(token: string): Promise<{
  sitemap: SitemapData;
  comments: Comment[];
  figures: Figure[];
  freeLines: FreeLine[];
  timestamp: number;
  version: number;
} | null> {
  // Support embedded payloads directly in the URL (no storage required)
  if (token.startsWith(EMBEDDED_SHARE_PREFIX)) {
    const embeddedPayload = token.slice(EMBEDDED_SHARE_PREFIX.length);
    return parseCompressedPayload(embeddedPayload);
  }

  let compressed: string | null = null;
  let sitemapRow: any = null;
  
  // Try Supabase first (with timeout)
  if (supabase) {
    try {
      const supabaseTimeout = 10000; // 10 seconds
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Supabase query timeout')), supabaseTimeout)
      );

      const queryPromise = supabase
        .from('sitemaps')
        .select('*') // Select all fields, not just 'data'
        .eq('share_token', token)
        .single();
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      if (!error && data) {
        sitemapRow = data;
        const sitemapData = data.data as any;
        // Check for share_payload field (new format)
        if (sitemapData?.share_payload) {
          compressed = sitemapData.share_payload;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('timeout')) {
        console.warn('Supabase query timeout when loading share payload, trying localStorage:', err);
      } else {
        console.warn('Failed to load share payload from Supabase, trying localStorage:', err);
      }
    }
  }
  
  // If we have compressed payload, use it
  if (compressed) {
    return parseCompressedPayload(compressed);
  }
  
  // If we have sitemap row but no share_payload, reconstruct from sitemap data
  // This handles cases where share_payload wasn't stored but sitemap data exists
  if (sitemapRow && sitemapRow.data) {
    try {
      const sitemapData = sitemapRow.data;
      const sitemap: SitemapData = {
        id: sitemapRow.id,
        name: sitemapRow.name,
        nodes: sitemapData.nodes || [],
        extraLinks: sitemapData.extraLinks || [],
        linkStyles: sitemapData.linkStyles || {},
        colorOverrides: sitemapData.colorOverrides || {},
        urls: sitemapData.urls || [],
        selectionGroups: sitemapData.selectionGroups || [],
        lastModified: sitemapRow.last_modified,
        createdAt: sitemapRow.created_at,
        isShared: true,
        sharePermission: sitemapRow.share_permission === 'edit' ? 'edit' : 'view',
      };

      return {
        sitemap,
        comments: sitemapData.comments || [],
        figures: sitemapData.figures || [],
        freeLines: sitemapData.freeLines || [],
        timestamp: sitemapRow.last_modified || Date.now(),
        version: SHARE_PAYLOAD_VERSION,
      };
    } catch (err) {
      console.warn('Failed to reconstruct sitemap from row data:', err);
    }
  }
  
  // Fallback to localStorage
  try {
    compressed = localStorage.getItem(`share_payload_${token}`);
    if (compressed) {
      return parseCompressedPayload(compressed);
    }
  } catch (err) {
    console.error('Failed to load share payload from localStorage:', err);
  }
  
  // If all methods fail, return null
  return null;
}

// Send invite to a user by email using Supabase's built-in email templates
export async function sendInvite(sitemapId: string, email: string, shareUrl: string, sitemapName?: string): Promise<void> {
  if (!supabase) {
    const errorMsg = 'Email sending requires Supabase configuration. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
    console.error('sendInvite failed:', errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Get the current user's session for authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error when sending invite:', {
        error: sessionError.message,
        code: sessionError.status,
      });
      throw new Error('Authentication error. Please sign in and try again.');
    }
    
    if (!session) {
      console.error('No session found when sending invite');
      throw new Error('User must be authenticated to send invites. Please sign in and try again.');
    }

    console.log('Calling send-invite Edge Function:', { email, sitemapId, shareUrl, sitemapName });

    // Create timeout promise (5 seconds for Edge Function - longer than DB queries)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        console.warn('[sendInvite] Edge Function timeout after 5 seconds');
        reject(new Error('Invite request timeout. The Edge Function may not be deployed or is taking too long.'));
      }, 5000)
    );

    // Call the Supabase Edge Function with timeout protection
    const invokePromise = supabase.functions.invoke('send-invite', {
      body: {
        email,
        shareUrl,
        sitemapId,
        sitemapName,
      },
    });

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;

    if (error) {
      console.error('Error calling send-invite function:', {
        message: error.message,
        context: error.context,
        status: error.status,
        email,
        sitemapId,
      });
      // Provide more specific error messages
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        throw new Error('Network error. Please check your connection and try again.');
      } else if (error.status === 401 || error.message?.includes('Unauthorized')) {
        throw new Error('Authentication failed. Please sign in and try again.');
      } else if (error.status === 404) {
        throw new Error('Invite function not found. The Edge Function may not be deployed. Please contact support.');
      } else if (error.message?.includes('timeout')) {
        throw new Error('Invite request timed out. The Edge Function may not be deployed or is taking too long.');
      } else {
        throw new Error(error.message || 'Failed to send invite email. Please try again.');
      }
    }

    if (!data || !data.success) {
      const errorMsg = data?.error || 'Failed to send invite email';
      console.error('send-invite function returned error:', { data, email, sitemapId });
      throw new Error(errorMsg);
    }

    console.log('Invite email sent successfully:', { data, email, sitemapId });
  } catch (error) {
    console.error('Error sending invite:', {
      error,
      email,
      sitemapId,
      shareUrl,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    // Re-throw with a user-friendly message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to send invite email. Please try again.');
  }
}

