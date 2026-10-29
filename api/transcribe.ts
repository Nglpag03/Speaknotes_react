import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { bearerToken, supabaseAsUser, supabaseAdmin } from './_lib/supabaseAdmin.js';

export const config = {
  api: { bodyParser: false },
};

const HALLUCINATIONS = [
  /^(thank you( for watching)?|thanks for watching)\.?$/i,
  /subtitles? by/i,
  /amara\.org/i,
  /transcribed by/i,
  /please subscribe/i,
  /^\s*[\.\,]+\s*$/,
];

function isHallucination(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length < 3) return true;
  return HALLUCINATIONS.some((re) => re.test(t));
}

function parseForm(req: VercelRequest): Promise<{ meetingCode: string; audio: { data: Buffer; contentType: string } }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const busboy = Busboy({ headers: req.headers });
      let meetingCode = '';
      let audioData: Buffer | null = null;
      let audioType = 'audio/wav';

      busboy.on('field', (name, val) => { if (name === 'meeting_code') meetingCode = val; });
      busboy.on('file', (name, file, info) => {
        if (name === 'audio') {
          audioType = info.mimeType;
          const fileChunks: Buffer[] = [];
          file.on('data', (chunk: Buffer) => fileChunks.push(chunk));
          file.on('end', () => { audioData = Buffer.concat(fileChunks); });
        } else { file.resume(); }
      });
      busboy.on('finish', () => {
        if (!meetingCode || !audioData) reject(new Error('meeting_code and audio required'));
        else resolve({ meetingCode, audio: { data: audioData, contentType: audioType } });
      });
      busboy.on('error', reject);
      busboy.end(body);
    });
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const token = bearerToken(req.headers);
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  let formData;
  try { formData = await parseForm(req); }
  catch (err) { return res.status(400).json({ error: err instanceof Error ? err.message : 'bad form data' }); }

  const { meetingCode, audio } = formData;

  const user = supabaseAsUser(token);
  const { data: { user: authUser } } = await user.auth.getUser();
  if (!authUser) return res.status(401).json({ error: 'invalid token' });

  const { data: member, error: memberErr } = await user
    .from('participants').select('user_id').eq('meeting_id', meetingCode)
    .eq('user_id', authUser.id).is('kicked_at', null).maybeSingle();
  if (memberErr || !member) return res.status(403).json({ error: 'not a participant' });

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) return res.status(500).json({ error: 'server missing ELEVENLABS_API_KEY' });

  // Build ElevenLabs request
  const form = new FormData();
  const audioBytes = new Uint8Array(audio.data.buffer, audio.data.byteOffset, audio.data.byteLength);
  form.append('file', new Blob([audioBytes as any], { type: audio.contentType }), 'chunk.wav');
  form.append('model_id', 'scribe_v2');
  
  // Append keyterms individually (just like the working curl)
  const keyterms = ['pero', 'kasi', 'yung', 'mga', 'hindi', 'oo', 'salamat'];
  for (const term of keyterms) {
    form.append('keyterms', term);
  }

  const elevenRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': elevenKey },
    body: form,
  });

  if (!elevenRes.ok) {
    const detail = await elevenRes.text();
    console.error('ElevenLabs error:', detail);
    return res.status(502).json({ error: 'elevenlabs failed', detail });
  }

  const elevenJson = (await elevenRes.json()) as { text?: string };
  const text = elevenJson.text?.trim() ?? '';

  if (!text || isHallucination(text)) {
    return res.status(200).json({ inserted: false, reason: 'empty or hallucination' });
  }

  const admin = supabaseAdmin();
  const { error: insertErr } = await admin.from('transcripts').insert({
    meeting_id: meetingCode, user_id: authUser.id,
    full_name: authUser.email ?? 'Unknown', content: text,
  });
  if (insertErr) return res.status(500).json({ error: 'insert failed', detail: insertErr.message });

  return res.status(200).json({ inserted: true, text });
}