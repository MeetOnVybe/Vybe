"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Flame, HeartHandshake, MessageCircle, Radio, Search, ShieldCheck, Sparkles, TrendingUp, UsersRound, Video, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { DAILY_MESSAGES } from "@/lib/profile-options";
import { useVybeStore } from "@/store/useVybeStore";

export default function HomePage() {
  const people = useVybeStore((state) => state.people);
  const profile = useVybeStore((state) => state.profile);
  const ageBracket = useVybeStore((state) => state.ageBracket);
  const interests = useVybeStore((state) => state.interests);
  const statuses = useVybeStore((state) => state.friendStatuses);
  const messages = useVybeStore((state) => state.messages);
  const notifications = useVybeStore((state) => state.notifications);
  const friends = people.filter((user) => statuses[user.id] === "friends");
  const recent = people.filter((user) => user.online).slice(0, 5);
  const unreadMessages = Object.values(messages).flat().filter((message) => !message.read && message.senderId !== "me").length;
  const unreadNotifications = notifications.filter((item) => !item.read).length;
  const dailyMessage = DAILY_MESSAGES[new Date().getDate() % DAILY_MESSAGES.length];
  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    people.forEach((person) => person.interests.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [people]);

  return (
    <AppShell>
      <PageHeader eyebrow="Meet. Match. VYBE." title={`What’s the VYBE, ${profile.displayName || profile.username}?`} description={`Your ${ageBracket} space is active. Start a live match, discover eligible members, or catch up with your people.`} action={<Link href="/profile" className="vybe-button inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-3 py-2.5 text-sm font-bold hover:border-blue-400/20"><Avatar imageSrc={profile.profileImage ?? profile.avatarChoice} showStatus={false} size="sm" alt="Your avatar" /><span className="hidden sm:inline">View profile</span></Link>} />

      <section className="grid gap-5 lg:grid-cols-[1.38fr_.62fr]">
        <div className="grid gap-5 md:grid-cols-2">
          <MatchCard href="/solo" eyebrow="One-on-one" title="Solo Match" body="Join the secure age-protected queue and connect live with one eligible VYBE member." icon={Video} primary />
          <MatchCard href="/group" eyebrow="Group energy" title="Group Match" body="Join a secure age-protected LiveKit room with eligible authenticated members." icon={UsersRound} />
        </div>
        <aside className="vybe-card flex flex-col rounded-[32px] p-6">
          <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Connected on VYBE</p><div className="mt-2 flex items-center gap-3"><p className="text-4xl font-black tracking-[-.05em]">{people.filter((user) => user.online).length}</p><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" /></div><p className="mt-1 text-xs text-slate-500">eligible members visible to your account</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/12 text-blue-300"><Radio size={22} /></span></div>
          <div className="mt-6 grid grid-cols-2 gap-3"><Stat label="Friends" value={friends.length} note={`${friends.filter((friend) => friend.online).length} online`} /><Stat label="Unread" value={unreadMessages + unreadNotifications} note="messages and alerts" /></div>
          <div className="mt-5 rounded-2xl border border-blue-400/15 bg-blue-500/[.065] p-4"><div className="flex items-center gap-2 text-xs font-black text-blue-200"><Sparkles size={15} /> Daily VYBE</div><p className="mt-2 text-sm leading-6 text-slate-300">“{dailyMessage}”</p></div>
          <Link href="/safety" className="vybe-button mt-auto flex items-center gap-3 rounded-2xl px-1 pt-5 text-xs font-bold text-slate-400 hover:text-blue-200"><ShieldCheck size={17} className="text-blue-400" /> Safety controls are always one tap away</Link>
        </aside>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="vybe-card rounded-[30px] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Active now</p><h2 className="mt-1 text-xl font-black">Recently active members</h2></div><Zap size={20} className="text-blue-400" /></div><div className="mt-5 flex gap-4 overflow-x-auto pb-2">{recent.map((user) => <Link key={user.id} href={`/profile/${user.id}`} className="group min-w-[82px] text-center"><div className="mx-auto w-fit rounded-[22px] p-0.5 ring-1 ring-blue-400/25"><Avatar user={user} size="lg" showStatus /></div><p className="mt-2 truncate text-xs font-black">{user.username}</p><p className="mt-1 truncate text-[9px] text-slate-600">{user.status}</p></Link>)}{!recent.length && <EmptyText text="Members who share online status will appear here." />}</div></div>
        <div className="vybe-card rounded-[30px] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Your circle</p><h2 className="mt-1 text-xl font-black">Friend activity</h2></div><UsersRound size={20} className="text-blue-400" /></div><div className="mt-4 space-y-3">{friends.slice(0, 3).map((user) => <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center gap-3 rounded-2xl border border-white/[.055] bg-white/[.025] p-3 hover:border-blue-400/15"><Avatar user={user} size="sm" /><div className="min-w-0"><p className="truncate text-xs font-black">{user.username}</p><p className="mt-1 text-[10px] text-slate-500">{user.online ? "Online now" : user.lastSeen}</p></div></Link>)}{!friends.length && <EmptyText text="Accepted friends and their allowed presence will appear here." />}</div></div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{trending.length ? trending.map(([name, count], index) => <div key={name} className="vybe-card rounded-[22px] p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-300">{index === 0 ? <Flame size={17} /> : <TrendingUp size={17} />}</span><span className="text-[10px] font-black text-blue-300">#{index + 1}</span></div><h3 className="mt-4 font-black">{name}</h3><p className="mt-1 text-xs text-slate-500">{count} eligible {count === 1 ? "member" : "members"}</p></div>) : interests.slice(0, 4).map((name) => <div key={name} className="vybe-card rounded-[22px] p-5"><TrendingUp className="text-blue-400" size={17} /><h3 className="mt-4 font-black">{name}</h3><p className="mt-1 text-xs text-slate-500">One of your interests</p></div>)}</section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NavCard href="/discover" icon={Compass} title="Discovery" body="Browse real same-bracket profiles and find mutual VYBEs." />
        <NavCard href="/matches" icon={HeartHandshake} title="Matches" body="See mutual likes and open authorized match chat." />
        <NavCard href="/search" icon={Search} title="Search users" body="Find eligible people by name or interest." />
        <NavCard href="/friends" icon={UsersRound} title="Friends" body="Manage accepted friends and requests." />
        <NavCard href="/chat" icon={MessageCircle} title="Chat inbox" body="Open Realtime direct and group conversations." />
        <NavCard href="/notifications" icon={Radio} title="Notifications" body="See requests, matches, messages, video, and safety updates." />
      </section>
    </AppShell>
  );
}

