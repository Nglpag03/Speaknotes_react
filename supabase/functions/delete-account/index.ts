// supabase/functions/delete-account/index.ts
// Deleting an auth user needs the service-role key, which must never ship to the browser.
// Deploy:  supabase functions deploy delete-account
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  // Identify the caller from their own token, so nobody can delete someone else.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not signed in.' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true })
})