"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useVybeStore } from "@/store/useVybeStore";
import type { AgeBracket } from "@/types";

export default function AgeSetupPage() {
  const router = useRouter();
  const selected = useVybeStore((state) => state.ageBracket);
  const setAge = useVybeStore((state) => state.setAgeBracket);
  const dataMode = useVybeStore((state) => state.dataMode);
  const cloudLoading = useVybeStore((state) => state.cloudLoading);
  const cloudError = useVybeStore((state) => state.cloudError);
  const options: { value: AgeBracket; title: string; description: string }[] = [
    { value: "13-15", title: "Ages 13–15", description: "VYBE keeps this bracket separate from older teen accounts." },
    { value: "16-17", title: "Ages 16–17", description: "VYBE keeps this bracket separate from younger teen accounts." },
  ];
  return <main className="relative grid min-h-screen place-items-center bg-[#05070c] px-4 py-10 text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,110,255,.19),transparent_34%)]" /><div className="relative w-full max-w-2xl"><div className="text-center"><Logo /><p className="mt-8 text-xs font-black uppercase tracking-[.2em] text-blue-400">Step 1 of 2</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Your age bracket</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">{dataMode === "supabase" ? "Your bracket is calculated from your date of birth by Postgres. The browser cannot override it." : "VYBE never matches across age brackets. Demo mode lets you preview either bracket."}</p></div>{cloudError && dataMode === "supabase" && <p className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/8 p-4 text-center text-sm text-red-200">{cloudError}</p>}<div className="mt-8 grid gap-4 sm:grid-cols-2">{options.map((option) => <button key={option.value} disabled={dataMode === "supabase"} onClick={() => setAge(option.value)} className={`rounded-[26px] border p-6 text-left transition ${selected === option.value ? "border-blue-400/70 bg-blue-500/13 shadow-[0_0_35px_rgba(0,102,255,.18)]" : "border-white/8 bg-white/[.03]"} ${dataMode === "supabase" ? "cursor-default opacity-80" : "hover:border-white/15"}`}><ShieldCheck className={selected === option.value ? "text-blue-300" : "text-slate-500"} /><h2 className="mt-5 text-xl font-black">{option.title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{option.description}</p>{selected === option.value && dataMode === "supabase" && <p className="mt-4 flex items-center gap-2 text-xs font-black text-blue-300"><Database size={14} /> Database verified bracket</p>}</button>)}</div><button disabled={cloudLoading || Boolean(cloudError && dataMode === "supabase")} onClick={() => router.push("/onboarding/interests")} className="vybe-button mx-auto mt-8 flex items-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 font-black hover:bg-blue-500 disabled:opacity-50">Choose interests <ArrowRight size={18} /></button></div></main>;
}
