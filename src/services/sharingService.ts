import { supabase } from '../lib/supabase';
import { SitemapData } from '../types/sitemap';
import { SharePermission } from '../types/comments';

// Generate a unique share token
function generateToken(): string {
  return crypto.randomUUID();
}

// Generate and save share token for a sitemap
export async function generateShareToken(sitemapId: string, permission: SharePermission = 'view'): Promise<string> {
  const token = generateToken();

  if (supabase) {
    // Try Supabase first with timeout protection
    try {
      console.log('[generateShareToken] Starting Supabase update...');
      
      // Create timeout promise (1 second)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          console.warn('[generateShareToken] Update timeout after 1 second');
          reject(new Error('Token update timeout after 1 second'));
        }, 1000)
      );
      
      // Create update promise
      const updateResult = supabase
        .from('sitemaps')
        .update({ share_token: token, share_permission: permission })
        .eq('id', sitemapId);
      
      // Convert to proper promise and race with timeout
      const updatePromise = new Promise((resolve, reject) => {
        if (updateResult && typeof (updateResult as any).then === 'function') {
          (updateResult as any).then(resolve, reject);
        } else {
          Promise.resolve(updateResult).then(resolve, reject);
        }
      });
      
      const { error } = await Promise.race([updatePromise, timeoutPromise]) as any;

      if (error) {
        console.error('Error generating share token in Supabase:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          sitemapId,
        });
        // Fall through to localStorage fallback
      } else {
        // Successfully saved to Supabase
        console.log('Share token generated successfully in Supabase:', { sitemapId, token, permission });
        // Also store in localStorage as backup
        try {
          const storageKey = `share_token_${sitemapId}`;
          const permissionKey = `share_token_${sitemapId}_permission`;
          localStorage.setItem(storageKey, token);
          localStorage.setItem(permissionKey, permission);
        } catch (e) {
          console.warn('Failed to save token to localStorage backup:', e);
        }
        return token;
      }
    } catch (supabaseError: any) {
      console.warn('Supabase token update exception or timeout, using localStorage fallback:', {
        error: supabaseError?.message || supabaseError,
        sitemapId,
      });
      // Fall through to localStorage fallback
    }
  } else {
    console.warn('Supabase not initialized, using localStorage fallback for share token');
  }

  // Fallback to localStorage
  try {
    const storageKey = `share_token_${sitemapId}`;
    const permissionKey = `share_token_${sitemapId}_permission`;
    localStorage.setItem(storageKey, token);
    localStorage.setItem(permissionKey, permission);
    console.log('Share token generated successfully in localStorage:', { sitemapId, token, permission });
    return token;
  } catch (error) {
    console.error('Error saving share token to localStorage:', error);
    throw new Error('Failed to generate share token');
  }
}

// Load sitemap by share token
export async function getSitemapByShareToken(token: string): Promise<{ sitemap: SitemapData; permission: SharePermission } | null> {
  // Try Supabase first if available
  if (supabase) {
    const { data, error } = await supabase
      .from('sitemaps')
      .select('*')
      .eq('share_token', token)
      .single();

    if (!error && data) {
      // Convert to SitemapData format
      const sitemap: SitemapData = {
        id: data.id,
        name: data.name,
        nodes: data.data.nodes || [],
        extraLinks: data.data.extraLinks || [],
        linkStyles: data.data.linkStyles || {},
        colorOverrides: data.data.colorOverrides || {},
        urls: data.data.urls || [],
        selectionGroups: data.data.selectionGroups || [],
        lastModified: data.last_modified,
        createdAt: data.created_at,
      };
      
      const permission: SharePermission = (data.share_permission === 'edit' ? 'edit' : 'view');
      
      return { sitemap, permission };
    }
    
    // If Supabase query failed with "no rows", continue to localStorage fallback
    if (error && error.code !== 'PGRST116') {
      console.error('Error loading sitemap by share token:', error);
      // Continue to localStorage fallback instead of throwing
    }
  }

  // Fallback to localStorage: find sitemap by matching share token
  try {
    const sitemapsStr = localStorage.getItem('sitemaps');
    if (!sitemapsStr) {
      return null;
    }
    
    const sitemaps: SitemapData[] = JSON.parse(sitemapsStr);
    
    // Find sitemap that has this share token
    for (const sitemap of sitemaps) {
      const storageKey = `share_token_${sitemap.id}`;
      const storedToken = localStorage.getItem(storageKey);
      
      if (storedToken === token) {
        const permissionKey = `share_token_${sitemap.id}_permission`;
        const permission: SharePermission = (localStorage.getItem(permissionKey) === 'edit' ? 'edit' : 'view');
        return { sitemap, permission };
      }
    }
    
    return null; // Token not found
  } catch (error) {
    console.error('Error loading sitemap from localStorage:', error);
    return null;
  }
}

