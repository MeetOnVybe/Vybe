"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, UserRound, UsersRound, Zap } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useVybeStore } from "@/store/useVybeStore";

export function FindingScreen({ group = false }: { group?: boolean }) {
  const ageBracket = useVybeStore((state) => state.ageBracket);
  const interests = useVybeStore((state) => state.interests);
  const animations = useVybeStore((state) => state.settings.animationsEnabled);
  const cardCount = group ? 4 : 3;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-14 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,124,255,.15),transparent_34%)]" />
      <div className="relative mb-10 h-52 w-72 sm:w-96">
        {Array.from({ length: cardCount }, (_, index) => {
          const positions = group
            ? ["left-4 top-9 -rotate-6", "right-4 top-9 rotate-6", "left-[29%] bottom-0 -rotate-2", "right-[29%] bottom-0 rotate-2"]
            : ["left-5 top-10 -rotate-6", "right-5 top-10 rotate-6", "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"];
          const Icon = group ? UsersRound : UserRound;
          return (
            <motion.div key={index} className={`absolute ${positions[index]} grid h-28 w-24 place-items-center overflow-hidden rounded-[22px] border border-blue-400/15 bg-[radial-gradient(circle_at_50%_25%,rgba(100,169,250,.22),transparent_50%),#09111e] shadow-2xl`} animate={animations ? { y: [0, index % 2 ? -8 : 8, 0], opacity: [.55, 1, .55], scale: [.96, 1.03, .96] } : { opacity: .85 }} transition={{ duration: 2.8 + index * .3, repeat: Infinity, ease: "easeInOut", delay: index * .18 }}>
              <Icon size={30} className="text-blue-300/65" />
              <div className="absolute inset-x-3 bottom-3 h-2 rounded-full bg-blue-400/15" />
            </motion.div>
          );
        })}
        {[0, 1, 2].map((index) => <motion.span key={index} className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/35" initial={{ scale: .6, opacity: .7 }} animate={animations ? { scale: 2.15, opacity: 0 } : { scale: 1.25, opacity: .15 }} transition={{ duration: 2.2, repeat: Infinity, delay: index * .62, ease: "easeOut" }} />)}
        <motion.div animate={animations ? { rotate: [0, 4, -4, 0], scale: [1, 1.04, 1] } : undefined} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-[#050b14] p-2 shadow-[0_0_70px_rgba(0,126,255,.48)]"><Logo compact /></motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative"><div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-blue-200"><Zap size={13} className="fill-blue-300" /> Live matching</div><h1 className="text-3xl font-black tracking-[-.04em] sm:text-5xl">Finding your <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-blue-500 bg-clip-text text-transparent">VYBE...</span></h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-400 sm:text-base">Checking authenticated {group ? "members and active rooms" : "members"} in your {ageBracket} bracket against your safety and preference rules.</p></motion.div>
      <div className="relative mt-8 flex max-w-xl flex-wrap items-center justify-center gap-2">{interests.slice(0, 4).map((interest, index) => <motion.span key={interest} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 + index * .08 }} className="rounded-full border border-white/8 bg-white/[.035] px-3 py-1.5 text-xs font-bold text-slate-300">{interest}</motion.span>)}</div>
      <div className="relative mt-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500"><ShieldCheck size={14} className="text-blue-400" /> Age bracket protected <Sparkles size={12} className="text-blue-500" /> No exact location shared</div>
    </div>
  );
}
