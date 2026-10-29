import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const TARGET_SAMPLE_RATE = 16000;
const MAX_CHUNK_SECONDS = 28;
const SILENCE_THRESHOLD = 0.015;      // was 0.01 — less noise sensitivity
const MIN_SILENCE_MS = 1500;          // was 800 — wait for real pauses
const TRAILING_SILENCE_MS = 400;      // keep some tail audio after last speech
const MIN_CHUNK_MS = 1500;            // reject tiny clips (< 1.5s of speech)

export function useChunkedTranscription(meetingCode: string) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pcmBufferRef = useRef<Float32Array[]>([]);
  const currentBufferLengthRef = useRef(0);
  const silenceDurationRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const speechDurationRef = useRef(0);       // total ms of actual speech
  const trailingMsRef = useRef(0);           // ms since last speech sample
  const tailAfterSilenceRef = useRef<Float32Array[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      await ctx.audioWorklet.addModule('/worklets/pcm-processor.js');

      const source = ctx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');

      workletNode.port.onmessage = (e) => {
        const float32Data = e.data as Float32Array;
        processAudio(float32Data, ctx.sampleRate);
      };

      source.connect(workletNode);
      workletNode.connect(ctx.destination);

      setIsRecording(true);
      resetBuffer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mic access failed');
    }
  }, [meetingCode]);

  const stopRecording = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    const sr = audioContextRef.current?.sampleRate || 48000;
    audioContextRef.current?.close();
    setIsRecording(false);
    if (hasSpokenRef.current && currentBufferLengthRef.current > 0) {
      flushChunk(sr);
    }
  }, [meetingCode]);

  function resetBuffer() {
    pcmBufferRef.current = [];
    tailAfterSilenceRef.current = [];
    currentBufferLengthRef.current = 0;
    silenceDurationRef.current = 0;
    speechDurationRef.current = 0;
    trailingMsRef.current = 0;
    hasSpokenRef.current = false;
  }

  function processAudio(data: Float32Array, sampleRate: number) {
    // RMS volume
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const msThisBuffer = (data.length / sampleRate) * 1000;

    if (rms > SILENCE_THRESHOLD) {
      hasSpokenRef.current = true;
      silenceDurationRef.current = 0;
      trailingMsRef.current = 0;
      speechDurationRef.current += msThisBuffer;

      // If we had been trailing, absorb the tail into main buffer
      if (tailAfterSilenceRef.current.length > 0) {
        for (const t of tailAfterSilenceRef.current) {
          pcmBufferRef.current.push(t);
          currentBufferLengthRef.current += t.length;
        }
        tailAfterSilenceRef.current = [];
      }

      pcmBufferRef.current.push(new Float32Array(data));
      currentBufferLengthRef.current += data.length;
    } else if (hasSpokenRef.current) {
      silenceDurationRef.current += msThisBuffer;
      trailingMsRef.current += msThisBuffer;
      tailAfterSilenceRef.current.push(new Float32Array(data));

      // Cap the tail buffer so it doesn't grow indefinitely
      if (trailingMsRef.current > TRAILING_SILENCE_MS) {
        tailAfterSilenceRef.current.shift();
      }
    }

    const maxLength = MAX_CHUNK_SECONDS * sampleRate;
    const speechMs = (currentBufferLengthRef.current / sampleRate) * 1000;

    if (
      currentBufferLengthRef.current >= maxLength ||
      (silenceDurationRef.current >= MIN_SILENCE_MS && speechMs >= MIN_CHUNK_MS)
    ) {
      flushChunk(sampleRate);
    }
  }

  async function flushChunk(sourceSampleRate: number) {
    const chunks = pcmBufferRef.current;
    const totalLength = currentBufferLengthRef.current;
    const speechMs = (totalLength / sourceSampleRate) * 1000;

    if (speechMs < MIN_CHUNK_MS) {
      resetBuffer();
      return;
    }

    const flat = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      flat.set(chunk, offset);
      offset += chunk.length;
    }
    resetBuffer();

    const resampled = await resampleAudio(flat, sourceSampleRate, TARGET_SAMPLE_RATE);
    const wavBlob = encodeWav(resampled, TARGET_SAMPLE_RATE);
    await sendToApi(wavBlob);
  }

  async function sendToApi(wavBlob: Blob) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const formData = new FormData();
      formData.append('meeting_code', meetingCode);
      formData.append('audio', wavBlob, 'chunk.wav');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Transcribe failed:', res.status, body);
      }
    } catch (err) {
      console.error('Network error during transcribe:', err);
    }
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return { isRecording, startRecording, stopRecording, error };
}

async function resampleAudio(audioData: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate) return audioData;
  const offlineCtx = new OfflineAudioContext(1, audioData.length * (toRate / fromRate), toRate);
  const buffer = offlineCtx.createBuffer(1, audioData.length, fromRate);
  buffer.copyToChannel(audioData as any, 0);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampledBuffer = await offlineCtx.startRendering();
  return resampledBuffer.getChannelData(0);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}