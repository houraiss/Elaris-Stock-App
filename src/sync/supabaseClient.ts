import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isCloudConfigured = Boolean(url && anonKey);

// null when no project is configured — every sync entry point checks this
// first and no-ops, so the app stays fully functional offline (section 4).
export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: false } })
  : null;
