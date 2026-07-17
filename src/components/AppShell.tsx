"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, CloudOff, Compass, Crown, HeartHandshake, House, LoaderCircle, MessageCircle, Moon,
  RefreshCw, Search, Settings, ShieldCheck, Sparkles, Sun, UserRound, UsersRound, Video,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { useVybeStore } from "@/store/useVybeStore";
import { useEffect, useState } from "react";

const mobileNav = [
  { href: "/home", label: "Home", icon: House },
  { href: "/solo", label: "Match", icon: Video },
  { href: "/friends", label: "Friends", icon: UsersRound },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

const socialNav = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/stories", label: "Stories", icon: Sparkles },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/matches", label: "Matches", icon: HeartHandshake },
  { href: "/search", label: "Search", icon: Search },
];

export function AppShell({ children, immersive = false }: { children: React.ReactNode; immersive?: boolean }) {
  const pathname = usePathname();
  const toast = useVybeStore((state) => state.toast);
  const clearToast = useVybeStore((state) => state.clearToast);
  const notifications = useVybeStore((state) => state.notifications);
  const messages = useVybeStore((state) => state.messages);
  const groupMessages = useVybeStore((state) => state.groupMessages);
  const currentUserId = useVybeStore((state) => state.currentUserId);
  const isAdmin = useVybeStore((state) => state.isAdmin);
  const settings = useVybeStore((state) => state.settings);
  const setSetting = useVybeStore((state) => state.setSetting);
  const dataMode = useVybeStore((state) => state.dataMode);
  const cloudReady = useVybeStore((state) => state.cloudReady);
  const cloudLoading = useVybeStore((state) => state.cloudLoading);
  const cloudError = useVybeStore((state) => state.cloudError);
  const hydrateCloud = useVybeStore((state) => state.hydrateCloud);
  const [isLight, setIsLight] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const unreadMessages = [...Object.values(messages).flat(), ...Object.values(groupMessages).flat()].filter((message) => !message.read && message.senderId !== "me" && message.senderId !== currentUserId).length;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 2600);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  useEffect(() => {
    const sync = () => setIsLight(document.documentElement.dataset.theme === "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!settings.hapticsEnabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const tap = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = event.target instanceof Element ? event.target.closest("button,a,[role='button']") : null;
      if (!target || target.getAttribute("aria-disabled") === "true" || (target instanceof HTMLButtonElement && target.disabled)) return;
      navigator.vibrate(8);
    };
    document.addEventListener("pointerup", tap, { passive: true });
    return () => document.removeEventListener("pointerup", tap);
  }, [settings.hapticsEnabled]);

  const toggleTheme = () => setSetting("themePreference", isLight ? "dark" : "light");

  return (
    <div className="vybe-app min-h-screen" data-animations={settings.animationsEnabled ? "on" : "off"} data-glow={settings.glowIntensity}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animated-grid absolute inset-0 opacity-60" />
        <div className="ambient-orb absolute -left-36 -top-44 h-[34rem] w-[34rem] rounded-full bg-blue-600/16 blur-[110px]" />
        <div className="ambient-orb-delayed absolute -right-44 top-10 h-[32rem] w-[32rem] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-500/[.045] to-transparent" />
      </div>

      {!immersive && (
        <header className="vybe-header sticky top-0 z-40 border-b backdrop-blur-2xl">
          <div className="mx-auto flex h-[70px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <Logo />
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Social navigation">
              {socialNav.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return <Link key={href} href={href} className={`vybe-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${active ? "bg-blue-500/12 text-blue-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={16} /> {label}</Link>;
              })}
              {isAdmin && <Link href="/admin" className={`vybe-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${pathname.startsWith("/admin") ? "bg-blue-500/12 text-blue-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Crown size={16} /> Admin</Link>}
            </nav>
            <div className="flex items-center gap-1.5">
              <Link href="/safety" className="vybe-button hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white sm:flex"><ShieldCheck size={17} /> Safety</Link>
              <button onClick={toggleTheme} className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-blue-500" aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}>{isLight ? <Moon size={18} /> : <Sun size={18} />}</button>
              <Link href="/notifications" className="vybe-button relative grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Notifications">
                <Bell size={19} />
                {unreadNotifications > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.8)]" />}
              </Link>
              <Link href="/settings" className="vybe-button grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Settings"><Settings size={19} /></Link>
            </div>
          </div>
        </header>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={pathname}
          initial={settings.animationsEnabled ? { opacity: 0, y: 9, filter: "blur(4px)" } : false}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={settings.animationsEnabled ? { opacity: 0, y: -6, filter: "blur(3px)" } : undefined}
          transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
          className={immersive ? "relative z-10" : `relative z-10 mx-auto max-w-7xl px-4 pt-7 sm:px-6 ${settings.compactMode ? "pb-24 sm:pb-8" : "pb-32 sm:pb-12"}`}
        >
          {dataMode === "supabase" && !cloudReady ? (
            <section className="vybe-card mx-auto grid min-h-[55vh] max-w-xl place-items-center rounded-[32px] p-8 text-center">
              <div>
                {cloudError ? <CloudOff className="mx-auto text-red-400" size={34} /> : <LoaderCircle className="mx-auto animate-spin text-blue-400" size={34} />}
                <h1 className="mt-5 text-2xl font-black">{cloudError ? "VYBE cloud needs attention" : "Syncing your VYBE"}</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">{cloudError || "Loading your private profile, discovery, matches, friends, messages, and notifications."}</p>
                {cloudError && <button onClick={() => void hydrateCloud()} disabled={cloudLoading} className="vybe-button mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"><RefreshCw size={17} /> Retry</button>}
              </div>
            </section>
          ) : children}
        </motion.main>
      </AnimatePresence>

      {!immersive && (
        <nav className="vybe-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+7px)] pt-2 backdrop-blur-2xl sm:hidden" aria-label="Mobile navigation">
          <div className="grid grid-cols-6">
            {mobileNav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/home" && pathname.startsWith(href));
              const badge = href === "/chat" ? unreadMessages : 0;
              return (
                <Link key={href} href={href} aria-label={label} className={`relative flex flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-bold transition ${active ? "text-blue-500" : "text-slate-500"}`}>
                  <span className={`grid h-7 w-9 place-items-center rounded-xl transition ${active ? "bg-blue-500/14 shadow-[0_0_20px_rgba(37,99,235,.2)]" : ""}`}><Icon size={18} /></span>
                  {badge > 0 && <span className="absolute right-[18%] top-0 grid min-w-4 place-items-center rounded-full bg-blue-500 px-1 text-[9px] text-white">{badge}</span>}
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .97 }} className="vybe-toast fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-5 py-3 text-sm font-bold shadow-[0_0_38px_rgba(0,119,255,.22)] backdrop-blur-xl sm:bottom-8">{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
