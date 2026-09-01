/**
 * The single Supabase client used by the whole backend.
 *
 * Created once at module load and reused everywhere. Creating a new client per
 * request would leak connections and slow every response down.
 *
 * This client holds the service_role key, so it bypasses Row Level Security and
 * can touch every row in the database. That is intentional for a trusted server,
 * and it is exactly why this file must never be imported into frontend code and
 * why the key never leaves .env.
 */

import { createClient } from '@supabase/supabase-js';
import config from './env.js';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      // This is a server. There is no browser session to persist and no token
      // to refresh in the background — turning these off avoids stray timers.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'techstore-backend' },
    },
    db: { schema: 'public' },
  }
);

/**
 * Confirms the database is reachable before the server starts accepting
 * traffic. Better to fail fast at boot than to serve errors to customers.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function verifySupabaseConnection() {
  try {
    const { error } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default supabase;
