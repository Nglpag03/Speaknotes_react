import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'method not allowed' }));
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'server missing ELEVENLABS_API_KEY' }));
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('ElevenLabs token error:', detail);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'failed to create token', detail }));
    }

    const data = await response.json();
    
    // Send successful response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ token: data.token }));
    
  } catch (err) {
    console.error('Token fetch error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'internal server error' }));
  }
}