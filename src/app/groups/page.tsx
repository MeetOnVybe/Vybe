"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, MessageCircle, Plus, ShieldCheck, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";
import type { PublicProfile } from "@/types";

export default function GroupsPage() {
  const router = useRouter();
  const currentUserId = useVybeStore((state) => state.currentUserId || "me");
  const groups = useVybeStore((state) => state.groups);
  const groupMessages = useVybeStore((state) => state.groupMessages);
  const people = useVybeStore((state) => state.people);
  const friendStatuses = useVybeStore((state) => state.friendStatuses);
  const createGroup = useVybeStore((state) => state.createGroup);
  const respondInvite = useVybeStore((state) => state.respondGroupInvite);
  const [creating, setCreating] = useState(false);
  const friends = useMemo(() => people.filter((person) => friendStatuses[person.id] === "friends"), [friendStatuses, people]);
  const activeGroups = groups.filter((group) => group.memberIds.includes(currentUserId) || group.memberIds.includes("me"));
  const invites = groups.filter((group) => group.invitedIds.includes(currentUserId) || group.invitedIds.includes("me"));

  return <AppShell>
    <PageHeader eyebrow="Private circles" title="Group Chats" description="Create private groups with accepted friends. Group messages, images, voice notes, typing, receipts, pins, and notifications use the same secure conversation system." action={<button onClick={() => setCreating(true)} className="vybe-button inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"><Plus size={18} /> New group</button>} />

    {invites.length > 0 && <section className="mb-5 rounded-[28px] border border-blue-400/18 bg-blue-500/[.055] p-5"><h2 className="flex items-center gap-2 font-black text-blue-400"><UsersRound size={18} /> Group invites</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{invites.map((group) => <div key={group.id} className="rounded-2xl border border-white/[.07] bg-[var(--panel)] p-4"><div className="flex items-center gap-3"><GroupIcon group={group} /><div className="min-w-0 flex-1"><p className="truncate font-black">{group.title}</p><p className="text-xs text-slate-500">{group.memberIds.length} members</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void respondInvite(group.id, false)} className="vybe-button rounded-xl border border-white/10 py-2 text-xs font-bold text-slate-500">Decline</button><button onClick={() => void respondInvite(group.id, true)} className="vybe-button rounded-xl bg-blue-600 py-2 text-xs font-black text-white">Join</button></div></div>)}</div></section>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{activeGroups.map((group) => { const messages = groupMessages[group.id] || []; const last = messages.at(-1); const unread = messages.filter((message) => !message.read && message.senderId !== currentUserId && message.senderId !== "me").length; return <Link href={`/chat/group/${group.id}`} key={group.id} className="vybe-card group rounded-[28px] p-5 transition hover:-translate-y-1 hover:border-blue-400/20 hover:shadow-[0_18px_55px_rgba(0,82,180,.13)]"><div className="flex items-center gap-4"><GroupIcon group={group} large /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-black group-hover:text-blue-400">{group.title}</h2>{unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] font-black text-white">{unread}</span>}</div><p className="mt-1 text-xs text-slate-500">{group.memberIds.length} members · {group.ownerId === currentUserId || group.ownerId === "me" ? "You own this group" : "Private group"}</p></div></div><div className="mt-5 rounded-2xl border border-white/[.06] bg-white/[.025] p-4"><p className="truncate text-sm text-slate-400">{last ? `${last.senderId === "me" || last.senderId === currentUserId ? "You" : people.find((person) => person.id === last.senderId)?.username || "Member"}: ${last.type === "voice" ? "Voice message" : last.type === "image" ? "Photo" : last.text}` : "No messages yet"}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">{last ? <ClientTimestamp value={last.createdAt} format="dateTime" /> : "Start the VYBE"}</p></div><div className="mt-4 flex items-center justify-between text-xs"><span className="flex -space-x-2">{group.memberIds.filter((id) => id !== currentUserId && id !== "me").slice(0, 4).map((id) => <span key={id} className="rounded-full border-2 border-[var(--panel)]"><Avatar user={people.find((person) => person.id === id)} size="sm" showStatus={false} /></span>)}</span><span className="inline-flex items-center gap-1 font-black text-blue-400"><MessageCircle size={14} /> Open chat</span></div></Link>; })}</div>

    {!activeGroups.length && <div className="vybe-card grid min-h-72 place-items-center rounded-[30px] p-8 text-center"><div><UsersRound className="mx-auto text-blue-400" size={34} /><h2 className="mt-4 text-xl font-black">No groups yet</h2><p className="mt-2 text-sm text-slate-500">Create a private group with accepted friends.</p><button onClick={() => setCreating(true)} className="vybe-button mt-5 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Create your first group</button></div></div>}

    <section className="mt-5 grid gap-3 sm:grid-cols-3"><Info icon={ShieldCheck} title="Friends only invites" body="Only accepted friends can be invited." /><Info icon={UsersRound} title="Owner controls" body="Owners rename, update icons, and remove members." /><Info icon={MessageCircle} title="One chat system" body="Groups use the existing secure message tables." /></section>

    <AnimatePresence>{creating && <CreateGroupModal friends={friends} onClose={() => setCreating(false)} onCreate={async (title, ids) => { const id = await createGroup(title, ids); setCreating(false); if (id) router.push(`/chat/group/${id}`); }} />}</AnimatePresence>
  </AppShell>;
}

function GroupIcon({ group, large = false }: { group: ReturnType<typeof useVybeStore.getState>["groups"][number]; large?: boolean }) { const size = large ? "h-16 w-16" : "h-12 w-12"; return <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-blue-400 to-blue-900 text-white ${size}`}>{group.iconUrl ? <Image src={group.iconUrl} alt="" fill className="object-cover" unoptimized /> : <UsersRound size={large ? 26 : 20} />}</span>; }
function Info({ icon: Icon, title, body }: { icon: typeof ShieldCheck; title: string; body: string }) { return <div className="rounded-[22px] border border-white/[.07] bg-white/[.025] p-4"><Icon className="text-blue-400" size={18} /><p className="mt-3 font-black">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{body}</p></div>; }

function CreateGroupModal({ friends, onClose, onCreate }: { friends: PublicProfile[]; onClose: () => void; onCreate: (title: string, ids: string[]) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [saving, setSaving] = useState(false);
  return <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }} className="vybe-card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[30px] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-400">New group</p><h2 className="mt-1 text-xl font-black">Create a private circle</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5"><X size={18} /></button></div><label className="mt-5 block text-xs font-black text-slate-400">Group name<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={50} className="vybe-input mt-2" placeholder="After School VYBE" /></label><p className="mt-5 text-xs font-black uppercase tracking-[.15em] text-slate-500">Invite friends</p><div className="mt-3 space-y-2">{friends.map((friend) => { const active = selected.includes(friend.id); return <button key={friend.id} onClick={() => setSelected((current) => active ? current.filter((id) => id !== friend.id) : [...current, friend.id])} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${active ? "border-blue-400/35 bg-blue-500/10" : "border-white/[.07]"}`}><Avatar user={friend} size="sm" /><div className="min-w-0 flex-1"><p className="font-black">{friend.username}</p><p className="truncate text-xs text-slate-500">{friend.status}</p></div><span className={`grid h-6 w-6 place-items-center rounded-full ${active ? "bg-blue-600 text-white" : "border border-white/15"}`}>{active && <Check size={13} />}</span></button>; })}</div>{!friends.length && <p className="mt-3 rounded-2xl border border-white/[.07] p-4 text-sm text-slate-500">Accept at least one friend before creating a group.</p>}<button disabled={!title.trim() || !selected.length || saving} onClick={() => { setSaving(true); void onCreate(title, selected).finally(() => setSaving(false)); }} className="vybe-button mt-5 w-full rounded-2xl bg-blue-600 py-3.5 font-black text-white disabled:opacity-40">{saving ? "Creating…" : `Create group with ${selected.length} friend${selected.length === 1 ? "" : "s"}`}</button></motion.div></motion.div>;
}