// Revoke share token (remove sharing)
export async function revokeShareToken(sitemapId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from('sitemaps')
      .update({ share_token: null, share_permission: null })
      .eq('id', sitemapId);

    if (error) {
      console.error('Error revoking share token:', error);
      // Fall through to localStorage cleanup
    }
  }

  // Also clear from localStorage
  try {
    const storageKey = `share_token_${sitemapId}`;
    const permissionKey = `share_token_${sitemapId}_permission`;
    localStorage.removeItem(storageKey);
    localStorage.removeItem(permissionKey);
  } catch (error) {
    console.error('Error removing share token from localStorage:', error);
  }
}

// Check if sitemap has active share token
export async function isSitemapShared(sitemapId: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from('sitemaps')
    .select('share_token')
    .eq('id', sitemapId)
    .single();

  if (error) {
    console.error('Error checking share status:', error);
    return false;
  }

  return !!data?.share_token;
}

// Get share token for a sitemap
export async function getShareToken(sitemapId: string): Promise<string | null> {
  try {
    if (supabase) {
      // Try Supabase first
      try {
        const { data, error } = await supabase
          .from('sitemaps')
          .select('share_token')
          .eq('id', sitemapId)
          .single();

        if (!error && data?.share_token) {
          return data.share_token;
        }
      } catch (supabaseError) {
        // Supabase query failed, fall through to localStorage
        console.warn('Supabase query failed, falling back to localStorage:', supabaseError);
      }
    }

    // Fallback to localStorage
    try {
      const storageKey = `share_token_${sitemapId}`;
      const token = localStorage.getItem(storageKey);
      return token;
    } catch (localStorageError) {
      console.error('Error getting share token from localStorage:', localStorageError);
      return null;
    }
  } catch (error) {
    // Catch any unexpected errors
    console.error('Unexpected error in getShareToken:', error);
    return null;
  }
}

// Get share token with permission for a sitemap
export async function getShareTokenWithPermission(sitemapId: string): Promise<{ token: string | null; permission: SharePermission }> {
  try {
    // Debug: Check if supabase client exists
    console.log('[getShareTokenWithPermission] Starting:', {
      sitemapId,
      hasSupabase: !!supabase,
      supabaseType: typeof supabase,
    });

    if (supabase) {
      // Try Supabase first with timeout protection
      try {
        console.log('[getShareTokenWithPermission] Creating query promise...');
        
        // Create a timeout promise (1 second)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => {
            console.warn('[getShareTokenWithPermission] Timeout triggered after 1 second');
            reject(new Error('Query timeout after 1 second'));
          }, 1000)
        );
        
        // Create the query promise
        console.log('[getShareTokenWithPermission] Building Supabase query...');
        const queryBuilder = supabase
          .from('sitemaps')
          .select('share_token, share_permission')
          .eq('id', sitemapId);
        
        console.log('[getShareTokenWithPermission] Calling .single()...');
        // Supabase query builders are thenable, so we can use them directly
        const queryResult = queryBuilder.single();
        
        // Add a check to see if the result is thenable
        const isThenable = queryResult && typeof (queryResult as any).then === 'function';
        console.log('[getShareTokenWithPermission] Query result is thenable:', isThenable);
        
        console.log('[getShareTokenWithPermission] Starting Promise.race...');
        
        // Create a proper promise from the thenable
        const queryPromise = new Promise((resolve, reject) => {
          if (isThenable) {
            (queryResult as any).then(resolve, reject);
          } else {
            // If not thenable, try to await it directly
            Promise.resolve(queryResult).then(resolve, reject);
          }
        });
        
        // Race between query and timeout
        const result = await Promise.race([queryPromise, timeoutPromise]);
        const { data, error } = result as any;
        
        console.log('[getShareTokenWithPermission] Promise resolved:', { hasData: !!data, hasError: !!error });

        if (!error && data?.share_token) {
          const permission: SharePermission = (data.share_permission === 'edit' ? 'edit' : 'view');
          console.log('Retrieved share token from Supabase:', { sitemapId, token: data.share_token, permission });
          return { token: data.share_token, permission };
        } else if (error) {
          console.warn('Supabase query failed for getShareTokenWithPermission:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            sitemapId,
          });
          // Fall through to localStorage
        } else {
          // No token found in Supabase
          console.log('No share token found in Supabase for sitemap:', sitemapId);
        }
      } catch (supabaseError: any) {
        // Supabase query failed or timed out, fall through to localStorage
        console.warn('Supabase query exception or timeout, falling back to localStorage:', {
          error: supabaseError?.message || supabaseError,
          errorType: supabaseError?.name,
          errorStack: supabaseError?.stack?.substring(0, 200),
          sitemapId,
        });
      }
    } else {
      console.warn('Supabase not initialized, using localStorage for getShareTokenWithPermission');
    }

    // Fallback to localStorage
    try {
      const storageKey = `share_token_${sitemapId}`;
      const permissionKey = `share_token_${sitemapId}_permission`;
      const token = localStorage.getItem(storageKey);
      const permission: SharePermission = (localStorage.getItem(permissionKey) === 'edit' ? 'edit' : 'view');
      if (token) {
        console.log('Retrieved share token from localStorage:', { sitemapId, token, permission });
      } else {
        console.log('No share token found in localStorage for sitemap:', sitemapId);
      }
      return { token, permission };
    } catch (localStorageError) {
      console.error('Error getting share token from localStorage:', localStorageError);
      return { token: null, permission: 'view' };
    }
  } catch (error) {
    // Catch any unexpected errors
    console.error('Unexpected error in getShareTokenWithPermission:', error);
    return { token: null, permission: 'view' };
  }
}

