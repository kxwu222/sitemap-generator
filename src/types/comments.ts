export interface Comment {
  id: string;
  sitemapId: string;
  userId: string;
  userName: string;
  userEmail: string;
  x: number;
  y: number;
  text: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  commentCount: number;
  hasUnresolved: boolean;
}

export type ShareMode = 'owner' | 'viewer';
export type SharePermission = 'view' | 'edit';

