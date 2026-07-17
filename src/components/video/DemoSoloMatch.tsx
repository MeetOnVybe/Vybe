"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Camera,
  CameraOff,
  Flag,
  LogOut,
  Mic,
  MicOff,
  SkipForward,
  Sparkles,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FindingScreen } from "@/components/FindingScreen";
import { MatchPanel } from "@/components/MatchPanel";
import { BlockModal, ReportModal } from "@/components/Modals";
import { SIM_USERS } from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";
import { SimUser } from "@/types";

export function DemoSoloMatch() {
  const dataMode = useVybeStore((state) => state.dataMode);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const finding = useVybeStore((state) => state.finding);
  const matchFoundPulse = useVybeStore((state) => state.matchFoundPulse);
  const currentId = useVybeStore((state) => state.currentSoloId);
  const age = useVybeStore((state) => state.ageBracket);
  const interests = useVybeStore((state) => state.interests);
  const profile = useVybeStore((state) => state.profile);
  const muted = useVybeStore((state) => state.muted);
  const cameraOff = useVybeStore((state) => state.cameraOff);
  const start = useVybeStore((state) => state.startSoloMatch);
  const skip = useVybeStore((state) => state.skipSolo);
  const toggleMuted = useVybeStore((state) => state.toggleMuted);
  const toggleCamera = useVybeStore((state) => state.toggleCamera);
  const sendFriendRequest = useVybeStore((state) => state.sendFriendRequest);
  const friendStatuses = useVybeStore((state) => state.friendStatuses);

  useEffect(() => {
    if (!currentId) start();
  }, [currentId, start]);

  const matched = SIM_USERS.find((user) => user.id === currentId);
  const self: SimUser = {
    id: "me",
    username: profile.username,
    displayName: profile.displayName,
    ageBracket: age,
    interests,
    online: true,
    lastSeen: "Online now",
    status: profile.status,
    statusLine:
      dataMode === "supabase" ? "Phase 2 match preview" : "Your local preview",
    bio: profile.bio,
    personality: "Your VYBE",
    favoriteMusic: "Your choice",
    favoriteGame: "Your choice",
    favoriteSport: "Your choice",
    banner: profile.bannerChoice,
    avatar: {
      image: profile.profileImage ?? profile.avatarChoice,
      gradient: "from-slate-700 via-blue-950 to-black",
    },
  };

  if (finding || !matched)
    return (
      <AppShell immersive>
        <FindingScreen />
      </AppShell>
    );

  const status = friendStatuses[matched.id];

  return (
    <AppShell immersive>
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#03060b] p-3 sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_105%,rgba(0,119,255,.13),transparent_35%)]" />
        <div className="relative mb-3 flex items-center justify-between px-1">
          <Link href="/home" className="text-sm font-black tracking-[.22em]">
            VYBE
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-bold text-slate-600 sm:inline">
              Meet. Match. VYBE.
            </span>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-slate-400">
              SOLO · {age}
            </div>
          </div>
        </div>
        {dataMode === "supabase" && (
          <div className="relative mb-3 rounded-2xl border border-blue-400/15 bg-blue-500/7 px-4 py-2.5 text-center text-[10px] font-bold text-blue-100/75">
            Phase 2 preview only: public matchmaking and social actions on demo
            profiles are not connected to real accounts.
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={matched.id}
            className="relative grid flex-1 gap-3 md:grid-cols-2"
          >
            <MatchPanel
              user={self}
              self
              cameraOff={cameraOff}
              interests={interests}
            />
            <MatchPanel
              user={matched}
              interests={interests}
              friendStatus={status}
            />
          </motion.div>
        </AnimatePresence>

        <div className="relative sticky bottom-0 z-30 mt-3 rounded-[26px] border border-white/10 bg-[#070d17]/92 p-3 shadow-[0_-12px_55px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <div className="grid grid-cols-4 items-center gap-2 sm:flex sm:flex-wrap sm:justify-center">
            <button
              onClick={toggleMuted}
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-white/5 px-2 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10 sm:min-w-16 sm:px-3"
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}{" "}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={toggleCamera}
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-white/5 px-2 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10 sm:min-w-16 sm:px-3"
            >
              {cameraOff ? <CameraOff size={20} /> : <Camera size={20} />}{" "}
              Camera
            </button>
            <button
              onClick={() => void sendFriendRequest(matched.id)}
              disabled={
                dataMode === "supabase" ||
                status === "pending" ||
                status === "friends"
              }
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-blue-500/12 px-2 py-2.5 text-[10px] font-bold text-blue-300 disabled:opacity-55 sm:min-w-20 sm:px-3"
            >
              {status === "friends" ? (
                <UserCheck size={20} />
              ) : (
                <UserPlus size={20} />
              )}
              {dataMode === "supabase"
                ? "Preview"
                : status === "friends"
                  ? "Friends"
                  : status === "pending"
                    ? "Sent"
                    : "Add Friend"}
            </button>
            <button
              onClick={skip}
              className="vybe-button order-first col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-4 text-sm font-black shadow-[0_0_38px_rgba(0,102,255,.38)] hover:bg-blue-500 sm:order-none sm:min-w-36 sm:px-7"
            >
              <SkipForward size={21} /> Skip
            </button>
            <button
              disabled={dataMode === "supabase"}
              onClick={() => setReportOpen(true)}
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-white/5 px-2 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10 sm:min-w-16 sm:px-3"
            >
              <Flag size={20} /> Report
            </button>
            <button
              disabled={dataMode === "supabase"}
              onClick={() => setBlockOpen(true)}
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-red-500/8 px-2 py-2.5 text-[10px] font-bold text-red-300 hover:bg-red-500/15 sm:min-w-16 sm:px-3"
            >
              <Ban size={20} /> Block
            </button>
            <Link
              href="/home"
              className="vybe-button flex flex-col items-center gap-1 rounded-2xl bg-white/5 px-2 py-2.5 text-[10px] font-bold text-slate-300 hover:bg-white/10 sm:min-w-16 sm:px-3"
            >
              <LogOut size={20} /> Leave
            </Link>
          </div>
        </div>

        <AnimatePresence>
          {matchFoundPulse && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.08 }}
              className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full border border-blue-300/30 bg-[#071321]/92 px-5 py-2.5 text-xs font-black text-blue-100 shadow-[0_0_45px_rgba(37,99,235,.4)] backdrop-blur-xl"
            >
              <span className="flex items-center gap-2">
                <Sparkles size={15} /> VYBE FOUND · {matched.username}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        userId={matched.id}
        username={matched.username}
      />
      <BlockModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        userId={matched.id}
        username={matched.username}
        afterBlock={skip}
      />
    </AppShell>
  );
}
