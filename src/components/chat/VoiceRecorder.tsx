"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Send, Trash2, X } from "lucide-react";

export interface VoiceDraft {
  blob: Blob;
  durationSeconds: number;
  waveform: number[];
  previewUrl: string;
  filename: string;
}

function formatDuration(value: number) {
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onSend, disabled = false }: { onSend: (draft: VoiceDraft) => Promise<void>; disabled?: boolean }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pointerStartRef = useRef<number | null>(null);
  const pointerStartedAtRef = useRef(0);
  const wasRecordingAtPointerDownRef = useRef(false);
  const suppressClickRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  };

  useEffect(() => () => { cleanupStream(); if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl); }, [draft?.previewUrl]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  const sampleWaveform = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const values = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(values);
    const average = values.reduce((sum, value) => sum + Math.abs(value - 128), 0) / values.length;
    samplesRef.current.push(Math.min(1, Math.max(.12, average / 34)));
    if (samplesRef.current.length > 72) samplesRef.current.shift();
    animationRef.current = requestAnimationFrame(sampleWaveform);
  };

  const start = async () => {
    if (disabled || recording || draft) return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      samplesRef.current = [];
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const durationSeconds = Math.max(1, (Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const previewUrl = URL.createObjectURL(blob);
        const extension = recorder.mimeType.includes("mp4") ? "m4a" : "webm";
        setDraft({ blob, durationSeconds, waveform: samplesRef.current.slice(0, 64), previewUrl, filename: `vybe-voice-${Date.now()}.${extension}` });
        void audioContext.close();
        cleanupStream();
      };
      recorder.start(250);
      setRecording(true);
      sampleWaveform();
    } catch {
      setError("Microphone access is needed only while recording a voice message.");
      cleanupStream();
    }
  };

  const stop = (cancel = false) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.onstop = cancel ? () => cleanupStream() : recorder.onstop;
    recorder.stop();
    setRecording(false);
    setCancelArmed(false);
    if (cancel) { setElapsed(0); chunksRef.current = []; samplesRef.current = []; }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = event.clientX;
    pointerStartedAtRef.current = Date.now();
    wasRecordingAtPointerDownRef.current = recording;
    suppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!recording) void start();
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerStartRef.current === null) return;
    setCancelArmed(pointerStartRef.current - event.clientX > 72);
  };
  const handlePointerUp = () => {
    const heldFor = Date.now() - pointerStartedAtRef.current;
    const wasAlreadyRecording = wasRecordingAtPointerDownRef.current;
    pointerStartRef.current = null;
    if (cancelArmed) stop(true);
    else if (wasAlreadyRecording || heldFor >= 350) stop(false);
    // A short first tap intentionally leaves recording active; tap again to stop.
  };

  const discard = () => {
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    setPlaying(false);
    setElapsed(0);
  };

  const send = async () => {
    if (!draft || sending) return;
    setSending(true);
    try { await onSend(draft); discard(); } finally { setSending(false); }
  };

  if (draft) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/[.07] p-2">
        <audio ref={audioRef} src={draft.previewUrl} onEnded={() => setPlaying(false)} controlsList="nodownload noplaybackrate" />
        <button type="button" onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) { void audio.play(); setPlaying(true); } else { audio.pause(); setPlaying(false); } }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white" aria-label={playing ? "Pause preview" : "Play preview"}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">{draft.waveform.slice(0, 42).map((bar, index) => <span key={index} className="w-1 shrink-0 rounded-full bg-blue-400" style={{ height: `${Math.max(4, bar * 25)}px` }} />)}</div>
        <span className="text-[10px] font-black text-slate-500">{formatDuration(draft.durationSeconds)}</span>
        <button type="button" onClick={discard} className="grid h-9 w-9 place-items-center rounded-xl text-red-400 hover:bg-red-500/10" aria-label="Discard voice message"><Trash2 size={16} /></button>
        <button type="button" disabled={sending} onClick={() => void send()} className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white hover:bg-blue-500" aria-label="Send voice message"><Send size={16} /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } if (recording) stop(false); else void start(); }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} className={`vybe-button grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition ${recording ? (cancelArmed ? "bg-red-500 text-white" : "bg-blue-600 text-white animate-pulse") : "border border-white/10 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400"}`} aria-label={recording ? "Stop recording voice message" : "Record voice message"}>{cancelArmed ? <X size={20} /> : <Mic size={20} />}</button>
      {recording && <div className={`absolute bottom-14 right-0 whitespace-nowrap rounded-full border px-3 py-2 text-[10px] font-black shadow-xl backdrop-blur-xl ${cancelArmed ? "border-red-400/25 bg-red-500/15 text-red-300" : "border-blue-400/20 bg-[var(--panel-strong)] text-blue-400"}`}>{cancelArmed ? "Release to cancel" : `${formatDuration(elapsed)} · slide left to cancel`}</div>}
      {error && <div className="absolute bottom-14 right-0 w-64 rounded-2xl border border-red-400/20 bg-[var(--panel-strong)] p-3 text-[10px] leading-4 text-red-300 shadow-xl">{error}</div>}
    </div>
  );
}
