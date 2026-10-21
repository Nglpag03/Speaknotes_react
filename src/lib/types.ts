export type MeetingStatus = 'active' | 'ended';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  host_id: string;
  title: string | null;
  status: MeetingStatus;
  created_at: string;
  ended_at: string | null;
}

export interface Participant {
  meeting_id: string;
  user_id: string;
  full_name: string;
  email: string;
  joined_at: string;
  kicked_at: string | null;
}

export interface TranscriptRow {
  id: number;
  meeting_id: string;
  user_id: string;
  full_name: string;
  content: string;
  created_at: string;
}

export interface MinutesContent {
  title: string;
  summary: string;
  decisions: string[];
  action_items: { owner: string; task: string; due?: string }[];
  attendees: string[];
}

export interface Minutes {
  meeting_id: string;
  content: MinutesContent;
  model: string | null;
  created_at: string;
}