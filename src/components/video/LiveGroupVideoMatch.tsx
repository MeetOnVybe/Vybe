"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  Flag,
  Heart,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  UserPlus,
  Users,
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
import { getSupabaseGroupVideoService } from "@/services/supabase/group-video";
import { useVybeStore } from "@/store/useVybeStore";
import type {
  GroupVideoParticipant,
  GroupVideoSessionSummary,
  LocationVisibility,
  VideoConnectionQuality,
  VideoGenderIdentity,
  VideoMatchPreferences,
} from "@/types";

type GroupPhase =
  | "setup"
  | "permissions"
  | "matching"
  | "connecting"
  | "active"
  | "reconnecting"
  | "restricted"
  | "error";

type RemoteTrackSet = { video?: RemoteTrack; audio?: RemoteTrack };

const DEFAULT_PREFERENCES: VideoMatchPreferences = {
  genderPreference: "everyone",
  locationFilter: "anywhere",
  cameraEnabled: true,
  microphoneEnabled: true,
};

function mapQuality(value: ConnectionQuality): VideoConnectionQuality {
  if (value === ConnectionQuality.Excellent) return "excellent";
  if (value === ConnectionQuality.Good) return "good";
  if (value === ConnectionQuality.Poor) return "poor";
  if (value === ConnectionQuality.Lost) return "lost";
  return "unknown";
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function PreferenceCard({
  selected,
  title,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`vybe-button rounded-[22px] border p-4 text-left ${
        selected
          ? "border-blue-400/55 bg-blue-500/13 shadow-[0_0_28px_rgba(100,169,250,.18)]"
          : "border-[var(--border)] bg-[var(--panel-soft)] hover:border-blue-400/30"
      }`}
    >
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-3 font-black">{title}</p>
    </button>
  );
}

