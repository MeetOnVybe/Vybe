"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  Database,
  EyeOff,
  Gauge,
  Globe2,
  Heart,
  Laptop,
  LogOut,
  MessageCircle,
  Moon,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UserRoundCheck,
  Volume2,
  Waves,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useVybeStore } from "@/store/useVybeStore";
import type { AudienceRule, ThemePreference, UserSettings } from "@/types";

function ToggleRow({
  icon: Icon,
  title,
  body,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  body: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[.07] py-4 last:border-0">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400">
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          aria-label={title}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="relative h-7 w-12 rounded-full bg-slate-700 transition peer-checked:bg-blue-600 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}

function AudiencePicker({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: AudienceRule;
  onChange: (value: AudienceRule) => void;
  description: string;
}) {
  return (
    <div className="border-b border-white/[.07] py-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400">
          <ShieldCheck size={17} />
        </span>
        <div>
          <p className="font-bold">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div
        role="group"
        aria-label={label}
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {(["friends", "matches", "everyone", "nobody"] as const).map(
          (option) => (
            <button
              key={option}
              type="button"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
              className={`vybe-button rounded-xl border py-2.5 text-xs font-black capitalize ${value === option ? "border-blue-400/40 bg-blue-500/12 text-blue-500" : "border-white/10 bg-white/[.02] text-slate-500"}`}
            >
              {option}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

const themes: Array<{
  value: ThemePreference;
  label: string;
  body: string;
  icon: typeof Moon;
}> = [
  {
    value: "system",
    label: "System",
    body: "Follow this device automatically.",
    icon: Laptop,
  },
  {
    value: "dark",
    label: "Midnight",
    body: "Original black and electric blue.",
    icon: Moon,
  },
  {
    value: "light",
    label: "Ice",
    body: "White, icy blue, and deep navy.",
    icon: Sun,
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const age = useVybeStore((state) => state.ageBracket);
  const settings = useVybeStore((state) => state.settings);
  const setSetting = useVybeStore((state) => state.setSetting);
  const logout = useVybeStore((state) => state.logout);
  const blockedIds = useVybeStore((state) => state.blockedIds);
  const people = useVybeStore((state) => state.people);
  const unblockUser = useVybeStore((state) => state.unblockUser);
  const toggle = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => setSetting(key, value);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Control your experience"
        title="Settings"
        description="Theme, discovery, notification, sound, privacy, and safety preferences sync to your private Supabase account."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Bell size={19} className="text-blue-400" /> Notifications & sound
          </h2>
          <div className="mt-3">
            <ToggleRow
              icon={Bell}
              title="Friend, match, and message alerts"
              body="Create friend-request, match, message, unread, and moderation alerts."
              checked={settings.notificationsEnabled}
              onChange={(value) => toggle("notificationsEnabled", value)}
            />
            <ToggleRow
              icon={UserRoundCheck}
              title="Profile activity alerts"
              body="Allow a low-frequency alert when an eligible same-bracket member views your profile."
              checked={settings.profileInteractionNotifications}
              onChange={(value) =>
                toggle("profileInteractionNotifications", value)
              }
            />
            <ToggleRow
              icon={Volume2}
              title="VYBE sounds"
              body="Play lightweight match, acceptance, and message tones."
              checked={settings.soundEnabled}
              onChange={(value) => toggle("soundEnabled", value)}
            />
            <ToggleRow
              icon={Waves}
              title="Animations"
              body="Enable page transitions, discovery cards, typing dots, and animated backgrounds."
              checked={settings.animationsEnabled}
              onChange={(value) => toggle("animationsEnabled", value)}
            />
            <ToggleRow
              icon={Zap}
              title="Subtle mobile haptics"
              body="Use short vibration feedback for supported mobile browsers and gestures."
              checked={settings.hapticsEnabled}
              onChange={(value) => toggle("hapticsEnabled", value)}
            />
          </div>
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ShieldCheck size={19} className="text-blue-400" /> Privacy & safety
          </h2>
          <div className="mt-3">
            <ToggleRow
              icon={UserRoundCheck}
              title="Show activity status"
              body="Allow eligible connections to see the activity level selected below."
              checked={settings.showOnlineStatus}
              onChange={(value) => {
                toggle("showOnlineStatus", value);
                toggle("presenceVisibility", value ? "precise" : "hidden");
              }}
            />
            <ToggleRow
              icon={Sparkles}
              title="Read receipts"
              body="Show read and delivered indicators in friend and active-match chats."
              checked={settings.readReceipts}
              onChange={(value) => toggle("readReceipts", value)}
            />
            <ToggleRow
              icon={UserRoundCheck}
              title="Allow friend requests"
              body="Allow eligible same-bracket members to send protected friend requests."
              checked={settings.allowFriendRequests}
              onChange={(value) => toggle("allowFriendRequests", value)}
            />
            <ToggleRow
              icon={Heart}
              title="Profile appreciation"
              body="Allow eligible members to send low-frequency private profile likes."
              checked={settings.profileLikesEnabled}
              onChange={(value) => toggle("profileLikesEnabled", value)}
            />
            <ToggleRow
              icon={EyeOff}
              title="Blur sensitive previews"
              body="Blur sensitive media previews flagged by VYBE moderation."
              checked={settings.blurSensitivePreviews}
              onChange={(value) => toggle("blurSensitivePreviews", value)}
            />
            <ToggleRow
              icon={ShieldCheck}
              title="Safety reminders"
              body="Keep privacy reminders visible in discovery, match, and chat flows."
              checked={settings.safetyReminders}
              onChange={(value) => toggle("safetyReminders", value)}
            />
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-400">
              Activity visibility
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["precise", "recently", "hidden"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    toggle("presenceVisibility", value);
                    toggle("showOnlineStatus", value !== "hidden");
                  }}
                  className={`vybe-button rounded-2xl border px-2 py-3 text-xs font-black capitalize ${settings.presenceVisibility === value ? "border-blue-400/45 bg-blue-500/13 text-blue-500" : "border-white/10 bg-white/[.025] text-slate-500"}`}
                >
                  {value === "precise" ? "Online" : value}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <MessageCircle size={19} className="text-blue-400" /> Communication
            controls
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Database policies enforce these choices before a profile, story,
            presence record, or new message is exposed.
          </p>
          <div className="mt-3">
            <AudiencePicker
              label="Who can message you"
              value={settings.messagePrivacy}
              onChange={(value) => toggle("messagePrivacy", value)}
              description="Existing authorized conversations remain subject to blocks, friendship, and match state."
            />
            <AudiencePicker
              label="Who can view stories"
              value={settings.storyPrivacy}
              onChange={(value) => toggle("storyPrivacy", value)}
              description="Stories never appear on a public explore feed."
            />
            <AudiencePicker
              label="Who can see online status"
              value={settings.onlineStatusPrivacy}
              onChange={(value) => toggle("onlineStatusPrivacy", value)}
              description="Hidden and recently-active modes avoid exposing precise activity."
            />
          </div>
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Moon size={19} className="text-blue-400" /> Appearance
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {themes.map(({ value, label, body, icon: Icon }) => (
              <button
                key={value}
                onClick={() => toggle("themePreference", value)}
                className={`vybe-button rounded-[22px] border p-4 text-left ${settings.themePreference === value ? "border-blue-400/50 bg-blue-500/10 shadow-[0_0_24px_rgba(22,134,255,.16)]" : "border-white/10 bg-white/[.025]"}`}
              >
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-500/10 text-blue-400">
                  <Icon size={18} />
                </span>
                <p className="mt-3 font-black">{label}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  {body}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-5">
            <p className="text-xs font-bold text-slate-400">Glow intensity</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["subtle", "full"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => toggle("glowIntensity", value)}
                  className={`vybe-button rounded-2xl border py-3 text-sm font-black capitalize ${settings.glowIntensity === value ? "border-blue-400/45 bg-blue-500/13 text-blue-500" : "border-white/10 bg-white/[.025] text-slate-400"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            icon={Gauge}
            title="Compact spacing"
            body="Tighten page spacing on smaller screens and dense lists."
            checked={settings.compactMode}
            onChange={(value) => toggle("compactMode", value)}
          />
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Globe2 size={19} className="text-blue-400" /> Discovery privacy
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Discovery remains limited to your verified age bracket and never
            uses exact location.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["everyone", "friends", "matches", "nobody"] as const).map(
              (value) => (
                <button
                  key={value}
                  onClick={() => toggle("profileVisibility", value)}
                  className={`vybe-button rounded-2xl border p-4 text-left ${settings.profileVisibility === value ? "border-blue-400/45 bg-blue-500/12 text-blue-500" : "border-white/10 bg-white/[.025] text-slate-500"}`}
                >
                  <p className="text-sm font-black capitalize">{value}</p>
                  <p className="mt-1 text-[10px] leading-4">
                    {value === "everyone"
                      ? "Eligible same-bracket members can find you."
                      : value === "nobody"
                        ? "Your profile is hidden from other members."
                        : `Only ${value} can open your profile.`}
                  </p>
                </button>
              ),
            )}
          </div>
          <ToggleRow
            icon={RotateCcw}
            title="Prevent repeats"
            body="Hide profiles after an active Like or Pass until the decision is undone or reset."
            checked={settings.repeatPrevention}
            onChange={(value) => toggle("repeatPrevention", value)}
          />
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <SlidersHorizontal size={19} className="text-blue-400" /> Age
            bracket
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Your bracket is calculated from date of birth in Postgres and cannot be changed from the browser.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(["13-15", "16-17"] as const).map((value) => (
              <button
                disabled
                key={value}
                className={`vybe-button rounded-2xl border py-4 font-black ${age === value ? "border-blue-400/45 bg-blue-500/12 text-blue-500 shadow-[0_0_22px_rgba(37,99,235,.12)]" : "border-white/10 bg-white/[.025] text-slate-400"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Database size={17} className="text-blue-400" /> Phase 5 service
              layer
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Supabase Auth, Postgres, private Storage, Realtime, RLS, discovery, matches, direct and group chat, stories, voice messages, moderation, presence, search, notifications, and secure Solo and Group LiveKit video matching are active.
            </p>
          </div>
        </section>
      </div>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <h2 className="text-lg font-black">Blocked accounts</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Blocked members disappear from discovery, search, matches,
          friendships, and messaging immediately.
        </p>
        {blockedIds.length ? (
          <div className="mt-4 space-y-2">
            {blockedIds.map((id) => {
              const person = people.find((item) => item.id === id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {person?.username || "Blocked account"}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {person?.displayName || `Account …${id.slice(-6)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => void unblockUser(id)}
                    className="vybe-button rounded-xl border border-blue-400/20 bg-blue-500/8 px-4 py-2 text-xs font-black text-blue-500 hover:bg-blue-500/12"
                  >
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-white/[.06] bg-white/[.02] p-4 text-sm text-slate-500">
            No blocked accounts.
          </p>
        )}
      </section>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <h2 className="text-lg font-black">Account controls</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => {
              void logout().then(() => {
                router.push("/");
                router.refresh();
              });
            }}
            className="vybe-button inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/5"
          >
            <LogOut size={17} /> Log out
          </button>
        </div>
      </section>
    </AppShell>
  );
}
