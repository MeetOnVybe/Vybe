"use client";

import { Suspense } from "react";
import { LiveVideoMatch } from "@/components/video/LiveVideoMatch";

function SoloMatchContent() {
  return <LiveVideoMatch />;
}

function SoloMatchFallback() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-6 text-[var(--text-primary)]">
      <div className="glass-panel flex max-w-sm flex-col items-center gap-4 rounded-[2rem] p-8 text-center">
        <span className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--blue)]" />
        <div>
          <p className="font-display text-xl font-bold">Preparing secure video</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Loading your matching preferences and session.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SoloPage() {
  return (
    <Suspense fallback={<SoloMatchFallback />}>
      <SoloMatchContent />
    </Suspense>
  );
}
