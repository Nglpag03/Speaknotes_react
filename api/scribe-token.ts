import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests (or GET, depending on your preference, but POST is more secure)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'server missing ELEVENLABS_API_KEY' });
  }

  try {
    // Call ElevenLabs token endpoint (token type is realtime_scribe) [citation:7]
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('ElevenLabs token error:', detail);
      return res.status(response.status).json({ error: 'failed to create token', detail });
    }

    const data = await response.json();
    // Return the token to the frontend (valid for 15 minutes) [citation:9][citation:12]
    return res.status(200).json({ token: data.token });
  } catch (err) {
    console.error('Token fetch error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
}