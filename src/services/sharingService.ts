import { supabase } from '../lib/supabase';
import { SitemapData } from '../types/sitemap';
import { Comment } from '../types/comments';
import { Figure, FreeLine } from '../types/drawables';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const SHARE_PAYLOAD_VERSION = 1;

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

function cloneCommentsForShare(comments: Comment[]): Comment[] {
  return JSON.parse(JSON.stringify(comments));
}

function cloneFigures(figures: Figure[]): Figure[] {
  return JSON.parse(JSON.stringify(figures));
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
    figures: cloneFigures(figures),
    freeLines: JSON.parse(JSON.stringify(freeLines)),
    comments: cloneCommentsForShare(comments),
  };
}

export function buildSharePayloadToken(
  sitemap: SitemapData,
  comments: Comment[],
  figures: Figure[] = [],
  freeLines: FreeLine[] = []
): string {
  const payload = toSharePayload(sitemap, comments, figures, freeLines);
  const json = JSON.stringify(payload);
  return compressToEncodedURIComponent(json);
}

export function decodeSharePayload(token: string): {
  sitemap: SitemapData;
  comments: Comment[];
  figures: Figure[];
  freeLines: FreeLine[];
  timestamp: number;
  version: number;
} | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
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
    console.error('Failed to decode share payload:', error);
    return null;
  }
}

export function buildShareLink(
  sitemap: SitemapData,
  comments: Comment[],
  options?: { origin?: string; path?: string },
  figures: Figure[] = [],
  freeLines: FreeLine[] = []
): string {
  const token = buildSharePayloadToken(sitemap, comments, figures, freeLines);
  const origin =
    options?.origin ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  const path =
    options?.path ??
    (typeof window !== 'undefined' ? window.location.pathname : '');
  const base = `${origin}${path}`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}share=${token}`;
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

