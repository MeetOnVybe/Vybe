"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { hasSupabaseEnv } from "@/lib/data-mode";
import { supabaseAuthService } from "@/services";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(searchParams.get("error") || "");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!hasSupabaseEnv()) {
      setError("VYBE authentication is temporarily unavailable.");
      return;
    }
    setLoading(true);
    try {
      await supabaseAuthService.login(email, password);
      const requestedNext = searchParams.get("next");
      router.push(
        requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : "/home",
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#05070c] px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(0,110,255,.2),transparent_35%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <Logo />
          <h1 className="mt-7 text-3xl font-black">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-400">
            Log in to your verified VYBE account.
          </p>
        </div>
        <form onSubmit={submit} className="vybe-card rounded-[30px] p-6 sm:p-8">
          <label className="text-xs font-black uppercase tracking-widest text-slate-500">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              className="vybe-input mt-2"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              className="vybe-input mt-2"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="mt-3 text-right">
            <Link href="/forgot-password" className="text-xs font-bold text-blue-400 hover:text-blue-300">
              Forgot password?
            </Link>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/8 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <button
            disabled={loading}
            className="vybe-button mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Enter VYBE"} <ArrowRight size={18} />
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          New here? <Link href="/signup" className="font-bold text-blue-400">Create an account</Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