function GroupTile({
  participant,
  isLocal,
  selected,
  localVideoRef,
  remoteTracks,
  hidden,
  onSelect,
  registerRemoteVideo,
}: {
  participant: GroupVideoParticipant;
  isLocal: boolean;
  selected: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteTracks?: RemoteTrackSet;
  hidden: boolean;
  onSelect: () => void;
  registerRemoteVideo: (userId: string, element: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isLocal) return;
    const video = remoteTracks?.video;
    const audio = remoteTracks?.audio;
    if (video && videoRef.current) video.attach(videoRef.current);
    if (audio && audioRef.current) audio.attach(audioRef.current);
    return () => {
      video?.detach();
      audio?.detach();
    };
  }, [isLocal, remoteTracks]);

  const videoReady = isLocal || Boolean(remoteTracks?.video);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative min-h-[260px] overflow-hidden rounded-[28px] border text-left shadow-2xl transition sm:min-h-[320px] ${
        selected
          ? "border-blue-400/70 shadow-[0_0_38px_rgba(37,99,235,.3)]"
          : "border-white/10 hover:border-blue-400/35"
      }`}
      aria-label={`${isLocal ? "Your" : participant.displayName + "'s"} video${selected ? ", selected" : ""}`}
    >
      <div className="absolute inset-0 bg-[#07101b]">
        {isLocal ? (
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            disablePictureInPicture
            controlsList="nodownload noremoteplayback"
            className={`h-full w-full scale-x-[-1] object-cover transition duration-500 ${
              participant.cameraEnabled ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <>
            <video
              ref={(element) => {
                videoRef.current = element;
                registerRemoteVideo(participant.id, element);
              }}
              autoPlay
              playsInline
              disablePictureInPicture
              controlsList="nodownload noremoteplayback"
              className={`h-full w-full object-cover transition duration-700 ${
                videoReady && participant.cameraEnabled && !hidden
                  ? "opacity-100"
                  : "opacity-0 blur-2xl"
              }`}
            />
            <audio
              ref={audioRef}
              autoPlay
              controlsList="nodownload noremoteplayback"
            />
          </>
        )}
      </div>

      {(!videoReady || !participant.cameraEnabled || hidden) && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(37,99,235,.18),transparent_52%),#07101b]">
          <div className="text-center">
            <Avatar
              imageSrc={participant.avatarUrl || undefined}
              alt={participant.username}
              size="xl"
            />
            <p className="mt-4 text-sm font-black text-white">
              {hidden
                ? "Video hidden for safety review"
                : participant.cameraEnabled
                  ? "Connecting video…"
                  : "Camera off"}
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-4 pt-16 text-white">
        <div className="min-w-0">
          <p className="truncate font-black">
            {participant.displayName} {isLocal ? "(You)" : ""}
          </p>
          <p className="truncate text-[10px] font-bold text-blue-200/80">
            @{participant.username} · {participant.ageBracket}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!participant.microphoneEnabled && (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-red-500/20 text-red-200">
              <MicOff size={15} />
            </span>
          )}
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              participant.connected ? "bg-emerald-400" : "bg-amber-400"
            } shadow-[0_0_12px_currentColor]`}
          />
        </div>
      </div>
    </button>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  primary,
  danger,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`vybe-button flex min-h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black text-white disabled:opacity-40 ${
        primary
          ? "border-blue-300/40 bg-[#1686ff] shadow-[0_0_30px_rgba(100,169,250,.42)]"
          : danger
            ? "border-red-400/25 bg-red-500/18 text-red-100"
            : "border-white/10 bg-black/35 text-slate-100 hover:bg-white/12"
      }`}
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function LiveGroupVideoMatch() {
  const service = useMemo(() => getSupabaseGroupVideoService(), []);
  const profile = useVybeStore((state) => state.profile);
  const currentUserId = useVybeStore((state) => state.currentUserId);
  const updateProfile = useVybeStore((state) => state.updateProfile);
  const sendFriendRequest = useVybeStore((state) => state.sendFriendRequest);
  const decideProfile = useVybeStore((state) => state.decideProfile);
  const friendStatuses = useVybeStore((state) => state.friendStatuses);
  const matchStatuses = useVybeStore((state) => state.matchStatuses);

  const [phase, setPhase] = useState<GroupPhase>("setup");
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [videoGender, setVideoGender] = useState<VideoGenderIdentity>(
    profile.videoGender || "unspecified",
  );
  const [countryCode, setCountryCode] = useState(profile.countryCode || "");
  const [countryName, setCountryName] = useState(profile.countryName || "");
  const [stateRegion, setStateRegion] = useState(profile.stateRegion || "");
  const [city, setCity] = useState(profile.city || "");
  const [locationVisibility, setLocationVisibility] =
    useState<LocationVisibility>(profile.locationVisibility || "hidden");
  const [session, setSession] = useState<GroupVideoSessionSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [callSeconds, setCallSeconds] = useState(0);
  const [error, setError] = useState("");
  const [restriction, setRestriction] = useState("");
  const [starting, setStarting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [remoteTracksState, setRemoteTracksState] = useState<Map<string, RemoteTrackSet>>(new Map());
  const [hiddenParticipantIds, setHiddenParticipantIds] = useState<Set<string>>(
    new Set(),
  );

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteTracksRef = useRef<Map<string, RemoteTrackSet>>(new Map());
  const remoteVideoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const queueRunRef = useRef(0);
  const connectingSessionIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);

  const selectedParticipant = session?.participants.find(
    (participant) => participant.id === selectedId,
  );
  const remoteParticipants = useMemo(
    () => session?.participants.filter((participant) => participant.id !== currentUserId) || [],
    [currentUserId, session?.participants],
  );
  const localParticipant = session?.participants.find(
    (participant) => participant.id === currentUserId,
  );
  const friendStatus = selectedParticipant
    ? friendStatuses[selectedParticipant.id]
    : undefined;
  const matchStatus = selectedParticipant
    ? matchStatuses[selectedParticipant.id]
    : undefined;
  const canChat = friendStatus === "friends" || matchStatus === "active";

  const registerRemoteVideo = useCallback(
    (userId: string, element: HTMLVideoElement | null) => {
      if (element) remoteVideoElementsRef.current.set(userId, element);
      else remoteVideoElementsRef.current.delete(userId);
    },
    [],
  );

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
      remoteTracksRef.current.forEach((tracks) => {
        tracks.video?.detach();
        tracks.audio?.detach();
      });
      remoteTracksRef.current.clear();
      setRemoteTracksState(new Map());
    },
    [],
  );

  const ensureLocalTracks = useCallback(async (next: VideoMatchPreferences) => {
    if (localTracksRef.current.length) return localTracksRef.current;
    try {
      const tracks = await createLocalTracks({
        audio: next.microphoneEnabled
          ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : false,
        video: next.cameraEnabled
          ? { facingMode: "user", resolution: VideoPresets.h720.resolution }
          : false,
      });
      localTracksRef.current = tracks;
      const videoTrack = tracks.find((track) => track.kind === Track.Kind.Video);
      if (videoTrack && localVideoRef.current) videoTrack.attach(localVideoRef.current);
      return tracks;
    } catch (reason) {
      throw new Error(
        reason instanceof Error && reason.name === "NotAllowedError"
          ? "Camera or microphone permission was denied. Allow access, then try again."
          : "VYBE could not start your camera or microphone.",
      );
    }
  }, []);

  const refreshSession = useCallback(
    async (sessionId: string) => {
      const next = await service.loadSession(sessionId);
      setSession(next);
      setSelectedId((current) => {
        if (current && next.participants.some((item) => item.id === current)) return current;
        return next.participants.find((item) => item.id !== currentUserId)?.id || null;
      });
      if (next.status === "ended") {
        await disconnectRoom(false);
        setError("This group video session has ended.");
        setPhase("error");
      }
      return next;
    },
    [currentUserId, disconnectRoom, service],
  );

  const bindRoomEvents = useCallback(
    (room: Room, activeSessionId: string) => {
      room
        .on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            const tracks = remoteTracksRef.current.get(participant.identity) || {};
            if (track.kind === Track.Kind.Video) tracks.video = track;
            if (track.kind === Track.Kind.Audio) tracks.audio = track;
            remoteTracksRef.current.set(participant.identity, tracks);
            setRemoteTracksState(new Map(remoteTracksRef.current));
          },
        )
        .on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
            track.detach();
            const tracks = remoteTracksRef.current.get(participant.identity) || {};
            if (track.kind === Track.Kind.Video) delete tracks.video;
            if (track.kind === Track.Kind.Audio) delete tracks.audio;
            remoteTracksRef.current.set(participant.identity, tracks);
            setRemoteTracksState(new Map(remoteTracksRef.current));
          },
        )
        .on(RoomEvent.ParticipantConnected, () => {
          void refreshSession(activeSessionId);
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          const tracks = remoteTracksRef.current.get(participant.identity);
          tracks?.video?.detach();
          tracks?.audio?.detach();
          remoteTracksRef.current.delete(participant.identity);
          setRemoteTracksState(new Map(remoteTracksRef.current));
          void refreshSession(activeSessionId);
        })
        .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          if (participant.identity === currentUserId) return;
          setSession((current) =>
            current
              ? {
                  ...current,
                  participants: current.participants.map((item) =>
                    item.id === participant.identity
                      ? { ...item, connectionQuality: mapQuality(quality) }
                      : item,
                  ),
                }
              : current,
          );
        })
        .on(RoomEvent.Reconnecting, () => {
          if (!endingRef.current) setPhase("reconnecting");
        })
        .on(RoomEvent.Reconnected, () => {
          setPhase("active");
          void refreshSession(activeSessionId);
        })
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setPhase("active");
        })
        .on(RoomEvent.Disconnected, () => {
          if (!endingRef.current) setPhase("reconnecting");
        });
    },
    [currentUserId, refreshSession],
  );

  const connectSession = useCallback(
    async (sessionId: string) => {
      setPhase("connecting");
      setError("");
      const loaded = await refreshSession(sessionId);
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
      bindRoomEvents(room, loaded.id);
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
    [bindRoomEvents, disconnectRoom, ensureLocalTracks, preferences, refreshSession, service],
  );

  const connectMatchedSession = useCallback(
    async (sessionId: string) => {
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
      let rejoins = 0;
      for (let attempt = 0; attempt < 100 && queueRunRef.current === runId; attempt += 1) {
        const status = await service.getQueueStatus();
        if (status.status === "matched" && status.sessionId) {
          await connectMatchedSession(status.sessionId);
          return;
        }
        if (status.status === "restricted") {
          setRestriction(status.restrictionReason || "Group video matching is temporarily unavailable.");
          setPhase("restricted");
          return;
        }
        if ((status.status === "idle" || status.status === "cancelled") && rejoins < 3) {
          rejoins += 1;
          const rejoined = await service.joinQueue(activePreferences);
          if (rejoined.status === "matched" && rejoined.sessionId) {
            await connectMatchedSession(rejoined.sessionId);
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1300));
      }
      if (queueRunRef.current === runId)
        throw new Error("Group matching took longer than expected. Please try again.");
    },
    [connectMatchedSession, service],
  );

  const enterQueue = useCallback(
    async (nextPreferences = preferences) => {
      const runId = queueRunRef.current + 1;
      queueRunRef.current = runId;
      setPhase("matching");
      setError("");
      const result = await service.joinQueue(nextPreferences);
      if (result.status === "matched" && result.sessionId) {
        await connectMatchedSession(result.sessionId);
        return;
      }
      if (result.status === "restricted") {
        setRestriction(result.restrictionReason || "Group video matching is temporarily unavailable.");
        setPhase("restricted");
        return;
      }
      await pollForMatch(runId, nextPreferences);
    },
    [connectMatchedSession, pollForMatch, preferences, service],
  );

  const saveVideoProfile = useCallback(async () => {
    if (videoGender === "unspecified")
      throw new Error("Choose how your matching profile should be categorized.");
    const normalizedCode = countryCode.trim().toUpperCase();
    if (locationVisibility !== "hidden" && (!normalizedCode || !countryName.trim()))
      throw new Error("Add your country before sharing a location label.");
    if (
      (locationVisibility === "state" || locationVisibility === "city") &&
      !stateRegion.trim()
    )
      throw new Error("Add your state or region for this visibility option.");
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
      await saveVideoProfile();
      await service.savePreferences(preferences);
      await ensureLocalTracks(preferences);
      await enterQueue(preferences);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start group matching.");
      setPhase("error");
    } finally {
      setStarting(false);
    }
  }, [ensureLocalTracks, enterQueue, preferences, saveVideoProfile, service, starting]);

  const leaveCurrentSession = useCallback(
    async (
      reason: "leave" | "skip" | "disconnect" | "block" | "report",
      continueMatching = false,
    ) => {
      endingRef.current = true;
      queueRunRef.current += 1;
      try {
        if (session) await service.leaveSession(session.id, reason);
        else await service.leaveQueue();
        await disconnectRoom(false);
        setSession(null);
        setSelectedId(null);
        connectingSessionIdRef.current = null;
        setCallSeconds(0);
        setShowProfile(false);
        setHiddenParticipantIds(new Set());
        endingRef.current = false;
        if (continueMatching) await enterQueue();
        else {
          stopLocalTracks();
          setPhase("setup");
        }
      } catch (reasonValue) {
        endingRef.current = false;
        setError(reasonValue instanceof Error ? reasonValue.message : "Unable to leave group video.");
        setPhase("error");
      }
    },
    [disconnectRoom, enterQueue, service, session, stopLocalTracks],
  );

  const toggleLocalTrack = useCallback(
    async (kind: Track.Kind) => {
      const room = roomRef.current;
      const publication: LocalTrackPublication | undefined =
        kind === Track.Kind.Video
          ? room?.localParticipant.getTrackPublication(Track.Source.Camera)
          : room?.localParticipant.getTrackPublication(Track.Source.Microphone);
      let localTrack =
        publication?.track || localTracksRef.current.find((track) => track.kind === kind);
      const nextEnabled = kind === Track.Kind.Video ? !cameraEnabled : !microphoneEnabled;
      if (!localTrack && nextEnabled) {
        const created = await createLocalTracks({
          video:
            kind === Track.Kind.Video
              ? { facingMode: "user", resolution: VideoPresets.h720.resolution }
              : false,
          audio:
            kind === Track.Kind.Audio
              ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
              : false,
        });
        localTrack = created[0];
        if (!localTrack) return;
        localTracksRef.current.push(localTrack);
        if (room)
          await room.localParticipant.publishTrack(localTrack, {
            source:
              kind === Track.Kind.Video ? Track.Source.Camera : Track.Source.Microphone,
          });
        if (kind === Track.Kind.Video && localVideoRef.current)
          localTrack.attach(localVideoRef.current);
      }
      if (!localTrack) return;
      if (nextEnabled) await localTrack.unmute();
      else await localTrack.mute();
      if (kind === Track.Kind.Video) setCameraEnabled(nextEnabled);
      else setMicrophoneEnabled(nextEnabled);
      if (session)
        await service.updateParticipantState(session.id, {
          connected: true,
          quality: "unknown",
          cameraEnabled: kind === Track.Kind.Video ? nextEnabled : cameraEnabled,
          microphoneEnabled:
            kind === Track.Kind.Audio ? nextEnabled : microphoneEnabled,
        });
    },
    [cameraEnabled, microphoneEnabled, service, session],
  );

  useEffect(() => {
    void service.loadPreferences().then((next) => {
      setPreferences(next);
      setCameraEnabled(next.cameraEnabled);
      setMicrophoneEnabled(next.microphoneEnabled);
    });
  }, [service]);

  useEffect(() => {
    if (phase !== "matching") return;
    let cleanup: (() => void) | undefined;
    void service
      .subscribeQueue(async () => {
        const status = await service.getQueueStatus();
        if (status.status === "matched" && status.sessionId)
          await connectMatchedSession(status.sessionId);
      })
      .then((value) => {
        cleanup = value;
      })
      .catch(() => undefined);
    return () => cleanup?.();
  }, [connectMatchedSession, phase, service]);

  useEffect(() => {
    if (!session?.id) return;
    let cleanup: (() => void) | undefined;
    void service.subscribeSession(session.id, () => void refreshSession(session.id)).then((value) => {
      cleanup = value;
    });
    return () => cleanup?.();
  }, [refreshSession, service, session?.id]);

  useEffect(() => {
    if (!["matching", "connecting", "active", "reconnecting"].includes(phase)) return;
    const interval = window.setInterval(() => {
      void service.heartbeatQueue().catch(() => undefined);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [phase, service]);

  useEffect(() => {
    if (phase !== "active") return;
    const interval = window.setInterval(() => setCallSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "active" || !session?.id) return;
    const interval = window.setInterval(() => {
      for (const participant of remoteParticipants) {
        const video = remoteVideoElementsRef.current.get(participant.id);
        if (!video || video.readyState < 2 || video.videoWidth < 2) continue;
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.max(180, Math.round((video.videoHeight / video.videoWidth) * 320));
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL("image/jpeg", 0.62);
        void service
          .moderateFrame(session.id, participant.id, frame)
          .then((result) => {
            if (result.hidden)
              setHiddenParticipantIds((current) => new Set(current).add(participant.id));
          })
          .catch(() => undefined);
      }
    }, 14000);
    return () => window.clearInterval(interval);
  }, [phase, remoteParticipants, service, session?.id]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!session?.id) return;
      navigator.sendBeacon(
        "/api/video/group-end",
        new Blob([JSON.stringify({ sessionId: session.id, reason: "disconnect" })], {
          type: "application/json",
        }),
      );
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [session?.id]);

  useEffect(
    () => () => {
      queueRunRef.current += 1;
      void disconnectRoom(true);
      stopLocalTracks();
    },
    [disconnectRoom, stopLocalTracks],
  );

  const displayedParticipants = session
    ? [
        ...(localParticipant ? [{ ...localParticipant, cameraEnabled, microphoneEnabled }] : []),
        ...remoteParticipants,
      ]
    : [];

  return (
    <AppShell immersive>
      <main className="relative min-h-dvh overflow-hidden bg-[#03060b] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,119,255,.16),transparent_40%)]" />
        <div className="relative z-10 flex h-16 items-center justify-between border-b border-white/8 px-4 backdrop-blur-xl sm:px-6">
          <Link href="/home" className="font-black tracking-[.22em]">
            VYBE
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black text-slate-300">
            <Users size={13} className="text-blue-400" /> GROUP VIDEO · 2–4
          </div>
        </div>

        <AnimatePresence mode="wait">
          {phase === "setup" && (
            <motion.section
              key="setup"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 mx-auto grid min-h-[calc(100dvh-64px)] max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[.92fr_1.08fr] lg:items-center"
            >
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black text-blue-300">
                  <Sparkles size={13} /> REAL AGE-PROTECTED GROUP MATCHING
                </span>
                <h1 className="mt-5 text-4xl font-black tracking-[-.05em] sm:text-6xl">
                  Find your next <span className="text-blue-400">group VYBE.</span>
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
                  VYBE creates a private LiveKit room with two to four compatible verified accounts. Every person is checked pairwise for age bracket, blocks, restrictions, gender preferences, location preferences, and recent connected matches.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    ["Private", "Room-scoped tokens"],
                    ["Safe", "Always-visible controls"],
                    ["Fast", "Realtime queue delivery"],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-2xl border border-white/8 bg-white/[.035] p-3">
                      <p className="font-black">{title}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="vybe-card rounded-[32px] p-5 sm:p-7">
                <h2 className="text-xl font-black">Who would you like to meet?</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <PreferenceCard selected={preferences.genderPreference === "girls"} icon="👧" title="Girls" onClick={() => setPreferences((value) => ({ ...value, genderPreference: "girls" }))} />
                  <PreferenceCard selected={preferences.genderPreference === "boys"} icon="👦" title="Boys" onClick={() => setPreferences((value) => ({ ...value, genderPreference: "boys" }))} />
                  <PreferenceCard selected={preferences.genderPreference === "everyone"} icon="🌎" title="Everyone" onClick={() => setPreferences((value) => ({ ...value, genderPreference: "everyone" }))} />
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Your video category
                    <select value={videoGender} onChange={(event) => setVideoGender(event.target.value as VideoGenderIdentity)} className="vybe-input mt-2">
                      <option value="unspecified">Choose one</option>
                      <option value="girl">Girl</option>
                      <option value="boy">Boy</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Match location
                    <select value={preferences.locationFilter} onChange={(event) => setPreferences((value) => ({ ...value, locationFilter: event.target.value as VideoMatchPreferences["locationFilter"] }))} className="vybe-input mt-2">
                      <option value="anywhere">Anywhere</option>
                      <option value="country">Same country</option>
                      <option value="state">Same state</option>
                      <option value="city">Same city</option>
                    </select>
                  </label>
                </div>

                <details className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-soft)] p-4">
                  <summary className="cursor-pointer text-xs font-black">Optional location privacy</summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input className="vybe-input" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} placeholder="Country code, e.g. US" maxLength={3} />
                    <input className="vybe-input" value={countryName} onChange={(event) => setCountryName(event.target.value)} placeholder="Country name" />
                    <input className="vybe-input" value={stateRegion} onChange={(event) => setStateRegion(event.target.value)} placeholder="State or region" />
                    <input className="vybe-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" />
                    <select value={locationVisibility} onChange={(event) => setLocationVisibility(event.target.value as LocationVisibility)} className="vybe-input sm:col-span-2">
                      <option value="hidden">Hidden (default)</option>
                      <option value="country">Country</option>
                      <option value="state">State</option>
                      <option value="city">City</option>
                    </select>
                  </div>
                </details>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button type="button" aria-pressed={preferences.cameraEnabled} onClick={() => setPreferences((value) => ({ ...value, cameraEnabled: !value.cameraEnabled }))} className="vybe-button rounded-2xl border border-[var(--border)] p-3 text-xs font-black">
                    {preferences.cameraEnabled ? <Camera className="mx-auto mb-2 text-blue-400" /> : <CameraOff className="mx-auto mb-2 text-slate-500" />} Camera
                  </button>
                  <button type="button" aria-pressed={preferences.microphoneEnabled} onClick={() => setPreferences((value) => ({ ...value, microphoneEnabled: !value.microphoneEnabled }))} className="vybe-button rounded-2xl border border-[var(--border)] p-3 text-xs font-black">
                    {preferences.microphoneEnabled ? <Mic className="mx-auto mb-2 text-blue-400" /> : <MicOff className="mx-auto mb-2 text-slate-500" />} Microphone
                  </button>
                </div>

                <button type="button" onClick={() => void beginMatching()} disabled={starting} className="vybe-button mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black shadow-[0_0_35px_rgba(37,99,235,.35)] disabled:opacity-50">
                  {starting ? <LoaderCircle className="animate-spin" /> : <Users />} Start Group Match
                </button>
              </div>
            </motion.section>
          )}

          {(phase === "permissions" || phase === "matching" || phase === "connecting") && (
            <motion.section key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 grid min-h-[calc(100dvh-64px)] place-items-center px-4">
              <div className="vybe-card w-full max-w-xl rounded-[34px] p-8 text-center">
                <div className="relative mx-auto h-28 w-28">
                  <span className="absolute inset-0 animate-ping rounded-full border border-blue-400/25" />
                  <span className="absolute inset-3 animate-pulse rounded-full border border-blue-400/40" />
                  <span className="absolute inset-6 grid place-items-center rounded-full bg-blue-600 shadow-[0_0_45px_rgba(37,99,235,.55)]"><Users size={30} /></span>
                </div>
                <h1 className="mt-7 text-3xl font-black">
                  {phase === "permissions" ? "Getting you ready…" : phase === "connecting" ? "Group VYBE found" : "Finding your group VYBE…"}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {phase === "connecting" ? "Opening one secure room for everyone." : "Matching compatible verified accounts in your age bracket."}
                </p>
                <button onClick={() => void leaveCurrentSession("leave", false)} className="vybe-button mt-7 rounded-2xl border border-white/10 px-6 py-3 text-sm font-bold text-slate-300">Cancel</button>
              </div>
            </motion.section>
          )}

          {(phase === "active" || phase === "reconnecting") && session && (
            <motion.section key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex min-h-[calc(100dvh-64px)] flex-col p-2.5 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-300">Live group VYBE</p>
                  <p className="mt-1 text-xs text-slate-400">{displayedParticipants.length}/{session.maxParticipants} connected · {formatTimer(callSeconds)}</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black">
                  {phase === "reconnecting" ? <WifiOff size={13} className="text-amber-400" /> : <span className="h-2 w-2 rounded-full bg-emerald-400" />} {phase === "reconnecting" ? "Reconnecting" : "Secure room"}
                </div>
              </div>

              <div className={`grid flex-1 gap-2.5 ${displayedParticipants.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2"}`}>
                {displayedParticipants.map((participant) => (
                  <GroupTile
                    key={participant.id}
                    participant={participant}
                    isLocal={participant.id === currentUserId}
                    selected={participant.id === selectedId}
                    localVideoRef={localVideoRef}
                    remoteTracks={remoteTracksState.get(participant.id)}
                    hidden={hiddenParticipantIds.has(participant.id)}
                    onSelect={() => participant.id !== currentUserId && setSelectedId(participant.id)}
                    registerRemoteVideo={registerRemoteVideo}
                  />
                ))}
              </div>

              {phase === "reconnecting" && (
                <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 backdrop-blur-md">
                  <div className="text-center"><RefreshCcw className="mx-auto animate-spin text-blue-400" size={34} /><h2 className="mt-4 text-xl font-black">Reconnecting your group</h2><button onClick={() => session && void connectSession(session.id)} className="vybe-button mt-4 rounded-2xl bg-blue-600 px-5 py-3 font-black">Reconnect now</button></div>
                </div>
              )}

              <div className="sticky bottom-0 z-50 mt-2 rounded-[28px] border border-white/10 bg-[#070c14]/94 p-2.5 shadow-[0_-14px_50px_rgba(0,0,0,.3)] backdrop-blur-2xl">
                <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto pb-1 sm:justify-center">
                  <ActionButton label={microphoneEnabled ? "Mute" : "Unmute"} icon={microphoneEnabled ? <Mic size={20} /> : <MicOff size={20} />} onClick={() => void toggleLocalTrack(Track.Kind.Audio)} />
                  <ActionButton label={cameraEnabled ? "Camera" : "Camera on"} icon={cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />} onClick={() => void toggleLocalTrack(Track.Kind.Video)} />
                  <ActionButton label="Profile" icon={<Users size={20} />} disabled={!selectedParticipant} onClick={() => setShowProfile(true)} />
                  <ActionButton label={friendStatus === "friends" ? "Friends" : friendStatus === "pending" ? "Sent" : "Add friend"} icon={friendStatus === "friends" ? <CheckCircle2 size={20} /> : <UserPlus size={20} />} disabled={!selectedParticipant || friendStatus === "friends" || friendStatus === "pending"} onClick={() => selectedParticipant && void sendFriendRequest(selectedParticipant.id)} />
                  <ActionButton label={matchStatus === "active" ? "Matched" : "Like"} icon={<Heart size={20} />} disabled={!selectedParticipant || matchStatus === "active"} onClick={() => selectedParticipant && void decideProfile(selectedParticipant.id, "like")} />
                  {selectedParticipant && canChat ? <Link href={`/chat/${selectedParticipant.id}`} className="vybe-button flex min-h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-black"><MessageCircle size={20} /> Chat</Link> : null}
                  <ActionButton label="Next group" icon={<SkipForward size={22} />} primary onClick={() => void leaveCurrentSession("skip", true)} />
                  <ActionButton label="Report" icon={<Flag size={20} />} danger disabled={!selectedParticipant} onClick={() => setReportOpen(true)} />
                  <ActionButton label="Block" icon={<Ban size={20} />} danger disabled={!selectedParticipant} onClick={() => setBlockOpen(true)} />
                  <ActionButton label="End" icon={<PhoneOff size={20} />} danger onClick={() => void leaveCurrentSession("leave", false)} />
                </div>
                <p className="mt-1 text-center text-[9px] font-bold text-slate-500"><ShieldCheck className="mr-1 inline" size={11} /> Private room · not recorded by default · select a person for social and safety actions</p>
              </div>
            </motion.section>
          )}

          {(phase === "error" || phase === "restricted") && (
            <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 grid min-h-[calc(100dvh-64px)] place-items-center px-4">
              <div className="vybe-card w-full max-w-lg rounded-[32px] p-8 text-center">
                <span className={`mx-auto grid h-16 w-16 place-items-center rounded-[24px] ${phase === "restricted" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>{phase === "restricted" ? <ShieldCheck size={30} /> : <CircleAlert size={30} />}</span>
                <h1 className="mt-5 text-2xl font-black">{phase === "restricted" ? "Group video is paused" : "We couldn’t connect"}</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">{phase === "restricted" ? restriction : error}</p>
                <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setPhase("setup")} className="vybe-button rounded-2xl border border-white/10 py-3 font-bold">Back</button><button disabled={phase === "restricted"} onClick={() => void beginMatching()} className="vybe-button rounded-2xl bg-blue-600 py-3 font-black disabled:opacity-40">Try again</button></div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {selectedParticipant && reportOpen && session && (
        <ReportModal
          open
          onClose={() => setReportOpen(false)}
          userId={selectedParticipant.id}
          username={selectedParticipant.username}
          targetType="group_video_session"
          targetId={session.id}
          afterSubmit={() => void leaveCurrentSession("report", true)}
        />
      )}
      {selectedParticipant && blockOpen && (
        <BlockModal
          open
          onClose={() => setBlockOpen(false)}
          userId={selectedParticipant.id}
          username={selectedParticipant.username}
          afterBlock={() => void leaveCurrentSession("block", true)}
        />
      )}

      <AnimatePresence>
        {showProfile && selectedParticipant && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] grid place-items-end bg-slate-950/65 p-3 backdrop-blur-sm sm:place-items-center" onMouseDown={() => setShowProfile(false)}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onMouseDown={(event) => event.stopPropagation()} className="vybe-card max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[30px] p-5">
              <div className="flex items-start justify-between"><div className="flex items-center gap-3"><Avatar imageSrc={selectedParticipant.avatarUrl || undefined} alt={selectedParticipant.username} size="lg" /><div><p className="font-black">{selectedParticipant.displayName}</p><p className="text-xs text-blue-400">@{selectedParticipant.username} · {selectedParticipant.ageBracket}</p></div></div><button onClick={() => setShowProfile(false)} className="vybe-button rounded-xl p-2" aria-label="Close profile"><X size={18} /></button></div>
              <p className="mt-5 text-sm leading-6 text-[var(--muted)]">{selectedParticipant.bio}</p>
              <div className="mt-4 flex flex-wrap gap-2">{selectedParticipant.interests.map((interest) => <span key={interest} className="rounded-full border border-blue-400/20 bg-blue-500/8 px-3 py-1.5 text-[10px] font-black text-blue-400">{interest}</span>)}</div>
              <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-[var(--border)] p-4"><p className="text-2xl font-black text-blue-400">{selectedParticipant.compatibilityScore}%</p><p className="text-[10px] text-[var(--muted)]">VYBE compatibility</p></div><div className="rounded-2xl border border-[var(--border)] p-4"><p className="font-black">{selectedParticipant.locationLabel || "Hidden"}</p><p className="text-[10px] text-[var(--muted)]">Shared location label</p></div></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
