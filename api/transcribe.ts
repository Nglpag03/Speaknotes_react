import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bearerToken, supabaseAsUser, supabaseAdmin } from './_lib/supabaseAdmin.js';

export const config = { api: { bodyParser: false } };

// Whisper hallucination filter. Whisper invents these on silence/noise.
const HALLUCINATIONS = [
  /thank you for watching/i,
  /subtitles by/i,
  /amara\.org/i,
  /transcribed by/i,
  /please subscribe/i,
  /^\s*$/,
];

function isHallucination(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return true;
  return HALLUCINATIONS.some((re) => re.test(t));
}

async function readBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Minimal multipart parser: extracts "meeting_code" and "audio" from the body. */
function parseMultipart(body: Buffer, boundary: string) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts: { name: string; filename?: string; contentType?: string; data: Buffer }[] = [];
  let start = body.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = body.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    const section = body.subarray(start + boundaryBuf.length, next);
    // section starts with \r\n, ends with \r\n
    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const rawHeaders = section.subarray(0, headerEnd).toString('utf8');
      const data = section.subarray(headerEnd + 4, section.length - 2);
      const nameMatch = /name="([^"]+)"/.exec(rawHeaders);
      const filenameMatch = /filename="([^"]*)"/.exec(rawHeaders);
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders);
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch?.[1],
          contentType: typeMatch?.[1]?.trim(),
          data,
        });
      }
    }
    start = next;
  }
  return parts;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // 1. Auth
  const token = bearerToken(req.headers);
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  // 2. Parse multipart
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) return res.status(400).json({ error: 'expected multipart/form-data' });
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const body = await readBody(req);
  const parts = parseMultipart(body, boundary);
  const meetingCode = parts.find((p) => p.name === 'meeting_code')?.data.toString('utf8').trim();
  const audio = parts.find((p) => p.name === 'audio');
  if (!meetingCode || !audio) return res.status(400).json({ error: 'meeting_code and audio required' });

  // 3. Membership check via the caller's JWT (RLS applies)
  const user = supabaseAsUser(token);
  const { data: member, error: memberErr } = await user
    .from('participants')
    .select('user_id')
    .eq('meeting_id', meetingCode)
    .eq('user_id', (await user.auth.getUser()).data.user?.id ?? '')
    .is('kicked_at', null)
    .maybeSingle();
  if (memberErr || !member) return res.status(403).json({ error: 'not a participant' });

  // 4. Call Groq
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL || 'whisper-large-v3-turbo';
  if (!groqKey) return res.status(500).json({ error: 'server missing GROQ_API_KEY' });

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio.data.buffer as ArrayBuffer, audio.data.byteOffset, audio.data.byteLength)], { type: audio.contentType ?? 'audio/wav' }), audio.filename ?? 'clip.wav');
  form.append('model', groqModel);
  form.append('response_format', 'json');
  if (process.env.TRANSCRIBE_LANGUAGE) form.append('language', process.env.TRANSCRIBE_LANGUAGE);
  if (process.env.TRANSCRIBE_PROMPT) form.append('prompt', process.env.TRANSCRIBE_PROMPT);

  const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });
  if (!groqRes.ok) {
    const detail = await groqRes.text();
    return res.status(502).json({ error: 'groq failed', detail });
  }
  const groqJson = (await groqRes.json()) as { text?: string };
  const text = groqJson.text?.trim() ?? '';

  // 5. Filter + insert as the caller (trigger sets user_id/full_name)
  if (!text || isHallucination(text)) {
    return res.status(200).json({ inserted: false, reason: 'empty or hallucination' });
  }

  const { error: insertErr } = await supabaseAsUser(token)
    .from('transcripts')
    .insert({ meeting_id: meetingCode, content: text });
  if (insertErr) return res.status(500).json({ error: 'insert failed', detail: insertErr.message });

  return res.status(200).json({ inserted: true, text });
}