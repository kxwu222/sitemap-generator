import { SitemapData } from '../types/sitemap';
import { Comment, SharePermission } from '../types/comments';

// JSONBin.io API configuration
const JSONBIN_API_URL = 'https://api.jsonbin.io/v3';
const JSONBIN_MASTER_KEY = import.meta.env.VITE_JSONBIN_MASTER_KEY || ''; // Optional: for private bins
const JSONBIN_ACCESS_KEY = import.meta.env.VITE_JSONBIN_ACCESS_KEY || ''; // Optional: for read access

// Shared data structure stored in JSONBin.io
interface SharedSitemapData {
  sitemap: SitemapData;
  comments: Comment[];
  permission: SharePermission;
  createdAt: string;
  lastUpdated: string;
}

// Create a new bin with sitemap and comments
export async function createSharedBin(
  sitemap: SitemapData,
  permission: SharePermission,
  comments: Comment[] = []
): Promise<string> {
  const sharedData: SharedSitemapData = {
    sitemap,
    comments,
    permission,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // If master key is provided, use it for private bins
    // Otherwise, create public bin
    if (JSONBIN_MASTER_KEY) {
      headers['X-Master-Key'] = JSONBIN_MASTER_KEY;
      headers['X-Bin-Private'] = 'true';
    }

    const response = await fetch(`${JSONBIN_API_URL}/b`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sharedData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create bin: ${response.status} ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const binId = data.metadata?.id;

    if (!binId) {
      throw new Error('No bin ID returned from JSONBin.io');
    }

    console.log('Created JSONBin.io bin:', binId);
    return binId;
  } catch (error) {
    console.error('Error creating JSONBin.io bin:', error);
    throw error;
  }
}

// Get bin data by ID
export async function getSharedBin(binId: string): Promise<SharedSitemapData | null> {
  try {
    const headers: HeadersInit = {};

    // Use access key if provided, otherwise try public access
    if (JSONBIN_ACCESS_KEY) {
      headers['X-Access-Key'] = JSONBIN_ACCESS_KEY;
    } else if (JSONBIN_MASTER_KEY) {
      headers['X-Master-Key'] = JSONBIN_MASTER_KEY;
    }

    const response = await fetch(`${JSONBIN_API_URL}/b/${binId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get bin: ${response.status} ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    return data.record as SharedSitemapData;
  } catch (error) {
    console.error('Error getting JSONBin.io bin:', error);
    throw error;
  }
}

// Update bin with new data
export async function updateSharedBin(
  binId: string,
  updates: Partial<SharedSitemapData>
): Promise<void> {
  try {
    // First get current data
    const currentData = await getSharedBin(binId);
    if (!currentData) {
      throw new Error('Bin not found');
    }

    // Merge updates
    const updatedData: SharedSitemapData = {
      ...currentData,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Use master key if available, otherwise try public update (may fail)
    if (JSONBIN_MASTER_KEY) {
      headers['X-Master-Key'] = JSONBIN_MASTER_KEY;
    }

    const response = await fetch(`${JSONBIN_API_URL}/b/${binId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updatedData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to update bin: ${response.status} ${errorData.message || response.statusText}`);
    }

    console.log('Updated JSONBin.io bin:', binId);
  } catch (error) {
    console.error('Error updating JSONBin.io bin:', error);
    throw error;
  }
}

// Update only comments in a bin
export async function updateBinComments(binId: string, comments: Comment[]): Promise<void> {
  const currentData = await getSharedBin(binId);
  if (!currentData) {
    throw new Error('Bin not found');
  }

  await updateSharedBin(binId, { comments });
}

// Check if JSONBin.io is configured
export function isJsonBinConfigured(): boolean {
  // Works with or without API keys (public bins)
  return true;
}

// Check if a token looks like a JSONBin.io bin ID
// JSONBin.io bin IDs are typically 24-character alphanumeric strings
// UUIDs are 36 characters with hyphens (e.g., "e6536394-1e48-4f01-b229-e1f71756f1ac")
export function isJsonBinId(token: string | null | undefined): boolean {
  if (!token) return false;
  // JSONBin.io bin IDs are typically 20-24 alphanumeric characters, no hyphens
  // UUIDs have hyphens and are 36 characters
  // Check: if it has hyphens, it's a UUID; if it's alphanumeric and 20-24 chars, likely a bin ID
  if (token.includes('-')) return false; // UUIDs have hyphens
  if (token.length < 20 || token.length > 24) return false; // Bin IDs are typically 20-24 chars
  // Check if it's alphanumeric
  return /^[a-zA-Z0-9]+$/.test(token);
}

