"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, MessageCircle, Sparkles, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { SimUser } from "@/types";

export function MatchCelebration({ user, onClose }: { user: SimUser | null; onClose: () => void }) {
  return <AnimatePresence>{user && <motion.div className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="New VYBE match">
    <motion.div initial={{ scale: .78, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .92, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }} className="vybe-card relative w-full max-w-md overflow-hidden rounded-[36px] p-7 text-center sm:p-9">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(28,134,255,.25),transparent_42%)]" />
      <button onClick={onClose} className="vybe-button absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5" aria-label="Close match screen"><X size={18} /></button>
      <div className="relative">
        <motion.div animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.12, 1] }} transition={{ duration: .8 }} className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-blue-600 text-white shadow-[0_0_35px_rgba(22,134,255,.45)]"><Heart size={27} fill="currentColor" /></motion.div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[.28em] text-blue-500">Mutual like</p>
        <h2 className="mt-2 text-4xl font-black tracking-[-.055em]">It’s a VYBE</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">You and <span className="font-black text-blue-500">@{user.username}</span> liked each other. Match chat is now unlocked.</p>
        <div className="mx-auto mt-7 w-fit rounded-[34px] border border-blue-400/25 bg-blue-500/8 p-2 shadow-[0_0_38px_rgba(22,134,255,.18)]"><Avatar user={user} size="2xl" /></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button onClick={onClose} className="vybe-button rounded-2xl border border-white/10 py-3.5 font-black text-slate-400 hover:bg-white/5">Keep discovering</button>
          <Link href={`/chat/${user.id}`} onClick={onClose} className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 font-black text-white hover:bg-blue-500"><MessageCircle size={18} /> Say hey</Link>
        </div>
        <p className="mt-4 inline-flex items-center gap-1 text-[10px] text-slate-600"><Sparkles size={12} /> VYBE scores are deterministic shared-interest estimates, not scientific compatibility.</p>
      </div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}
