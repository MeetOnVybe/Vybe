"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

function formatDuration(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function VoiceMessagePlayer({ src, duration = 0, waveform = [], mine = false }: { src: string; duration?: number; waveform?: number[]; mine?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = waveform.length ? waveform.slice(0, 36) : Array.from({ length: 28 }, (_, index) => 0.25 + ((index * 7) % 10) / 14);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const stop = () => { setPlaying(false); setProgress(0); };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("ended", stop);
    return () => { audio.removeEventListener("timeupdate", update); audio.removeEventListener("ended", stop); };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { await audio.play(); setPlaying(true); } else { audio.pause(); setPlaying(false); }
  };

  return (
    <div className="flex min-w-[220px] items-center gap-3" onContextMenu={(event) => event.preventDefault()}>
      <audio ref={audioRef} src={src} preload="metadata" controlsList="nodownload noplaybackrate" />
      <button type="button" onClick={() => void toggle()} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${mine ? "bg-white/18 text-white" : "bg-blue-500/15 text-blue-400"}`} aria-label={playing ? "Pause voice message" : "Play voice message"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <div className="min-w-0 flex-1">
        <div className="flex h-9 items-center gap-[2px]" aria-label="Voice message waveform">
          {bars.map((bar, index) => {
            const active = index / bars.length <= progress;
            return <span key={index} className={`w-1 rounded-full transition ${active ? (mine ? "bg-white" : "bg-blue-400") : (mine ? "bg-white/35" : "bg-slate-500/40")}`} style={{ height: `${Math.max(5, Math.round(bar * 28))}px` }} />;
          })}
        </div>
        <span className={`text-[10px] font-bold ${mine ? "text-blue-100/75" : "text-slate-500"}`}>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
