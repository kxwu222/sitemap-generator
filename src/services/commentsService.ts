import { supabase } from '../lib/supabase';
import { Comment } from '../types/comments';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getSharedBin, updateBinComments, isJsonBinConfigured } from './jsonbinService';
import { getShareToken } from './sharingService';

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

// Helper: Sync comments to JSONBin.io if sitemap is shared
async function syncCommentsToJsonBin(sitemapId: string, comments: Comment[]): Promise<void> {
  if (!isJsonBinConfigured()) return;
  
  try {
    const shareToken = await getShareToken(sitemapId);
    if (shareToken) {
      await updateBinComments(shareToken, comments);
      console.log('Synced comments to JSONBin.io:', { sitemapId, shareToken, commentCount: comments.length });
    }
  } catch (error) {
    console.warn('Failed to sync comments to JSONBin.io:', error);
    // Don't throw - this is a sync operation, not critical
  }
}

// Create a new comment
export async function createComment(sitemapId: string, x: number, y: number, text: string): Promise<Comment> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured()) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        // Get current comments from bin
        const sharedData = await getSharedBin(shareToken);
        if (sharedData) {
          // Get user info (try Supabase, fallback to localStorage)
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
              }
            } catch (e) {
              // Fallback to localStorage user
              const localUser = localStorage.getItem('localUser');
              if (localUser) {
                const user = JSON.parse(localUser);
                userId = user.id || 'local-user';
                userEmail = user.email || '';
                userName = user.name || 'Local User';
              }
            }
          } else {
            // Use localStorage user
            const localUser = localStorage.getItem('localUser');
            if (localUser) {
              const user = JSON.parse(localUser);
              userId = user.id || 'local-user';
              userEmail = user.email || '';
              userName = user.name || 'Local User';
            }
          }

          const commentId = crypto.randomUUID();
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Add to comments array and update bin
          const updatedComments = [newComment, ...sharedData.comments];
          await updateBinComments(shareToken, updatedComments);
          
          console.log('Created comment via JSONBin.io:', newComment);
          return newComment;
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment creation failed, falling back to Supabase:', jsonbinError);
      // Fall through to Supabase
    }
  }

  // Fallback to Supabase
  if (!supabase) {
    throw new Error('Supabase client not initialized and JSONBin.io not available');
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

  const comment = rowToComment(data);
  
  // Sync to JSONBin.io if sitemap is shared
  try {
    const allComments = await getComments(sitemapId);
    await syncCommentsToJsonBin(sitemapId, allComments);
  } catch (e) {
    // Non-critical
  }

  return comment;
}