function MatchCard({ href, eyebrow, title, body, icon: Icon, primary = false }: { href: string; eyebrow: string; title: string; body: string; icon: typeof Video; primary?: boolean }) { return <motion.div whileHover={{ y: -5 }} whileTap={{ scale: .99 }} className="vybe-card relative min-h-[325px] overflow-hidden rounded-[32px] p-6 sm:p-7"><div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" /><div className="relative z-10"><span className="grid h-14 w-14 place-items-center rounded-[20px] border border-blue-300/15 bg-blue-500/16 text-blue-200 shadow-[0_0_30px_rgba(37,99,235,.2)]"><Icon size={27} /></span><p className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-blue-300/70">{eyebrow}</p><h2 className="mt-1 text-3xl font-black tracking-[-.04em]">{title}</h2><p className="mt-3 max-w-[18rem] text-sm leading-6 text-slate-400">{body}</p><Link href={href} className={`vybe-button mt-7 inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 font-black ${primary ? "bg-blue-600 text-white shadow-[0_0_35px_rgba(0,102,255,.32)] hover:bg-blue-500" : "border border-blue-400/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20"}`}>Start {title} <ArrowRight size={18} /></Link></div></motion.div>; }
function Stat({ label, value, note }: { label: string; value: number; note: string }) { return <div className="rounded-2xl border border-white/[.06] bg-white/[.028] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-blue-300">{note}</p></div>; }
function EmptyText({ text }: { text: string }) { return <div className="rounded-2xl border border-white/[.06] bg-white/[.025] px-5 py-4 text-xs text-slate-500">{text}</div>; }
function NavCard({ href, icon: Icon, title, body }: { href: string; icon: typeof Compass; title: string; body: string }) { return <Link href={href} className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><Icon className="text-blue-400" /><h3 className="mt-4 font-black">{title}</h3><p className="mt-1 text-xs text-slate-500">{body}</p></Link>; }
