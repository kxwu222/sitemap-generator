import { supabase } from '../lib/supabase';
import { SitemapData } from '../types/sitemap';
import { Figure } from '../types/drawables';
import { FreeLine } from '../types/drawables';

// Database schema type for sitemaps table
interface SitemapRow {
  id: string;
  name: string;
  data: {
    nodes: any[];
    extraLinks: Array<{ sourceId: string; targetId: string }>;
    linkStyles: Record<string, any>;
    colorOverrides: Record<string, { customColor?: string; textColor?: string }>;
    urls: string[];
    figures?: Figure[];
    freeLines?: FreeLine[];
    selectionGroups?: any[];
  };
  last_modified: number;
  created_at: number;
  user_id?: string;
}

// Convert SitemapData to database format
function sitemapToRow(sitemap: SitemapData, figures?: Figure[], freeLines?: FreeLine[]): Omit<SitemapRow, 'user_id'> {
  return {
    id: sitemap.id,
    name: sitemap.name,
    data: {
      nodes: sitemap.nodes,
      extraLinks: sitemap.extraLinks,
      linkStyles: sitemap.linkStyles,
      colorOverrides: sitemap.colorOverrides,
      urls: sitemap.urls,
      figures: figures || [],
      freeLines: freeLines || [],
      selectionGroups: sitemap.selectionGroups || [],
    },
    last_modified: sitemap.lastModified,
    created_at: sitemap.createdAt,
  };
}

// Convert database row to SitemapData
function rowToSitemap(row: SitemapRow): SitemapData {
  return {
    id: row.id,
    name: row.name,
    nodes: row.data.nodes,
    extraLinks: row.data.extraLinks || [],
    linkStyles: row.data.linkStyles || {},
    colorOverrides: row.data.colorOverrides || {},
    urls: row.data.urls || [],
    selectionGroups: row.data.selectionGroups || [],
    lastModified: row.last_modified,
    createdAt: row.created_at,
  };
}

// Get figures and freeLines from row
export function getFiguresAndFreeLines(row: SitemapRow): { figures: Figure[]; freeLines: FreeLine[] } {
  return {
    figures: row.data.figures || [],
    freeLines: row.data.freeLines || [],
  };
}

// Save a sitemap to Supabase
export async function saveSitemap(
  sitemap: SitemapData,
  figures?: Figure[],
  freeLines?: FreeLine[]
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const row = sitemapToRow(sitemap, figures, freeLines);
  const rowWithUserId: SitemapRow = {
    ...row,
    user_id: userId || undefined,
  };
  
  const { error } = await supabase
    .from('sitemaps')
    .upsert(rowWithUserId, { onConflict: 'id' });

  if (error) {
    console.error('Error saving sitemap:', error);
    throw new Error(`Failed to save sitemap: ${error.message}`);
  }
}

// Load all sitemaps for the current user
export async function loadSitemaps(): Promise<SitemapData[]> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  let query = supabase
    .from('sitemaps')
    .select('*');

  // Filter by user_id if logged in, otherwise only show sitemaps without user_id (local/anonymous)
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.is('user_id', null);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading sitemaps:', error);
    throw new Error(`Failed to load sitemaps: ${error.message}`);
  }

  return (data || []).map(rowToSitemap);
}

// Delete a sitemap
export async function deleteSitemap(sitemapId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || null;

  let query = supabase
    .from('sitemaps')
    .delete()
    .eq('id', sitemapId);

  // Filter by user_id if logged in, otherwise only delete sitemaps without user_id (local/anonymous)
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.is('user_id', null);
  }

  const { error } = await query;

  if (error) {
    console.error('Error deleting sitemap:', error);
    throw new Error(`Failed to delete sitemap: ${error.message}`);
  }
}

// Load a single sitemap with figures and freeLines
export async function loadSitemapWithDrawables(
  sitemapId: string
): Promise<{ sitemap: SitemapData; figures: Figure[]; freeLines: FreeLine[] }> {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  const { data, error } = await supabase
    .from('sitemaps')
    .select('*')
    .eq('id', sitemapId)
    .single();

  if (error) {
    console.error('Error loading sitemap:', error);
    throw new Error(`Failed to load sitemap: ${error.message}`);
  }

  const sitemap = rowToSitemap(data);
  const { figures, freeLines } = getFiguresAndFreeLines(data);

  return { sitemap, figures, freeLines };
}

