"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getDataMode } from "@/lib/data-mode";
import { supabaseAuthService } from "@/services";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (getDataMode() === "demo") { setMessage("Password reset is available in Supabase mode."); return; }
    try { await supabaseAuthService.sendPasswordReset(email); setMessage("Check your email for a secure reset link."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send reset email"); }
  };
  return <main className="relative grid min-h-screen place-items-center bg-[#05070c] px-4 text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,110,255,.2),transparent_35%)]" /><div className="relative w-full max-w-md"><div className="mb-7 text-center"><Logo /><h1 className="mt-7 text-3xl font-black">Reset your password</h1><p className="mt-2 text-sm text-slate-400">We’ll email a secure Supabase recovery link.</p></div><form onSubmit={submit} className="vybe-card rounded-[30px] p-7"><label className="text-xs font-black uppercase tracking-widest text-slate-500">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="vybe-input mt-2" /></label>{message && <p className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/8 p-3 text-sm text-blue-100">{message}</p>}{error && <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/8 p-3 text-sm text-red-200">{error}</p>}<button className="vybe-button mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black"><Mail size={18} /> Send reset link</button></form><p className="mt-6 text-center text-sm text-slate-500"><Link href="/login" className="font-bold text-blue-400">Back to login</Link></p></div></main>;
}
