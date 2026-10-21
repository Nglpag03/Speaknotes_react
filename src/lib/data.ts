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

export async function requestSummary(code: string): Promise<{ created: boolean; minutes: Minutes }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not signed in');
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ meeting_code: code }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `summarize failed (${res.status})`);
  return body as { created: boolean; minutes: Minutes };
}