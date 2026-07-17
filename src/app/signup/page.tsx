"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getDataMode, hasSupabaseEnv } from "@/lib/data-mode";
import { supabaseAuthService } from "@/services";
import { useVybeStore } from "@/store/useVybeStore";

export default function SignUpPage() {
  const router = useRouter();
  const setAuth = useVybeStore((state) => state.setAuth);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const demoMode = getDataMode() === "demo";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (demoMode) {
      setAuth(username || "NewVYBE", email);
      router.push("/onboarding/age");
      return;
    }
    if (!hasSupabaseEnv()) {
      setError("Supabase is not configured. Add the values from .env.example to .env.local.");
      return;
    }
    setLoading(true);
    try {
      const result = await supabaseAuthService.signUp({ email, password, username, displayName, dateOfBirth });
      if (result.needsEmailVerification) setVerificationSent(true);
      else router.push("/onboarding/age");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account");
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#05070c] px-4 py-10 text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,110,255,.2),transparent_35%)]" /><div className="vybe-card relative w-full max-w-md rounded-[30px] p-8 text-center"><MailCheck className="mx-auto text-blue-400" size={42} /><h1 className="mt-6 text-3xl font-black">Check your email</h1><p className="mt-3 text-sm leading-6 text-slate-400">We sent a verification link to <strong className="text-slate-200">{email}</strong>. Verify it to activate your VYBE account and finish onboarding.</p><Link href="/login" className="vybe-button mt-7 inline-flex rounded-2xl bg-blue-600 px-6 py-3 font-black">Return to login</Link></div></main>;
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#05070c] px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,110,255,.2),transparent_35%)]" />
      <div className="relative w-full max-w-lg">
        <div className="mb-7 text-center"><Logo /><h1 className="mt-7 text-3xl font-black">Create your VYBE</h1><p className="mt-2 text-sm text-slate-400">{demoMode ? "Development demo account—nothing leaves your browser." : "A real, email-verified VYBE account powered by Supabase."}</p></div>
        <form onSubmit={submit} className="vybe-card rounded-[30px] p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">Username<input required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} className="vybe-input mt-2" placeholder="your_vybe" /></label>
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">Display name<input required={!demoMode} maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="vybe-input mt-2" placeholder="Your name" /></label>
          </div>
          <label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">Date of birth<input required={!demoMode} type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="vybe-input mt-2" /></label>
          <p className="mt-2 text-[10px] leading-5 text-slate-600">Your 13–15 or 16–17 bracket is calculated in the database. A browser-selected bracket is never trusted.</p>
          <label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="vybe-input mt-2" placeholder="you@example.com" /></label>
          <label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="vybe-input mt-2" placeholder="At least 8 characters" /></label>
          <div className="mt-5 space-y-2 rounded-2xl bg-blue-500/7 p-4 text-xs text-slate-400"><p className="flex gap-2"><ShieldCheck size={15} className="shrink-0 text-blue-400" /> Age brackets are calculated server-side and never cross.</p><p className="flex gap-2"><CheckCircle2 size={15} className="shrink-0 text-blue-400" /> Private messaging stays locked until friendship is accepted.</p></div>
          {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/8 p-3 text-sm text-red-200">{error}</p>}
          <button disabled={loading} className="vybe-button mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black shadow-[0_0_28px_rgba(0,102,255,.3)] hover:bg-blue-500 disabled:opacity-60">{loading ? "Creating account…" : "Continue"} <ArrowRight size={18} /></button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="font-bold text-blue-400">Log in</Link></p>
      </div>
    </main>
  );
}
