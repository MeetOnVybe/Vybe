"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Ban, Flag, Sparkles, UserCheck, UserPlus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PublicProfile } from "@/types";

export function matchPercent(userInterests: string[], otherInterests: string[]) {
  const shared = otherInterests.filter((item) => userInterests.includes(item)).length;
  return Math.min(98, 58 + shared * 10);
}

export function MatchPanel({
  user,
  self = false,
  cameraOff = false,
  interests = [],
  compact = false,
  onAdd,
  onReport,
  onBlock,
  friendStatus,
}: {
  user: PublicProfile;
  self?: boolean;
  cameraOff?: boolean;
  interests?: string[];
  compact?: boolean;
  onAdd?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
  friendStatus?: string;
}) {
  const score = matchPercent(interests, user.interests);
  const shared = user.interests.filter((interest) => interests.includes(interest));

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: .94, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: .96, y: -12, filter: "blur(7px)" }}
      transition={{ duration: .42, ease: [0.22, 1, 0.36, 1] }}
      whileHover={compact ? { y: -4 } : undefined}
      className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#08101b] shadow-[0_24px_80px_rgba(0,0,0,.42)] ${compact ? "min-h-[310px]" : "min-h-[55vh] sm:min-h-[66vh]"}`}
    >
      <div className="absolute inset-0">
        <Image src={user.avatar.image} alt={`${user.displayName} profile`} fill sizes={compact ? "(max-width: 640px) 100vw, 33vw" : "(max-width: 768px) 100vw, 50vw"} className={`object-cover transition duration-700 group-hover:scale-[1.025] ${cameraOff ? "opacity-10 blur-xl" : "opacity-95"}`} priority={!compact} />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(2,5,12,.98)_0%,rgba(3,8,17,.68)_36%,rgba(2,6,15,.08)_66%,rgba(1,4,10,.5)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(74,177,255,.17),transparent_24%)]" />
      <div className="absolute inset-0 opacity-[.09] [background-image:linear-gradient(rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:38px_38px]" />

      <div className="relative flex h-full min-h-[inherit] flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-black tracking-[.12em] backdrop-blur-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,.75)]" /> LIVE
          </div>
          {!self && (
            <motion.div initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: .25 }} className="flex items-center gap-1.5 rounded-full border border-blue-300/30 bg-blue-500/18 px-3 py-1.5 text-[10px] font-black tracking-wider text-blue-100 shadow-[0_0_22px_rgba(37,99,235,.22)] backdrop-blur-xl">
              <Sparkles size={12} /> {score}% VYBE MATCH
            </motion.div>
          )}
        </div>

        {cameraOff && (
          <div className="grid flex-1 place-items-center">
            <div className="text-center"><Avatar user={user} size="xl" showStatus={false} /><p className="mt-4 text-sm font-bold text-white/70">Camera preview is off</p></div>
          </div>
        )}

        <div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-300/85">{self ? "Your preview" : `${user.ageBracket} bracket`}</p>
              <h2 className={`${compact ? "text-xl" : "text-2xl sm:text-[2rem]"} mt-1 truncate font-black tracking-[-.035em]`}>{self ? user.displayName : user.username}</h2>
              {!self && <p className="mt-1 line-clamp-1 text-xs text-slate-300 sm:text-sm">{user.status}</p>}
            </div>
            {!self && !compact && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black tracking-wide ${user.online ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"}`}>{user.online ? "ONLINE" : "OFFLINE"}</span>}
          </div>

          {!self && <p className={`mt-2 text-xs leading-5 text-slate-400 ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{user.statusLine}</p>}
          {!self && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {user.interests.slice(0, compact ? 3 : 4).map((interest) => (
                <span key={interest} className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${shared.includes(interest) ? "border-blue-400/30 bg-blue-500/16 text-blue-100" : "border-white/10 bg-black/20 text-slate-300"}`}>{interest}</span>
              ))}
            </div>
          )}

          {!self && compact && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={onAdd} disabled={friendStatus === "pending" || friendStatus === "friends"} className="vybe-button grid place-items-center rounded-xl bg-blue-500/18 py-2.5 text-blue-200 disabled:opacity-50" title="Add friend" aria-label={`Add ${user.username} as friend`}>
                {friendStatus === "friends" ? <UserCheck size={17} /> : <UserPlus size={17} />}
              </button>
              <button onClick={onReport} className="vybe-button grid place-items-center rounded-xl bg-white/7 py-2.5 text-slate-300" title="Report" aria-label={`Report ${user.username}`}><Flag size={17} /></button>
              <button onClick={onBlock} className="vybe-button grid place-items-center rounded-xl bg-red-500/12 py-2.5 text-red-300" title="Block" aria-label={`Block ${user.username}`}><Ban size={17} /></button>
            </div>
          )}

          {!self && !compact && <Link href={`/profile/${user.id}`} className="mt-3 inline-flex text-[10px] font-black uppercase tracking-[.14em] text-blue-300/75 transition hover:text-blue-200">View profile →</Link>}
        </div>
      </div>
    </motion.article>
  );
}
