"use client";

import Image from "next/image";
import { ChangeEvent, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  Camera,
  Check,
  Gamepad2,
  Globe2,
  GraduationCap,
  Headphones,
  Heart,
  ImagePlus,
  MapPin,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import {
  AVATAR_OPTIONS,
  BANNER_OPTIONS,
  INTERESTS,
  PROFILE_STATUSES,
} from "@/lib/mock-data";
import { useVybeStore } from "@/store/useVybeStore";
import { CurrentProfile, Interest } from "@/types";

export default function ProfilePage() {
  const storedProfile = useVybeStore((state) => state.profile);
  const storedInterests = useVybeStore((state) => state.interests);
  const hydrationKey = JSON.stringify([
    storedProfile.username,
    storedProfile.displayName,
    storedProfile.bio,
    storedProfile.status,
    storedProfile.avatarChoice,
    storedProfile.bannerChoice,
    storedProfile.profileImage?.slice(0, 64),
    storedProfile.favoriteMusic,
    storedProfile.favoriteGames,
    storedProfile.favoriteHobbies,
    storedProfile.schoolGrade,
    storedProfile.pronouns,
    storedProfile.favoriteSports,
    storedProfile.accentColor,
    storedProfile.videoGender,
    storedProfile.countryCode,
    storedProfile.countryName,
    storedProfile.stateRegion,
    storedProfile.city,
    storedProfile.locationVisibility,
    storedInterests,
  ]);
  return (
    <ProfileEditor
      key={hydrationKey}
      initialProfile={storedProfile}
      initialInterests={storedInterests}
    />
  );
}

function ProfileEditor({
  initialProfile,
  initialInterests,
}: {
  initialProfile: CurrentProfile;
  initialInterests: Interest[];
}) {
  const ageBracket = useVybeStore((state) => state.ageBracket);
  const updateProfile = useVybeStore((state) => state.updateProfile);
  const setInterests = useVybeStore((state) => state.setInterests);
  const [draft, setDraft] = useState<CurrentProfile>(initialProfile);
  const [draftInterests, setDraftInterests] =
    useState<Interest[]>(initialInterests);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const dataMode = useVybeStore((state) => state.dataMode);
  const uploadProfileMedia = useVybeStore((state) => state.uploadProfileMedia);
  const deleteProfileMedia = useVybeStore((state) => state.deleteProfileMedia);

  const removeCloudMedia = async (
    kind: "avatar" | "banner",
    path?: string | null,
  ) => {
    if (dataMode !== "supabase" || !path) return;
    setUploading(true);
    try {
      await deleteProfileMedia(kind, path);
    } catch (cause) {
      setFileError(
        cause instanceof Error ? cause.message : "Unable to remove image",
      );
    } finally {
      setUploading(false);
    }
  };

  const chooseInterest = (interest: Interest) => {
    setDraftInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const handleImage = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "banner" = "avatar",
  ) => {
    const file = event.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("Choose a JPG, PNG, WEBP, GIF, or other image file.");
      return;
    }
    const maxSize = kind === "avatar" ? 5 : 8;
    if (file.size > maxSize * 1024 * 1024) {
      setFileError(`Keep the ${kind} image under ${maxSize} MB.`);
      return;
    }
    if (dataMode === "supabase") {
      setUploading(true);
      try {
        const previousPath =
          kind === "avatar" ? draft.profileImagePath : draft.bannerPath;
        const path = await uploadProfileMedia(kind, file, previousPath);
        const preview = URL.createObjectURL(file);
        setDraft((current) =>
          kind === "avatar"
            ? { ...current, profileImage: preview, profileImagePath: path }
            : { ...current, bannerChoice: preview, bannerPath: path },
        );
      } catch (cause) {
        setFileError(cause instanceof Error ? cause.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = () =>
        setDraft((current) =>
          kind === "avatar"
            ? {
                ...current,
                profileImage: String(reader.result),
                profileImagePath: null,
              }
            : {
                ...current,
                bannerChoice: String(reader.result),
                bannerPath: null,
              },
        );
      reader.readAsDataURL(file);
    }
    event.target.value = "";
  };

  const save = async () => {
    setSaving(true);
    setInterests(draftInterests);
    try {
      await updateProfile(draft);
    } finally {
      setSaving(false);
    }
  };

  const activeAvatar = draft.profileImage ?? draft.avatarChoice;
  const completionFields = [
    draft.profileImage || draft.avatarChoice,
    draft.bannerChoice,
    draft.username,
    draft.displayName,
    draft.bio,
    draft.status,
    draft.favoriteMusic,
    draft.favoriteGames?.length,
    draft.favoriteHobbies?.length,
    draft.schoolGrade,
    draft.favoriteSports?.length,
    draftInterests.length,
  ];
  const completion = Math.round(
    (completionFields.filter(Boolean).length / completionFields.length) * 100,
  );
  const listValue = (value?: string[]) => (value || []).join(", ");
  const setList = (
    key: "favoriteGames" | "favoriteHobbies" | "favoriteSports",
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      [key]: value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8),
    }));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Your identity"
        title="Build your VYBE profile"
        description={
          dataMode === "supabase"
            ? "Customize your cloud profile. Photos, banners, interests, and details sync through Supabase."
            : "Customize what people see before they add you. Demo data stays in this browser."
        }
        action={
          <button
            disabled={saving || uploading}
            onClick={() => void save()}
            className="vybe-button inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black shadow-[0_0_28px_rgba(37,99,235,.28)] hover:bg-blue-500"
          >
            <Save size={17} /> {saving ? "Saving…" : "Save profile"}
          </button>
        }
      />

      <section
        className="vybe-card overflow-hidden rounded-[34px]"
        style={{ boxShadow: `0 24px 80px ${draft.accentColor || "#1686ff"}18` }}
      >
        <div className="relative h-48 overflow-hidden sm:h-56">
          <Image
            src={draft.bannerChoice}
            alt="Selected profile banner"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07101b] via-transparent to-black/10" />
        </div>
        <div className="relative px-5 pb-7 sm:px-8">
          <div className="-mt-14 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="rounded-[32px] border-4 border-[#07101b] bg-[#07101b] shadow-2xl">
                <Avatar
                  imageSrc={activeAvatar}
                  size="2xl"
                  showStatus
                  alt="Your selected profile image"
                />
              </div>
              <div className="pb-2">
                <p className="text-xs font-black uppercase tracking-[.17em] text-blue-300">
                  @{draft.username || "username"}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">
                  {draft.displayName || "Display name"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{draft.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-fit rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-black text-blue-400">
                AGES {ageBracket}
              </span>
              <span
                className="grid h-14 w-14 place-items-center rounded-full border-4 border-blue-500/20 bg-[var(--panel)] text-xs font-black text-blue-400"
                style={{ borderTopColor: draft.accentColor || "#1686ff" }}
              >
                {completion}%
              </span>
            </div>
          </div>
          <p className="mt-7 max-w-2xl text-sm leading-7 text-slate-300">
            {draft.bio || "Add a short bio so people know what your VYBE is."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {draftInterests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border px-3 py-1.5 text-xs font-bold"
                style={{
                  borderColor: `${draft.accentColor || "#1686ff"}40`,
                  backgroundColor: `${draft.accentColor || "#1686ff"}12`,
                  color: draft.accentColor || "#1686ff",
                }}
              >
                {interest}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(draft.profileBadges || ["Early VYBE"]).map((badge, index) => (
              <motion.span
                key={badge}
                animate={{ y: [0, -2, 0] }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  delay: index * 0.25,
                }}
                className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-400"
              >
                <Award size={12} /> {badge}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Camera size={19} className="text-blue-400" /> Profile picture
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Upload your own image, replace it anytime, or use one of VYBE’s
            local avatars.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <Avatar
              imageSrc={activeAvatar}
              size="xl"
              showStatus={false}
              alt="Profile preview"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInput.current?.click()}
                className="vybe-button inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black hover:bg-blue-500"
              >
                <Upload size={15} />{" "}
                {draft.profileImage ? "Replace photo" : "Upload photo"}
              </button>
              {draft.profileImage && (
                <button
                  onClick={() => {
                    const path = draft.profileImagePath;
                    setDraft((current) => ({
                      ...current,
                      profileImage: null,
                      profileImagePath: null,
                    }));
                    void removeCloudMedia("avatar", path);
                  }}
                  className="vybe-button inline-flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-500/8 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/12"
                >
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => void handleImage(event, "avatar")}
            className="hidden"
          />
          {fileError && (
            <p className="mt-3 rounded-xl border border-red-400/15 bg-red-500/8 p-3 text-xs text-red-200">
              {fileError}
            </p>
          )}
          <div className="mt-6">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">
              Avatar choices
            </p>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar}
                  onClick={() => {
                    const path = draft.profileImagePath;
                    setDraft((current) => ({
                      ...current,
                      profileImage: null,
                      profileImagePath: null,
                      avatarChoice: avatar,
                    }));
                    void removeCloudMedia("avatar", path);
                  }}
                  className={`relative rounded-[18px] p-0.5 transition ${!draft.profileImage && draft.avatarChoice === avatar ? "ring-2 ring-blue-400 shadow-[0_0_20px_rgba(37,99,235,.25)]" : "opacity-70 hover:opacity-100"}`}
                  aria-label="Choose this avatar"
                >
                  <Avatar imageSrc={avatar} size="sm" showStatus={false} />
                  {!draft.profileImage && draft.avatarChoice === avatar && (
                    <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-500">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="vybe-card rounded-[30px] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Sparkles size={19} className="text-blue-400" /> Profile details
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-400">
              Username
              <input
                value={draft.username}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                className="vybe-input mt-2"
                maxLength={20}
                placeholder="Your username"
              />
            </label>
            <label className="text-xs font-bold text-slate-400">
              Display name
              <input
                value={draft.displayName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                className="vybe-input mt-2"
                maxLength={30}
                placeholder="Your display name"
              />
            </label>
          </div>
          {draft.dateOfBirth && (
            <label className="mt-4 block text-xs font-bold text-slate-400">
              Date of birth
              <input
                value={draft.dateOfBirth}
                readOnly
                className="vybe-input mt-2 opacity-70"
              />
              <span className="mt-1 block text-[10px] text-slate-600">
                Used server-side to calculate your protected age bracket.
              </span>
            </label>
          )}
          <label className="mt-4 block text-xs font-bold text-slate-400">
            Short bio
            <textarea
              value={draft.bio}
              onChange={(event) =>
                setDraft((current) => ({ ...current, bio: event.target.value }))
              }
              className="vybe-input mt-2 min-h-28 resize-none"
              maxLength={160}
              placeholder="Tell people what you’re into..."
            />
            <span className="mt-1 block text-right text-[10px] text-slate-600">
              {draft.bio.length}/160
            </span>
          </label>
          <label className="mt-4 block text-xs font-bold text-slate-400">
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as CurrentProfile["status"],
                }))
              }
              className="vybe-input mt-2"
            >
              {PROFILE_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </section>
      </div>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Globe2 size={19} className="text-blue-400" /> Video matching
              identity
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Used only for mutual video preferences and optional coarse
              location labels. Never add a school, address, ZIP, GPS coordinate,
              distance, or live location.
            </p>
          </div>
          <span className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black text-blue-400">
            <ShieldCheck size={12} className="mr-1 inline" /> AGE-BRACKET LOCKED
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <UserRound size={15} className="text-blue-400" /> Matching
              category
            </span>
            <select
              value={draft.videoGender || "unspecified"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  videoGender: event.target
                    .value as CurrentProfile["videoGender"],
                }))
              }
              className="vybe-input mt-2"
            >
              <option value="unspecified">Choose before video matching</option>
              <option value="girl">Girl</option>
              <option value="boy">Boy</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <MapPin size={15} className="text-blue-400" /> Visible location
              level
            </span>
            <select
              value={draft.locationVisibility || "hidden"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  locationVisibility: event.target
                    .value as CurrentProfile["locationVisibility"],
                }))
              }
              className="vybe-input mt-2"
            >
              <option value="hidden">Hidden (default)</option>
              <option value="country">Country</option>
              <option value="state">State / region</option>
              <option value="city">City</option>
            </select>
          </label>
        </div>
        {(draft.locationVisibility || "hidden") !== "hidden" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-400">
              Country code
              <input
                maxLength={2}
                value={draft.countryCode || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    countryCode: event.target.value.toUpperCase(),
                  }))
                }
                className="vybe-input mt-2 uppercase"
                placeholder="US"
              />
            </label>
            <label className="text-xs font-bold text-slate-400">
              Country
              <input
                value={draft.countryName || ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    countryName: event.target.value,
                  }))
                }
                className="vybe-input mt-2"
                placeholder="United States"
              />
            </label>
            {(draft.locationVisibility === "state" ||
              draft.locationVisibility === "city") && (
              <label className="text-xs font-bold text-slate-400">
                State or region
                <input
                  value={draft.stateRegion || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      stateRegion: event.target.value,
                    }))
                  }
                  className="vybe-input mt-2"
                  placeholder="Florida"
                />
              </label>
            )}
            {draft.locationVisibility === "city" && (
              <label className="text-xs font-bold text-slate-400">
                City
                <input
                  value={draft.city || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  className="vybe-input mt-2"
                  placeholder="Jacksonville"
                />
              </label>
            )}
          </div>
        )}
        <p className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/[.055] p-4 text-[11px] leading-5 text-slate-500">
          Same-city matching works only when both people choose City. Hidden
          fields stay private and are returned to the other person only as the
          exact label level you selected.
        </p>
      </section>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Heart size={19} className="text-blue-400" /> Favorites and
              identity
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              These details help connections understand your VYBE without
              exposing private information.
            </p>
          </div>
          <span className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-xs font-black text-blue-400">
            {completion}% complete
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <Headphones size={15} className="text-blue-400" /> Favorite music
            </span>
            <input
              value={draft.favoriteMusic || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  favoriteMusic: event.target.value,
                }))
              }
              className="vybe-input mt-2"
              maxLength={120}
              placeholder="Artists, genres, playlists"
            />
          </label>
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <Gamepad2 size={15} className="text-blue-400" /> Favorite games
            </span>
            <input
              value={listValue(draft.favoriteGames)}
              onChange={(event) => setList("favoriteGames", event.target.value)}
              className="vybe-input mt-2"
              placeholder="2K, Fortnite, Minecraft"
            />
          </label>
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <Trophy size={15} className="text-blue-400" /> Favorite sports
            </span>
            <input
              value={listValue(draft.favoriteSports)}
              onChange={(event) =>
                setList("favoriteSports", event.target.value)
              }
              className="vybe-input mt-2"
              placeholder="Basketball, track"
            />
          </label>
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <Sparkles size={15} className="text-blue-400" /> Favorite hobbies
            </span>
            <input
              value={listValue(draft.favoriteHobbies)}
              onChange={(event) =>
                setList("favoriteHobbies", event.target.value)
              }
              className="vybe-input mt-2"
              placeholder="Editing, drawing, cooking"
            />
          </label>
          <label className="text-xs font-bold text-slate-400">
            <span className="flex items-center gap-2">
              <GraduationCap size={15} className="text-blue-400" /> School grade
            </span>
            <select
              value={draft.schoolGrade || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  schoolGrade: event.target.value,
                }))
              }
              className="vybe-input mt-2"
            >
              <option value="">Prefer not to say</option>
              {["7th", "8th", "9th", "10th", "11th", "12th", "Other"].map(
                (grade) => (
                  <option key={grade}>{grade}</option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-400">
            Pronouns (optional)
            <input
              value={draft.pronouns || ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  pronouns: event.target.value,
                }))
              }
              className="vybe-input mt-2"
              maxLength={40}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="mt-5">
          <p className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <Palette size={15} className="text-blue-400" /> Profile accent
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {[
              "#1686ff",
              "#0ea5e9",
              "#2563eb",
              "#0284c7",
              "#1d4ed8",
              "#075985",
            ].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, accentColor: color }))
                }
                className={`h-10 w-10 rounded-full border-4 transition hover:scale-110 ${draft.accentColor === color ? "border-white ring-2 ring-blue-400" : "border-transparent"}`}
                style={{ backgroundColor: color }}
                aria-label={`Choose ${color} accent`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <ImagePlus size={19} className="text-blue-400" /> Profile banner
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose a VYBE banner or upload your own image.
            </p>
          </div>
          <button
            disabled={uploading}
            onClick={() => bannerInput.current?.click()}
            className="vybe-button inline-flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/8 px-4 py-2.5 text-xs font-black text-blue-200"
          >
            <Upload size={15} /> Upload banner
          </button>
          <input
            ref={bannerInput}
            type="file"
            accept="image/*"
            onChange={(event) => void handleImage(event, "banner")}
            className="hidden"
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BANNER_OPTIONS.map((banner) => (
            <button
              key={banner}
              onClick={() => {
                const path = draft.bannerPath;
                setDraft((current) => ({
                  ...current,
                  bannerChoice: banner,
                  bannerPath: null,
                }));
                void removeCloudMedia("banner", path);
              }}
              className={`relative h-28 overflow-hidden rounded-[20px] border transition ${draft.bannerChoice === banner ? "border-blue-400/60 shadow-[0_0_28px_rgba(37,99,235,.2)]" : "border-white/8 hover:border-blue-400/25"}`}
              aria-label="Choose this profile banner"
            >
              <Image
                src={banner}
                alt="Banner option"
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
              {draft.bannerChoice === banner && (
                <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-blue-500 shadow-lg">
                  <Check size={15} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="vybe-card mt-5 rounded-[30px] p-5 sm:p-6">
        <h2 className="text-lg font-black">Your interests</h2>
        <p className="mt-1 text-xs text-slate-500">
          Shared interests shape your simulated VYBE Match score.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {INTERESTS.map((interest) => {
            const selected = draftInterests.includes(interest);
            return (
              <button
                key={interest}
                onClick={() => chooseInterest(interest)}
                className={`vybe-button rounded-full border px-4 py-2 text-xs font-bold ${selected ? "border-blue-400/45 bg-blue-500/14 text-blue-100 shadow-[0_0_16px_rgba(37,99,235,.12)]" : "border-white/10 bg-white/[.025] text-slate-400 hover:border-white/20"}`}
              >
                {selected && <Check size={13} className="mr-1 inline" />}
                {interest}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-blue-400/15 bg-blue-500/[.055] p-5">
          <ShieldCheck className="text-blue-400" />
          <h3 className="mt-3 font-black">Age-bracket protected</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Your profile and match pool remain inside ages {ageBracket}.
          </p>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-white/[.025] p-5">
          <Sparkles className="text-blue-400" />
          <h3 className="mt-3 font-black">
            {dataMode === "supabase"
              ? "Cloud profile enabled"
              : "Local persistence enabled"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {dataMode === "supabase"
              ? "Your profile, private media paths, and interests sync securely to your account."
              : "Your image, banner, bio, status, and interests remain after refresh on this browser."}
          </p>
        </div>
      </section>
    </AppShell>
  );
}
