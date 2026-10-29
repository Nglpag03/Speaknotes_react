import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function createRoomChannel(meetingCode: string): RealtimeChannel {
  return supabase.channel(`room:${meetingCode}`, {
    config: { presence: { key: 'user' } },
  });
}

export function createHostChannel(meetingCode: string): RealtimeChannel {
  return supabase.channel(`host:${meetingCode}`);
}