"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Ban, BellOff, BellRing, Flag, ImagePlus, Pin, Send, ShieldAlert, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { VoiceDraft, VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { BlockModal, ReportModal } from "@/components/Modals";
import { getSupabasePlatformService } from "@/services";
import { useVybeStore } from "@/store/useVybeStore";
import type { Message } from "@/types";

const EMPTY_MESSAGES: Message[] = [];

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined }).format(date);
}

export default function PrivateChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const people = useVybeStore((state) => state.people);
  const conversationId = useVybeStore((state) => state.conversationIdsByUser[id]);
  const currentUserId = useVybeStore((state) => state.currentUserId);
  const user = people.find((item) => item.id === id);
  const status = useVybeStore((state) => state.friendStatuses[id]);
  const matchStatus = useVybeStore((state) => state.matchStatuses[id]);
  const messages = useVybeStore((state) => state.messages[id] ?? EMPTY_MESSAGES);
  const typing = useVybeStore((state) => state.typingUsers[id] ?? false);
  const settings = useVybeStore((state) => state.settings);
  const mutedIds = useVybeStore((state) => state.mutedConversationIds);
  const sendMessage = useVybeStore((state) => state.sendMessage);
  const uploadMedia = useVybeStore((state) => state.uploadConversationMedia);
  const reactToMessage = useVybeStore((state) => state.reactToMessage);
  const deleteForMe = useVybeStore((state) => state.deleteMessageForMe);
  const deleteForEveryone = useVybeStore((state) => state.deleteMessageForEveryone);
  const togglePin = useVybeStore((state) => state.toggleMessagePin);
  const setConversationMuted = useVybeStore((state) => state.setConversationMuted);
  const reportContent = useVybeStore((state) => state.reportContent);
  const markRead = useVybeStore((state) => state.markChatRead);
  const setTyping = useVybeStore((state) => state.setTyping);
  const friends = useVybeStore((state) => state.friendStatuses);
  const matchesByUser = useVybeStore((state) => state.matchStatuses);
  const matches = useVybeStore((state) => state.matches);
  const unmatch = useVybeStore((state) => state.unmatch);
  const [text, setText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [reportingMessage, setReportingMessage] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingChannel = useRef<{ send: (typing: boolean) => Promise<void>; unsubscribe: () => Promise<void> } | null>(null);
  const threadConversationId = conversationId || "";
  const isMuted = mutedIds.includes(threadConversationId);

  const connections = useMemo(() => people.filter((person) => person.id !== id && (friends[person.id] === "friends" || matchesByUser[person.id] === "active")), [friends, id, matchesByUser, people]);
  const firstUnread = messages.findIndex((message) => !message.read && message.senderId === id);

  useEffect(() => { if (user && (status === "friends" || matchStatus === "active")) void markRead(id); }, [id, markRead, matchStatus, messages.length, status, user]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: settings.animationsEnabled ? "smooth" : "auto" }); }, [messages.length, settings.animationsEnabled, typing]);
  useEffect(() => {
    if (!conversationId || !user) return;
    let active = true;
    void getSupabasePlatformService().subscribeTyping(conversationId, (_userId, isTyping) => setTyping(id, isTyping)).then((channel) => {
      if (!active) { void channel.unsubscribe(); return; }
      typingChannel.current = channel;
    });
    return () => { active = false; if (typingTimer.current) window.clearTimeout(typingTimer.current); if (typingChannel.current) void typingChannel.current.unsubscribe(); typingChannel.current = null; setTyping(id, false); };
  }, [conversationId, id, setTyping, user]);

  if (!user) return <AppShell><div className="vybe-card rounded-[28px] p-8 text-center">User not found or no longer available.</div></AppShell>;
  if (status !== "friends" && matchStatus !== "active") return <AppShell><div className="vybe-card grid min-h-[60vh] place-items-center rounded-[30px] p-8 text-center"><div><ShieldAlert className="mx-auto text-blue-400" size={32} /><h1 className="mt-5 text-2xl font-black">Chat locked</h1><p className="mt-2 text-sm text-slate-500">Private chat requires an accepted friendship or active mutual match, with neither account blocked.</p><Link href="/friends" className="vybe-button mt-6 inline-flex rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">Open Connections</Link></div></div></AppShell>;

  const activeMatch = matches.find((match) => match.userId === id && match.status === "active");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; void typingChannel.current?.send(false); void sendMessage(id, text, { replyToId: replyTo?.id, type: "text" }); setText(""); setReplyTo(null); };
  const sendVoice = async (draft: VoiceDraft) => { setUploading(true); try { const path = await uploadMedia("voice", threadConversationId, draft.blob, draft.filename); await sendMessage(id, "Voice message", { type: "voice", mediaPath: path, durationSeconds: draft.durationSeconds, waveform: draft.waveform, replyToId: replyTo?.id }); setReplyTo(null); } finally { setUploading(false); } };
  const sendImage = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || !file.type.startsWith("image/")) return; setUploading(true); try { const path = await uploadMedia("image", threadConversationId, file, file.name); await sendMessage(id, "Photo", { type: "image", mediaPath: path, replyToId: replyTo?.id }); setReplyTo(null); } finally { setUploading(false); } };
  const onTextChange = (value: string) => { setText(value); if (!typingChannel.current) return; void typingChannel.current.send(Boolean(value)); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => void typingChannel.current?.send(false), 1200); };

  return (
    <AppShell>
      <div className="vybe-card mx-auto flex h-[calc(100vh-11.5rem)] max-w-5xl flex-col overflow-hidden rounded-[30px] sm:h-[calc(100vh-8.5rem)]">
        <header className="flex items-center gap-3 border-b border-white/[.075] bg-[var(--panel-strong)]/90 p-4 backdrop-blur-xl">
          <button onClick={() => router.push("/chat")} className="vybe-button grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5" aria-label="Back to chat inbox"><ArrowLeft size={19} /></button>
          <Avatar user={user} size="sm" />
          <div className="min-w-0 flex-1"><Link href={`/profile/${user.id}`} className="font-black tracking-tight hover:text-blue-400">{user.username}</Link><p className={`text-xs ${typing ? "text-blue-400" : "text-slate-500"}`}>{typing ? <span className="inline-flex items-center gap-1">typing<span className="flex gap-0.5"><i className="h-1 w-1 animate-bounce rounded-full bg-blue-400" /><i className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:120ms]" /><i className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:240ms]" /></span></span> : user.lastSeen}</p></div>
          <button onClick={() => void setConversationMuted(threadConversationId, !isMuted)} className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label={isMuted ? "Unmute conversation" : "Mute conversation"}>{isMuted ? <BellOff size={18} /> : <BellRing size={18} />}</button>
          {activeMatch && <button onClick={() => void unmatch(activeMatch.id)} className="vybe-button hidden rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black text-slate-500 hover:bg-white/5 sm:block">Unmatch</button>}<button onClick={() => setReportOpen(true)} className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Report profile"><Flag size={18} /></button>
          <button onClick={() => setBlockOpen(true)} className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-red-400 hover:bg-red-500/10" aria-label="Block"><Ban size={18} /></button>
        </header>

        {messages.some((message) => message.pinned) && <div className="flex items-center gap-2 border-b border-blue-400/12 bg-blue-500/[.055] px-5 py-2.5 text-xs text-blue-400"><Pin size={13} /><span className="font-black">{messages.filter((message) => message.pinned).length} pinned</span><span className="truncate text-slate-500">{messages.find((message) => message.pinned)?.text}</span></div>}

        <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,.055),transparent_38%)] p-4 sm:p-6">
          {settings.safetyReminders && <div className="mx-auto mb-7 max-w-md rounded-2xl border border-blue-400/15 bg-blue-500/[.065] p-3 text-center text-[11px] leading-5 text-blue-300">Voice notes and messages are private to this conversation. Keep precise location and personal information out of chat.</div>}
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
                const mine = message.senderId === "me" || message.senderId === currentUserId;
                return <div key={message.id}>{showDay && <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-white/[.07]" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-600">{dayLabel(message.createdAt)}</span><span className="h-px flex-1 bg-white/[.07]" /></div>}{index === firstUnread && <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-blue-500/35" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-blue-400">New messages</span><span className="h-px flex-1 bg-blue-500/35" /></div>}<MessageBubble message={{ ...message, replyPreview: message.replyToId ? messages.find((item) => item.id === message.replyToId)?.text : undefined }} mine={mine} sender={user} readReceipts={settings.readReceipts} onReact={(emoji) => void reactToMessage(id, message.id, emoji)} onReply={() => setReplyTo(message)} onForward={() => setForwarding(message)} onDeleteMe={() => void deleteForMe(id, message.id)} onDeleteEveryone={() => void deleteForEveryone(id, message.id)} onPin={() => void togglePin(id, message.id, !message.pinned)} onReport={() => setReportingMessage(message)} /></div>;
              })}
            </AnimatePresence>
            {typing && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2"><Avatar user={user} size="sm" showStatus={false} /><div className="flex gap-1 rounded-[18px] rounded-bl-md border border-white/[.07] bg-white/[.06] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:240ms]" /></div></motion.div>}
            <div ref={bottomRef} />
          </div>
        </div>

        {replyTo && <div className="flex items-center gap-3 border-t border-blue-400/12 bg-blue-500/[.055] px-4 py-2.5"><div className="min-w-0 flex-1 border-l-2 border-blue-400 pl-3"><p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Replying</p><p className="truncate text-xs text-slate-500">{replyTo.text || `${replyTo.type} message`}</p></div><button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/5"><X size={15} /></button></div>}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/[.075] bg-[var(--panel-strong)]/94 p-3 backdrop-blur-xl sm:p-4">
          <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(event) => void sendImage(event)} />
          <button type="button" disabled={uploading} onClick={() => imageInput.current?.click()} className="vybe-button grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400" aria-label="Send image"><ImagePlus size={20} /></button>
          <VoiceRecorder onSend={sendVoice} disabled={uploading} />
          <textarea rows={1} value={text} onChange={(event) => onTextChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event as unknown as FormEvent); } }} className="vybe-input min-h-12 flex-1 resize-none py-3.5" placeholder={`Message ${user.username}`} aria-label={`Message ${user.username}`} />
          <button disabled={!text.trim() || uploading} className="vybe-button grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-[0_0_24px_rgba(37,99,235,.28)] hover:bg-blue-500 disabled:opacity-40" aria-label="Send message"><Send size={19} /></button>
        </form>
      </div>

      <ReportModal open={reportOpen} userId={id} username={user.username} onClose={() => setReportOpen(false)} />
      <BlockModal open={blockOpen} userId={id} username={user.username} onClose={() => setBlockOpen(false)} afterBlock={() => router.push("/chat")} />
      <AnimatePresence>{forwarding && <Modal title="Forward message" onClose={() => setForwarding(null)}><div className="space-y-2">{connections.map((person) => <button key={person.id} onClick={() => { void sendMessage(person.id, forwarding.type === "text" ? forwarding.text : `Forwarded ${forwarding.type || "message"}`, { type: "text", forwardedFromId: forwarding.id }); setForwarding(null); }} className="flex w-full items-center gap-3 rounded-2xl border border-white/8 p-3 text-left hover:bg-white/5"><Avatar user={person} size="sm" /><div><p className="font-black">{person.username}</p><p className="text-xs text-slate-500">{person.displayName}</p></div></button>)}</div></Modal>}</AnimatePresence>
      <AnimatePresence>{reportingMessage && <Modal title="Report message" onClose={() => setReportingMessage(null)}><p className="rounded-2xl border border-white/8 bg-white/[.03] p-3 text-sm text-slate-400">{reportingMessage.text || `${reportingMessage.type} message`}</p><button onClick={() => { void reportContent(id, "message", reportingMessage.id, "Unsafe message", reportingMessage.text); setReportingMessage(null); }} className="vybe-button mt-4 w-full rounded-2xl bg-red-600 px-5 py-3 font-black text-white">Submit message report</button></Modal>}</AnimatePresence>
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: .97 }} className="vybe-card w-full max-w-md rounded-[28px] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{title}</h2><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-white/5" aria-label="Close"><X size={17} /></button></div><div className="mt-4">{children}</div></motion.div></motion.div>;
}
