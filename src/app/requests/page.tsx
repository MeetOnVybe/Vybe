"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, UserCheck, UserPlus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

export default function RequestsPage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const people = useVybeStore((state) => state.people);
  const statuses = useVybeStore((state) => state.friendStatuses);
  const incomingIds = useVybeStore((state) => state.incomingRequestIds);
  const accept = useVybeStore((state) => state.acceptFriendRequest);
  const decline = useVybeStore((state) => state.declineFriendRequest);
  const cancel = useVybeStore((state) => state.cancelFriendRequest);
  const users = dataMode === "demo" ? SIM_USERS : people;
  const incoming = users.filter((user) => incomingIds.includes(user.id));
  const outgoing = users.filter((user) => statuses[user.id] === "pending");

  return <AppShell><PageHeader eyebrow="Connections" title="Friend Requests" description="Accept, decline, or cancel private connection requests. Changes sync in real time in Supabase mode." />
    {incoming.length > 0 && <section><div className="mb-3 flex items-center gap-2"><UserPlus size={17} className="text-blue-400" /><h2 className="text-sm font-black uppercase tracking-[.14em]">Incoming</h2><span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-black">{incoming.length}</span></div><div className="space-y-3">{incoming.map((user) => <div key={user.id} className="vybe-card flex flex-col gap-4 rounded-[22px] p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar user={user} /><div><Link href={`/profile/${user.id}`} className="font-black hover:text-blue-300">{user.username}</Link><p className="mt-1 text-xs text-slate-400">{user.status}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">Ages {user.ageBracket}</p></div></div><div className="flex gap-2"><button onClick={() => void decline(user.id)} className="vybe-button flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5">Decline</button><button onClick={() => void accept(user.id)} className="vybe-button flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black hover:bg-blue-500">Accept</button></div></div>)}</div></section>}
    {outgoing.length > 0 && <section className={incoming.length ? "mt-7" : ""}><div className="mb-3 flex items-center gap-2"><ArrowUpRight size={17} className="text-blue-400" /><h2 className="text-sm font-black uppercase tracking-[.14em]">Sent</h2></div><div className="space-y-3">{outgoing.map((user) => <div key={user.id} className="vybe-card flex items-center gap-3 rounded-[22px] p-4"><Avatar user={user} /><div className="min-w-0 flex-1"><Link href={`/profile/${user.id}`} className="font-black hover:text-blue-300">{user.username}</Link><p className="mt-1 text-xs text-slate-500">Waiting for a response</p></div><span className="hidden items-center gap-1.5 rounded-full border border-blue-400/15 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black text-blue-200 sm:inline-flex"><Clock3 size={12} /> Pending</span><button onClick={() => void cancel(user.id)} className="vybe-button grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/5" aria-label={`Cancel request to ${user.username}`}><X size={16} /></button></div>)}</div></section>}
    {!incoming.length && !outgoing.length && <div className="vybe-card grid min-h-72 place-items-center rounded-[30px] p-8 text-center"><div><UserCheck className="mx-auto text-blue-400" size={30} /><h2 className="mt-5 text-xl font-black">No pending requests</h2><p className="mt-2 text-sm text-slate-500">New requests and sent connections will appear here.</p><Link href={dataMode === "supabase" ? "/friends" : "/solo"} className="vybe-button mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black"><UserPlus size={17} /> {dataMode === "supabase" ? "Find members" : "Meet someone"}</Link></div></div>}
  </AppShell>;
}
