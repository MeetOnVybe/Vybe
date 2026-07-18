"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Ban, Bot, EyeOff, Flag, LockKeyhole, MapPinOff, MessageSquareLock, Scale, ShieldCheck, UserCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";

const items = [
  { icon: UserCheck, title: "Age brackets stay isolated", body: "Discovery, search, friendship, matching, stories, and messaging enforce the 13–15 and 16–17 separation in PostgreSQL policies and server-side functions." },
  { icon: MessageSquareLock, title: "Private communication only", body: "Direct chat requires an accepted friendship or active mutual match. Group invites are limited to accepted friends." },
  { icon: MapPinOff, title: "Coarse location only by choice", body: "Location is hidden by default. Users may share country, state, or bilateral city for matching; VYBE never exposes coordinates, addresses, ZIP codes, schools, live location, or distance." },
  { icon: Flag, title: "Report profiles and content", body: "Profiles, messages, stories, and groups can be reported into the same protected moderation queue." },
  { icon: Ban, title: "Blocks take effect immediately", body: "Blocking removes discovery, match, friend, story, profile, and messaging access in both directions." },
  { icon: Bot, title: "Automated safety screening", body: "Messages and stories are checked for bullying, harassment, hate, grooming patterns, spam, predatory language, and threats before publication." },
];

export default function SafetyPage() {
  const settings = useVybeStore((state) => state.settings);
  const submitAppeal = useVybeStore((state) => state.submitAppeal);
  const [appeal, setAppeal] = useState("");

  return <AppShell>
    <PageHeader eyebrow="Safety Center" title="Protect your VYBE" description="VYBE combines user controls, private-by-default communication, database authorization, automated screening, and human administrator review." action={<Link href="/settings" className="vybe-button inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"><EyeOff size={17} /> Privacy controls</Link>} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(({ icon: Icon, title, body }) => <div key={title} className="vybe-card rounded-[26px] p-5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500/10 text-blue-400"><Icon size={20} /></span><h2 className="mt-5 font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></div>)}</div>

    <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <div className="vybe-card rounded-[28px] p-6"><h2 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="text-blue-400" /> Your current privacy posture</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Privacy label="Who can message" value={settings.messagePrivacy} /><Privacy label="Who sees stories" value={settings.storyPrivacy} /><Privacy label="Profile visibility" value={settings.profileVisibility} /><Privacy label="Online status" value={settings.onlineStatusPrivacy} /></div><p className="mt-5 text-xs leading-5 text-slate-500">Read receipts are {settings.readReceipts ? "on" : "off"}. Sensitive previews are {settings.blurSensitivePreviews ? "blurred" : "shown normally"}. Online precision is set to {settings.presenceVisibility}.</p><Link href="/settings" className="vybe-button mt-5 inline-flex rounded-2xl border border-blue-400/20 px-5 py-3 text-sm font-black text-blue-400">Review all privacy settings</Link></div>
      <div className="vybe-card rounded-[28px] p-6"><Scale className="text-blue-400" /><h2 className="mt-4 text-lg font-black">Appeal an account action</h2><p className="mt-2 text-sm leading-6 text-slate-500">Warnings, suspensions, and bans can be appealed for human review. Appeals and administrator decisions are stored in the moderation audit system.</p><textarea value={appeal} onChange={(event) => setAppeal(event.target.value)} maxLength={1500} className="vybe-input mt-4 min-h-28 resize-none" placeholder="Explain why the action should be reviewed…" aria-label="Appeal reason" /><button disabled={appeal.trim().length < 10} onClick={() => { void submitAppeal(appeal.trim()); setAppeal(""); }} className="vybe-button mt-3 w-full rounded-2xl bg-blue-600 py-3 font-black text-white disabled:opacity-40">Submit appeal</button></div>
    </section>

    <section className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><div className="vybe-card rounded-[28px] p-6"><h2 className="flex items-center gap-2 text-xl font-black"><LockKeyhole className="text-blue-400" /> Layered moderation</h2><p className="mt-3 text-sm leading-7 text-slate-400">Potentially severe messages, stories, and live-session safety events are temporarily hidden or restricted before delivery and placed in an administrator-only queue. Human reviewers can warn, suspend, ban, remove content, restore content, and review appeals. Moderation provider instructions and credentials stay server-side.</p></div><div className="rounded-[28px] border border-blue-400/15 bg-blue-500/[.055] p-6"><AlertTriangle className="text-blue-400" /><h2 className="mt-4 text-lg font-black">Production boundaries</h2><p className="mt-2 text-sm leading-6 text-slate-500">VYBE supports private voice notes and authenticated Solo and Group video matching. It does not provide public livestreams, call recording by default, exact location, payments, ads, reels, or anonymous public feeds.</p><p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Supabase + LiveKit production mode</p></div></section>
  </AppShell>;
}

function Privacy({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-600">{label}</p><p className="mt-2 font-black capitalize text-blue-400">{value}</p></div>; }