// Get all comments for a sitemap
export async function getComments(sitemapId: string): Promise<Comment[]> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured()) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        const sharedData = await getSharedBin(shareToken);
        if (sharedData && sharedData.comments) {
          console.log('Loaded comments from JSONBin.io:', { sitemapId, shareToken, count: sharedData.comments.length });
          return sharedData.comments;
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment loading failed, falling back to Supabase:', jsonbinError);
      // Fall through to Supabase
    }
  }

  // Fallback to Supabase
  if (!supabase) {
    // Try localStorage fallback
    const storageKey = `comments_${sitemapId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  }

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('sitemap_id', sitemapId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading comments:', error);
    throw new Error(`Failed to load comments: ${error.message}`);
  }

  // Convert all rows to comments
  return (data || []).map(rowToComment);
}

// Update comment text
export async function updateComment(commentId: string, text: string, sitemapId?: string): Promise<Comment> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured() && sitemapId) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        const sharedData = await getSharedBin(shareToken);
        if (sharedData) {
          const updatedComments = sharedData.comments.map(c =>
            c.id === commentId
              ? { ...c, text: text.trim(), updatedAt: new Date().toISOString() }
              : c
          );
          await updateBinComments(shareToken, updatedComments);
          const updated = updatedComments.find(c => c.id === commentId);
          if (updated) {
            console.log('Updated comment via JSONBin.io:', updated);
            return updated;
          }
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment update failed, falling back to Supabase:', jsonbinError);
    }
  }

  // Fallback to Supabase
  if (!supabase) {
    throw new Error('Supabase client not initialized and JSONBin.io not available');
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

  const comment = rowToComment(data);
  
  // Sync to JSONBin.io if sitemap is shared
  if (sitemapId) {
    try {
      const allComments = await getComments(sitemapId);
      await syncCommentsToJsonBin(sitemapId, allComments);
    } catch (e) {
      // Non-critical
    }
  }

  return comment;
}

// Update comment position
export async function updateCommentPosition(commentId: string, x: number, y: number, sitemapId?: string): Promise<Comment> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured() && sitemapId) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        const sharedData = await getSharedBin(shareToken);
        if (sharedData) {
          const updatedComments = sharedData.comments.map(c =>
            c.id === commentId
              ? { ...c, x, y, updatedAt: new Date().toISOString() }
              : c
          );
          await updateBinComments(shareToken, updatedComments);
          const updated = updatedComments.find(c => c.id === commentId);
          if (updated) {
            console.log('Updated comment position via JSONBin.io:', updated);
            return updated;
          }
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment position update failed, falling back to Supabase:', jsonbinError);
    }
  }

  // Fallback to Supabase
  if (!supabase) {
    throw new Error('Supabase client not initialized and JSONBin.io not available');
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

  const comment = rowToComment(data);
  
  // Sync to JSONBin.io if sitemap is shared
  if (sitemapId) {
    try {
      const allComments = await getComments(sitemapId);
      await syncCommentsToJsonBin(sitemapId, allComments);
    } catch (e) {
      // Non-critical
    }
  }

  return comment;
}

// Resolve/unresolve a comment
export async function resolveComment(commentId: string, resolved: boolean, sitemapId?: string): Promise<Comment> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured() && sitemapId) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        const sharedData = await getSharedBin(shareToken);
        if (sharedData) {
          const updatedComments = sharedData.comments.map(c =>
            c.id === commentId
              ? { ...c, resolved, updatedAt: new Date().toISOString() }
              : c
          );
          await updateBinComments(shareToken, updatedComments);
          const updated = updatedComments.find(c => c.id === commentId);
          if (updated) {
            console.log('Resolved comment via JSONBin.io:', updated);
            return updated;
          }
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment resolve failed, falling back to Supabase:', jsonbinError);
    }
  }

  // Fallback to Supabase
  if (!supabase) {
    throw new Error('Supabase client not initialized and JSONBin.io not available');
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

  const comment = rowToComment(data);
  
  // Sync to JSONBin.io if sitemap is shared
  if (sitemapId) {
    try {
      const allComments = await getComments(sitemapId);
      await syncCommentsToJsonBin(sitemapId, allComments);
    } catch (e) {
      // Non-critical
    }
  }

  return comment;
}

// Delete a comment
export async function deleteComment(commentId: string, sitemapId?: string): Promise<void> {
  // Try JSONBin.io first if sitemap is shared
  if (isJsonBinConfigured() && sitemapId) {
    try {
      const shareToken = await getShareToken(sitemapId);
      if (shareToken) {
        const sharedData = await getSharedBin(shareToken);
        if (sharedData) {
          const updatedComments = sharedData.comments.filter(c => c.id !== commentId);
          await updateBinComments(shareToken, updatedComments);
          console.log('Deleted comment via JSONBin.io:', { commentId, sitemapId });
          return; // Success - exit early
        }
      }
    } catch (jsonbinError) {
      console.warn('JSONBin.io comment delete failed, falling back to Supabase:', jsonbinError);
    }
  }

  // Fallback to Supabase
  if (supabase) {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      throw new Error(`Failed to delete comment: ${error.message}`);
    }
    
    // Sync to JSONBin.io if sitemap is shared
    if (sitemapId) {
      try {
        const allComments = await getComments(sitemapId);
        await syncCommentsToJsonBin(sitemapId, allComments);
      } catch (e) {
        // Non-critical
      }
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
}

