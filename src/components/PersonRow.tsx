"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PublicProfile } from "@/types";

export function PersonRow({ user, subtitle, meta, badge, action, menu }: { user: PublicProfile; subtitle?: string; meta?: ReactNode; badge?: number; action?: { label: string; href?: string; onClick?: () => void }; menu?: () => void }) {
  const actionClasses = "vybe-button shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-black text-white shadow-[0_0_20px_rgba(37,99,235,.15)] hover:bg-blue-500";
  return (
    <div className="group flex w-full min-w-0 items-center gap-3 rounded-[20px] border border-white/[.07] bg-white/[.025] p-3.5 transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/20 hover:bg-white/[.045]">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${user.id}`} className="truncate font-black tracking-tight hover:text-blue-300">{user.username}</Link>
          {user.online && <span className="hidden rounded-full bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300 sm:inline">online</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle ?? user.statusLine}</p>
        {meta && <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{meta}</p>}
      </div>
      {badge ? <span className="grid min-w-6 shrink-0 place-items-center rounded-full bg-blue-500 px-1.5 py-1 text-[10px] font-black shadow-[0_0_14px_rgba(37,99,235,.45)]">{badge}</span> : null}
      {action?.href ? <Link href={action.href} className={actionClasses}>{action.label}</Link> : action?.onClick ? <button onClick={action.onClick} className={actionClasses}>{action.label}</button> : <Link href={`/chat/${user.id}`} className="vybe-button grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500/20" aria-label={`Chat with ${user.username}`}><MessageCircle size={18} /></Link>}
      {menu && <button onClick={menu} className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-white" aria-label={`More options for ${user.username}`}><MoreHorizontal size={19} /></button>}
    </div>
  );
}
