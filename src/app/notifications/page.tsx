"use client";

import Link from "next/link";
import { Bell, CheckCheck, Eye, HeartHandshake, MessageCircle, ShieldAlert, ShieldCheck, Sparkles, UserPlus, UsersRound, Waves } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";
import type { NotificationItem } from "@/types";

const icons: Record<NotificationItem["type"], typeof Bell> = {
  friend: UserPlus,
  message: MessageCircle,
  match: HeartHandshake,
  profile: Eye,
  safety: ShieldCheck,
  story: Sparkles,
  voice: Waves,
  group: UsersRound,
  moderation: ShieldAlert,
  system: Bell,
};

export default function NotificationsPage() {
  const notifications = useVybeStore((state) => state.notifications);
  const markOne = useVybeStore((state) => state.markNotificationRead);
  const markAll = useVybeStore((state) => state.markNotificationsRead);

  return (
    <AppShell>
      <PageHeader eyebrow="Activity" title="Notifications" description="Friend requests, matches, private messages, profile activity where allowed, and safety updates appear here in real time." action={<button onClick={() => void markAll()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/5"><CheckCheck size={17} /> Mark all read</button>} />
      <div className="space-y-3">
        {notifications.length ? notifications.map((notification) => {
          const Icon = icons[notification.type];
          const isNewFriendRequest = notification.type === "friend" && notification.title === "New friend request";
          const href = notification.href || (notification.type === "match" ? "/matches" : notification.type === "message" && notification.userId ? `/chat/${notification.userId}` : isNewFriendRequest ? "/requests" : notification.type === "friend" ? "/friends" : notification.type === "safety" ? "/safety" : "/home");
          return <Link onClick={() => { if (!notification.read) void markOne(notification.id); }} key={notification.id} href={href} className={`flex gap-4 rounded-2xl border p-4 transition hover:bg-white/[.045] ${notification.read ? "border-white/6 bg-white/[.02]" : "border-blue-400/20 bg-blue-500/[.055]"}`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400"><Icon size={19} /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-black">{notification.title}</h2>{!notification.read && <span className="h-2 w-2 rounded-full bg-blue-400" />}</div><p className="mt-1 text-sm leading-6 text-slate-400">{notification.body}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-600"><ClientTimestamp value={notification.createdAt} format="dateTime" /></p></div></Link>;
        }) : <div className="vybe-card grid min-h-72 place-items-center rounded-[30px] text-center"><div><Bell className="mx-auto text-blue-400" /><h2 className="mt-4 text-xl font-black">All quiet</h2><p className="mt-2 text-sm text-slate-500">New activity will show up here.</p></div></div>}
      </div>
    </AppShell>
  );
}
