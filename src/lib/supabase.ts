import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Helper function to validate if a URL is valid
function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  // Check if it's a placeholder value
  if (url === 'your-project-url' || url.includes('your-project')) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Create Supabase client only if credentials are provided and valid
// This allows the app to work without Supabase (using localStorage fallback)
export const supabase: SupabaseClient | null = 
  (isValidUrl(supabaseUrl) && supabaseAnonKey && supabaseAnonKey !== 'your-anon-key')
    ? (() => {
        console.log('[Supabase] Creating client:', {
          url: supabaseUrl,
          hasKey: !!supabaseAnonKey,
          keyLength: supabaseAnonKey?.length || 0,
        });
        const client = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: {
              'apikey': supabaseAnonKey,
            },
          },
        });
        console.log('[Supabase] Client created successfully');
        return client;
      })()
    : (() => {
        console.warn('[Supabase] Client NOT created:', {
          url: supabaseUrl,
          hasKey: !!supabaseAnonKey,
          isValidUrl: isValidUrl(supabaseUrl),
        });
        return null;
      })();

