"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Compass, LoaderCircle, RotateCcw, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DiscoveryCard } from "@/components/DiscoveryCard";
import { MatchCelebration } from "@/components/MatchCelebration";
import { PageHeader } from "@/components/PageHeader";
import { INTERESTS } from "@/lib/profile-options";
import { useVybeStore } from "@/store/useVybeStore";
import type { DiscoverySort, Interest } from "@/types";

export default function DiscoverPage() {
  const people = useVybeStore((state) => state.people);
  const profiles = useVybeStore((state) => state.discoveryProfiles);
  const loading = useVybeStore((state) => state.discoveryLoading);
  const error = useVybeStore((state) => state.discoveryError);
  const filters = useVybeStore((state) => state.discoveryFilters);
  const lastPassedIds = useVybeStore((state) => state.lastPassedIds);
  const celebrationId = useVybeStore((state) => state.matchCelebrationUserId);
  const loadDiscovery = useVybeStore((state) => state.loadDiscovery);
  const setFilters = useVybeStore((state) => state.setDiscoveryFilters);
  const decide = useVybeStore((state) => state.decideProfile);
  const undo = useVybeStore((state) => state.undoPass);
  const closeCelebration = useVybeStore((state) => state.dismissMatchCelebration);
  const current = profiles[0];
  const celebrationUser = [...profiles, ...people].find((user) => user.id === celebrationId) || null;

  useEffect(() => { void loadDiscovery(); }, [loadDiscovery]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); void decide(current.id, "pass"); }
      if (event.key === "ArrowRight") { event.preventDefault(); void decide(current.id, "like"); }
      if (event.key.toLowerCase() === "u") { event.preventDefault(); void undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, decide, undo]);

  const toggleInterest = (interest: Interest) => setFilters({ interests: filters.interests.includes(interest) ? filters.interests.filter((item) => item !== interest) : [...filters.interests, interest] });

  return <AppShell>
    <PageHeader eyebrow="Same-bracket social discovery" title="Discover your next VYBE" description="Browse eligible real profiles. Blocks, visibility, decisions, and age isolation are enforced in Postgres and RLS." />

    <section className="vybe-card mb-5 rounded-[28px] p-4 sm:p-5">
      <div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-blue-400" /><h2 className="font-black">Discovery filters</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <select aria-label="Discovery sorting" className="vybe-input" value={filters.sort} onChange={(event) => setFilters({ sort: event.target.value as DiscoverySort })}><option value="random">Random</option><option value="compatibility">Highest compatibility</option><option value="new">New users</option></select>
        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.025] px-4 py-3 text-sm font-bold"><span>Online now</span><input aria-label="Online users only" type="checkbox" checked={filters.onlineOnly} onChange={(event) => setFilters({ onlineOnly: event.target.checked })} className="h-4 w-4 accent-blue-600" /></label>
        <button onClick={() => setFilters({ interests: [], onlineOnly: false, sort: "random" })} className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.025] px-4 py-3 text-sm font-black text-slate-400 hover:border-blue-400/25"><RotateCcw size={16} /> Reset filters</button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{INTERESTS.map((interest) => <button key={interest} onClick={() => toggleInterest(interest)} className={`vybe-button shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${filters.interests.includes(interest) ? "border-blue-400/40 bg-blue-500/12 text-blue-500" : "border-white/10 bg-white/[.025] text-slate-500"}`}>{interest}</button>)}</div>
    </section>

    <div className="relative min-h-[650px]">
      {loading && <div className="vybe-card mx-auto grid min-h-[560px] max-w-xl place-items-center rounded-[34px]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-blue-500" size={34} /><p className="mt-4 font-black">Loading eligible profiles</p><p className="mt-2 text-xs text-slate-500">Same age bracket. No exact location.</p></div></div>}
      {!loading && error && <div className="vybe-card mx-auto grid min-h-80 max-w-xl place-items-center rounded-[34px] p-8 text-center"><div><h2 className="text-xl font-black">Discovery unavailable</h2><p className="mt-2 text-sm text-slate-500">{error}</p><button onClick={() => void loadDiscovery()} className="vybe-button mt-5 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Try again</button></div></div>}
      {!loading && !error && current && <AnimatePresence mode="popLayout"><DiscoveryCard key={current.id} user={current} onDecision={(decision) => void decide(current.id, decision)} onUndo={() => void undo()} canUndo={lastPassedIds.length > 0} /></AnimatePresence>}
      {!loading && !error && !current && <div className="vybe-card mx-auto grid min-h-[460px] max-w-xl place-items-center rounded-[34px] p-8 text-center"><div><Compass className="mx-auto text-blue-500" size={38} /><h2 className="mt-5 text-2xl font-black">You’re caught up</h2><p className="mt-2 text-sm leading-6 text-slate-500">No more eligible profiles match these filters right now. Undo a recent pass, loosen a filter, or check again later.</p><div className="mt-5 flex justify-center gap-3"><button onClick={() => void undo()} className="vybe-button rounded-2xl border border-white/10 px-4 py-3 font-black text-slate-400">Undo pass</button><button onClick={() => setFilters({ interests: [], onlineOnly: false, sort: "random" })} className="vybe-button rounded-2xl bg-blue-600 px-4 py-3 font-black text-white">Reset filters</button></div></div></div>}
    </div>
    <MatchCelebration user={celebrationUser} onClose={closeCelebration} />
  </AppShell>;
}
