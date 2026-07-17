"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, HeartHandshake, MessageCircle, UserMinus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BlockModal, ReportModal } from "@/components/Modals";
import { PageHeader } from "@/components/PageHeader";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

export default function MatchesPage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const people = useVybeStore((state) => state.people);
  const matches = useVybeStore((state) => state.matches);
  const unmatch = useVybeStore((state) => state.unmatch);
  const [reportId, setReportId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const users = dataMode === "demo" ? SIM_USERS : people;
  const active = matches.filter((match) => match.status === "active").map((match) => ({ match, user: users.find((user) => user.id === match.userId) })).filter((item) => item.user);
  const reportUser = users.find((user) => user.id === reportId);
  const blockUser = users.find((user) => user.id === blockId);

  return <AppShell>
    <PageHeader eyebrow="Mutual likes only" title="Your Matches" description="Friendship and matching are separate. An accepted friend can still chat after unmatching; a match-only conversation locks immediately when the match ends." action={<Link href="/discover" className="vybe-button rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">Discover people</Link>} />
    {active.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(({ match, user }) => user && <article key={match.id} className="vybe-card overflow-hidden rounded-[28px]"><div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${user.banner})` }} /><div className="p-5"><div className="-mt-12 flex items-end gap-3"><div className="rounded-[24px] border-4 border-[var(--panel-strong)]"><Avatar user={user} size="lg" /></div><div className="pb-1"><h2 className="font-black">{user.displayName}</h2><p className="text-xs font-bold text-blue-500">@{user.username}</p></div></div><p className="mt-4 text-xs leading-5 text-slate-500">Matched {new Date(match.createdAt).toLocaleDateString()} • {user.lastSeen}</p><div className="mt-5 grid grid-cols-2 gap-2"><Link href={`/chat/${user.id}`} className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white"><MessageCircle size={16} /> Message</Link><Link href={`/profile/${user.id}`} className="vybe-button inline-flex items-center justify-center rounded-2xl border border-white/10 py-3 text-sm font-black text-slate-400">View profile</Link></div><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => void unmatch(match.id)} className="vybe-button inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 py-2 text-[10px] font-bold text-slate-500"><UserMinus size={13} /> Unmatch</button><button onClick={() => setReportId(user.id)} className="vybe-button rounded-xl border border-white/10 py-2 text-[10px] font-bold text-slate-500">Report</button><button onClick={() => setBlockId(user.id)} className="vybe-button inline-flex items-center justify-center gap-1 rounded-xl border border-red-400/15 py-2 text-[10px] font-bold text-red-400"><Ban size={13} /> Block</button></div></div></article>)}</div> : <div className="vybe-card grid min-h-96 place-items-center rounded-[32px] p-8 text-center"><div><HeartHandshake className="mx-auto text-blue-500" size={40} /><h2 className="mt-5 text-2xl font-black">No active matches yet</h2><p className="mt-2 text-sm text-slate-500">A match appears only after two eligible members like each other.</p><Link href="/discover" className="vybe-button mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Start discovering</Link></div></div>}
    {reportUser && <ReportModal open onClose={() => setReportId(null)} userId={reportUser.id} username={reportUser.username} />}
    {blockUser && <BlockModal open onClose={() => setBlockId(null)} userId={blockUser.id} username={blockUser.username} />}
  </AppShell>;
}
