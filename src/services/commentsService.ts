import { supabase } from '../lib/supabase';
import { Comment } from '../types/comments';
import { RealtimeChannel } from '@supabase/supabase-js';

// Database row type
interface CommentRow {
  id: string;
  sitemap_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

// Convert database row to Comment (with user info)
function rowToComment(row: CommentRow): Comment {
  const userName = row.user_name || `User ${row.user_id.slice(0, 8)}`;
  const userEmail = row.user_email || '';

  return {
    id: row.id,
    sitemapId: row.sitemap_id,
    userId: row.user_id,
    userName,
    userEmail,
    x: row.x,
    y: row.y,
    text: row.text,
    resolved: row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Create a new comment
export async function createComment(sitemapId: string, x: number, y: number, text: string): Promise<Comment> {
  // Get user info (try Supabase, fallback to localStorage/anonymous)
  let userId = 'anonymous';
  let userEmail = '';
  let userName = 'Anonymous User';
  
  if (supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email || '';
        userName = user.user_metadata?.name || user.email?.split('@')[0] || `User ${user.id.slice(0, 8)}`;
      } else {
        // No authenticated user - use anonymous ID
        // Generate a consistent anonymous ID for this browser session
        let anonymousId = localStorage.getItem('anonymous_user_id');
        if (!anonymousId) {
          anonymousId = `anon-${crypto.randomUUID()}`;
          localStorage.setItem('anonymous_user_id', anonymousId);
        }
        userId = anonymousId;
        userName = 'Anonymous User';
      }
    } catch (err) {
      // Fallback to localStorage user or anonymous
      const localUser = localStorage.getItem('localUser');
      if (localUser) {
        const user = JSON.parse(localUser);
        userId = user.id || 'local-user';
        userEmail = user.email || '';
        userName = user.name || 'Local User';
      } else {
        // Generate consistent anonymous ID
        let anonymousId = localStorage.getItem('anonymous_user_id');
        if (!anonymousId) {
          anonymousId = `anon-${crypto.randomUUID()}`;
          localStorage.setItem('anonymous_user_id', anonymousId);
        }
        userId = anonymousId;
      }
    }
  } else {
    // No Supabase - use localStorage or anonymous
    const localUser = localStorage.getItem('localUser');
    if (localUser) {
      const user = JSON.parse(localUser);
      userId = user.id || 'local-user';
      userEmail = user.email || '';
      userName = user.name || 'Local User';
    } else {
      // Generate consistent anonymous ID
      let anonymousId = localStorage.getItem('anonymous_user_id');
      if (!anonymousId) {
        anonymousId = `anon-${crypto.randomUUID()}`;
        localStorage.setItem('anonymous_user_id', anonymousId);
      }
      userId = anonymousId;
    }
  }

  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const newComment: Comment = {
    id: commentId,
    sitemapId,
    userId,
    userName,
    userEmail,
    x,
    y,
    text: text.trim(),
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };

  // Try Supabase first if available
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          id: commentId,
          sitemap_id: sitemapId,
          user_id: userId,
          user_name: userName,
          user_email: userEmail,
          x,
          y,
          text: text.trim(),
          resolved: false,
        })
        .select()
        .single();

      if (!error && data) {
        return rowToComment(data);
      }
      
      // If error (e.g., table doesn't exist), fall through to localStorage
      console.warn('Failed to create comment in Supabase, using localStorage:', error?.message);
    } catch (err) {
      console.warn('Error creating comment in Supabase, using localStorage:', err);
    }
  }

  // Fallback to localStorage (always succeeds, even if storage fails)
  try {
    const storageKey = `comments_${sitemapId}`;
    const existingComments = JSON.parse(localStorage.getItem(storageKey) || '[]') as Comment[];
    const updatedComments = [newComment, ...existingComments];
    localStorage.setItem(storageKey, JSON.stringify(updatedComments));
  } catch (err) {
    // If localStorage fails (e.g., quota exceeded), still return the comment
    // The comment will exist in memory and can be saved later
    console.warn('Failed to persist comment to localStorage, comment exists in memory only:', err);
  }
  
  // Always return the comment, even if persistence failed
  return newComment;
}

