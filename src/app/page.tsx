"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LockKeyhole, MessageCircle, ShieldCheck, Sparkles, UsersRound, Video } from "lucide-react";
import { Logo } from "@/components/Logo";

const features = [
  { icon: Video, title: "Live age-protected matching", body: "Authenticated Solo and Group Match use Supabase eligibility rules and room-scoped LiveKit access." },
  { icon: MessageCircle, title: "Friends, matches, and private chat", body: "Requests, direct messages, group chat, voice notes, Stories, reactions, and notifications sync in real time." },
  { icon: ShieldCheck, title: "Safety at every layer", body: "Age isolation, blocking, reporting, moderation, private storage, admin review, and Row Level Security protect every private flow." },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-5%,rgba(0,119,255,.28),transparent_31%),radial-gradient(circle_at_12%_55%,rgba(0,92,255,.10),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-5 sm:px-8">
        <header className="flex items-center justify-between"><Logo /><div className="flex items-center gap-2"><Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white">Log in</Link><Link href="/signup" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black shadow-[0_0_24px_rgba(37,99,235,.32)] hover:bg-blue-500">Join VYBE</Link></div></header>
        <section className="grid min-h-[78vh] items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr]">
          <div><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-200"><Sparkles size={14} /> Safe social video for teens</motion.div><motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }} className="max-w-3xl text-5xl font-black leading-[.96] tracking-[-.045em] sm:text-7xl lg:text-8xl">Meet. Match. <span className="bg-gradient-to-r from-blue-300 via-blue-500 to-cyan-300 bg-clip-text text-transparent">VYBE.</span></motion.h1><motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">Create a verified account, meet eligible people in your age bracket, connect through secure live video, and keep the conversation going with friends, matches, Stories, voice notes, and groups.</motion.p><motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }} className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 font-black shadow-[0_0_38px_rgba(0,102,255,.35)] transition hover:-translate-y-0.5 hover:bg-blue-500">Create your account <ArrowRight size={19} /></Link><Link href="/login" className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-slate-200 backdrop-blur-xl hover:bg-white/10">Log in to VYBE</Link></motion.div><div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-500"><span className="flex items-center gap-2"><UsersRound size={14} className="text-blue-400" /> Age brackets never mix</span><span className="flex items-center gap-2"><LockKeyhole size={14} className="text-blue-400" /> Private Realtime communication</span><span className="flex items-center gap-2"><ShieldCheck size={14} className="text-blue-400" /> Report and block always available</span></div></div>
          <motion.div initial={{ opacity: 0, scale: .96, y: 25 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: .12, duration: .55 }} className="relative mx-auto w-full max-w-xl"><div className="absolute -inset-10 rounded-full bg-blue-600/20 blur-[100px]" /><div className="vybe-card relative rounded-[34px] p-4"><div className="grid min-h-[460px] place-items-center overflow-hidden rounded-[28px] border border-blue-400/15 bg-[radial-gradient(circle_at_50%_25%,rgba(100,169,250,.24),transparent_30%),linear-gradient(145deg,#0d1b31,#05070c_70%)]"><div className="relative text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-[30px] border border-blue-300/20 bg-blue-500/15 text-blue-200 shadow-[0_0_65px_rgba(37,99,235,.38)]"><Video size={42} /></span><p className="mt-7 text-xs font-black uppercase tracking-[.2em] text-blue-300">Secure LiveKit rooms</p><h2 className="mt-2 text-3xl font-black">Find your VYBE live.</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">Permissions start only when you choose to match. Remote video stays blurred until the connection is established.</p></div></div></div></motion.div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, body }) => <div key={title} className="vybe-card rounded-[26px] p-6"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/12 text-blue-300"><Icon size={22} /></span><h2 className="mt-5 text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div>)}</section>
      </div>
    </main>
  );
}
