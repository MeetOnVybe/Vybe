"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Search, UsersRound, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { PageHeader } from "@/components/PageHeader";
import { PersonRow } from "@/components/PersonRow";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";
import type { Message } from "@/types";

function preview(message?: Message) {
  if (!message) return "Start a private chat";
  if (message.deletedForEveryone) return "Message deleted";
  if (message.type === "voice") return "Voice message";
  if (message.type === "image") return "Photo";
  return message.text || "New message";
}

export default function ChatInboxPage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const currentUserId = useVybeStore((state) => state.currentUserId || "me");
  const people = useVybeStore((state) => state.people);
  const statuses = useVybeStore((state) => state.friendStatuses);
  const matchStatuses = useVybeStore((state) => state.matchStatuses);
  const messages = useVybeStore((state) => state.messages);
  const groups = useVybeStore((state) => state.groups);
  const groupMessages = useVybeStore((state) => state.groupMessages);
  const typingUsers = useVybeStore((state) => state.typingUsers);
  const [query, setQuery] = useState("");
  const users = dataMode === "demo" ? SIM_USERS : people;
  const clean = query.trim().toLowerCase();

  const direct = useMemo(() => users
    .filter((user) => (statuses[user.id] === "friends" || matchStatuses[user.id] === "active") && `${user.username} ${user.displayName}`.toLowerCase().includes(clean))
    .sort((a, b) => (messages[b.id]?.at(-1)?.createdAt ?? "").localeCompare(messages[a.id]?.at(-1)?.createdAt ?? "")), [clean, matchStatuses, messages, statuses, users]);
  const activeGroups = groups
    .filter((group) => (group.memberIds.includes(currentUserId) || group.memberIds.includes("me")) && group.title.toLowerCase().includes(clean))
    .sort((a, b) => (groupMessages[b.id]?.at(-1)?.createdAt ?? b.lastMessageAt ?? "").localeCompare(groupMessages[a.id]?.at(-1)?.createdAt ?? a.lastMessageAt ?? ""));

  return <AppShell>
    <PageHeader eyebrow="Private conversations" title="Chat Inbox" description={dataMode === "supabase" ? "Friend, match, and group conversations sync through the same Supabase Realtime system with voice notes, photos, replies, receipts, reactions, pins, and unread counts." : "Demo friend, match, and group chats use the complete Phase 4 communication experience locally."} action={<div className="relative w-full sm:w-64"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="vybe-input pl-11" placeholder="Search conversations" aria-label="Search conversations" /></div>} />

    {activeGroups.length > 0 && <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black"><UsersRound className="text-blue-400" size={17} /> Group chats</h2><Link href="/groups" className="text-xs font-black text-blue-400">Manage groups</Link></div><div className="grid gap-3 lg:grid-cols-2">{activeGroups.map((group) => { const thread = groupMessages[group.id] || []; const last = thread.at(-1); const unread = thread.filter((message) => !message.read && message.senderId !== currentUserId && message.senderId !== "me").length; return <Link key={group.id} href={`/chat/group/${group.id}`} className="vybe-card flex min-w-0 items-center gap-4 rounded-[24px] p-4 transition hover:-translate-y-0.5 hover:border-blue-400/20"><span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-blue-400 to-blue-950 text-white">{group.iconUrl ? <Image src={group.iconUrl} alt="" fill className="object-cover" unoptimized /> : <UsersRound size={22} />}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-black">{group.title}</h3>{group.muted && <span className="text-[9px] font-black uppercase tracking-wider text-slate-600">Muted</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{last ? `${last.senderId === "me" || last.senderId === currentUserId ? "You" : users.find((person) => person.id === last.senderId)?.username || "Member"}: ${preview(last)}` : "Start the group VYBE"}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{last ? <ClientTimestamp value={last.createdAt} format="dateTime" /> : `${group.memberIds.length} members`}</p></div>{unread > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-blue-600 px-1.5 py-1 text-[10px] font-black text-white">{unread}</span>}</Link>; })}</div></section>}

    <section><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black"><MessageCircle className="text-blue-400" size={17} /> Direct chats</h2><div className="flex gap-3 text-xs font-black"><Link href="/friends" className="text-blue-400">Friends</Link><Link href="/matches" className="text-blue-400">Matches</Link></div></div><div className="grid gap-3 lg:grid-cols-2">{direct.map((user) => { const thread = messages[user.id] ?? []; const last = thread.at(-1); const unread = thread.filter((message) => !message.read && message.senderId === user.id).length; const subtitle = typingUsers[user.id] ? "typing…" : preview(last); const meta = last ? <ClientTimestamp value={last.createdAt} /> : user.lastSeen; return <PersonRow key={user.id} user={user} subtitle={subtitle} meta={meta} badge={unread} action={{ label: last?.type === "voice" ? "Play" : "Open", href: `/chat/${user.id}` }} />; })}</div></section>

    {!direct.length && !activeGroups.length && <div className="vybe-card mt-5 grid min-h-72 place-items-center rounded-[30px] p-8 text-center"><div><Waves className="mx-auto text-blue-400" /><h2 className="mt-4 text-xl font-black">{query ? "No conversations found" : "Your inbox is ready"}</h2><p className="mt-2 text-sm text-slate-500">{query ? "Try another name or group title." : "Accepted friends, active matches, and private groups appear here."}</p>{!query && <div className="mt-5 flex flex-wrap justify-center gap-2"><Link href="/friends" className="vybe-button rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Open connections</Link><Link href="/groups" className="vybe-button rounded-2xl border border-white/10 px-5 py-3 font-black">Create group</Link></div>}</div></div>}
  </AppShell>;
}
