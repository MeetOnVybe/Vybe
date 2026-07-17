"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { LoaderCircle, MessageCircle, Search, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PersonRow } from "@/components/PersonRow";
import { BlockModal } from "@/components/Modals";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

export default function FriendsPage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const people = useVybeStore((state) => state.people);
  const statuses = useVybeStore((state) => state.friendStatuses);
  const incomingRequests = useVybeStore((state) => state.incomingRequestIds);
  const searchResults = useVybeStore((state) => state.searchResults);
  const searchingMembers = useVybeStore((state) => state.searchingMembers);
  const searchMembers = useVybeStore((state) => state.searchMembers);
  const clearMemberSearch = useVybeStore((state) => state.clearMemberSearch);
  const sendRequest = useVybeStore((state) => state.sendFriendRequest);
  const unfriend = useVybeStore((state) => state.unfriend);
  const users = dataMode === "demo" ? SIM_USERS : people;
  const [menuId, setMenuId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const friends = users.filter((user) => statuses[user.id] === "friends" && `${user.username} ${user.displayName}`.toLowerCase().includes(query.toLowerCase()));
  const pendingOutgoing = users.filter((user) => statuses[user.id] === "pending");
  const blocking = [...users, ...searchResults].find((user) => user.id === blockId);
  const requestCount = incomingRequests.length + pendingOutgoing.length;

  const discover = (event: FormEvent) => {
    event.preventDefault();
    void searchMembers(discoverQuery);
  };

  return <AppShell><PageHeader eyebrow="Your people" title="Friends" description="Accepted friends unlock private chat, online status, read receipts, reactions, and real-time activity." action={<Link href="/requests" className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-100"><UserPlus size={17} /> Requests {requestCount ? `(${requestCount})` : ""}</Link>} />

    {dataMode === "supabase" && <section className="vybe-card mb-5 rounded-[26px] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end"><div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-300">Find a real VYBE member</p><h2 className="mt-2 text-xl font-black">Search by username or display name</h2><p className="mt-1 text-xs text-slate-500">Only accounts in your database-calculated age bracket can appear.</p></div><form onSubmit={discover} className="flex w-full gap-2 sm:max-w-md"><input value={discoverQuery} onChange={(event) => { setDiscoverQuery(event.target.value); if (!event.target.value) clearMemberSearch(); }} className="vybe-input" placeholder="Search members" aria-label="Search VYBE members" minLength={2} /><button disabled={searchingMembers || discoverQuery.trim().length < 2} className="vybe-button grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-blue-600 disabled:opacity-50" aria-label="Search members">{searchingMembers ? <LoaderCircle className="animate-spin" size={18} /> : <Search size={18} />}</button></form></div>{searchResults.length > 0 && <div className="mt-4 grid gap-3 lg:grid-cols-2">{searchResults.map((user) => <PersonRow key={user.id} user={user} subtitle={user.bio || user.status} meta={`Ages ${user.ageBracket}`} action={statuses[user.id] === "friends" ? { label: "Chat", href: `/chat/${user.id}` } : statuses[user.id] === "pending" ? { label: "Pending" } : { label: "Add friend", onClick: () => void sendRequest(user.id) }} />)}</div>}</section>}

    {friends.length > 0 && <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="vybe-card-soft rounded-2xl p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total friends</p><p className="mt-1 text-2xl font-black">{friends.length}</p></div><div className="vybe-card-soft rounded-2xl p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Online now</p><p className="mt-1 text-2xl font-black text-emerald-300">{friends.filter((friend) => friend.online).length}</p></div><div className="relative"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="vybe-input h-full pl-11" placeholder="Search friends" aria-label="Search friends" /></div></div>}

    {friends.length ? <div className="grid gap-3 lg:grid-cols-2">{friends.map((user) => <div key={user.id} className="relative"><PersonRow user={user} subtitle={user.status} meta={user.lastSeen} action={{ label: "Chat", href: `/chat/${user.id}` }} menu={() => setMenuId(menuId === user.id ? null : user.id)} />{menuId === user.id && <div className="absolute right-3 top-16 z-20 w-48 rounded-2xl border border-white/10 bg-[#0b111d]/98 p-2 shadow-2xl backdrop-blur-xl"><button onClick={() => { void unfriend(user.id); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"><UserMinus size={16} /> Unfriend</button><button onClick={() => { setBlockId(user.id); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10">Block user</button></div>}</div>)}</div> : <div className="vybe-card grid min-h-80 place-items-center rounded-[30px] p-8 text-center"><div>{query ? <Search className="mx-auto text-blue-400" size={32} /> : <UsersRound className="mx-auto text-blue-400" size={32} />}<h2 className="mt-5 text-xl font-black">{query ? "No friend matches that search" : "No accepted friends yet"}</h2><p className="mt-2 text-sm text-slate-500">{query ? "Try another username or display name." : dataMode === "supabase" ? "Search for another verified account above, then send a friend request." : "Add someone during a demo match. Their simulated acceptance arrives shortly."}</p>{dataMode === "demo" && !query && <Link href="/solo" className="vybe-button mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black"><MessageCircle size={17} /> Start matching</Link>}</div></div>}
    {blocking && <BlockModal open onClose={() => setBlockId(null)} userId={blocking.id} username={blocking.username} />}
  </AppShell>;
}