// Update share permission for existing token (without changing the token)
export async function updateSharePermission(sitemapId: string, permission: SharePermission): Promise<void> {
  if (supabase) {
    // Try Supabase first with timeout protection
    try {
      console.log('[updateSharePermission] Starting Supabase update...', { sitemapId, permission });
      
      // Create timeout promise (1 second)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          console.warn('[updateSharePermission] Update timeout after 1 second');
          reject(new Error('Permission update timeout after 1 second'));
        }, 1000)
      );
      
      // Create update promise
      const updateResult = supabase
        .from('sitemaps')
        .update({ share_permission: permission })
        .eq('id', sitemapId);
      
      // Convert to proper promise and race with timeout
      const updatePromise = new Promise((resolve, reject) => {
        if (updateResult && typeof (updateResult as any).then === 'function') {
          (updateResult as any).then(resolve, reject);
        } else {
          Promise.resolve(updateResult).then(resolve, reject);
        }
      });
      
      const { error } = await Promise.race([updatePromise, timeoutPromise]) as any;

      if (error) {
        console.error('Error updating share permission in Supabase:', error);
        // Fall through to localStorage fallback
      } else {
        console.log('[updateSharePermission] Successfully updated permission in Supabase:', { sitemapId, permission });
        // Also update in localStorage as backup
        try {
          const permissionKey = `share_token_${sitemapId}_permission`;
          localStorage.setItem(permissionKey, permission);
        } catch (e) {
          console.warn('Failed to save permission to localStorage backup:', e);
        }
        return;
      }
    } catch (supabaseError: any) {
      console.warn('Supabase permission update exception or timeout, using localStorage fallback:', {
        error: supabaseError?.message || supabaseError,
        sitemapId,
      });
      // Fall through to localStorage fallback
    }
  } else {
    console.warn('Supabase not initialized, using localStorage fallback for updateSharePermission');
  }

  // Fallback to localStorage
  try {
    const permissionKey = `share_token_${sitemapId}_permission`;
    localStorage.setItem(permissionKey, permission);
    console.log('[updateSharePermission] Successfully updated permission in localStorage:', { sitemapId, permission });
  } catch (error) {
    console.error('Error updating share permission in localStorage:', error);
    throw new Error('Failed to update share permission');
  }
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

    // Call the Supabase Edge Function which uses Supabase's email templates
    const { data, error } = await supabase.functions.invoke('send-invite', {
      body: {
        email,
        shareUrl,
        sitemapId,
        sitemapName,
      },
    });

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
        throw new Error('Invite function not found. Please contact support.');
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

