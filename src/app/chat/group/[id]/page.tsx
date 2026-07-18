"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BellOff, BellRing, Flag, ImagePlus, LogOut, Pencil, Send, Settings2, ShieldAlert, UserMinus, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { VoiceDraft, VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { getSupabasePlatformService } from "@/services";
import { useVybeStore } from "@/store/useVybeStore";
import type { Message, PublicProfile } from "@/types";

const EMPTY_GROUP_MESSAGES: Message[] = [];

function dayLabel(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value)); }

export default function GroupChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const currentUserId = useVybeStore((state) => state.currentUserId || "me");
  const group = useVybeStore((state) => state.groups.find((item) => item.id === id));
  const messages = useVybeStore((state) => state.groupMessages[id] || EMPTY_GROUP_MESSAGES);
  const people = useVybeStore((state) => state.people);
  const settings = useVybeStore((state) => state.settings);
  const mutedIds = useVybeStore((state) => state.mutedConversationIds);
  const sendGroupMessage = useVybeStore((state) => state.sendGroupMessage);
  const uploadMedia = useVybeStore((state) => state.uploadConversationMedia);
  const react = useVybeStore((state) => state.reactToGroupMessage);
  const deleteForMe = useVybeStore((state) => state.deleteMessageForMe);
  const deleteForEveryone = useVybeStore((state) => state.deleteMessageForEveryone);
  const togglePin = useVybeStore((state) => state.toggleMessagePin);
  const muteConversation = useVybeStore((state) => state.setConversationMuted);
  const markRead = useVybeStore((state) => state.markGroupRead);
  const updateGroup = useVybeStore((state) => state.updateGroup);
  const removeMember = useVybeStore((state) => state.removeGroupMember);
  const leaveGroup = useVybeStore((state) => state.leaveGroup);
  const reportContent = useVybeStore((state) => state.reportContent);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<{ send: (typing: boolean) => Promise<void>; unsubscribe: () => Promise<void> } | null>(null);
  const typingTimer = useRef<number | null>(null);
  const isMuted = mutedIds.includes(id) || group?.muted;
  const isOwner = group?.ownerId === currentUserId || group?.ownerId === "me";
  const active = Boolean(group?.memberIds.includes(currentUserId) || group?.memberIds.includes("me"));
  const members = useMemo(() => group?.memberIds.filter((memberId) => memberId !== currentUserId && memberId !== "me").map((memberId) => people.find((person) => person.id === memberId)).filter((person): person is PublicProfile => Boolean(person)) || [], [currentUserId, group?.memberIds, people]);
  const firstUnread = messages.findIndex((message) => !message.read && message.senderId !== currentUserId && message.senderId !== "me");

  useEffect(() => { if (active) void markRead(id); }, [active, id, markRead, messages.length]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: settings.animationsEnabled ? "smooth" : "auto" }); }, [messages.length, settings.animationsEnabled, typingIds.length]);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void getSupabasePlatformService().subscribeTyping(id, (userId, typing) => { if (!mounted) return; setTypingIds((current) => typing ? Array.from(new Set([...current, userId])) : current.filter((item) => item !== userId)); }).then((channel) => { if (!mounted) void channel.unsubscribe(); else typingChannel.current = channel; });
    return () => { mounted = false; if (typingChannel.current) void typingChannel.current.unsubscribe(); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingChannel.current = null; };
  }, [active, id]);

  if (!group) return <AppShell><div className="vybe-card grid min-h-[60vh] place-items-center rounded-[30px] p-8 text-center"><div><ShieldAlert className="mx-auto text-blue-400" /><h1 className="mt-4 text-xl font-black">Group unavailable</h1><p className="mt-2 text-sm text-slate-500">It may have been deleted, or you no longer have access.</p><Link href="/groups" className="vybe-button mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Back to groups</Link></div></div></AppShell>;
  if (!active) return <AppShell><div className="vybe-card grid min-h-[60vh] place-items-center rounded-[30px] p-8 text-center"><div><UsersRound className="mx-auto text-blue-400" /><h1 className="mt-4 text-xl font-black">Invite pending</h1><p className="mt-2 text-sm text-slate-500">Join this group from the Groups page before opening its messages.</p><Link href="/groups" className="vybe-button mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Review invite</Link></div></div></AppShell>;

  const submit = (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; void typingChannel.current?.send(false); void sendGroupMessage(id, text, { type: "text", replyToId: replyTo?.id }); setText(""); setReplyTo(null); };
  const sendVoice = async (draft: VoiceDraft) => { setUploading(true); try { const path = await uploadMedia("voice", id, draft.blob, draft.filename); await sendGroupMessage(id, "Voice message", { type: "voice", mediaPath: path, durationSeconds: draft.durationSeconds, waveform: draft.waveform, replyToId: replyTo?.id }); setReplyTo(null); } finally { setUploading(false); } };
  const sendImage = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file?.type.startsWith("image/")) return; setUploading(true); try { const path = await uploadMedia("image", id, file, file.name); await sendGroupMessage(id, "Photo", { type: "image", mediaPath: path, replyToId: replyTo?.id }); setReplyTo(null); } finally { setUploading(false); } };
  const updateTyping = (value: string) => { setText(value); if (!typingChannel.current) return; void typingChannel.current.send(Boolean(value)); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => void typingChannel.current?.send(false), 1200); };

  return <AppShell>
    <div className="vybe-card mx-auto flex h-[calc(100vh-11.5rem)] max-w-6xl flex-col overflow-hidden rounded-[30px] sm:h-[calc(100vh-8.5rem)]">
      <header className="flex items-center gap-3 border-b border-white/[.075] bg-[var(--panel-strong)]/92 p-4 backdrop-blur-xl"><button onClick={() => router.push("/groups")} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5" aria-label="Back to groups"><ArrowLeft size={19} /></button><span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-400 to-blue-900 text-white">{group.iconUrl ? <Image src={group.iconUrl} alt="" fill className="object-cover" unoptimized /> : <UsersRound size={20} />}</span><div className="min-w-0 flex-1"><h1 className="truncate font-black">{group.title}</h1><p className="truncate text-xs text-slate-500">{typingIds.length ? `${typingIds.map((userId) => people.find((person) => person.id === userId)?.username || "Someone").join(", ")} typing…` : `${group.memberIds.length} members`}</p></div><button onClick={() => void muteConversation(id, !isMuted)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label={isMuted ? "Unmute group" : "Mute group"}>{isMuted ? <BellOff size={18} /> : <BellRing size={18} />}</button><button onClick={() => setSettingsOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label="Group settings"><Settings2 size={18} /></button></header>
      {messages.some((message) => message.pinned) && <div className="border-b border-blue-400/12 bg-blue-500/[.055] px-5 py-2 text-xs text-blue-400">Pinned: <span className="text-slate-500">{messages.find((message) => message.pinned)?.text || "Media message"}</span></div>}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6"><div className="space-y-4"><AnimatePresence initial={false}>{messages.map((message, index) => { const previous = messages[index - 1]; const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt); const mine = message.senderId === currentUserId || message.senderId === "me"; const sender = people.find((person) => person.id === message.senderId); return <div key={message.id}>{showDay && <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/[.07]" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-600">{dayLabel(message.createdAt)}</span><span className="h-px flex-1 bg-white/[.07]" /></div>}{index === firstUnread && <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-blue-500/35" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-blue-400">Unread</span><span className="h-px flex-1 bg-blue-500/35" /></div>}{!mine && <p className="mb-1 ml-12 text-[10px] font-black text-blue-400">{sender?.username || "Group member"}</p>}<MessageBubble message={{ ...message, replyPreview: message.replyToId ? messages.find((item) => item.id === message.replyToId)?.text : undefined }} mine={mine} sender={sender} readReceipts={settings.readReceipts} onReact={(emoji) => void react(id, message.id, emoji)} onReply={() => setReplyTo(message)} onForward={() => navigator.clipboard?.writeText(message.text)} onDeleteMe={() => void deleteForMe(id, message.id, true)} onDeleteEveryone={() => void deleteForEveryone(id, message.id, true)} onPin={() => void togglePin(id, message.id, !message.pinned, true)} onReport={() => setReporting(message)} /></div>; })}</AnimatePresence>{typingIds.length > 0 && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-1 rounded-2xl border border-white/[.07] bg-white/[.05] p-3 text-xs text-blue-400"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:240ms]" /></motion.div>}<div ref={bottomRef} /></div></div>
      {replyTo && <div className="flex items-center gap-3 border-t border-blue-400/12 bg-blue-500/[.055] px-4 py-2.5"><div className="min-w-0 flex-1 border-l-2 border-blue-400 pl-3"><p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Replying</p><p className="truncate text-xs text-slate-500">{replyTo.text || `${replyTo.type} message`}</p></div><button onClick={() => setReplyTo(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500"><X size={15} /></button></div>}
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/[.075] bg-[var(--panel-strong)]/94 p-3 sm:p-4"><input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(event) => void sendImage(event)} /><button type="button" disabled={uploading} onClick={() => imageInput.current?.click()} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400" aria-label="Send image"><ImagePlus size={20} /></button><VoiceRecorder onSend={sendVoice} disabled={uploading} /><textarea rows={1} value={text} onChange={(event) => updateTyping(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event as unknown as FormEvent); } }} className="vybe-input min-h-12 flex-1 resize-none py-3.5" placeholder={`Message ${group.title}`} /><button disabled={!text.trim() || uploading} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white disabled:opacity-40" aria-label="Send"><Send size={18} /></button></form>
    </div>

    <AnimatePresence>{settingsOpen && <GroupSettings group={group} members={members} currentUserId={currentUserId} isOwner={Boolean(isOwner)} onClose={() => setSettingsOpen(false)} onUpdate={updateGroup} onRemove={removeMember} onLeave={async () => { await leaveGroup(id); router.push("/groups"); }} onReport={() => { void reportContent(group.ownerId, "group", group.id, "Unsafe group", group.title); setSettingsOpen(false); }} />}</AnimatePresence>
    <AnimatePresence>{reporting && <SimpleModal title="Report message" onClose={() => setReporting(null)}><p className="rounded-2xl border border-white/8 p-3 text-sm text-slate-500">{reporting.text || `${reporting.type} message`}</p><button onClick={() => { void reportContent(reporting.senderId, "message", reporting.id, "Unsafe group message", reporting.text); setReporting(null); }} className="mt-4 w-full rounded-2xl bg-red-600 py-3 font-black text-white">Submit report</button></SimpleModal>}</AnimatePresence>
  </AppShell>;
}

function GroupSettings({ group, members, currentUserId, isOwner, onClose, onUpdate, onRemove, onLeave, onReport }: { group: NonNullable<ReturnType<typeof useVybeStore.getState>["groups"][number]>; members: PublicProfile[]; currentUserId: string; isOwner: boolean; onClose: () => void; onUpdate: (id: string, title?: string, file?: File) => Promise<void>; onRemove: (groupId: string, memberId: string) => Promise<void>; onLeave: () => Promise<void>; onReport: () => void }) {
  const [title, setTitle] = useState(group.title); const [file, setFile] = useState<File>(); const [saving, setSaving] = useState(false);
  return <SimpleModal title="Group settings" onClose={onClose}><div className="flex items-center gap-4"><label className="relative grid h-20 w-20 cursor-pointer place-items-center overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-400 to-blue-900 text-white">{file ? <Image src={URL.createObjectURL(file)} alt="" fill className="object-cover" unoptimized /> : group.iconUrl ? <Image src={group.iconUrl} alt="" fill className="object-cover" unoptimized /> : <UsersRound />}{isOwner && <input type="file" accept="image/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0])} />}</label><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wider text-blue-400">{isOwner ? "Owner controls" : "Group info"}</p>{isOwner ? <input value={title} onChange={(event) => setTitle(event.target.value)} className="vybe-input mt-2" maxLength={50} /> : <h3 className="mt-2 text-xl font-black">{group.title}</h3>}</div></div>{isOwner && <button disabled={saving || !title.trim()} onClick={() => { setSaving(true); void onUpdate(group.id, title, file).finally(() => setSaving(false)); }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-black text-white"><Pencil size={16} /> {saving ? "Saving…" : "Save group"}</button>}<h3 className="mt-6 text-xs font-black uppercase tracking-[.15em] text-slate-500">Members</h3><div className="mt-3 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-white/[.07] p-3"><Avatar user={member} size="sm" /><div className="min-w-0 flex-1"><p className="font-black">{member.username}</p><p className="text-xs text-slate-500">{member.status}</p></div>{isOwner && member.id !== currentUserId && <button onClick={() => void onRemove(group.id, member.id)} className="grid h-9 w-9 place-items-center rounded-xl text-red-400 hover:bg-red-500/10" aria-label={`Remove ${member.username}`}><UserMinus size={16} /></button>}</div>)}</div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={onReport} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/15 py-3 text-xs font-black text-red-400"><Flag size={15} /> Report</button><button onClick={() => void onLeave()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 py-3 text-xs font-black text-white"><LogOut size={15} /> Leave</button></div></SimpleModal>;
}

function SimpleModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div initial={{ y: 18, scale: .97 }} animate={{ y: 0, scale: 1 }} className="vybe-card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[30px] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5"><X size={18} /></button></div><div className="mt-5">{children}</div></motion.div></motion.div>; }
