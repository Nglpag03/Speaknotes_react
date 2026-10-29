import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { bearerToken, supabaseAsUser, supabaseAdmin } from './_lib/supabaseAdmin.js';

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

// Helper to send JSON without Express helpers
function sendJson(res: VercelResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });

  const token = bearerToken(req.headers);
  if (!token) return sendJson(res, 401, { error: 'unauthorized' });

  // Parse body manually since we disabled helpers/bodyParser
  let bodyData: { meeting_code?: string } = {};
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) bodyData = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON body' });
  }

  const meetingCode = bodyData.meeting_code;
  if (!meetingCode) return sendJson(res, 400, { error: 'meeting_code required' });

  // 1. Host check via caller's JWT
  const user = supabaseAsUser(token);
  const { data: { user: authUser } } = await user.auth.getUser();
  if (!authUser) return sendJson(res, 401, { error: 'invalid token' });

  const { data: meeting, error: mErr } = await user
    .from('meetings')
    .select('id, host_id, status, title')
    .eq('id', meetingCode)
    .maybeSingle();
    
  if (mErr || !meeting) return sendJson(res, 404, { error: 'meeting not found' });
  if (meeting.host_id !== authUser.id) return sendJson(res, 403, { error: 'host only' });

  // 2. Idempotency: return existing minutes if already generated
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from('minutes')
    .select('meeting_id, content, model, created_at')
    .eq('meeting_id', meetingCode)
    .maybeSingle();
    
  if (existing) return sendJson(res, 200, { created: false, minutes: existing });

  // 3. Read transcript (RLS: host-only)
  const { data: rows, error: tErr } = await user
    .from('transcripts')
    .select('full_name, content, created_at')
    .eq('meeting_id', meetingCode)
    .order('created_at', { ascending: true });
    
  if (tErr) return sendJson(res, 500, { error: 'transcript read failed', detail: tErr.message });
  if (!rows || rows.length === 0) return sendJson(res, 400, { error: 'no transcript to summarize' });

  const transcript = rows.map((r) => `[${r.full_name}] ${r.content}`).join('\n');

  // 4. Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  if (!geminiKey) return sendJson(res, 500, { error: 'server missing GEMINI_API_KEY' });

  try {
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
    if (!raw) return sendJson(res, 502, { error: 'gemini returned empty' });

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return sendJson(res, 502, { error: 'gemini returned invalid JSON', raw });
    }

    // 5. Upsert minutes via service role
    const { error: upErr } = await admin
      .from('minutes')
      .upsert({ meeting_id: meetingCode, content: parsed, model: geminiModel }, { onConflict: 'meeting_id' });
      
    if (upErr) return sendJson(res, 500, { error: 'minutes write failed', detail: upErr.message });

    const { data: saved } = await admin
      .from('minutes')
      .select('meeting_id, content, model, created_at')
      .eq('meeting_id', meetingCode)
      .maybeSingle();

    return sendJson(res, 200, { created: true, minutes: saved });
  } catch (err: any) {
    console.error('Gemini error:', err);
    return sendJson(res, 500, { error: 'Gemini API failed', detail: err.message || String(err) });
  }
}