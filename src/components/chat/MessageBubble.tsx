"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, CheckCheck, CornerUpLeft, Ellipsis, Flag, Forward, Pin, PinOff, SmilePlus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { VoiceMessagePlayer } from "@/components/chat/VoiceMessagePlayer";
import type { Message, SimUser } from "@/types";

const REACTIONS = ["💙", "😂", "🔥", "👍", "😮"];

export function MessageBubble({ message, mine, sender, showAvatar = true, readReceipts = true, onReact, onReply, onForward, onDeleteMe, onDeleteEveryone, onPin, onReport }: {
  message: Message;
  mine: boolean;
  sender?: SimUser;
  showAvatar?: boolean;
  readReceipts?: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onDeleteMe: () => void;
  onDeleteEveryone: () => void;
  onPin: () => void;
  onReport: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [reactionMenu, setReactionMenu] = useState(false);
  const reactions = Object.entries(message.reactions).filter(([, count]) => count > 0);
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[90%] items-end gap-2 sm:max-w-[78%] ${mine ? "flex-row-reverse" : ""}`}>
        {!mine && showAvatar && sender && <Avatar user={sender} size="sm" showStatus={false} />}
        <div className="relative min-w-0">
          {message.pinned && <span className={`mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-blue-400 ${mine ? "justify-end" : ""}`}><Pin size={10} /> Pinned</span>}
          <div className={`relative rounded-[21px] px-4 py-3 text-sm leading-6 shadow-lg ${mine ? "rounded-br-md bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-950/30" : "rounded-bl-md border border-white/[.075] bg-white/[.065] text-[var(--text-primary)]"}`}>
            {message.replyPreview && <div className={`mb-2 rounded-xl border-l-2 px-3 py-2 text-[11px] leading-4 ${mine ? "border-white/65 bg-black/10 text-blue-100" : "border-blue-400 bg-blue-500/8 text-slate-400"}`}>{message.replyPreview}</div>}
            {message.forwardedFromId && <p className={`mb-1 text-[9px] font-black uppercase tracking-wider ${mine ? "text-blue-100/70" : "text-blue-400"}`}>Forwarded</p>}
            {message.type === "voice" && message.mediaUrl ? <VoiceMessagePlayer src={message.mediaUrl} duration={message.durationSeconds} waveform={message.waveform} mine={mine} /> : message.type === "image" && message.mediaUrl ? <div className="relative mb-1 h-56 w-56 max-w-full overflow-hidden rounded-2xl"><Image src={message.mediaUrl} alt="Shared chat image" fill sizes="224px" className="object-cover" unoptimized /></div> : <p className={message.deletedForEveryone ? "italic opacity-60" : "whitespace-pre-wrap break-words"}>{message.text}</p>}
            {message.storyId && <p className={`mt-2 text-[9px] font-bold ${mine ? "text-blue-100/70" : "text-blue-400"}`}>Reply to a story</p>}
            <div className={`mt-1.5 flex items-center gap-1.5 text-[9px] ${mine ? "justify-end text-blue-100/70" : "text-slate-500"}`}>
              <ClientTimestamp value={message.createdAt} />
              {mine && readReceipts && (message.deliveryStatus === "read" ? <span className="inline-flex items-center gap-1 text-blue-100"><CheckCheck size={12} /> {message.seenByCount && message.seenByCount > 1 ? `Seen by ${message.seenByCount}` : "Seen"}</span> : message.deliveryStatus === "delivered" ? <span className="inline-flex items-center gap-1"><CheckCheck size={12} /> Delivered</span> : <span className="inline-flex items-center gap-1"><Check size={12} /> Sent</span>)}
            </div>
          </div>
          {reactions.length > 0 && <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>{reactions.map(([emoji, count]) => <button type="button" key={emoji} onClick={() => onReact(emoji)} className={`rounded-full border px-2 py-0.5 text-[11px] ${message.myReaction === emoji ? "border-blue-400/40 bg-blue-500/15" : "border-white/10 bg-[var(--panel)]"}`}>{emoji} {count}</button>)}</div>}
          <div className={`mt-1 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 ${mine ? "justify-end" : ""}`}>
            <button type="button" onClick={() => setReactionMenu((value) => !value)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label="React"><SmilePlus size={14} /></button>
            <button type="button" onClick={onReply} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label="Reply"><CornerUpLeft size={14} /></button>
            <button type="button" onClick={() => setMenu((value) => !value)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-blue-400" aria-label="More message actions"><Ellipsis size={15} /></button>
          </div>
          <AnimatePresence>{reactionMenu && <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} className={`absolute z-30 flex gap-1 rounded-full border border-white/10 bg-[var(--panel-strong)] p-1.5 shadow-2xl ${mine ? "right-0" : "left-0"}`}>{REACTIONS.map((emoji) => <button type="button" key={emoji} onClick={() => { onReact(emoji); setReactionMenu(false); }} className="grid h-8 w-8 place-items-center rounded-full hover:bg-blue-500/15">{emoji}</button>)}</motion.div>}</AnimatePresence>
          <AnimatePresence>{menu && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`absolute z-30 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel-strong)] p-1.5 shadow-2xl ${mine ? "right-0" : "left-0"}`}>
            <Action icon={Forward} label="Forward" onClick={() => { onForward(); setMenu(false); }} />
            <Action icon={message.pinned ? PinOff : Pin} label={message.pinned ? "Unpin" : "Pin message"} onClick={() => { onPin(); setMenu(false); }} />
            <Action icon={Trash2} label="Delete for me" onClick={() => { onDeleteMe(); setMenu(false); }} />
            {mine && !message.deletedForEveryone && <Action icon={Trash2} label="Delete for everyone" danger onClick={() => { onDeleteEveryone(); setMenu(false); }} />}
            {!mine && <Action icon={Flag} label="Report message" danger onClick={() => { onReport(); setMenu(false); }} />}
          </motion.div>}</AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function Action({ icon: Icon, label, onClick, danger = false }: { icon: typeof Forward; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold ${danger ? "text-red-400 hover:bg-red-500/10" : "text-slate-400 hover:bg-white/5 hover:text-[var(--text-primary)]"}`}><Icon size={14} /> {label}</button>;
}
