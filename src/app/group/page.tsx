"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Mic, MicOff, SkipForward, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FindingScreen } from "@/components/FindingScreen";
import { MatchPanel } from "@/components/MatchPanel";
import { BlockModal, ReportModal } from "@/components/Modals";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";

export default function GroupPage() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const [reportUser, setReportUser] = useState<string | null>(null);
  const [blockUser, setBlockUser] = useState<string | null>(null);
  const finding = useVybeStore((state) => state.finding);
  const matchFoundPulse = useVybeStore((state) => state.matchFoundPulse);
  const ids = useVybeStore((state) => state.currentGroupIds);
  const age = useVybeStore((state) => state.ageBracket);
  const interests = useVybeStore((state) => state.interests);
  const muted = useVybeStore((state) => state.muted);
  const start = useVybeStore((state) => state.startGroupMatch);
  const skip = useVybeStore((state) => state.skipGroup);
  const toggleMuted = useVybeStore((state) => state.toggleMuted);
  const sendFriendRequest = useVybeStore((state) => state.sendFriendRequest);
  const statuses = useVybeStore((state) => state.friendStatuses);

  useEffect(() => { if (!ids.length) start(); }, [ids.length, start]);

  const users = ids.map((id) => SIM_USERS.find((user) => user.id === id)).filter(Boolean);
  const reporting = SIM_USERS.find((user) => user.id === reportUser);
  const blocking = SIM_USERS.find((user) => user.id === blockUser);

  if (finding || !users.length) return <AppShell immersive><FindingScreen group /></AppShell>;

  return (
    <AppShell immersive>
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#03060b] p-3 sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_105%,rgba(0,119,255,.13),transparent_38%)]" />
        <div className="relative mb-3 flex items-center justify-between px-1"><Link href="/home" className="text-sm font-black tracking-[.22em]">VYBE</Link><div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-slate-400">GROUP · {age}</div></div>
        {dataMode === "supabase" && <div className="relative mb-3 rounded-2xl border border-blue-400/15 bg-blue-500/7 px-4 py-2.5 text-center text-[10px] font-bold text-blue-100/75">Phase 2 preview only: group matchmaking remains simulated and cannot create real friends or reports.</div>}

        <AnimatePresence mode="wait">
          <motion.div key={ids.join("-")} className="relative grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => user && <MatchPanel key={user.id} user={user} compact interests={interests} friendStatus={dataMode === "demo" ? statuses[user.id] : undefined} onAdd={dataMode === "demo" ? () => void sendFriendRequest(user.id) : undefined} onReport={dataMode === "demo" ? () => setReportUser(user.id) : undefined} onBlock={dataMode === "demo" ? () => setBlockUser(user.id) : undefined} />)}
          </motion.div>
        </AnimatePresence>

        <div className="relative sticky bottom-0 z-30 mt-3 flex items-center justify-center gap-2 rounded-[26px] border border-white/10 bg-[#070d17]/92 p-3 shadow-[0_-12px_55px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <button onClick={toggleMuted} className="vybe-button flex min-w-16 flex-col items-center gap-1 rounded-2xl bg-white/5 px-4 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10">{muted ? <MicOff size={20} /> : <Mic size={20} />} {muted ? "Unmute" : "Mute"}</button>
          <button onClick={skip} className="vybe-button flex min-w-40 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 py-4 font-black shadow-[0_0_38px_rgba(0,102,255,.38)] hover:bg-blue-500"><SkipForward size={21} /> Skip Group</button>
          <Link href="/home" className="vybe-button flex min-w-16 flex-col items-center gap-1 rounded-2xl bg-white/5 px-4 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"><LogOut size={20} /> Leave</Link>
        </div>

        <AnimatePresence>{matchFoundPulse && <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full border border-blue-300/30 bg-[#071321]/92 px-5 py-2.5 text-xs font-black text-blue-100 shadow-[0_0_45px_rgba(37,99,235,.4)] backdrop-blur-xl"><span className="flex items-center gap-2"><Sparkles size={15} /> GROUP VYBE FOUND</span></motion.div>}</AnimatePresence>
      </div>

      {reporting && <ReportModal open onClose={() => setReportUser(null)} userId={reporting.id} username={reporting.username} />}
      {blocking && <BlockModal open onClose={() => setBlockUser(null)} userId={blocking.id} username={blocking.username} afterBlock={skip} />}
    </AppShell>
  );
}
