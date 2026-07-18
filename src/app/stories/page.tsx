"use client";

import Image from "next/image";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronLeft, ChevronRight, Clock3, ImagePlus, MessageCircle, Plus, Send, Sparkles, Trash2, Upload, Video, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";
import type { PublicProfile, StoryItem } from "@/types";

const STORY_COLORS = ["#1686ff", "#0d47a1", "#075985", "#0f3d63", "#102a43", "#0b132b"];
const REACTIONS = ["💙", "😂", "🔥", "👏", "😮"];

export default function StoriesPage() {
  const stories = useVybeStore((state) => state.stories).filter((story) => new Date(story.expiresAt) > new Date());
  const people = useVybeStore((state) => state.people);
  const currentUserId = useVybeStore((state) => state.currentUserId || "me");
  const profile = useVybeStore((state) => state.profile);
  const settings = useVybeStore((state) => state.settings);
  const createStory = useVybeStore((state) => state.createStory);
  const deleteStory = useVybeStore((state) => state.deleteStory);
  const viewStory = useVybeStore((state) => state.viewStory);
  const reactToStory = useVybeStore((state) => state.reactToStory);
  const replyToStory = useVybeStore((state) => state.replyToStory);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const sorted = useMemo(() => [...stories].sort((a, b) => Number(a.viewed) - Number(b.viewed) || b.createdAt.localeCompare(a.createdAt)), [stories]);
  const active = activeIndex === null ? null : sorted[activeIndex];
  const owner = active ? (active.userId === currentUserId || active.userId === "me" ? null : people.find((person) => person.id === active.userId)) : null;
  const openStory = (index: number) => { setActiveIndex(index); void viewStory(sorted[index].id); };
  const move = (direction: 1 | -1) => { if (activeIndex === null) return; const next = activeIndex + direction; if (next < 0 || next >= sorted.length) setActiveIndex(null); else openStory(next); };

  return (
    <AppShell>
      <PageHeader eyebrow="24-hour moments" title="Stories" description={`Share photos, short videos, or text with the people allowed by your ${settings.storyPrivacy} story privacy. There is no public story explore feed.`} action={<button onClick={() => setComposerOpen(true)} className="vybe-button inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-[0_0_26px_rgba(37,99,235,.24)] hover:bg-blue-500"><Plus size={18} /> Add story</button>} />

      <section className="vybe-card overflow-hidden rounded-[30px] p-4 sm:p-5">
        <div className="flex gap-4 overflow-x-auto pb-2">
          <button onClick={() => setComposerOpen(true)} className="group flex w-[76px] shrink-0 flex-col items-center gap-2 text-center"><span className="relative grid h-16 w-16 place-items-center rounded-full border border-dashed border-blue-400/40 bg-blue-500/8 text-blue-400 transition group-hover:scale-105 group-hover:bg-blue-500/14"><Avatar imageSrc={profile.profileImage || profile.avatarChoice} size="md" showStatus={false} /><span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--panel-strong)] bg-blue-600 text-white"><Plus size={13} /></span></span><span className="text-[10px] font-black">Your story</span></button>
          {sorted.map((story, index) => { const person = story.userId === currentUserId || story.userId === "me" ? null : people.find((item) => item.id === story.userId); return <button key={story.id} onClick={() => openStory(index)} className="group flex w-[76px] shrink-0 flex-col items-center gap-2 text-center"><span className={`rounded-full p-[3px] transition group-hover:scale-105 ${story.viewed ? "bg-slate-700" : "bg-gradient-to-br from-blue-300 via-blue-500 to-cyan-500 shadow-[0_0_22px_rgba(37,99,235,.28)]"}`}><span className="block rounded-full bg-[var(--background)] p-[2px]"><Avatar user={person || undefined} imageSrc={person ? undefined : profile.profileImage || profile.avatarChoice} size="md" showStatus={false} /></span></span><span className="w-full truncate text-[10px] font-black">{person?.username || "You"}</span></button>; })}
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="vybe-card rounded-[28px] p-5 lg:col-span-2"><div className="flex items-center gap-3"><Sparkles className="text-blue-400" /><div><h2 className="text-lg font-black">Close-friend energy</h2><p className="text-xs text-slate-500">Stories disappear automatically after 24 hours and are never placed on a public anonymous feed.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><SafetyCard icon={Clock3} title="24 hours" body="Expiration is enforced in Postgres." /><SafetyCard icon={MessageCircle} title="Private replies" body="Replies open an authorized direct chat." /><SafetyCard icon={Camera} title="Private media" body="Files stay in a signed, RLS-protected bucket." /></div></section>
        <section className="vybe-card rounded-[28px] p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-blue-400">Your story stats</p><p className="mt-4 text-4xl font-black">{stories.filter((story) => story.userId === currentUserId || story.userId === "me").length}</p><p className="mt-1 text-sm text-slate-500">active stories</p><p className="mt-5 text-xs leading-5 text-slate-500">Viewer totals are visible only on your own story. Other members never receive a public viewer list.</p></section>
      </div>

      {!sorted.length && <div className="vybe-card mt-5 grid min-h-72 place-items-center rounded-[30px] p-8 text-center"><div><Sparkles className="mx-auto text-blue-400" size={32} /><h2 className="mt-4 text-xl font-black">No active stories</h2><p className="mt-2 text-sm text-slate-500">Share the first moment with your connections.</p></div></div>}

      <AnimatePresence>{composerOpen && <StoryComposer onClose={() => setComposerOpen(false)} onCreate={async (input, file) => { await createStory(input, file); setComposerOpen(false); }} />}</AnimatePresence>
      <AnimatePresence>{active && activeIndex !== null && <StoryViewer story={active} owner={owner || undefined} mine={active.userId === currentUserId || active.userId === "me"} onClose={() => setActiveIndex(null)} onPrevious={() => move(-1)} onNext={() => move(1)} hasPrevious={activeIndex > 0} hasNext={activeIndex < sorted.length - 1} onReact={(emoji) => void reactToStory(active.id, emoji)} reply={reply} setReply={setReply} onReply={() => { if (!reply.trim()) return; void replyToStory(active.id, reply); setReply(""); }} onDelete={() => { void deleteStory(active.id); setActiveIndex(null); }} />}</AnimatePresence>
    </AppShell>
  );
}

