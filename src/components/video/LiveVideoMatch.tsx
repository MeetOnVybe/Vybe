"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Flag,
  Globe2,
  Heart,
  LoaderCircle,
  LocateFixed,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCcw,
  ShieldCheck,
  Signal,
  SkipForward,
  Sparkles,
  UserPlus,
  Users,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import {
  ConnectionQuality,
  ConnectionState,
  LocalTrack,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalTracks,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BlockModal, ReportModal } from "@/components/Modals";
import { getVideoService } from "@/services/video";
import { useVybeStore } from "@/store/useVybeStore";
import type {
  VideoConnectionQuality,
  VideoGenderIdentity,
  VideoGenderPreference,
  VideoLocationFilter,
  VideoMatchPreferences,
  VideoSessionSummary,
} from "@/types";

const videoDebugEnabled = process.env.NEXT_PUBLIC_VIDEO_DEBUG_LOGS !== "false";
const videoInfo = (event: string, details: Record<string, unknown> = {}) => {
  if (videoDebugEnabled) console.info(`[VYBE video] ${event}`, details);
};
const videoWarn = (event: string, details: Record<string, unknown> = {}) => {
  if (videoDebugEnabled) console.warn(`[VYBE video] ${event}`, details);
};

const DEFAULT_PREFERENCES: VideoMatchPreferences = {
  genderPreference: "everyone",
  locationFilter: "anywhere",
  cameraEnabled: true,
  microphoneEnabled: true,
};

const QUALITY_LABEL: Record<VideoConnectionQuality, string> = {
  unknown: "Checking connection",
  excellent: "Excellent connection",
  good: "Good connection",
  poor: "Weak connection",
  lost: "Connection lost",
};

const QUALITY_DOTS: Record<VideoConnectionQuality, number> = {
  unknown: 1,
  excellent: 4,
  good: 3,
  poor: 2,
  lost: 0,
};

type MatchPhase =
  | "setup"
  | "permissions"
  | "matching"
  | "connecting"
  | "active"
  | "reconnecting"
  | "restricted"
  | "error";

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function mapQuality(value: ConnectionQuality): VideoConnectionQuality {
  if (value === ConnectionQuality.Excellent) return "excellent";
  if (value === ConnectionQuality.Good) return "good";
  if (value === ConnectionQuality.Poor) return "poor";
  if (value === ConnectionQuality.Lost) return "lost";
  return "unknown";
}

function MatchingOrb() {
  return (
    <div
      className="relative grid h-40 w-40 place-items-center"
      aria-hidden="true"
    >
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          className="absolute rounded-full border border-blue-400/30"
          initial={{ width: 70, height: 70, opacity: 0.7 }}
          animate={{ width: 150, height: 150, opacity: 0 }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            delay: ring * 0.55,
            ease: "easeOut",
          }}
        />
      ))}
      <motion.div
        animate={{ rotate: 360, scale: [1, 1.08, 1] }}
        transition={{
          rotate: { duration: 8, repeat: Infinity, ease: "linear" },
          scale: { duration: 1.8, repeat: Infinity },
        }}
        className="grid h-24 w-24 place-items-center rounded-[32px] border border-blue-300/30 bg-gradient-to-br from-blue-400/25 to-blue-700/10 shadow-[0_0_60px_rgba(100,169,250,.34)] backdrop-blur-xl"
      >
        <Sparkles size={36} className="text-blue-300" />
      </motion.div>
    </div>
  );
}

function QualityIndicator({ quality }: { quality: VideoConnectionQuality }) {
  const dots = QUALITY_DOTS[quality];
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-xl"
      title={QUALITY_LABEL[quality]}
    >
      <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4].map((value) => (
          <span
            key={value}
            className={`w-[3px] rounded-full ${value <= dots ? "bg-emerald-400" : "bg-white/25"}`}
            style={{ height: `${4 + value * 2}px` }}
          />
        ))}
      </span>
      <span className="hidden sm:inline">{QUALITY_LABEL[quality]}</span>
      <span className="sr-only">{QUALITY_LABEL[quality]}</span>
    </div>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
  active = false,
  danger = false,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`vybe-button flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? "border-blue-300/40 bg-[#1686ff] shadow-[0_0_30px_rgba(100,169,250,.42)] hover:bg-[#4F9AF8]"
          : danger
            ? "border-red-400/25 bg-red-500/18 text-red-100 hover:bg-red-500/28"
            : active
              ? "border-blue-300/35 bg-blue-500/22 text-blue-100"
              : "border-white/10 bg-black/35 text-slate-100 hover:bg-white/12"
      }`}
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PreferenceButton({
  selected,
  onClick,
  icon,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`vybe-button rounded-[22px] border p-4 text-left ${selected ? "border-blue-400/55 bg-blue-500/13 shadow-[0_0_28px_rgba(100,169,250,.18)]" : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-blue-400/30"}`}
    >
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{body}</p>
    </button>
  );
}

