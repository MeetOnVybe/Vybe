"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CheckCircle2, ClipboardList, Gavel, History, RotateCcw, Search, ShieldAlert, UserRoundSearch, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";
import type { AdminUserSummary, ModerationCase } from "@/types";

type Tab = "queue" | "users" | "appeals" | "logs";

export function AdminDashboard() {
  const isAdmin = useVybeStore((state) => state.isAdmin);
  const cases = useVybeStore((state) => state.moderationCases);
  const appeals = useVybeStore((state) => state.moderationAppeals);
  const logs = useVybeStore((state) => state.moderationLogs);
  const users = useVybeStore((state) => state.adminUsers);
  const loadAdminData = useVybeStore((state) => state.loadAdminData);
  const searchUsers = useVybeStore((state) => state.searchAdminUsers);
  const moderateCase = useVybeStore((state) => state.moderateCase);
  const moderateUser = useVybeStore((state) => state.moderateUser);
  const reviewAppeal = useVybeStore((state) => state.reviewAppeal);
  const [tab, setTab] = useState<Tab>("queue");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { if (isAdmin) void loadAdminData(); }, [isAdmin, loadAdminData]);
  useEffect(() => { if (tab !== "users") return; const timer = window.setTimeout(() => { if (query.trim().length >= 2) void searchUsers(query); }, 350); return () => window.clearTimeout(timer); }, [query, searchUsers, tab]);

  const pending = useMemo(() => cases.filter((item) => item.status === "pending" || item.status === "reviewing"), [cases]);
  const pendingAppeals = appeals.filter((appeal) => appeal.status === "pending" || appeal.status === "reviewing");

  return <AppShell>
    <PageHeader eyebrow="Administrator only" title="Trust & Safety Dashboard" description="Review user reports and automated flags, enforce accounts, remove harmful content, review appeals, and audit every moderation action. Access is protected by server checks and RLS." />
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric icon={ShieldAlert} label="Open cases" value={pending.length} />
      <Metric icon={ClipboardList} label="Appeals" value={pendingAppeals.length} />
      <Metric icon={History} label="Audit logs" value={logs.length} />
      <Metric icon={Gavel} label="Reviewed" value={cases.filter((item) => item.status === "actioned" || item.status === "dismissed").length} />
    </div>

    <div className="vybe-card rounded-[28px] p-2"><div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Moderation dashboard sections">{([
      ["queue", "Queue", ShieldAlert], ["users", "Users", UserRoundSearch], ["appeals", "Appeals", ClipboardList], ["logs", "Logs", History],
    ] as const).map(([value, label, Icon]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`vybe-button flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-xs font-black ${tab === value ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-white/5"}`}><Icon size={15} /><span className="hidden sm:inline">{label}</span></button>)}</div></div>

    <AnimatePresence mode="wait">
      <motion.section key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="mt-5">
        {tab === "queue" && <div className="space-y-4">{cases.map((item) => <CaseCard key={item.id} item={item} notes={notes} setNotes={setNotes} act={(action) => void moderateCase(item.id, action, notes)} />)}{!cases.length && <Empty icon={ShieldAlert} title="Moderation queue is clear" body="New reports and automated safety flags will appear here in real time." />}</div>}
        {tab === "users" && <div><div className="vybe-card relative rounded-[24px] p-4"><Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-500" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="vybe-input pl-11" aria-label="Search moderation users" placeholder="Search username or display name" /></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{users.map((user) => <UserCard key={user.id} user={user} act={(action) => void moderateUser(user.id, action, notes)} />)}</div>{query.trim().length >= 2 && !users.length && <Empty icon={UserRoundSearch} title="No users found" body="Try another username or display name." />}</div>}
        {tab === "appeals" && <div className="space-y-4">{appeals.map((appeal) => <article key={appeal.id} className="vybe-card rounded-[26px] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-400">{appeal.enforcementStatus} appeal</p><h2 className="mt-1 font-black">User {appeal.userId.slice(0, 8)}</h2></div><StatusPill value={appeal.status} /></div><p className="mt-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-sm leading-6 text-slate-400">{appeal.reason}</p><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-600"><ClientTimestamp value={appeal.createdAt} format="dateTime" /></p>{appeal.status === "pending" || appeal.status === "reviewing" ? <div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => void reviewAppeal(appeal.id, "denied", notes)} className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/20 py-3 text-sm font-black text-red-400"><XCircle size={16} /> Deny</button><button onClick={() => void reviewAppeal(appeal.id, "approved", notes)} className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white"><CheckCircle2 size={16} /> Approve & restore</button></div> : appeal.reviewerNotes && <p className="mt-3 text-xs text-slate-500">Reviewer notes: {appeal.reviewerNotes}</p>}</article>)}{!appeals.length && <Empty icon={ClipboardList} title="No appeals" body="Account-enforcement appeals will appear here." />}</div>}
        {tab === "logs" && <div className="space-y-2">{logs.map((log) => <div key={log.id} className="vybe-card flex flex-col gap-2 rounded-[22px] p-4 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400"><History size={17} /></span><div className="min-w-0 flex-1"><p className="font-black capitalize">{log.action.replaceAll("_", " ")}</p><p className="truncate text-xs text-slate-500">{log.notes || "No notes"}{log.targetUserId ? ` · user ${log.targetUserId.slice(0, 8)}` : ""}</p></div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-600"><ClientTimestamp value={log.createdAt} format="dateTime" /></span></div>)}{!logs.length && <Empty icon={History} title="No moderation logs" body="Every administrator action is recorded here." />}</div>}
      </motion.section>
    </AnimatePresence>

    {(tab === "queue" || tab === "users" || tab === "appeals") && <label className="mt-5 block text-xs font-black text-slate-500">Moderator notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1500} className="vybe-input mt-2 min-h-24 resize-none" placeholder="Add context for the audit log and user notification…" /></label>}
  </AppShell>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShieldAlert; label: string; value: number }) { return <div className="vybe-card rounded-[22px] p-4"><Icon className="text-blue-400" size={18} /><p className="mt-3 text-2xl font-black">{value}</p><p className="text-xs text-slate-500">{label}</p></div>; }
function StatusPill({ value }: { value: string }) { return <span className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-blue-400">{value}</span>; }
function Empty({ icon: Icon, title, body }: { icon: typeof ShieldAlert; title: string; body: string }) { return <div className="vybe-card grid min-h-64 place-items-center rounded-[28px] p-8 text-center"><div><Icon className="mx-auto text-blue-400" size={32} /><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-2 text-sm text-slate-500">{body}</p></div></div>; }

function CaseCard({ item, notes, setNotes, act }: { item: ModerationCase; notes: string; setNotes: (value: string) => void; act: (action: "warn" | "suspend" | "ban" | "delete_message" | "delete_story" | "dismiss" | "restore") => void }) {
  const open = item.status === "pending" || item.status === "reviewing";
  return <article className={`vybe-card rounded-[28px] p-5 ${item.severity === "critical" ? "ring-1 ring-red-400/25" : ""}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><StatusPill value={item.severity} /><StatusPill value={item.status} />{item.hidden && <span className="rounded-full bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-400">temporarily hidden</span>}</div><h2 className="mt-3 text-lg font-black capitalize">{item.sourceType} safety review</h2><p className="mt-1 text-xs text-slate-500">Subject {item.subjectUserId.slice(0, 8)} · Source {item.sourceId.slice(0, 8)}</p></div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-600"><ClientTimestamp value={item.createdAt} format="dateTime" /></p></div><p className="mt-4 text-sm leading-6 text-slate-400">{item.summary || "Flagged for human trust-and-safety review."}</p><div className="mt-3 flex flex-wrap gap-2">{item.categories.map((category) => <span key={category} className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold text-slate-500">{category}</span>)}</div>{open && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => act("dismiss")} className="vybe-button rounded-xl border border-white/10 py-2 text-xs font-bold text-slate-500">Dismiss</button>{item.sourceType === "message" && <button onClick={() => act("delete_message")} className="vybe-button rounded-xl border border-red-400/20 py-2 text-xs font-bold text-red-400">Remove message</button>}{item.sourceType === "story" && <button onClick={() => act("delete_story")} className="vybe-button rounded-xl border border-red-400/20 py-2 text-xs font-bold text-red-400">Delete story</button>}<button onClick={() => act("warn")} className="vybe-button rounded-xl border border-amber-400/20 py-2 text-xs font-bold text-amber-400">Warn</button><button onClick={() => act("suspend")} className="vybe-button rounded-xl border border-red-400/20 py-2 text-xs font-bold text-red-400">Suspend</button><button onClick={() => act("ban")} className="vybe-button rounded-xl bg-red-600 py-2 text-xs font-black text-white">Ban</button></div>}{!open && item.hidden && <button onClick={() => act("restore")} className="vybe-button mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-400/20 px-4 py-2 text-xs font-black text-blue-400"><RotateCcw size={14} /> Restore account/content</button>}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="sr-only" tabIndex={-1} aria-hidden /></article>;
}

function UserCard({ user, act }: { user: AdminUserSummary; act: (action: "warn" | "suspend" | "ban" | "restore") => void }) { return <article className="vybe-card rounded-[24px] p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{user.displayName}</h2><p className="text-xs text-slate-500">@{user.username}</p></div><StatusPill value={user.accountStatus} /></div>{user.suspendedUntil && <p className="mt-3 text-xs text-slate-500">Suspended until <ClientTimestamp value={user.suspendedUntil} format="dateTime" /></p>}<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => act("warn")} className="vybe-button rounded-xl border border-amber-400/20 py-2 text-xs font-bold text-amber-400">Warn</button><button onClick={() => act("suspend")} className="vybe-button rounded-xl border border-red-400/20 py-2 text-xs font-bold text-red-400">Suspend</button><button onClick={() => act("ban")} className="vybe-button inline-flex items-center justify-center gap-1 rounded-xl bg-red-600 py-2 text-xs font-black text-white"><Ban size={13} /> Ban</button><button onClick={() => act("restore")} className="vybe-button inline-flex items-center justify-center gap-1 rounded-xl border border-blue-400/20 py-2 text-xs font-black text-blue-400"><RotateCcw size={13} /> Restore</button></div></article>; }