function SafetyCard({ icon: Icon, title, body }: { icon: typeof Clock3; title: string; body: string }) { return <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><Icon size={18} className="text-blue-400" /><p className="mt-3 font-black">{title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{body}</p></div>; }

function StoryComposer({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { mediaType: "photo" | "video" | "text"; text?: string; backgroundColor: string }, file?: File) => Promise<void> }) {
  const [type, setType] = useState<"photo" | "video" | "text">("text");
  const [text, setText] = useState("");
  const [color, setColor] = useState(STORY_COLORS[0]);
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (!selected) return; const mediaType = selected.type.startsWith("video/") ? "video" : "photo"; setType(mediaType); setFile(selected); if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(selected)); };
  const publish = async () => { if (type === "text" && !text.trim()) return; if (type !== "text" && !file) return; setPosting(true); try { await onCreate({ mediaType: type, text: text.trim(), backgroundColor: color }, file); } finally { setPosting(false); } };
  return <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div initial={{ y: 20, scale: .97 }} animate={{ y: 0, scale: 1 }} className="vybe-card w-full max-w-xl rounded-[30px] p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-400">New story</p><h2 className="mt-1 text-xl font-black">Share a moment</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-white/5" aria-label="Close"><X size={18} /></button></div><div className="mt-5 grid grid-cols-3 gap-2">{([{ value: "text", icon: Sparkles }, { value: "photo", icon: ImagePlus }, { value: "video", icon: Video }] as const).map(({ value, icon: Icon }) => <button key={value} onClick={() => { setType(value); if (value !== "text") fileInput.current?.click(); }} className={`vybe-button rounded-2xl border py-3 text-xs font-black capitalize ${type === value ? "border-blue-400/40 bg-blue-500/12 text-blue-400" : "border-white/10 text-slate-500"}`}><Icon size={16} className="mx-auto mb-1" />{value}</button>)}</div><input ref={fileInput} type="file" accept="image/*,video/mp4,video/webm" className="hidden" onChange={chooseFile} />
    <div className="mt-5 grid min-h-72 place-items-center overflow-hidden rounded-[26px] border border-white/10 p-5 text-center" style={{ background: type === "text" ? color : undefined }}>{type === "text" ? <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={180} autoFocus className="h-40 w-full resize-none bg-transparent text-center text-2xl font-black text-white outline-none placeholder:text-white/55" placeholder="Type your story…" /> : preview ? type === "video" ? <video src={preview} controls playsInline className="max-h-80 w-full rounded-2xl object-contain" /> : <div className="relative h-72 w-full"><Image src={preview} alt="Story preview" fill className="rounded-2xl object-contain" unoptimized /></div> : <button onClick={() => fileInput.current?.click()} className="text-slate-500"><Upload className="mx-auto" /><span className="mt-3 block text-sm font-bold">Choose media</span></button>}</div>
    {type !== "text" && <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={180} className="vybe-input mt-4 min-h-20 resize-none" placeholder="Add text (optional)" />}
    <div className="mt-4 flex items-center justify-between gap-3"><div className="flex gap-2">{STORY_COLORS.map((value) => <button key={value} onClick={() => setColor(value)} aria-label={`Choose ${value} background`} className={`h-8 w-8 rounded-full border-2 ${color === value ? "border-white ring-2 ring-blue-400" : "border-transparent"}`} style={{ background: value }} />)}</div><button disabled={posting || (type === "text" ? !text.trim() : !file)} onClick={() => void publish()} className="vybe-button rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40">{posting ? "Sharing…" : "Share story"}</button></div></motion.div></motion.div>;
}

function StoryViewer({ story, owner, mine, onClose, onPrevious, onNext, hasPrevious, hasNext, onReact, reply, setReply, onReply, onDelete }: { story: StoryItem; owner?: PublicProfile; mine: boolean; onClose: () => void; onPrevious: () => void; onNext: () => void; hasPrevious: boolean; hasNext: boolean; onReact: (emoji: string) => void; reply: string; setReply: (value: string) => void; onReply: () => void; onDelete: () => void }) {
  return <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/90 p-2 backdrop-blur-xl sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="relative flex h-[min(90vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#06101d] shadow-2xl"><div className="absolute inset-x-3 top-3 z-20 h-1 overflow-hidden rounded-full bg-white/20"><motion.div key={story.id} className="h-full bg-white" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 8, ease: "linear" }} onAnimationComplete={hasNext ? onNext : onClose} /></div><header className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-7"><Avatar user={owner} size="sm" showStatus={false} /><div className="min-w-0 flex-1"><p className="font-black text-white">{mine ? "Your story" : owner?.username || "VYBE friend"}</p><p className="text-[10px] text-white/65"><ClientTimestamp value={story.createdAt} format="time" /></p></div>{mine && <button onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-xl bg-black/25 text-red-300" aria-label="Delete story"><Trash2 size={16} /></button>}<button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-black/25 text-white" aria-label="Close story"><X size={17} /></button></header>
    <div className="relative flex flex-1 items-center justify-center overflow-hidden" style={{ background: story.backgroundColor }}>{story.mediaType === "photo" && story.mediaUrl ? <Image src={story.mediaUrl} alt="Story" fill sizes="430px" className="object-contain" unoptimized /> : story.mediaType === "video" && story.mediaUrl ? <video src={story.mediaUrl} autoPlay playsInline controls={false} controlsList="nodownload" className="h-full w-full object-contain" onContextMenu={(event) => event.preventDefault()} /> : null}{story.text && <p className={`relative z-10 max-w-[85%] whitespace-pre-wrap text-center font-black text-white drop-shadow-xl ${story.mediaType === "text" ? "text-3xl" : "rounded-2xl bg-black/35 p-4 text-lg backdrop-blur-sm"}`}>{story.text}</p>}</div>
    {hasPrevious && <button onClick={onPrevious} className="absolute left-2 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white" aria-label="Previous story"><ChevronLeft /></button>}{hasNext && <button onClick={onNext} className="absolute right-2 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white" aria-label="Next story"><ChevronRight /></button>}
    <footer className="border-t border-white/10 bg-black/35 p-3 backdrop-blur-xl">{mine ? <p className="text-center text-xs font-bold text-white/70">{story.viewerCount || 0} views · expires in 24 hours</p> : <><div className="mb-2 flex justify-center gap-2">{REACTIONS.map((emoji) => <button key={emoji} onClick={() => onReact(emoji)} className={`grid h-9 w-9 place-items-center rounded-full ${story.myReaction === emoji ? "bg-blue-500/35 ring-1 ring-blue-300" : "bg-white/10"}`}>{emoji}</button>)}</div><div className="flex gap-2"><input value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onReply(); }} className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/50 focus:border-blue-400" placeholder="Reply privately…" /><button onClick={onReply} disabled={!reply.trim()} className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white disabled:opacity-40" aria-label="Send story reply"><Send size={17} /></button></div></>}</footer></div></motion.div>;
}
