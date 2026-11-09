import { supabase } from './supabase';
import type { Meeting, Minutes, Participant, TranscriptRow } from './types';

export async function createMeeting(title?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_meeting', {
    p_title: title ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function joinMeeting(code: string, fullName: string): Promise<Meeting> {
  const { data, error } = await supabase.rpc('join_meeting', {
    p_code: code,
    p_full_name: fullName,
  });
  if (error) throw error;
  return data as Meeting;
}

export async function endMeeting(code: string): Promise<void> {
  const { error } = await supabase.rpc('end_meeting', { p_code: code });
  if (error) throw error;
}

export async function kickParticipant(code: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_participant', { p_code: code, p_user_id: userId });
  if (error) throw error;
}

export async function getMeeting(code: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('id, host_id, title, status, created_at, ended_at')
    .eq('id', code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyMeetings(): Promise<Meeting[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('meetings')
    .select('id, host_id, title, status, created_at, ended_at')
    .eq('host_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listParticipants(code: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participants')
    .select('meeting_id, user_id, full_name, email, joined_at, kicked_at')
    .eq('meeting_id', code)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listTranscripts(code: string): Promise<TranscriptRow[]> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('id, meeting_id, user_id, full_name, content, created_at')
    .eq('meeting_id', code)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getMinutes(code: string): Promise<Minutes | null> {
  const { data, error } = await supabase
    .from('minutes')
    .select('meeting_id, content, model, created_at')
    .eq('meeting_id', code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function requestSummary(code: string, venue: string = 'N/A'): Promise<{ created: boolean; minutes: Minutes }> {
  // 1. Fetch transcripts
  const { data: transcripts, error: txError } = await supabase
    .from('transcripts')
    .select('full_name, content')
    .eq('meeting_id', code)
    .order('created_at', { ascending: true });

  if (txError) throw txError;
  if (!transcripts || transcripts.length === 0) {
    throw new Error('No transcripts available for this meeting. Speak first!');
  }

  // 2. Fetch meeting for real times and participants
  const [{ data: meeting }, { data: participants }] = await Promise.all([
    supabase.from('meetings').select('created_at, ended_at').eq('id', code).single(),
    supabase.from('participants').select('full_name').eq('meeting_id', code)
  ]);

  // Format the date directly in JS so the AI doesn't mess it up
  const formattedDate = meeting?.created_at 
    ? new Date(meeting.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) 
    : 'N/A';

  const startTime = meeting?.created_at 
    ? new Date(meeting.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) 
    : 'N/A';
  
  const endTime = meeting?.ended_at 
    ? new Date(meeting.ended_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) 
    : 'N/A';

  // Format participants
  const presentList = participants?.map(p => p.full_name).filter(Boolean) || [];

  const transcriptText = transcripts
    .map((t) => `${t.full_name ?? 'Guest'}: ${t.content}`)
    .join('\n');

  const prompt = `You are a meeting notes assistant. Analyze the transcript and return ONLY valid JSON.
You MUST use the exact values provided for "date", "venue", "time_started", and "time_ended". Do not change them.

{
  "title": "Minutes of the Meeting",
  "date": "${formattedDate}",
  "venue": "${venue.trim() || 'N/A'}",
  "time_started": "${startTime}",
  "time_ended": "${endTime}",
  "agenda": ["Topic 1"],
  "present": ${JSON.stringify(presentList)},
  "table_data": [
    { "agenda_no": "Preliminaries", "activities": "Prayer", "raised_by": "AVP", "action": "" },
    { "agenda_no": "1", "activities": "Discussion topic", "raised_by": "Name", "action": "Agreed action" }
  ],
  "summary": "Short summary"
}

Transcript:
${transcriptText}`;

  let content;

  // --- ATTEMPT 1: GEMINI ---
  try {
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const geminiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';
    if (!geminiKey) throw new Error('No Gemini key');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      }
    );

    if (!geminiRes.ok) throw new Error(`Gemini status: ${geminiRes.status}`);
    
    const geminiData = await geminiRes.json();
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Gemini empty response');
    
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    content = JSON.parse(rawText);
    console.log("✅ Used Gemini successfully");

  } catch (geminiError) {
    // --- ATTEMPT 2: GROQ FALLBACK ---
    console.warn("Gemini failed, falling back to Groq...", geminiError);
    
    const groqKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!groqKey) throw new Error('Gemini failed and no Groq key available.');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API Error:", errText);
      throw new Error("Both Gemini and Groq failed.");
    }

    const groqData = await groqRes.json();
    let rawText = groqData.choices[0].message.content;
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    content = JSON.parse(rawText);
    console.log("✅ Used Groq fallback successfully");
  }

  // 3. Save to Supabase (same as before)
  const { data: minutes, error: saveError } = await supabase
    .from('minutes')
    .upsert({
      meeting_id: code,
      content,
      model: 'gemini-or-groq',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (saveError) {
    console.error("🚨 SUPABASE SAVE ERROR:", saveError);
    throw new Error(saveError.message);
  }

  return { created: true, minutes };
}
export async function listJoinedMeetings(): Promise<Meeting[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // We use a join to get the meeting details from the participants table
  const { data, error } = await supabase
    .from('participants')
    .select(`
      meeting_id,
      meetings (
        id,
        host_id,
        title,
        status,
        created_at,
        ended_at
      )
    `)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  if (error) throw error;

  // Flatten the data so it returns a clean array of Meeting objects
  return data
    .map((row: any) => row.meetings)
    .filter((m: any) => m !== null) as Meeting[];
}