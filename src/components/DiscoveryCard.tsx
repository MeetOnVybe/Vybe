"use client";

import Link from "next/link";
import { motion, type PanInfo } from "framer-motion";
import { Eye, Heart, RotateCcw, UsersRound, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { PublicProfile } from "@/types";

export function DiscoveryCard({ user, onDecision, onUndo, canUndo = false }: { user: PublicProfile; onDecision: (decision: "like" | "pass") => void; onUndo: () => void; canUndo?: boolean }) {
  const decideFromDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 110 || info.velocity.x > 650) onDecision("like");
    if (info.offset.x < -110 || info.velocity.x < -650) onDecision("pass");
  };

  return (
    <motion.article
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.68}
      onDragEnd={decideFromDrag}
      whileDrag={{ rotate: 2, scale: 1.015 }}
      initial={{ opacity: 0, y: 22, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 180, rotate: 8, scale: .96 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="vybe-card relative mx-auto w-full max-w-xl overflow-hidden rounded-[34px] touch-pan-y"
      aria-label={`Discovery profile for ${user.displayName}`}
    >
      <div className="relative h-44 overflow-hidden sm:h-52" style={{ backgroundImage: `url(${user.banner})`, backgroundPosition: "center", backgroundSize: "cover" }}>
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--panel-strong)] via-transparent to-transparent" />
        <span className="absolute right-4 top-4 rounded-full border border-blue-300/25 bg-blue-600/85 px-3 py-1.5 text-[10px] font-black tracking-[.12em] text-white shadow-lg backdrop-blur">{user.compatibilityScore ?? 50}% VYBE</span>
      </div>
      <div className="relative px-5 pb-6 sm:px-7 sm:pb-7">
        <div className="-mt-12 flex items-end gap-4">
          <div className="rounded-[30px] border-4 border-[var(--panel-strong)]"><Avatar user={user} size="xl" /></div>
          <div className="min-w-0 flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-black tracking-tight">{user.displayName}</h2><span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black text-blue-500">AGES {user.ageBracket}</span></div>
            <p className="truncate text-sm font-bold text-blue-500">@{user.username}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${user.online ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.65)]" : "bg-slate-400"}`} />
          <span>{user.lastSeen}</span>
          {(user.mutualFriendsCount || 0) > 0 && <><span>•</span><span className="inline-flex items-center gap-1"><UsersRound size={13} /> {user.mutualFriendsCount} mutual</span></>}
        </div>
        <p className="mt-4 text-sm font-bold text-blue-500">{user.status}</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">{user.bio}</p>
        <div className="mt-5 flex flex-wrap gap-2">{user.interests.map((interest) => <span key={interest} className="rounded-full border border-blue-400/18 bg-blue-500/[.07] px-3 py-1.5 text-xs font-bold text-blue-500">{interest}</span>)}</div>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button onClick={() => onDecision("pass")} className="vybe-button inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/[.07] font-black text-red-400 hover:bg-red-500/12" aria-label={`Pass on ${user.displayName}`}><X size={21} /> Pass</button>
          <Link href={`/profile/${user.id}`} className="vybe-button grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[.035] text-slate-400 hover:border-blue-400/30 hover:text-blue-500" aria-label={`View ${user.displayName}'s profile`}><Eye size={20} /></Link>
          <button onClick={() => onDecision("like")} className="vybe-button inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 font-black text-white shadow-[0_0_30px_rgba(22,134,255,.28)] hover:bg-blue-500" aria-label={`Like ${user.displayName}`}><Heart size={21} fill="currentColor" /> Like</button>
        </div>
        <button onClick={onUndo} disabled={!canUndo} className="vybe-button mx-auto mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-white/5 hover:text-blue-500 disabled:opacity-35" aria-label="Undo most recent pass"><RotateCcw size={14} /> Undo recent pass</button>
        <p className="mt-2 text-center text-[10px] text-slate-600">Swipe left to pass, right to like. Keyboard: ← / →.</p>
      </div>
    </motion.article>
  );
}
