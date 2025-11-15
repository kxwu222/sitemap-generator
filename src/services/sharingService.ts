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
    // Try Supabase first
    const { error } = await supabase
      .from('sitemaps')
      .update({ share_token: token, share_permission: permission })
      .eq('id', sitemapId);

    if (error) {
      console.error('Error generating share token:', error);
      // Fall through to localStorage fallback
    } else {
      // Also store in localStorage as backup
      try {
        const storageKey = `share_token_${sitemapId}`;
        const permissionKey = `share_token_${sitemapId}_permission`;
        localStorage.setItem(storageKey, token);
        localStorage.setItem(permissionKey, permission);
      } catch (e) {
        // Ignore localStorage errors
      }
      return token;
    }
  }

  // Fallback to localStorage
  try {
    const storageKey = `share_token_${sitemapId}`;
    const permissionKey = `share_token_${sitemapId}_permission`;
    localStorage.setItem(storageKey, token);
    localStorage.setItem(permissionKey, permission);
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
  if (supabase) {
    // Try Supabase first
    const { data, error } = await supabase
      .from('sitemaps')
      .select('share_token')
      .eq('id', sitemapId)
      .single();

    if (!error && data?.share_token) {
      return data.share_token;
    }
  }

  // Fallback to localStorage
  try {
    const storageKey = `share_token_${sitemapId}`;
    const token = localStorage.getItem(storageKey);
    return token;
  } catch (error) {
    console.error('Error getting share token from localStorage:', error);
    return null;
  }
}

// Get share token with permission for a sitemap
export async function getShareTokenWithPermission(sitemapId: string): Promise<{ token: string | null; permission: SharePermission }> {
  if (supabase) {
    // Try Supabase first
    const { data, error } = await supabase
      .from('sitemaps')
      .select('share_token, share_permission')
      .eq('id', sitemapId)
      .single();

    if (!error && data?.share_token) {
      const permission: SharePermission = (data.share_permission === 'edit' ? 'edit' : 'view');
      return { token: data.share_token, permission };
    }
  }

  // Fallback to localStorage
  try {
    const storageKey = `share_token_${sitemapId}`;
    const permissionKey = `share_token_${sitemapId}_permission`;
    const token = localStorage.getItem(storageKey);
    const permission: SharePermission = (localStorage.getItem(permissionKey) === 'edit' ? 'edit' : 'view');
    return { token, permission };
  } catch (error) {
    console.error('Error getting share token from localStorage:', error);
    return { token: null, permission: 'view' };
  }
}

// Update share permission for existing token (without changing the token)
export async function updateSharePermission(sitemapId: string, permission: SharePermission): Promise<void> {
  if (supabase) {
    // Try Supabase first
    const { error } = await supabase
      .from('sitemaps')
      .update({ share_permission: permission })
      .eq('id', sitemapId);

    if (error) {
      console.error('Error updating share permission:', error);
      // Fall through to localStorage fallback
    } else {
      // Also update in localStorage as backup
      try {
        const permissionKey = `share_token_${sitemapId}_permission`;
        localStorage.setItem(permissionKey, permission);
      } catch (e) {
        // Ignore localStorage errors
      }
      return;
    }
  }

  // Fallback to localStorage
  try {
    const permissionKey = `share_token_${sitemapId}_permission`;
    localStorage.setItem(permissionKey, permission);
  } catch (error) {
    console.error('Error updating share permission in localStorage:', error);
    throw new Error('Failed to update share permission');
  }
}

// Send invite to a user by email
export async function sendInvite(_sitemapId: string, _email: string): Promise<void> {
  // Placeholder function - can be implemented later with actual invite functionality
  // For now, just show a success message
  return Promise.resolve();
}

