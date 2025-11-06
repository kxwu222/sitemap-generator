import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug logging (remove after fixing)
console.log('Supabase Config Check:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'missing',
  keyValue: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'missing'
});

// Helper function to validate if a URL is valid
function isValidUrl(url: string | undefined): boolean {
  if (!url) {
    console.log('isValidUrl: URL is missing');
    return false;
  }
  // Check if it's a placeholder value
  if (url === 'your-project-url' || url.includes('your-project')) {
    console.log('isValidUrl: URL is placeholder');
    return false;
  }
  try {
    const parsed = new URL(url);
    const isValid = ['http:', 'https:'].includes(parsed.protocol);
    console.log('isValidUrl:', isValid, url);
    return isValid;
  } catch (e) {
    console.log('isValidUrl: URL parse error', e);
    return false;
  }
}

// Create Supabase client only if credentials are provided and valid
export const supabase: SupabaseClient | null = 
  (isValidUrl(supabaseUrl) && supabaseAnonKey && supabaseAnonKey !== 'your-anon-key')
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

console.log('Supabase client created:', !!supabase);

