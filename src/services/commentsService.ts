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
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User must be authenticated to create comments');
  }

  const commentId = crypto.randomUUID();
  const userEmail = user.email || '';
  const userName = user.user_metadata?.name || user.email?.split('@')[0] || `User ${user.id.slice(0, 8)}`;

  const { data, error } = await supabase
    .from('comments')
    .insert({
      id: commentId,
      sitemap_id: sitemapId,
      user_id: user.id,
      user_name: userName,
      user_email: userEmail,
      x,
      y,
      text: text.trim(),
      resolved: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    throw new Error(`Failed to create comment: ${error.message}`);
  }

  return rowToComment(data);
}

// Get all comments for a sitemap
export async function getComments(sitemapId: string): Promise<Comment[]> {
  // Try localStorage first (works without Supabase)
  try {
    const storageKey = `comments_${sitemapId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    // Ignore localStorage errors
  }

  // Try Supabase if available
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('sitemap_id', sitemapId)
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist or other error, fall back to localStorage
        console.warn('Error loading comments from Supabase, using localStorage:', error.message);
        const storageKey = `comments_${sitemapId}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          return JSON.parse(stored);
        }
        return [];
      }

      // Convert all rows to comments
      return (data || []).map(rowToComment);
    } catch (err) {
      // Catch any unexpected errors (e.g., table doesn't exist)
      console.warn('Failed to load comments from Supabase, using localStorage:', err);
      const storageKey = `comments_${sitemapId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    }
  }

  return [];
}

// Update comment text
export async function updateComment(commentId: string, text: string, _sitemapId?: string): Promise<Comment> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase
    .from('comments')
    .update({
      text: text.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', commentId)
    .select()
    .single();

  if (error) {
    console.error('Error updating comment:', error);
    throw new Error(`Failed to update comment: ${error.message}`);
  }

  return rowToComment(data);
}

// Update comment position
export async function updateCommentPosition(commentId: string, x: number, y: number, _sitemapId?: string): Promise<Comment> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

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

  if (error) {
    console.error('Error updating comment position:', error);
    throw new Error(`Failed to update comment position: ${error.message}`);
  }

  return rowToComment(data);
}

// Resolve/unresolve a comment
export async function resolveComment(commentId: string, resolved: boolean, _sitemapId?: string): Promise<Comment> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase
    .from('comments')
    .update({
      resolved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commentId)
    .select()
    .single();

  if (error) {
    console.error('Error resolving comment:', error);
    throw new Error(`Failed to resolve comment: ${error.message}`);
  }

  return rowToComment(data);
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