// Get all comments for a sitemap
export async function getComments(sitemapId: string): Promise<Comment[]> {
  // Try Supabase FIRST (for shared sitemaps, this is the source of truth)
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('sitemap_id', sitemapId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Success - convert and return, also sync to localStorage
        const comments = (data || []).map(rowToComment);
        
        // Sync to localStorage for offline access
        try {
          const storageKey = `comments_${sitemapId}`;
          localStorage.setItem(storageKey, JSON.stringify(comments));
        } catch (err) {
          // Ignore localStorage sync errors
        }
        
        return comments;
      }
      
      // If error, log but continue to localStorage fallback
      console.warn('Error loading comments from Supabase:', error?.message);
    } catch (err) {
      console.warn('Failed to load comments from Supabase:', err);
    }
  }
  
  // Fallback to localStorage (only if Supabase fails or not available)
  try {
    const storageKey = `comments_${sitemapId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    // Ignore localStorage errors
  }
  
  return [];
}

// Update comment text
export async function updateComment(commentId: string, text: string, sitemapId?: string): Promise<Comment> {
  // Try Supabase first if available
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .update({
          text: text.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .select()
        .single();

      if (!error && data) {
        return rowToComment(data);
      }
      
      // If error (e.g., table doesn't exist), fall through to localStorage
      console.warn('Failed to update comment in Supabase, using localStorage:', error?.message);
    } catch (err) {
      console.warn('Error updating comment in Supabase, using localStorage:', err);
    }
  }

  // Fallback to localStorage
  if (!sitemapId) {
    throw new Error('sitemapId is required when Supabase is not available');
  }

  try {
    const storageKey = `comments_${sitemapId}`;
    const comments = JSON.parse(localStorage.getItem(storageKey) || '[]') as Comment[];
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    comment.text = text.trim();
    comment.updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify(comments));
    return comment;
  } catch (err) {
    console.error('Failed to update comment in localStorage:', err);
    throw new Error('Failed to update comment');
  }
}

// Update comment position
export async function updateCommentPosition(commentId: string, x: number, y: number, sitemapId?: string): Promise<Comment> {
  // Try Supabase first if available
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .update({
          x,
          y,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .select()
        .single();

      if (!error && data) {
        return rowToComment(data);
      }
      
      // If error (e.g., table doesn't exist), fall through to localStorage
      console.warn('Failed to update comment position in Supabase, using localStorage:', error?.message);
    } catch (err) {
      console.warn('Error updating comment position in Supabase, using localStorage:', err);
    }
  }

  // Fallback to localStorage
  if (!sitemapId) {
    throw new Error('sitemapId is required when Supabase is not available');
  }

  try {
    const storageKey = `comments_${sitemapId}`;
    const comments = JSON.parse(localStorage.getItem(storageKey) || '[]') as Comment[];
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    comment.x = x;
    comment.y = y;
    comment.updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify(comments));
    return comment;
  } catch (err) {
    console.error('Failed to update comment position in localStorage:', err);
    throw new Error('Failed to update comment position');
  }
}

// Resolve/unresolve a comment
export async function resolveComment(commentId: string, resolved: boolean, sitemapId?: string): Promise<Comment> {
  // Try Supabase first if available
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .update({
          resolved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', commentId)
        .select()
        .single();

      if (!error && data) {
        return rowToComment(data);
      }
      
      // If error (e.g., table doesn't exist), fall through to localStorage
      console.warn('Failed to resolve comment in Supabase, using localStorage:', error?.message);
    } catch (err) {
      console.warn('Error resolving comment in Supabase, using localStorage:', err);
    }
  }

  // Fallback to localStorage
  if (!sitemapId) {
    throw new Error('sitemapId is required when Supabase is not available');
  }

  try {
    const storageKey = `comments_${sitemapId}`;
    const comments = JSON.parse(localStorage.getItem(storageKey) || '[]') as Comment[];
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    comment.resolved = resolved;
    comment.updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify(comments));
    return comment;
  } catch (err) {
    console.error('Failed to resolve comment in localStorage:', err);
    throw new Error('Failed to resolve comment');
  }
}

// Delete a comment
export async function deleteComment(commentId: string, sitemapId?: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      throw new Error(`Failed to delete comment: ${error.message}`);
    }
    
    return; // Success - exit early
  }

  // Fallback to localStorage if Supabase is not available
  if (!sitemapId) {
    throw new Error('sitemapId is required when Supabase is not available');
  }

  const storageKey = `comments_${sitemapId}`;
  const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const filtered = comments.filter((c: Comment) => c.id !== commentId);
  localStorage.setItem(storageKey, JSON.stringify(filtered));
  
  // Note: State update is handled by App.tsx
}

// Subscribe to real-time comment changes
export function subscribeToComments(
  sitemapId: string,
  callback: (comment: Comment, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
): RealtimeChannel | null {
  if (!supabase) {
    return null;
  }

  try {
    const channel = supabase
      .channel(`comments:${sitemapId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `sitemap_id=eq.${sitemapId}`,
        },
        async (payload) => {
          try {
            if (payload.eventType === 'DELETE') {
              // For deletes, we only have the old record
              const oldRecord = payload.old as CommentRow;
              callback(rowToComment(oldRecord), 'DELETE');
            } else {
              // For INSERT and UPDATE, convert the new record
              const newRecord = payload.new as CommentRow;
              callback(rowToComment(newRecord), payload.eventType as 'INSERT' | 'UPDATE');
            }
          } catch (error) {
            console.error('Error processing real-time comment update:', error);
          }
        }
      )
      .subscribe();

    return channel;
  } catch (error) {
    // If subscription fails (e.g., table doesn't exist), return null
    console.warn('Failed to subscribe to comments (table may not exist):', error);
    return null;
  }
}

