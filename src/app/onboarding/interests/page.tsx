"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { INTERESTS } from "@/lib/profile-options";
import { useVybeStore } from "@/store/useVybeStore";

export default function InterestSetupPage() {
  const router = useRouter();
  const selected = useVybeStore((s) => s.interests);
  const toggle = useVybeStore((s) => s.toggleInterest);
  const complete = useVybeStore((s) => s.completeInterests);
  const [saving, setSaving] = useState(false);
  const proceed = async () => { setSaving(true); await complete(); setSaving(false); router.push("/home"); };
  return (
    <main className="relative grid min-h-screen place-items-center bg-[#05070c] px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,110,255,.19),transparent_34%)]" />
      <div className="relative w-full max-w-3xl">
        <div className="text-center"><Logo /><p className="mt-8 text-xs font-black uppercase tracking-[.2em] text-blue-400">Step 2 of 2</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">What are you into?</h1><p className="mt-3 text-sm text-slate-400">Shared interests shape your profile now and future age-safe matchmaking later.</p></div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {INTERESTS.map((interest) => { const active = selected.includes(interest); return <button key={interest} onClick={() => toggle(interest)} className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition ${active ? "border-blue-400/60 bg-blue-500/15 text-blue-100" : "border-white/10 bg-white/[.035] text-slate-400 hover:text-white"}`}>{active && <Check size={16} />}{interest}</button>; })}
        </div>
        <button disabled={saving} onClick={() => void proceed()} className="vybe-button mx-auto mt-9 flex items-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 font-black hover:bg-blue-500 disabled:opacity-60">{saving ? "Saving…" : "Enter VYBE"} <ArrowRight size={18} /></button>
      </div>
    </main>
  );
}
