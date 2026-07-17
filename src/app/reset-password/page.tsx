"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabaseAuthService } from "@/services";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    try { await supabaseAuthService.updatePassword(password); router.push("/home"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update password"); }
  };
  return <main className="relative grid min-h-screen place-items-center bg-[#05070c] px-4 text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,110,255,.2),transparent_35%)]" /><div className="relative w-full max-w-md"><div className="mb-7 text-center"><Logo /><h1 className="mt-7 text-3xl font-black">Choose a new password</h1></div><form onSubmit={submit} className="vybe-card rounded-[30px] p-7"><label className="text-xs font-black uppercase tracking-widest text-slate-500">New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="vybe-input mt-2" /></label><label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">Confirm password<input required minLength={8} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="vybe-input mt-2" /></label>{error && <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/8 p-3 text-sm text-red-200">{error}</p>}<button className="vybe-button mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black"><KeyRound size={18} /> Save new password</button></form></div></main>;
}
