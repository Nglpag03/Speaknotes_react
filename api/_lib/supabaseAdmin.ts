import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`missing env: ${name}`);
  return value;
}

/** Client bound to the caller's JWT — RLS applies. Use for auth/membership checks. */
export function supabaseAsUser(accessToken: string) {
  return createClient(
    requireEnv('SUPABASE_URL', url),
    requireEnv('SUPABASE_ANON_KEY', anonKey),
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    },
  );
}

/** Service-role client — bypasses RLS. Use only for writes the API must do. */
export function supabaseAdmin() {
  return createClient(
    requireEnv('SUPABASE_URL', url),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', serviceKey),
    { auth: { persistSession: false } },
  );
}

export function bearerToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const raw = req.headers['authorization'] ?? req.headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token.length > 0 ? token : null;
}