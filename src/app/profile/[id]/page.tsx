"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Award, Ban, BookOpen, Flag, Gamepad2, GraduationCap, Headphones, Heart, MessageCircle, Palette, ShieldCheck, Sparkles, Trophy, UserCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { matchPercent } from "@/components/MatchPanel";
import { BlockModal, ReportModal } from "@/components/Modals";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

function ProfileFact({ icon: Icon, label, value }: { icon: typeof Headphones; label: string; value: string }) { return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4"><Icon size={18} className="text-blue-500" /><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>; }

export default function SimProfilePage() {
  const params = useParams<{ id: string }>();
  const dataMode = useVybeStore((state) => state.dataMode);
  const people = useVybeStore((state) => state.people);
  const user = (dataMode === "demo" ? SIM_USERS : people).find((item) => item.id === params.id);
  const interests = useVybeStore((state) => state.interests);
  const friendStatus = useVybeStore((state) => state.friendStatuses[params.id]);
  const matchStatus = useVybeStore((state) => state.matchStatuses[params.id]);
  const swipeDecision = useVybeStore((state) => state.swipeDecisions[params.id]);
  const sendFriendRequest = useVybeStore((state) => state.sendFriendRequest);
  const decideProfile = useVybeStore((state) => state.decideProfile);
  const recordProfileInteraction = useVybeStore((state) => state.recordProfileInteraction);
  const likeProfile = useVybeStore((state) => state.likeProfile);
  const profileLikesEnabled = useVybeStore((state) => state.settings.profileLikesEnabled);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => { if (user) void recordProfileInteraction(user.id); }, [recordProfileInteraction, user]);

  if (!user) return <AppShell><div className="vybe-card rounded-3xl p-8">Profile not found or unavailable.</div></AppShell>;

  const score = user.compatibilityScore ?? matchPercent(interests, user.interests);
  const shared = user.interests.filter((item) => interests.includes(item));
  const canChat = friendStatus === "friends" || matchStatus === "active";

  return (
    <AppShell>
      <div className="vybe-card overflow-hidden rounded-[34px]" style={{ boxShadow: `0 25px 85px ${user.accentColor || "#1686ff"}18` }}>
        <div className="relative h-52 sm:h-60">
          <Image src={user.banner} alt={`${user.username} profile banner`} fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-black/10" />
        </div>
        <div className="relative px-5 pb-8 sm:px-8">
          <div className="-mt-16 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4"><div className="rounded-[32px] border-4 border-[var(--surface)] bg-[var(--surface)]"><Avatar user={user} size="2xl" /></div><div className="pb-2"><p className="text-xs font-black uppercase tracking-[.17em] text-blue-500">@{user.username}</p><h1 className="mt-1 text-2xl font-black tracking-tight">{user.displayName}</h1><p className="mt-1 text-sm text-[var(--muted)]">{user.lastSeen} · Ages {user.ageBracket}</p></div></div>
            <div className="flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/12 px-4 py-2 text-sm font-black text-blue-500 shadow-[0_0_25px_rgba(37,99,235,.18)]"><Sparkles size={15} /> {score}% VYBE COMPATIBILITY</div>
          </div>

          <p className="mt-7 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{user.bio}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)]">{user.status}</div>

          <div className="mt-6 flex flex-wrap gap-2">{user.interests.map((item) => <span key={item} className={`rounded-full border px-3 py-2 text-xs font-bold ${shared.includes(item) ? "border-blue-400/30 bg-blue-500/12 text-blue-500" : "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)]"}`}>{item}</span>)}</div>
          {!!user.profileBadges?.length && <div className="mt-4 flex flex-wrap gap-2">{user.profileBadges.map((badge) => <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 2.2, repeat: Infinity }} key={badge} className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-500"><Award size={12} /> {badge}</motion.span>)}</div>}

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ProfileFact icon={Headphones} label="Favorite music" value={user.favoriteMusic} />
            <ProfileFact icon={Gamepad2} label="Favorite games" value={user.favoriteGames?.join(", ") || user.favoriteGame} />
            <ProfileFact icon={Trophy} label="Favorite sports" value={user.favoriteSports?.join(", ") || user.favoriteSport} />
            <ProfileFact icon={BookOpen} label="Hobbies" value={user.favoriteHobbies?.join(", ") || "Not shared"} />
            <ProfileFact icon={GraduationCap} label="School grade" value={user.schoolGrade || "Not shared"} />
            <ProfileFact icon={Palette} label="Profile VYBE" value={`${user.profileCompletion || 0}% complete${user.pronouns ? ` · ${user.pronouns}` : ""}`} />
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {canChat && <Link href={`/chat/${user.id}`} className="vybe-button inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-black text-white hover:bg-blue-500"><MessageCircle size={18} /> Private Chat</Link>}
            {matchStatus === "active" ? <span className="inline-flex items-center gap-2 rounded-2xl border border-blue-400/25 bg-blue-500/10 px-4 py-3.5 text-sm font-black text-blue-500"><Heart size={17} fill="currentColor" /> Matched</span> : <button onClick={() => void decideProfile(user.id, "like")} disabled={swipeDecision === "like"} className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-blue-400/25 bg-blue-500/10 px-4 py-3.5 text-sm font-black text-blue-500 disabled:opacity-55"><Heart size={17} /> {swipeDecision === "like" ? "Like sent" : "Like profile"}</button>}
            {friendStatus === "friends" ? <span className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3.5 text-sm font-black text-[var(--text-secondary)]"><UserCheck size={18} /> Friends</span> : <button onClick={() => void sendFriendRequest(user.id)} disabled={friendStatus === "pending"} className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3.5 font-black disabled:opacity-55">{friendStatus === "pending" ? <UserCheck size={18} /> : <UserPlus size={18} />}{friendStatus === "pending" ? "Request sent" : "Add Friend"}</button>}
            {profileLikesEnabled && <button onClick={() => void likeProfile(user.id)} className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-blue-400/20 bg-blue-500/7 px-4 py-3.5 text-sm font-bold text-blue-500"><Sparkles size={17} /> Appreciate profile</button>}
            <button onClick={() => setReportOpen(true)} className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-3.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"><Flag size={17} /> Report</button>
            <button onClick={() => setBlockOpen(true)} className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/5 px-4 py-3.5 text-sm font-bold text-red-400 hover:bg-red-500/10"><Ban size={17} /> Block</button>
          </div>
          {(friendStatus === "friends" || matchStatus === "active") && <p className="mt-4 text-[10px] leading-5 text-[var(--muted)]">Friendship and matching are separate relationships. Ending one keeps chat available only when the other remains active.</p>}
        </div>
      </div>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="vybe-card rounded-[26px] p-5"><ShieldCheck className="text-blue-500" /><h2 className="mt-4 font-black">{dataMode === "supabase" ? "Database-calculated age bracket" : "Age bracket verified locally"}</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{dataMode === "supabase" ? "Discovery and search policies only expose profiles in your database-calculated age bracket." : "This simulated profile is only available to users in the same bracket."}</p></div>
        <div className="vybe-card rounded-[26px] p-5"><Sparkles className="text-blue-500" /><h2 className="mt-4 font-black">Personality</h2><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{user.personality}</p></div>
      </section>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} userId={user.id} username={user.username} />
      <BlockModal open={blockOpen} onClose={() => setBlockOpen(false)} userId={user.id} username={user.username} />
    </AppShell>
  );
}
