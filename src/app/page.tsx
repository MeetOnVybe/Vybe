"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Ban, MessageCircle, ShieldCheck, Sparkles, UserPlus, UsersRound, Video } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getDataMode } from "@/lib/data-mode";

const features = [
  { icon: Video, title: "Match preview preserved", body: "Explore the polished Solo and Group Match experience with safe video placeholders while live video stays disabled." },
  { icon: UserPlus, title: "Real friends and private chat", body: "Verified accounts can send requests, become friends, and message in real time through Supabase." },
  { icon: ShieldCheck, title: "Privacy by default", body: "Protected pages, age-bracket separation, blocking, reporting, private storage, and database policies work together." },
];

export default function LandingPage() {
  const dataMode = getDataMode();
  const isDemo = dataMode === "demo";
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-5%,rgba(0,119,255,.28),transparent_31%),radial-gradient(circle_at_12%_55%,rgba(0,92,255,.10),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-5 sm:px-8">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white">Log in</Link>
            <Link href="/signup" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black shadow-[0_0_24px_rgba(37,99,235,.32)] hover:bg-blue-500">Join VYBE</Link>
          </div>
        </header>

        <section className="grid min-h-[78vh] items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-200">
              <Sparkles size={14} /> Phase 2 social platform
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }} className="max-w-3xl text-5xl font-black leading-[.96] tracking-[-.045em] sm:text-7xl lg:text-8xl">
              Meet. Match. <span className="bg-gradient-to-r from-blue-300 via-blue-500 to-cyan-300 bg-clip-text text-transparent">VYBE.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              Real accounts, cloud profiles, private friendships, real-time chat, presence, notifications, and safety controls—without enabling cameras or public matchmaking yet.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 font-black shadow-[0_0_38px_rgba(0,102,255,.35)] transition hover:-translate-y-0.5 hover:bg-blue-500">Start matching <ArrowRight size={19} /></Link>
              <Link href={isDemo ? "/home" : "/login"} className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-slate-200 backdrop-blur-xl hover:bg-white/10">{isDemo ? "Open demo home" : "Log in to your account"}</Link>
            </motion.div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-2"><Ban size={14} className="text-blue-400" /> No real camera</span>
              <span className="flex items-center gap-2"><MessageCircle size={14} className="text-blue-400" /> {isDemo ? "Development demo chat" : "Private real-time chat"}</span>
              <span className="flex items-center gap-2"><UsersRound size={14} className="text-blue-400" /> Age brackets never mix</span>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, scale: .96, y: 25 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: .12, duration: .55 }} className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-10 rounded-full bg-blue-600/20 blur-[100px]" />
            <div className="vybe-card relative rounded-[34px] p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3">
                {["YOU", "KAI"].map((name, index) => (
                  <div key={name} className={`relative min-h-[390px] overflow-hidden rounded-[26px] bg-gradient-to-br ${index === 0 ? "from-slate-800 via-blue-950 to-black" : "from-blue-500 via-blue-800 to-black"}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,.17),transparent_25%),linear-gradient(to_top,#02050b,transparent_60%)]" />
                    <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-[10px] font-black"><span className="h-2 w-2 rounded-full bg-red-400" /> LIVE</div>
                    <div className="absolute bottom-5 left-5"><p className="text-xs font-black tracking-widest text-blue-300">{index ? "94% VYBE MATCH" : "YOUR PREVIEW"}</p><p className="mt-1 text-2xl font-black">{name}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/8 bg-black/30 p-3">
                <span className="text-xs font-bold text-slate-400">Matched instantly</span>
                <span className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black">Skip →</span>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="vybe-card rounded-[26px] p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/12 text-blue-300"><Icon size={22} /></span>
              <h2 className="mt-5 text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
