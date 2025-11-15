import { PageNode } from '../utils/urlAnalyzer';
import { LinkStyle } from './linkStyle';

export interface SitemapData {
  id: string;
  name: string;
  nodes: PageNode[];
  extraLinks: Array<{ sourceId: string; targetId: string }>;
  linkStyles: Record<string, LinkStyle>;
  colorOverrides: Record<string, { customColor?: string; textColor?: string }>;
  urls: string[];
  selectionGroups?: SelectionGroup[];
  lastModified: number;
  createdAt: number;
  isShared?: boolean; // Marks if sitemap was received via share
  sharePermission?: 'view' | 'edit'; // Permission level for shared sitemaps
  originalSitemapId?: string; // Track which sitemap it was shared from
}

export interface SitemapState {
  sitemaps: SitemapData[];
  activeSitemapId: string | null;
}

export interface SelectionGroup {
  id: string;
  name: string;
  memberNodeIds: string[];
  memberFigureIds: string[];
}

