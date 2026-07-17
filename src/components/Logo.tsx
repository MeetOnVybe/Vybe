import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/home" className="inline-flex items-center gap-2.5" aria-label="VYBE home">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl border border-blue-400/40 bg-blue-500/10 text-sm font-black text-white shadow-[0_0_28px_rgba(26,115,255,.32)]">
        V
        <span className="absolute inset-1 rounded-lg border border-blue-300/20" />
      </span>
      {!compact && <span className="text-xl font-black tracking-[0.2em] text-white">VYBE</span>}
    </Link>
  );
}