export function LiveVideoMatch() {
  const searchParams = useSearchParams();
  const service = useMemo(() => getVideoService(), []);
  const profile = useVybeStore((state) => state.profile);
  const updateProfile = useVybeStore((state) => state.updateProfile);
  const sendFriendRequest = useVybeStore((state) => state.sendFriendRequest);
  const decideProfile = useVybeStore((state) => state.decideProfile);
  const friendStatuses = useVybeStore((state) => state.friendStatuses);
  const matchStatuses = useVybeStore((state) => state.matchStatuses);
  const currentUserId = useVybeStore((state) => state.currentUserId);
  const [phase, setPhase] = useState<MatchPhase>("setup");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [videoGender, setVideoGender] = useState<VideoGenderIdentity>(
    profile.videoGender || "unspecified",
  );
  const [countryCode, setCountryCode] = useState(profile.countryCode || "");
  const [countryName, setCountryName] = useState(profile.countryName || "");
  const [stateRegion, setStateRegion] = useState(profile.stateRegion || "");
  const [city, setCity] = useState(profile.city || "");
  const [locationVisibility, setLocationVisibility] = useState(
    profile.locationVisibility || "hidden",
  );
  const [session, setSession] = useState<VideoSessionSummary | null>(null);
  const [error, setError] = useState("");
  const [restriction, setRestriction] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [quality, setQuality] = useState<VideoConnectionQuality>("unknown");
  const [callSeconds, setCallSeconds] = useState(0);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteBlurred, setRemoteBlurred] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [starting, setStarting] = useState(false);
  const [permissionState, setPermissionState] = useState<
    "idle" | "granted" | "denied"
  >("idle");

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const endingRef = useRef(false);
  const queueRunRef = useRef(0);
  const remoteParticipantRef = useRef<RemoteParticipant | null>(null);
  const connectingSessionIdRef = useRef<string | null>(null);

  const peer = session?.peer;
  const friendStatus = peer ? friendStatuses[peer.id] : undefined;
  const matchStatus = peer ? matchStatuses[peer.id] : undefined;
  const canChat = friendStatus === "friends" || matchStatus === "active";

  const detachRemoteTracks = useCallback(() => {
    remoteParticipantRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.removeAttribute("src");
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.removeAttribute("src");
    }
    setRemoteReady(false);
    setRemoteBlurred(true);
  }, []);

  const stopLocalTracks = useCallback(() => {
    localTracksRef.current.forEach((track) => {
      track.detach();
      track.stop();
    });
    localTracksRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  const disconnectRoom = useCallback(
    async (stopTracks = false) => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) await room.disconnect(stopTracks);
      detachRemoteTracks();
    },
    [detachRemoteTracks],
  );

  const ensureLocalTracks = useCallback(
    async (nextPreferences: VideoMatchPreferences) => {
      if (localTracksRef.current.length) return localTracksRef.current;
      setPermissionState("idle");
      try {
        const tracks = await createLocalTracks({
          audio: nextPreferences.microphoneEnabled
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
          video: nextPreferences.cameraEnabled
            ? {
                facingMode: "user",
                resolution: VideoPresets.h720.resolution,
              }
            : false,
        });
        localTracksRef.current = tracks;
        const videoTrack = tracks.find(
          (track) => track.kind === Track.Kind.Video,
        );
        if (videoTrack && localVideoRef.current)
          videoTrack.attach(localVideoRef.current);
        setPermissionState("granted");
        return tracks;
      } catch (reason) {
        setPermissionState("denied");
        throw new Error(
          reason instanceof Error && reason.name === "NotAllowedError"
            ? "Camera or microphone permission was denied. Allow access in your browser settings, then try again."
            : "VYBE could not start your camera or microphone. Check that another app is not using them.",
        );
      }
    },
    [],
  );

  const attachRemoteTrack = useCallback((track: RemoteTrack) => {
    if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      setRemoteReady(true);
      window.setTimeout(() => setRemoteBlurred(false), 500);
    }
    if (track.kind === Track.Kind.Audio && remoteAudioRef.current)
      track.attach(remoteAudioRef.current);
  }, []);

  const bindRoomEvents = useCallback(
    (room: Room, activeSession: VideoSessionSummary) => {
      room
        .on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            remoteParticipantRef.current = participant;
            attachRemoteTrack(track);
          },
        )
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
          if (track.kind === Track.Kind.Video) setRemoteReady(false);
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          remoteParticipantRef.current = participant;
          participant.trackPublications.forEach((publication) => {
            if (publication.track)
              attachRemoteTrack(publication.track as RemoteTrack);
          });
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          setRemoteReady(false);
          setRemoteBlurred(true);
          if (!endingRef.current) setPhase("reconnecting");
        })
        .on(RoomEvent.ConnectionQualityChanged, (nextQuality, participant) => {
          if (participant.identity !== currentUserId)
            setQuality(mapQuality(nextQuality));
        })
        .on(RoomEvent.Reconnecting, () => {
          if (!endingRef.current) {
            setPhase("reconnecting");
            void service
              .logEvent(activeSession.id, "reconnecting")
              .catch(() => undefined);
          }
        })
        .on(RoomEvent.Reconnected, () => {
          setPhase("active");
          void service
            .logEvent(activeSession.id, "reconnected")
            .catch(() => undefined);
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setPhase("active");
        })
        .on(RoomEvent.Disconnected, () => {
          if (!endingRef.current) setPhase("reconnecting");
        });
    },
    [attachRemoteTrack, currentUserId, service],
  );

  const connectSession = useCallback(
    async (sessionId: string) => {
      setPhase("connecting");
      setError("");
      const loaded = await service.loadSession(sessionId);
      setSession(loaded);
      setRemoteBlurred(true);
      setCallSeconds(0);

      const [tokenData, tracks] = await Promise.all([
        service.getConnectionToken(sessionId),
        ensureLocalTracks(preferences),
      ]);
      setSession(tokenData.session);
      await disconnectRoom(false);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        publishDefaults: {
          simulcast: true,
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        },
      });
      roomRef.current = room;
      bindRoomEvents(room, tokenData.session);
      await room.connect(tokenData.serverUrl, tokenData.participantToken, {
        autoSubscribe: true,
      });
      for (const track of tracks) {
        const publication = await room.localParticipant.publishTrack(track, {
          source:
            track.kind === Track.Kind.Video
              ? Track.Source.Camera
              : Track.Source.Microphone,
        });
        if (track.kind === Track.Kind.Video && localVideoRef.current)
          publication.track?.attach(localVideoRef.current);
      }
      setCameraEnabled(preferences.cameraEnabled);
      setMicrophoneEnabled(preferences.microphoneEnabled);
      await service.updateParticipantState(sessionId, {
        connected: true,
        quality: "unknown",
        cameraEnabled: preferences.cameraEnabled,
        microphoneEnabled: preferences.microphoneEnabled,
      });
      await service.logEvent(sessionId, "connected");
      setPhase("active");
    },
    [bindRoomEvents, disconnectRoom, ensureLocalTracks, preferences, service],
  );

  const connectMatchedSession = useCallback(
    async (sessionId: string) => {
      // Polling and Realtime can observe the same queue update at nearly the same
      // moment. Claim the session once so both signals cannot open two LiveKit
      // rooms or request duplicate participant tokens.
      if (connectingSessionIdRef.current === sessionId) return;
      connectingSessionIdRef.current = sessionId;
      try {
        await connectSession(sessionId);
      } catch (reason) {
        connectingSessionIdRef.current = null;
        throw reason;
      }
    },
    [connectSession],
  );

  const pollForMatch = useCallback(
    async (runId: number, activePreferences: VideoMatchPreferences) => {
      let rejoinAttempts = 0;
      for (
        let attempt = 0;
        attempt < 90 && queueRunRef.current === runId;
        attempt += 1
      ) {
        const status = await service.getQueueStatus();
        if (status.status === "matched" && status.sessionId) {
          videoInfo("polling delivered shared session", {
            sessionId: status.sessionId,
          });
          await connectMatchedSession(status.sessionId);
          return;
        }
        if (status.status === "restricted") {
          setRestriction(
            status.restrictionReason ||
              "Video matching is temporarily unavailable for this account.",
          );
          setPhase("restricted");
          return;
        }
        // A stale cleanup, tab suspension, or deployment during matching can
        // remove a waiting row. Rejoin at most three times instead of polling an
        // idle queue forever. The server rate limit and idempotent RPC still
        // enforce abuse protection and duplicate-session prevention.
        if (
          (status.status === "idle" || status.status === "cancelled") &&
          rejoinAttempts < 3 &&
          queueRunRef.current === runId
        ) {
          rejoinAttempts += 1;
          videoInfo("queue row missing; retrying join", {
            status: status.status,
            rejoinAttempt: rejoinAttempts,
          });
          const rejoined = await service.joinQueue(activePreferences);
          if (rejoined.status === "matched" && rejoined.sessionId) {
            await connectMatchedSession(rejoined.sessionId);
            return;
          }
          if (rejoined.status === "restricted") {
            setRestriction(
              rejoined.restrictionReason ||
                "Video matching is temporarily unavailable for this account.",
            );
            setPhase("restricted");
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1300));
      }
      if (queueRunRef.current === runId)
        throw new Error(
          "Matching took longer than expected. Please try again.",
        );
    },
    [connectMatchedSession, service],
  );

  const enterQueue = useCallback(
    async (nextPreferences = preferences) => {
      const runId = queueRunRef.current + 1;
      queueRunRef.current = runId;
      setPhase("matching");
      setError("");
      setRestriction("");
      videoInfo("entering real Supabase queue", {
        runId,
        provider: service.provider,
        genderPreference: nextPreferences.genderPreference,
        locationFilter: nextPreferences.locationFilter,
      });
      const result = await service.joinQueue(nextPreferences);
      if (result.status === "matched" && result.sessionId) {
        videoInfo("queue join immediately matched", {
          sessionId: result.sessionId,
        });
        await connectMatchedSession(result.sessionId);
        return;
      }
      if (result.status === "restricted") {
        setRestriction(
          result.restrictionReason ||
            "Video matching is temporarily unavailable.",
        );
        setPhase("restricted");
        return;
      }
      await pollForMatch(runId, nextPreferences);
    },
    [connectMatchedSession, pollForMatch, preferences, service],
  );

  const saveVideoProfile = useCallback(async () => {
    if (videoGender === "unspecified")
      throw new Error(
        "Choose how you want your matching profile categorized before starting.",
      );
    const normalizedCode = countryCode.trim().toUpperCase();
    if (
      locationVisibility !== "hidden" &&
      (!normalizedCode || !countryName.trim())
    ) {
      throw new Error("Add your country before sharing a location label.");
    }
    if (
      (locationVisibility === "state" || locationVisibility === "city") &&
      !stateRegion.trim()
    ) {
      throw new Error("Add your state or region for this visibility option.");
    }
    if (locationVisibility === "city" && !city.trim())
      throw new Error("Add your city before sharing it.");
    await updateProfile({
      ...profile,
      videoGender,
      countryCode: normalizedCode,
      countryName: countryName.trim(),
      stateRegion: stateRegion.trim(),
      city: city.trim(),
      locationVisibility,
    });
  }, [
    city,
    countryCode,
    countryName,
    locationVisibility,
    profile,
    stateRegion,
    updateProfile,
    videoGender,
  ]);

  const beginMatching = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setPhase("permissions");
    setError("");
    try {
      videoInfo("start button accepted", {
        provider: service.provider,
      });
      await saveVideoProfile();
      await service.savePreferences(preferences);
      await ensureLocalTracks(preferences);
      await enterQueue(preferences);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to start video matching.",
      );
      setPhase("error");
    } finally {
      setStarting(false);
    }
  }, [
    ensureLocalTracks,
    enterQueue,
    preferences,
    saveVideoProfile,
    service,
    starting,
  ]);

  const endCurrentSession = useCallback(
    async (
      reason: "skip" | "end" | "disconnect" | "block" | "report",
      continueMatching = false,
    ) => {
      endingRef.current = true;
      queueRunRef.current += 1;
      let endFailed = false;
      try {
        if (session) await service.endSession(session.id, reason);
        else await service.leaveQueue();
      } catch (endError) {
        endFailed = true;
        if (reason === "skip")
          setError(
            endError instanceof Error
              ? endError.message
              : "Skip is temporarily limited.",
          );
      }
      await disconnectRoom(false);
      setSession(null);
      connectingSessionIdRef.current = null;
      setShowProfile(false);
      setQuality("unknown");
      setCallSeconds(0);
      endingRef.current = false;
      if (endFailed) {
        stopLocalTracks();
        setPhase("error");
        return;
      }
      if (continueMatching) {
        try {
          await enterQueue();
        } catch (matchError) {
          setError(
            matchError instanceof Error
              ? matchError.message
              : "Unable to find the next VYBE.",
          );
          setPhase("error");
        }
      } else {
        stopLocalTracks();
        setPhase("setup");
      }
    },
    [disconnectRoom, enterQueue, service, session, stopLocalTracks],
  );

  const retryConnection = useCallback(async () => {
    if (!session) return;
    try {
      await connectSession(session.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to reconnect.",
      );
      setPhase("error");
    }
  }, [connectSession, session]);

  const toggleLocalTrack = useCallback(
    async (kind: Track.Kind) => {
      const room = roomRef.current;
      const publication: LocalTrackPublication | undefined =
        kind === Track.Kind.Video
          ? room?.localParticipant.getTrackPublication(Track.Source.Camera)
          : room?.localParticipant.getTrackPublication(Track.Source.Microphone);
      let localTrack =
        publication?.track ||
        localTracksRef.current.find((track) => track.kind === kind);
      const nextEnabled =
        kind === Track.Kind.Video ? !cameraEnabled : !microphoneEnabled;
      if (!localTrack && nextEnabled) {
        const created = await createLocalTracks({
          video:
            kind === Track.Kind.Video
              ? { facingMode: "user", resolution: VideoPresets.h720.resolution }
              : false,
          audio:
            kind === Track.Kind.Audio
              ? {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }
              : false,
        });
        localTrack = created[0];
        if (!localTrack) return;
        localTracksRef.current.push(localTrack);
        if (room)
          await room.localParticipant.publishTrack(localTrack, {
            source:
              kind === Track.Kind.Video
                ? Track.Source.Camera
                : Track.Source.Microphone,
          });
        if (kind === Track.Kind.Video && localVideoRef.current)
          localTrack.attach(localVideoRef.current);
      }
      if (!localTrack) return;
      if (nextEnabled) await localTrack.unmute();
      else await localTrack.mute();
      if (kind === Track.Kind.Video) setCameraEnabled(nextEnabled);
      else setMicrophoneEnabled(nextEnabled);
      if (session) {
        await service.updateParticipantState(session.id, {
          connected: true,
          quality,
          cameraEnabled:
            kind === Track.Kind.Video ? nextEnabled : cameraEnabled,
          microphoneEnabled:
            kind === Track.Kind.Audio ? nextEnabled : microphoneEnabled,
        });
        await service.logEvent(
          session.id,
          kind === Track.Kind.Video ? "camera_toggle" : "microphone_toggle",
          { enabled: nextEnabled },
        );
      }
    },
    [cameraEnabled, microphoneEnabled, quality, service, session],
  );

  const handleBlockFinished = useCallback(() => {
    void endCurrentSession("block", true);
  }, [endCurrentSession]);

  useEffect(() => {
    void service
      .loadPreferences()
      .then((saved) => {
        setPreferences(saved);
        setCameraEnabled(saved.cameraEnabled);
        setMicrophoneEnabled(saved.microphoneEnabled);
      })
      .catch(() => undefined);
  }, [service]);

  useEffect(() => {
    const requestedSession = searchParams.get("session");
    if (!requestedSession) return;
    queueMicrotask(() => {
      void connectSession(requestedSession).catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to resume this video VYBE.",
        );
        setPhase("error");
      });
    });
  }, [connectSession, searchParams]);

  useEffect(() => {
    const track = localTracksRef.current.find(
      (item) => item.kind === Track.Kind.Video,
    );
    if (
      track &&
      localVideoRef.current &&
      (phase === "connecting" || phase === "active" || phase === "reconnecting")
    ) {
      track.attach(localVideoRef.current);
    }
  }, [phase, session?.id]);

  useEffect(() => {
    if (!session?.id) return;
    const sessionId = session.id;
    const handlePageHide = () => {
      void fetch("/api/video/end", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, reason: "disconnect" }),
      });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [session?.id]);

  useEffect(() => {
    if (phase !== "matching") return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const runId = queueRunRef.current;

    void service
      .subscribeQueue(async () => {
        if (disposed || queueRunRef.current !== runId) return;
        try {
          const status = await service.getQueueStatus();
          if (
            status.status === "matched" &&
            status.sessionId &&
            queueRunRef.current === runId
          ) {
            await connectMatchedSession(status.sessionId);
          } else if (status.status === "restricted") {
            setRestriction(
              status.restrictionReason ||
                "Video matching is temporarily unavailable for this account.",
            );
            setPhase("restricted");
          }
        } catch (reason) {
          videoWarn("Realtime queue delivery failed; polling remains active", {
            message: reason instanceof Error ? reason.message : "unknown error",
          });
          // The deterministic polling fallback remains active if Realtime is
          // temporarily unavailable or reconnecting.
        }
      })
      .then((dispose) => {
        if (disposed) dispose();
        else unsubscribe = dispose;
      })
      .catch((reason) => {
        videoWarn("queue Realtime subscription unavailable; polling remains active", {
          message: reason instanceof Error ? reason.message : "unknown error",
        });
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [connectMatchedSession, phase, service]);

  useEffect(() => {
    if (
      phase !== "matching" &&
      phase !== "connecting" &&
      phase !== "active" &&
      phase !== "reconnecting"
    )
      return;
    const heartbeat = window.setInterval(() => {
      void service.heartbeatQueue().catch(() => undefined);
    }, 12_000);
    return () => window.clearInterval(heartbeat);
  }, [phase, service]);

  useEffect(() => {
    if (phase !== "active") return;
    const timer = window.setInterval(
      () => setCallSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const sessionId = session?.id;
    if (!sessionId) return;
    let dispose: (() => void) | undefined;
    void service
      .subscribeSession(sessionId, async () => {
        try {
          const next = await service.loadSession(sessionId);
          setSession(next);
          if (next.hiddenUntilReview) setRemoteBlurred(true);
          if (next.status === "ended" && !endingRef.current) {
            await disconnectRoom(false);
            setError("This video session has ended.");
            setPhase("error");
          }
        } catch {
          /* Access can disappear immediately after a block or restriction. */
        }
      })
      .then((unsubscribe) => {
        dispose = unsubscribe;
      });
    return () => dispose?.();
  }, [disconnectRoom, service, session?.id]);

  useEffect(() => {
    if (
      phase !== "active" ||
      !session ||
      process.env.NEXT_PUBLIC_VIDEO_MODERATION_ENABLED !== "true"
    )
      return;
    const timer = window.setInterval(async () => {
      const video = remoteVideoRef.current;
      if (
        !video ||
        !remoteReady ||
        video.videoWidth < 10 ||
        video.videoHeight < 10
      )
        return;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.max(
        180,
        Math.round((video.videoHeight / video.videoWidth) * 320),
      );
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const result = await service.moderateFrame(
          session.id,
          canvas.toDataURL("image/jpeg", 0.42),
        );
        if (result.hidden) setRemoteBlurred(true);
      } catch {
        /* Moderation sampling never interrupts the call UI. */
      }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [phase, remoteReady, service, session]);

  useEffect(
    () => () => {
      endingRef.current = true;
      queueRunRef.current += 1;
      connectingSessionIdRef.current = null;
      void disconnectRoom(true);
      stopLocalTracks();
    },
    [disconnectRoom, stopLocalTracks],
  );


  const setupIncomplete = videoGender === "unspecified";

  return (
    <AppShell immersive>
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <div className="pointer-events-none absolute inset-0 animated-grid opacity-60" />
        <div className="ambient-orb pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-blue-500/16 blur-[100px]" />
        <div className="ambient-orb-delayed pointer-events-none absolute -right-28 bottom-10 h-96 w-96 rounded-full bg-cyan-400/10 blur-[120px]" />

        <header className="relative z-30 flex items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-[var(--header)] px-4 py-3 backdrop-blur-2xl sm:px-6">
          <Link
            href="/home"
            className="vybe-button inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-black"
            aria-label="Return home"
          >
            <ArrowLeft size={18} />
            <span className="tracking-[.2em]">VYBE</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black text-blue-400 sm:inline-flex">
              <ShieldCheck size={13} className="mr-1.5" /> AGE-PROTECTED 1:1
            </span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === "setup" && (
            <motion.section
              key="setup"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
            >
              <div className="text-center">
                <span className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/8 px-4 py-2 text-[10px] font-black uppercase tracking-[.18em] text-blue-400">
                  <Video size={15} /> Live Solo Match
                </span>
                <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
                  Find your next{" "}
                  <span className="bg-gradient-to-r from-[#64A9FA] to-[#1686ff] bg-clip-text text-transparent">
                    VYBE.
                  </span>
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  Secure one-on-one video matching inside your verified age
                  bracket. Your safety controls stay visible for the entire
                  call.
                </p>
              </div>

              <div className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
                <section className="vybe-card rounded-[32px] p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-black">
                        Who do you want to meet?
                      </h2>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Preferences are mutual and never override age isolation.
                      </p>
                    </div>
                    <Users className="text-blue-400" />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        [
                          "girls",
                          "👧",
                          "Girls",
                          "Match with eligible girls who also allow your profile.",
                        ],
                        [
                          "boys",
                          "👦",
                          "Boys",
                          "Match with eligible boys who also allow your profile.",
                        ],
                        [
                          "everyone",
                          "🌎",
                          "Everyone",
                          "Include girls, boys, and other supported identities.",
                        ],
                      ] as const
                    ).map(([value, icon, title, body]) => (
                      <PreferenceButton
                        key={value}
                        selected={preferences.genderPreference === value}
                        onClick={() =>
                          setPreferences((current) => ({
                            ...current,
                            genderPreference: value as VideoGenderPreference,
                          }))
                        }
                        icon={icon}
                        title={title}
                        body={body}
                      />
                    ))}
                  </div>

                  <div className="mt-7 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black">Location filter</h2>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Coarse labels only. No GPS, address, ZIP, school,
                        distance, or live location.
                      </p>
                    </div>
                    <LocateFixed className="text-blue-400" />
                  </div>
                  <div
                    role="group"
                    aria-label="Video matching location filter"
                    className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
                  >
                    {(
                      [
                        "anywhere",
                        "country",
                        "state",
                        "city",
                      ] as VideoLocationFilter[]
                    ).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={preferences.locationFilter === value}
                        onClick={() =>
                          setPreferences((current) => ({
                            ...current,
                            locationFilter: value,
                          }))
                        }
                        className={`vybe-button rounded-2xl border px-3 py-3 text-xs font-black capitalize ${preferences.locationFilter === value ? "border-blue-400/50 bg-blue-500/13 text-blue-400" : "border-[var(--border)] bg-[var(--panel-soft)] text-[var(--muted)]"}`}
                      >
                        {value === "anywhere" ? "Anywhere" : `Same ${value}`}
                      </button>
                    ))}
                  </div>

                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={preferences.cameraEnabled}
                      onClick={() =>
                        setPreferences((current) => ({
                          ...current,
                          cameraEnabled: !current.cameraEnabled,
                        }))
                      }
                      className={`vybe-button flex items-center gap-3 rounded-2xl border p-4 text-left ${preferences.cameraEnabled ? "border-blue-400/35 bg-blue-500/10" : "border-[var(--border)] bg-[var(--panel-soft)]"}`}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500/12 text-blue-400">
                        {preferences.cameraEnabled ? <Camera /> : <CameraOff />}
                      </span>
                      <span>
                        <b className="block">
                          Camera starts{" "}
                          {preferences.cameraEnabled ? "on" : "off"}
                        </b>
                        <small className="mt-1 block text-[var(--muted)]">
                          You can toggle it during the call.
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={preferences.microphoneEnabled}
                      onClick={() =>
                        setPreferences((current) => ({
                          ...current,
                          microphoneEnabled: !current.microphoneEnabled,
                        }))
                      }
                      className={`vybe-button flex items-center gap-3 rounded-2xl border p-4 text-left ${preferences.microphoneEnabled ? "border-blue-400/35 bg-blue-500/10" : "border-[var(--border)] bg-[var(--panel-soft)]"}`}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500/12 text-blue-400">
                        {preferences.microphoneEnabled ? <Mic /> : <MicOff />}
                      </span>
                      <span>
                        <b className="block">
                          Microphone starts{" "}
                          {preferences.microphoneEnabled ? "on" : "muted"}
                        </b>
                        <small className="mt-1 block text-[var(--muted)]">
                          Audio is used only inside this call.
                        </small>
                      </span>
                    </button>
                  </div>
                </section>

                <section className="vybe-card rounded-[32px] p-5 sm:p-7">
                  <h2 className="flex items-center gap-2 text-lg font-black">
                    <Globe2 size={19} className="text-blue-400" /> Matching
                    profile
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    Your category is required for preference matching. Location
                    remains hidden by default.
                  </p>
                  <label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    I should appear as
                  </label>
                  <select
                    aria-label="Video matching category"
                    value={videoGender}
                    onChange={(event) =>
                      setVideoGender(event.target.value as VideoGenderIdentity)
                    }
                    className="vybe-input mt-2"
                  >
                    <option value="unspecified">Choose one</option>
                    <option value="girl">Girl</option>
                    <option value="boy">Boy</option>
                    <option value="other">Other</option>
                  </select>
                  <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Visible location
                  </label>
                  <select
                    aria-label="Location visibility"
                    value={locationVisibility}
                    onChange={(event) =>
                      setLocationVisibility(
                        event.target.value as typeof locationVisibility,
                      )
                    }
                    className="vybe-input mt-2"
                  >
                    <option value="hidden">Hidden (default)</option>
                    <option value="country">Country</option>
                    <option value="state">State / region</option>
                    <option value="city">City</option>
                  </select>
                  {locationVisibility !== "hidden" && (
                    <div className="mt-3 grid gap-2">
                      <div className="grid grid-cols-[90px_1fr] gap-2">
                        <input
                          maxLength={2}
                          value={countryCode}
                          onChange={(event) =>
                            setCountryCode(event.target.value.toUpperCase())
                          }
                          placeholder="US"
                          className="vybe-input uppercase"
                          aria-label="Country code"
                        />
                        <input
                          value={countryName}
                          onChange={(event) =>
                            setCountryName(event.target.value)
                          }
                          placeholder="Country"
                          className="vybe-input"
                          aria-label="Country name"
                        />
                      </div>
                      {(locationVisibility === "state" ||
                        locationVisibility === "city") && (
                        <input
                          value={stateRegion}
                          onChange={(event) =>
                            setStateRegion(event.target.value)
                          }
                          placeholder="State or region"
                          className="vybe-input"
                          aria-label="State or region"
                        />
                      )}
                      {locationVisibility === "city" && (
                        <input
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                          placeholder="City"
                          className="vybe-input"
                          aria-label="City"
                        />
                      )}
                    </div>
                  )}
                  <div className="mt-5 rounded-2xl border border-blue-400/15 bg-blue-500/[.06] p-4">
                    <p className="flex items-center gap-2 text-xs font-black text-blue-400">
                      <ShieldCheck size={16} /> Privacy guarantee
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                      City matching activates only when both people explicitly
                      share a city. Hidden details never appear in discovery or
                      the call.
                    </p>
                  </div>
                  <button
                    disabled={starting || setupIncomplete}
                    onClick={() => void beginMatching()}
                    className="vybe-button mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1686ff] py-4 text-sm font-black text-white shadow-[0_0_36px_rgba(100,169,250,.38)] hover:bg-[#4F9AF8] disabled:opacity-45"
                  >
                    <Video size={19} /> Start Video Match{" "}
                    <ChevronRight size={18} />
                  </button>
                  {setupIncomplete && (
                    <p className="mt-2 text-center text-[10px] font-bold text-amber-500">
                      Choose your matching category to continue.
                    </p>
                  )}
                </section>
              </div>
            </motion.section>
          )}

          {(phase === "permissions" || phase === "matching") && (
            <motion.section
              key="matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 grid min-h-[calc(100vh-66px)] place-items-center px-4 py-12 text-center"
            >
              <div className="max-w-md">
                <MatchingOrb />
                <h1 className="mt-6 text-3xl font-black">
                  {phase === "permissions"
                    ? "Getting you ready…"
                    : "Finding your VYBE…"}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {phase === "permissions"
                    ? "Your browser may ask for camera and microphone permission. VYBE never records calls by default."
                    : "Searching only inside your verified age bracket with your selected preferences."}
                </p>
                <div className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/8 px-4 py-2 text-[10px] font-black text-blue-400">
                  <LoaderCircle size={15} className="animate-spin" /> SECURE
                  MATCHING QUEUE
                </div>
                <button
                  type="button"
                  onClick={() => void endCurrentSession("end", false)}
                  className="vybe-button mt-8 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] px-6 py-3 text-sm font-bold text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </motion.section>
          )}

          {(phase === "connecting" ||
            phase === "active" ||
            phase === "reconnecting") &&
            session && (
              <motion.section
                key="call"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                data-video-stage
                className="relative z-10 flex min-h-[calc(100vh-66px)] flex-col p-2 sm:p-4"
              >
                <div className="relative grid min-h-0 flex-1 gap-2 md:grid-cols-2 md:gap-3">
                  <div className="relative min-h-[32vh] overflow-hidden rounded-[28px] border border-white/10 bg-[#05080e] shadow-2xl md:min-h-0">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      disablePictureInPicture
                      controlsList="nodownload noremoteplayback"
                      className={`h-full w-full object-cover transition duration-300 ${cameraEnabled ? "opacity-100" : "opacity-0"}`}
                    />
                    {!cameraEnabled && (
                      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(22,134,255,.18),transparent_50%),#060a11]">
                        <div className="text-center">
                          <Avatar
                            imageSrc={
                              profile.profileImage || profile.avatarChoice
                            }
                            alt={profile.username}
                            size="xl"
                          />
                          <p className="mt-4 font-black text-white">
                            Camera off
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-xl">
                      YOU
                    </div>
                    <div className="absolute bottom-3 right-3 flex gap-2">
                      {!microphoneEnabled && (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-red-500/80 text-white">
                          <MicOff size={15} />
                        </span>
                      )}
                      {!cameraEnabled && (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-red-500/80 text-white">
                          <CameraOff size={15} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative min-h-[38vh] overflow-hidden rounded-[28px] border border-blue-400/20 bg-[#05080e] shadow-[0_0_55px_rgba(22,134,255,.15)] md:min-h-0">
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        disablePictureInPicture
                        controlsList="nodownload noremoteplayback"
                        className={`h-full w-full object-cover transition duration-700 ${remoteBlurred ? "scale-105 blur-2xl" : "scale-100 blur-0"}`}
                      />
                    <audio ref={remoteAudioRef} autoPlay controls={false} />
                    {!remoteReady && (
                      <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_35%,rgba(100,169,250,.2),transparent_48%),#060a11]">
                        <div className="text-center">
                          <Avatar
                            imageSrc={peer?.avatarUrl || undefined}
                            alt={peer?.username || "VYBE"}
                            size="xl"
                          />
                          <p className="mt-5 text-lg font-black text-white">
                            {phase === "reconnecting"
                              ? "Reconnecting…"
                              : "Connecting securely…"}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            Video stays blurred until both people connect.
                          </p>
                        </div>
                      </div>
                    )}
                    {session.hiddenUntilReview && (
                      <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/85 p-6 text-center backdrop-blur-2xl">
                        <div>
                          <CircleAlert
                            size={34}
                            className="mx-auto text-amber-400"
                          />
                          <h3 className="mt-4 text-xl font-black text-white">
                            Video hidden for safety review
                          </h3>
                          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                            The call was flagged by an automated safety signal.
                            Video remains hidden while the session is reviewed.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="absolute left-3 top-3 flex max-w-[70%] items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-xl">
                      <span className="truncate">{peer?.username}</span>
                      {peer?.locationLabel && (
                        <>
                          <span className="text-white/30">•</span>
                          <span className="truncate text-blue-200">
                            {peer.locationLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="absolute right-3 top-3">
                      <QualityIndicator quality={quality} />
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-white backdrop-blur-xl">
                        <p className="font-black">{peer?.displayName}</p>
                        <p className="mt-0.5 text-[10px] text-slate-300">
                          {peer?.compatibilityScore}% VYBE compatibility
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-xs font-black text-white backdrop-blur-xl">
                        {formatTimer(callSeconds)}
                      </span>
                    </div>
                  </div>

                  {phase === "reconnecting" && (
                    <div className="absolute inset-0 z-40 grid place-items-center rounded-[30px] bg-slate-950/65 p-4 backdrop-blur-md">
                      <div className="vybe-card max-w-sm rounded-[28px] p-6 text-center">
                        <WifiOff className="mx-auto text-blue-400" size={34} />
                        <h2 className="mt-4 text-xl font-black">
                          Connection interrupted
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                          VYBE is attempting network recovery. Your current
                          match stays reserved briefly.
                        </p>
                        <button
                          onClick={() => void retryConnection()}
                          className="vybe-button mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white"
                        >
                          <RefreshCcw size={17} /> Reconnect now
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative z-50 mt-2 rounded-[28px] border border-white/10 bg-[#070c14]/94 p-2.5 shadow-[0_-14px_50px_rgba(0,0,0,.3)] backdrop-blur-2xl sm:mt-3 sm:p-3">
                  <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto pb-1 sm:justify-center">
                    <ControlButton
                      label={microphoneEnabled ? "Mute" : "Unmute"}
                      icon={
                        microphoneEnabled ? (
                          <Mic size={20} />
                        ) : (
                          <MicOff size={20} />
                        )
                      }
                      onClick={() => void toggleLocalTrack(Track.Kind.Audio)}
                      active={!microphoneEnabled}
                    />
                    <ControlButton
                      label={cameraEnabled ? "Camera" : "Camera on"}
                      icon={
                        cameraEnabled ? (
                          <Camera size={20} />
                        ) : (
                          <CameraOff size={20} />
                        )
                      }
                      onClick={() => void toggleLocalTrack(Track.Kind.Video)}
                      active={!cameraEnabled}
                    />
                    <ControlButton
                      label="Profile"
                      icon={<Users size={20} />}
                      onClick={() => {
                        setShowProfile(true);
                        if (session)
                          void service.logEvent(session.id, "profile_view");
                      }}
                    />
                    <ControlButton
                      label={
                        friendStatus === "friends"
                          ? "Friends"
                          : friendStatus === "pending"
                            ? "Sent"
                            : "Add friend"
                      }
                      icon={
                        friendStatus === "friends" ? (
                          <CheckCircle2 size={20} />
                        ) : (
                          <UserPlus size={20} />
                        )
                      }
                      disabled={
                        !peer ||
                        friendStatus === "friends" ||
                        friendStatus === "pending"
                      }
                      onClick={() => {
                        if (peer) {
                          void sendFriendRequest(peer.id);
                          if (session)
                            void service.logEvent(session.id, "friend_request");
                        }
                      }}
                    />
                    <ControlButton
                      label={matchStatus === "active" ? "Matched" : "Like"}
                      icon={<Heart size={20} />}
                      active={matchStatus === "active"}
                      disabled={!peer || matchStatus === "active"}
                      onClick={() => {
                        if (peer) {
                          void decideProfile(peer.id, "like");
                          if (session)
                            void service.logEvent(session.id, "like");
                        }
                      }}
                    />
                    <ControlButton
                      label="Next"
                      icon={<SkipForward size={22} />}
                      primary
                      onClick={() => void endCurrentSession("skip", true)}
                    />
                    <ControlButton
                      label="Report"
                      icon={<Flag size={20} />}
                      danger
                      onClick={() => setReportOpen(true)}
                    />
                    <ControlButton
                      label="Block"
                      icon={<Ban size={20} />}
                      danger
                      onClick={() => setBlockOpen(true)}
                    />
                    <ControlButton
                      label="End"
                      icon={<PhoneOff size={20} />}
                      danger
                      onClick={() => void endCurrentSession("end", false)}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-4 text-[9px] font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={11} /> Not recorded by default
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Signal size={11} /> Encrypted WebRTC room
                    </span>
                  </div>
                </div>
              </motion.section>
            )}

          {(phase === "error" || phase === "restricted") && (
            <motion.section
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative z-10 grid min-h-[calc(100vh-66px)] place-items-center px-4 py-12"
            >
              <div className="vybe-card w-full max-w-lg rounded-[32px] p-7 text-center sm:p-9">
                <span
                  className={`mx-auto grid h-16 w-16 place-items-center rounded-[24px] ${phase === "restricted" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"}`}
                >
                  {phase === "restricted" ? (
                    <ShieldCheck size={30} />
                  ) : (
                    <CircleAlert size={30} />
                  )}
                </span>
                <h1 className="mt-5 text-2xl font-black">
                  {phase === "restricted"
                    ? "Video matching is paused"
                    : "We couldn’t connect"}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {phase === "restricted" ? restriction : error}
                </p>
                {permissionState === "denied" && (
                  <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/[.06] p-4 text-left text-xs leading-5 text-[var(--muted)]">
                    <b className="text-[var(--foreground)]">
                      Browser permission tip:
                    </b>{" "}
                    Use the lock or camera icon beside the address bar, allow
                    VYBE, then reload this page.
                  </div>
                )}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setError("");
                      setRestriction("");
                      setPhase("setup");
                    }}
                    className="vybe-button rounded-2xl border border-[var(--border)] py-3 font-bold text-[var(--muted)]"
                  >
                    Back to setup
                  </button>
                  <button
                    disabled={phase === "restricted"}
                    onClick={() => void beginMatching()}
                    className="vybe-button rounded-2xl bg-blue-600 py-3 font-black text-white disabled:opacity-40"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showProfile && peer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] grid place-items-end bg-slate-950/65 p-3 backdrop-blur-sm sm:place-items-center"
              onMouseDown={() => setShowProfile(false)}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                onMouseDown={(event) => event.stopPropagation()}
                className="vybe-card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[30px] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      imageSrc={peer.avatarUrl || undefined}
                      alt={peer.username}
                      size="lg"
                    />
                    <div>
                      <p className="font-black">{peer.displayName}</p>
                      <p className="text-xs text-blue-400">
                        @{peer.username} · {peer.ageBracket}
                      </p>
                    </div>
                  </div>
                  <button
                    className="vybe-button rounded-xl p-2 text-[var(--muted)]"
                    onClick={() => setShowProfile(false)}
                    aria-label="Close profile"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                  {peer.bio}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {peer.interests.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black text-blue-400"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
                {peer.locationLabel && (
                  <p className="mt-4 flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                    <Globe2 size={15} className="text-blue-400" />{" "}
                    {peer.locationLabel}
                  </p>
                )}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Link
                    href={`/profile/${peer.id}`}
                    onClick={() => {
                      if (session)
                        void service.logEvent(session.id, "profile_view");
                    }}
                    className="vybe-button rounded-2xl border border-[var(--border)] py-3 text-center text-sm font-black"
                  >
                    Full profile
                  </Link>
                  {canChat ? (
                    <Link
                      href={`/chat/${peer.id}`}
                      onClick={() => {
                        if (session)
                          void service.logEvent(session.id, "chat_open");
                      }}
                      className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white"
                    >
                      <MessageCircle size={17} /> Chat
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        void sendFriendRequest(peer.id);
                        if (session)
                          void service.logEvent(session.id, "friend_request");
                      }}
                      className="vybe-button inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-black text-white"
                    >
                      <UserPlus size={17} /> Add friend
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {peer && (
          <>
            <ReportModal
              open={reportOpen}
              onClose={() => setReportOpen(false)}
              userId={peer.id}
              username={peer.username}
              targetType="video_session"
              targetId={session?.id}
              afterSubmit={() => void endCurrentSession("report", true)}
            />
            <BlockModal
              open={blockOpen}
              onClose={() => setBlockOpen(false)}
              userId={peer.id}
              username={peer.username}
              afterBlock={handleBlockFinished}
            />
          </>
        )}
      </main>
    </AppShell>
  );
}
