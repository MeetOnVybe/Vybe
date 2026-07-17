"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Flame, Globe2, HeartHandshake, MessageCircle, Radio, Search, ShieldCheck, Sparkles, TrendingUp, UsersRound, Video, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { COUNTRY_FILTERS, DAILY_MESSAGES, FRIEND_ACTIVITY, INTERESTS, LANGUAGE_FILTERS, SIM_USERS, TRENDING_INTERESTS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

export default function HomePage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const people = useVybeStore((state) => state.people);
  const profile = useVybeStore((state) => state.profile);
  const ageBracket = useVybeStore((state) => state.ageBracket);
  const interests = useVybeStore((state) => state.interests);
  const country = useVybeStore((state) => state.countryFilter);
  const language = useVybeStore((state) => state.languageFilter);
  const interest = useVybeStore((state) => state.interestFilter);
  const setFilters = useVybeStore((state) => state.setFilters);
  const statuses = useVybeStore((state) => state.friendStatuses);
  const messages = useVybeStore((state) => state.messages);
  const [onlineCount, setOnlineCount] = useState(12847);
  const socialUsers = dataMode === "demo" ? SIM_USERS : people;
  const friends = socialUsers.filter((user) => statuses[user.id] === "friends");
  const recent = socialUsers.filter((user) => user.ageBracket === ageBracket && user.online).slice(0, 5);
  const unreadMessages = Object.values(messages).flat().filter((message) => !message.read && message.senderId !== "me").length;
  const dailyMessage = DAILY_MESSAGES[1];

  useEffect(() => {
    if (dataMode !== "demo") return;
    const timer = window.setInterval(() => setOnlineCount((count) => count + (Math.random() > .48 ? 1 : -1)), 3200);
    return () => window.clearInterval(timer);
  }, [dataMode]);

  const activity = useMemo(() => {
    if (dataMode === "supabase") {
      return friends.slice(0, 3).map((friend) => ({
        id: `friend-${friend.id}`,
        userId: friend.id,
        text: friend.online ? "is online now" : friend.lastSeen.toLowerCase(),
        createdAt: friend.online ? "now" : "recently",
      }));
    }
    const friendIds = new Set(friends.map((friend) => friend.id));
    const friendOnly = FRIEND_ACTIVITY.filter((item) => friendIds.has(item.userId));
    return friendOnly.length ? friendOnly : FRIEND_ACTIVITY.slice(0, 2);
  }, [dataMode, friends]);

  const visibleOnlineCount = dataMode === "demo" ? onlineCount : socialUsers.filter((user) => user.online).length;


  return (
    <AppShell>
      <PageHeader
        eyebrow="Meet. Match. VYBE."
        title={`What’s the VYBE, ${profile.displayName}?`}
        description={`Your ${ageBracket} space is active. Discover eligible people, check your matches, catch up with friends, or see what people are into right now.`}
        action={<Link href="/profile" className="vybe-button inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-3 py-2.5 text-sm font-bold text-slate-200 hover:border-blue-400/20 hover:bg-white/[.06]"><Avatar imageSrc={profile.profileImage ?? profile.avatarChoice} showStatus={false} size="sm" alt="Your avatar" /><span className="hidden sm:inline">View profile</span></Link>}
      />

      <section className="grid gap-5 lg:grid-cols-[1.38fr_.62fr]">
        <div className="grid gap-5 md:grid-cols-2">
          <motion.div whileHover={{ y: -5 }} whileTap={{ scale: .99 }} className="vybe-card relative min-h-[325px] overflow-hidden rounded-[32px] p-6 sm:p-7">
            <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-blue-500/22 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-52 opacity-30"><Image src="/avatars/zay.svg" alt="" fill sizes="208px" className="object-cover object-top [mask-image:linear-gradient(to_top,black,transparent)]" /></div>
            <div className="relative z-10">
              <span className="grid h-14 w-14 place-items-center rounded-[20px] border border-blue-300/15 bg-blue-500/16 text-blue-200 shadow-[0_0_30px_rgba(37,99,235,.2)]"><Video size={27} /></span>
              <p className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-blue-300/70">One-on-one</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-.04em]">Solo Match</h2>
              <p className="mt-3 max-w-[18rem] text-sm leading-6 text-slate-400">Meet one new person instantly, check the shared VYBE, and skip whenever the energy is off.</p>
              <Link href="/solo" className="vybe-button mt-7 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-black shadow-[0_0_35px_rgba(0,102,255,.32)] hover:bg-blue-500">Start Solo Match <ArrowRight size={18} /></Link>
            </div>
          </motion.div>

          <motion.div whileHover={{ y: -5 }} whileTap={{ scale: .99 }} className="vybe-card relative min-h-[325px] overflow-hidden rounded-[32px] p-6 sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/14 blur-3xl" />
            <div className="absolute bottom-6 right-5 grid grid-cols-2 gap-2 opacity-45">
              {SIM_USERS.slice(1, 5).map((user) => <Avatar key={user.id} user={user} showStatus={false} size="sm" />)}
            </div>
            <div className="relative z-10">
              <span className="grid h-14 w-14 place-items-center rounded-[20px] border border-cyan-300/15 bg-cyan-500/12 text-cyan-200"><UsersRound size={27} /></span>
              <p className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-cyan-300/70">Group energy</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-.04em]">Group Match</h2>
              <p className="mt-3 max-w-[18rem] text-sm leading-6 text-slate-400">Drop into an active group, discover different personalities, and refresh the whole room in one tap.</p>
              <Link href="/group" className="vybe-button mt-7 inline-flex items-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-5 py-3.5 font-black text-blue-100 hover:bg-blue-500/20">Start Group Match <ArrowRight size={18} /></Link>
            </div>
          </motion.div>
        </div>

        <aside className="vybe-card flex flex-col rounded-[32px] p-6">
          <div className="flex items-start justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Live on VYBE</p><div className="mt-2 flex items-center gap-3"><p className="text-4xl font-black tracking-[-.05em]">{visibleOnlineCount.toLocaleString()}</p><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" /></div><p className="mt-1 text-xs text-slate-500">{dataMode === "demo" ? "people online right now" : "friends and connected members online"}</p></div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/12 text-blue-300"><Radio size={22} /></span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[.06] bg-white/[.028] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Friends</p><p className="mt-1 text-2xl font-black">{friends.length}</p><p className="mt-1 text-[10px] text-emerald-300">{friends.filter((friend) => friend.online).length} online</p></div>
            <div className="rounded-2xl border border-white/[.06] bg-white/[.028] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Messages</p><p className="mt-1 text-2xl font-black">{unreadMessages}</p><p className="mt-1 text-[10px] text-blue-300">unread now</p></div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-400/15 bg-blue-500/[.065] p-4">
            <div className="flex items-center gap-2 text-xs font-black text-blue-200"><Sparkles size={15} /> Daily VYBE</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">“{dailyMessage}”</p>
          </div>

          <Link href="/safety" className="vybe-button mt-auto flex items-center gap-3 rounded-2xl px-1 pt-5 text-xs font-bold text-slate-400 hover:text-blue-200"><ShieldCheck size={17} className="text-blue-400" /> Safety controls are always one tap away</Link>
        </aside>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="vybe-card rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Active now</p><h2 className="mt-1 text-xl font-black tracking-tight">Recently active users</h2></div><Zap size={20} className="text-blue-400" /></div>
          <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
            {recent.map((user) => (
              <Link key={user.id} href={`/profile/${user.id}`} className="group min-w-[82px] text-center">
                <div className="mx-auto w-fit rounded-[22px] p-0.5 ring-1 ring-blue-400/25 transition group-hover:shadow-[0_0_25px_rgba(37,99,235,.25)]"><Avatar user={user} size="lg" showStatus /></div>
                <p className="mt-2 truncate text-xs font-black">{user.username}</p>
                <p className="mt-1 text-[9px] text-slate-600">{user.status.split(" ").slice(0, 2).join(" ")}</p>
              </Link>
            ))}
            {!recent.length && <div className="rounded-2xl border border-white/[.06] bg-white/[.025] px-5 py-4 text-xs text-slate-500">Accepted friends who share online status will appear here.</div>}
          </div>
        </div>

        <div className="vybe-card rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Your circle</p><h2 className="mt-1 text-xl font-black tracking-tight">Friend activity</h2></div><UsersRound size={20} className="text-blue-400" /></div>
          <div className="mt-4 space-y-3">
            {activity.map((item) => {
              const user = socialUsers.find((candidate) => candidate.id === item.userId);
              if (!user) return null;
              return <Link key={item.id} href={`/profile/${user.id}`} className="flex items-center gap-3 rounded-2xl border border-white/[.055] bg-white/[.025] p-3 transition hover:border-blue-400/15 hover:bg-white/[.04]"><Avatar user={user} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs"><span className="font-black text-white">{user.username}</span> <span className="text-slate-400">{item.text}</span></p><p className="mt-1 text-[9px] font-bold text-slate-600">{item.createdAt} ago</p></div></Link>;
            })}
          </div>{!activity.length && <p className="mt-4 text-xs text-slate-500">Friend presence and messages will create activity here.</p>}
        </div>
      </section>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="flex items-center gap-2 text-xl font-black"><Globe2 size={20} className="text-blue-400" /> Match filters</h2><p className="mt-1 text-sm text-slate-500">Random keeps discovery open. {dataMode === "demo" ? "Filters only affect the local simulation for now." : "Live anonymous matchmaking remains disabled. Use Discovery for real age-bracketed profiles without exact location."}</p></div><span className="inline-flex items-center gap-2 text-xs font-bold text-blue-300"><Sparkles size={14} /> {dataMode === "demo" ? "Local simulation" : "Discovery ready"}</span></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <select aria-label="Country filter" value={country} onChange={(event) => setFilters("country", event.target.value)} className="vybe-input">{COUNTRY_FILTERS.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Language filter" value={language} onChange={(event) => setFilters("language", event.target.value)} className="vybe-input">{LANGUAGE_FILTERS.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Interest filter" value={interest} onChange={(event) => setFilters("interest", event.target.value)} className="vybe-input"><option>Random</option>{INTERESTS.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{interests.map((item) => <span key={item} className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-xs font-bold text-blue-200">{item}</span>)}</div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TRENDING_INTERESTS.map((trend, index) => <div key={trend.name} className="vybe-card rounded-[22px] p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-300">{index === 0 ? <Flame size={17} /> : <TrendingUp size={17} />}</span><span className="text-[10px] font-black text-blue-300">#{index + 1}</span></div><h3 className="mt-4 font-black">{trend.name}</h3><p className="mt-1 text-xs text-slate-500">{trend.count}</p></div>)}
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/discover" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><Compass className="text-blue-400" /><h3 className="mt-4 font-black">Discovery</h3><p className="mt-1 text-xs text-slate-500">Browse, Like, Pass, and find mutual VYBEs.</p></Link>
        <Link href="/matches" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><HeartHandshake className="text-blue-400" /><h3 className="mt-4 font-black">Matches</h3><p className="mt-1 text-xs text-slate-500">See mutual likes and open match chat.</p></Link>
        <Link href="/search" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><Search className="text-blue-400" /><h3 className="mt-4 font-black">Search users</h3><p className="mt-1 text-xs text-slate-500">Find same-bracket people by name or interest.</p></Link>
        <Link href="/friends" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><UsersRound className="text-blue-400" /><h3 className="mt-4 font-black">Friends</h3><p className="mt-1 text-xs text-slate-500">Manage accepted friends and requests.</p></Link>
        <Link href="/chat" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><MessageCircle className="text-blue-400" /><h3 className="mt-4 font-black">Chat inbox</h3><p className="mt-1 text-xs text-slate-500">Messaging unlocks for friends and active matches.</p></Link>
        <Link href="/notifications" className="vybe-card vybe-button rounded-2xl p-5 hover:border-blue-400/25"><Radio className="text-blue-400" /><h3 className="mt-4 font-black">Notifications</h3><p className="mt-1 text-xs text-slate-500">See requests, matches, messages, and safety updates.</p></Link>
      </section>
    </AppShell>
  );
}
