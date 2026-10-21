import { GoogleGenAI } from '@google/genai';
import { bearerToken, supabaseAsUser, supabaseAdmin } from './_lib/supabaseAdmin.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const MINUTES_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          task: { type: 'string' },
          due: { type: 'string' },
        },
        required: ['owner', 'task'],
      },
    },
    attendees: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'decisions', 'action_items', 'attendees'],
} as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const token = bearerToken(req.headers);
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const meetingCode = (req.body as { meeting_code?: string } | undefined)?.meeting_code;
  if (!meetingCode) return res.status(400).json({ error: 'meeting_code required' });

  // 1. Host check via caller's JWT
  const user = supabaseAsUser(token);
  const { data: meeting, error: mErr } = await user
    .from('meetings')
    .select('id, host_id, status, title')
    .eq('id', meetingCode)
    .maybeSingle();
  if (mErr || !meeting) return res.status(404).json({ error: 'meeting not found' });
  const { data: { user: authUser } } = await user.auth.getUser();
  if (!authUser || meeting.host_id !== authUser.id) return res.status(403).json({ error: 'host only' });

  // 2. Idempotency: return existing minutes if already generated
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from('minutes')
    .select('meeting_id, content, model, created_at')
    .eq('meeting_id', meetingCode)
    .maybeSingle();
  if (existing) return res.status(200).json({ created: false, minutes: existing });

  // 3. Read transcript (RLS: host-only)
  const { data: rows, error: tErr } = await user
    .from('transcripts')
    .select('full_name, content, created_at')
    .eq('meeting_id', meetingCode)
    .order('created_at', { ascending: true });
  if (tErr) return res.status(500).json({ error: 'transcript read failed', detail: tErr.message });
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'no transcript to summarize' });

  const transcript = rows.map((r) => `[${r.full_name}] ${r.content}`).join('\n');

  // 4. Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  if (!geminiKey) return res.status(500).json({ error: 'server missing GEMINI_API_KEY' });

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const prompt =
    `You are writing meeting minutes. The transcript below is a face-to-face meeting. ` +
    `Names in brackets are speakers. Produce concise, factual minutes in JSON matching the schema. ` +
    `Do not invent attendees or decisions not supported by the transcript.\n\n` +
    `Meeting title: ${meeting.title ?? '(untitled)'}\n\nTranscript:\n${transcript}`;

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: MINUTES_SCHEMA as unknown as Record<string, unknown>,
    },
  });

  const raw = response.text;
  if (!raw) return res.status(502).json({ error: 'gemini returned empty' });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return res.status(502).json({ error: 'gemini returned invalid JSON', raw });
  }

  // 5. Upsert minutes via service role (host-only read is enforced by RLS)
  const { error: upErr } = await admin
    .from('minutes')
    .upsert({ meeting_id: meetingCode, content: parsed, model: geminiModel }, { onConflict: 'meeting_id' });
  if (upErr) return res.status(500).json({ error: 'minutes write failed', detail: upErr.message });

  const { data: saved } = await admin
    .from('minutes')
    .select('meeting_id, content, model, created_at')
    .eq('meeting_id', meetingCode)
    .maybeSingle();

  return res.status(200).json({ created: true, minutes: saved });
}