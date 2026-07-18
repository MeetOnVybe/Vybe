"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Ban, X } from "lucide-react";
import { useState } from "react";
import { useVybeStore } from "@/store/useVybeStore";

function ModalFrame({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="vybe-card w-full max-w-md rounded-[28px] p-6 shadow-2xl"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ReportModal({
  open,
  onClose,
  userId,
  username,
  targetType = "profile",
  targetId,
  afterSubmit,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  targetType?: "profile" | "message" | "story" | "group" | "video_session" | "group_video_session";
  targetId?: string;
  afterSubmit?: () => void;
}) {
  const reportUser = useVybeStore((state) => state.reportUser);
  const reportContent = useVybeStore((state) => state.reportContent);
  const [reason, setReason] = useState("Inappropriate behavior");
  const [notes, setNotes] = useState("");
  const submit = () => {
    const operation =
      targetType !== "profile" && targetId
        ? reportContent(userId, targetType, targetId, reason, notes)
        : reportUser(userId, reason, notes);
    void operation.then(() => afterSubmit?.());
    onClose();
    setNotes("");
  };
  return (
    <ModalFrame open={open} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-500">
            <AlertTriangle size={21} />
          </span>
          <div>
            <h2 className="text-xl font-black">Report {username}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Your report is stored privately for moderation review.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="vybe-button rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          aria-label="Close report dialog"
        >
          <X size={18} />
        </button>
      </div>
      <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
        Reason
      </label>
      <select
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="vybe-input mt-2"
      >
        <option>Inappropriate behavior</option>
        <option>Harassment or bullying</option>
        <option>Sexual content</option>
        <option>Hate or threats</option>
        <option>Spam or fake profile</option>
        <option>Other</option>
      </select>
      <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
        Extra details
      </label>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Tell us what happened (optional)"
        className="vybe-input mt-2 min-h-28 resize-none"
      />
      <button
        onClick={submit}
        className="vybe-button mt-5 w-full rounded-2xl bg-blue-600 py-3.5 font-black text-white shadow-[0_0_25px_rgba(0,102,255,.25)] hover:bg-blue-500"
      >
        Submit report
      </button>
    </ModalFrame>
  );
}

export function BlockModal({
  open,
  onClose,
  userId,
  username,
  afterBlock,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  afterBlock?: () => void;
}) {
  const blockUser = useVybeStore((state) => state.blockUser);
  const submit = () => {
    void blockUser(userId).then(() => {
      onClose();
      afterBlock?.();
    });
  };
  return (
    <ModalFrame open={open} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-500">
            <Ban size={21} />
          </span>
          <div>
            <h2 className="text-xl font-black">Block {username}?</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              They will immediately disappear from discovery, matches,
              friendships, and private chat. Existing messages become
              inaccessible while blocked.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="vybe-button rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          aria-label="Close block dialog"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={onClose}
          className="vybe-button rounded-2xl border border-[var(--border)] py-3 font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="vybe-button rounded-2xl bg-red-500 py-3 font-black text-white hover:bg-red-400"
        >
          Block
        </button>
      </div>
    </ModalFrame>
  );
}
