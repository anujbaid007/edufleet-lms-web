"use client";

import { useRef, useEffect, useCallback, useState, type MouseEvent } from "react";
import type Hls from "hls.js";
import { useRouter } from "next/navigation";
import { Loader2, Play, X } from "lucide-react";
import { updateVideoProgress } from "@/lib/actions/progress";
import {
  fetchSecurePlaybackSession,
  type SecurePlaybackSession,
  type SecureVideoVariant,
} from "@/lib/secure-video-client";

const MIN_SAVE_INTERVAL_MS = 60_000;
const MIN_PROGRESS_DELTA_SECONDS = 15;

interface VideoPlayerProps {
  videoId: string;
  playbackVariant: SecureVideoVariant;
  initialPosition?: number;
  durationSeconds: number;
  nextVideoId?: string | null;
  nextVideoTitle?: string | null;
}

export function VideoPlayer({
  videoId,
  playbackVariant,
  initialPosition = 0,
  durationSeconds,
  nextVideoId = null,
  nextVideoTitle = null,
}: VideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playback, setPlayback] = useState<SecurePlaybackSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAutoplayPrompt, setShowAutoplayPrompt] = useState(false);
  const [playbackState, setPlaybackState] = useState<"ready" | "playing" | "paused" | "completed">("ready");
  const [, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedPositionRef = useRef(initialPosition);
  const lastSavedAtRef = useRef(0);

  // Fetch secure playback session
  useEffect(() => {
    setLoading(true);
    setError(false);
    setPlayback(null);
    setSaveState("idle");
    setPlaybackState("ready");
    setShowAutoplayPrompt(false);
    fetchSecurePlaybackSession(videoId, playbackVariant)
      .then((session) => {
        if (session) setPlayback(session);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [durationSeconds, initialPosition, playbackVariant, videoId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    const currentVideo = video;
    const currentPlayback = playback;

    let cancelled = false;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    currentVideo.pause();
    currentVideo.removeAttribute("src");
    currentVideo.load();

    if (currentPlayback.delivery === "mp4") {
      currentVideo.src = currentPlayback.url;
      return () => {
        currentVideo.pause();
        currentVideo.removeAttribute("src");
        currentVideo.load();
      };
    }

    async function attachHls() {
      if (currentVideo.canPlayType("application/vnd.apple.mpegurl")) {
        currentVideo.src = currentPlayback.url;
        return;
      }

      const hlsModule = await import("hls.js");
      if (cancelled) return;

      const HlsClass = hlsModule.default;
      if (!HlsClass.isSupported()) {
        setError(true);
        return;
      }

      const hls = new HlsClass({
        enableWorker: true,
      });
      hlsRef.current = hls;

      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setError(true);
        hls.destroy();
        hlsRef.current = null;
      });

      hls.loadSource(currentPlayback.url);
      hls.attachMedia(currentVideo);
    }

    void attachHls();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      currentVideo.pause();
      currentVideo.removeAttribute("src");
      currentVideo.load();
    };
  }, [playback]);

  const saveProgress = useCallback(async (force = false) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const currentTime = video.currentTime;
    const percentage = (currentTime / video.duration) * 100;
    const now = Date.now();
    const movedEnough = Math.abs(currentTime - lastSavedPositionRef.current) >= MIN_PROGRESS_DELTA_SECONDS;
    const elapsedEnough = now - lastSavedAtRef.current >= MIN_SAVE_INTERVAL_MS;
    const isCompleted = percentage >= 90 || video.ended;

    if (!force && !(isCompleted || (movedEnough && elapsedEnough))) return;
    if (force && !isCompleted && Math.abs(currentTime - lastSavedPositionRef.current) < 5) return;

    setSaveState("saving");
    lastSavedPositionRef.current = currentTime;
    lastSavedAtRef.current = now;
    const result = await updateVideoProgress(videoId, percentage, currentTime);

    if (result?.error) {
      setSaveState("error");
      return;
    }

    setSaveState("saved");
    window.setTimeout(() => {
      setSaveState((current) => (current === "saved" ? "idle" : current));
    }, 1800);
  }, [videoId]);

  // Set up progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePause = () => {
      void saveProgress(true);
    };

    // Save periodically during playback, but much less often than before.
    const interval = setInterval(() => {
      if (video && !video.paused) {
        void saveProgress();
      }
    }, 15000);

    const handlePageHide = () => {
      void saveProgress(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void saveProgress(true);
      }
    };

    video.addEventListener("pause", handlePause);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      video.removeEventListener("pause", handlePause);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      void saveProgress(true);
    };
  }, [saveProgress]);

  // Seek to last position when video loads
  const handleLoadedMetadata = () => {
    if (videoRef.current && initialPosition > 0) {
      videoRef.current.currentTime = initialPosition;
    }
    setLoading(false);
    setPlaybackState("paused");
  };

  // Save on video end (100% completion)
  const handleEnded = async () => {
    setPlaybackState("completed");
    setSaveState("saving");
    lastSavedPositionRef.current = durationSeconds;
    lastSavedAtRef.current = Date.now();
    await updateVideoProgress(videoId, 100, durationSeconds);
    setSaveState("saved");
    if (nextVideoId) {
      setShowAutoplayPrompt(true);
    }
  };

  const handleCancelAutoplay = () => {
    setShowAutoplayPrompt(false);
  };

  const handlePlayNext = () => {
    if (!nextVideoId) return;
    router.push(`/dashboard/watch/${nextVideoId}`);
  };
  const handleResumePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    void video.play();
  };

  const blockContextMenu = (event: MouseEvent<HTMLDivElement | HTMLVideoElement>) => {
    event.preventDefault();
  };

  const blockRightClick = (event: MouseEvent<HTMLDivElement | HTMLVideoElement>) => {
    if (event.button !== 2) return;
    event.preventDefault();
  };

  return (
    <div
      className="relative aspect-video bg-gray-950 rounded-clay overflow-hidden"
      onContextMenuCapture={blockContextMenu}
      onMouseDownCapture={blockRightClick}
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
          <p className="text-gray-400 text-sm">Loading video...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-red-400 text-sm font-medium">Failed to load video</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-orange-400 underline"
          >
            Retry
          </button>
        </div>
      )}
      {playback?.url && (
        <video
          ref={videoRef}
          key={playback.url}
          src={playback.delivery === "mp4" ? playback.url : undefined}
          controls
          autoPlay
          controlsList="nodownload noremoteplayback"
          disableRemotePlayback
          disablePictureInPicture
          onContextMenu={blockContextMenu}
          onMouseDown={blockRightClick}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setPlaybackState("playing")}
          onPause={() => setPlaybackState((current) => (current === "completed" ? current : "paused"))}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {playback?.url && playbackState === "paused" ? (
        <button
          type="button"
          onClick={handleResumePlayback}
          className="absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/20"
          aria-label="Resume video"
        >
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-black/18 shadow-[0_24px_60px_rgba(0,0,0,0.26)] backdrop-blur-sm transition duration-200 hover:scale-[1.03]">
            <span className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-orange-300/35 bg-gradient-to-br from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] shadow-[0_18px_36px_rgba(232,135,30,0.34),inset_0_2px_1px_rgba(255,255,255,0.45),inset_0_-6px_10px_rgba(155,82,10,0.2)]">
              <Play className="ml-1 h-8 w-8 fill-white text-white" />
            </span>
          </span>
        </button>
      ) : null}

      {showAutoplayPrompt && nextVideoId ? (
        <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-orange-200/40 bg-[rgba(22,16,10,0.84)] p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[360px]">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-300/35 bg-gradient-to-br from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] shadow-[0_14px_28px_rgba(232,135,30,0.28),inset_0_2px_1px_rgba(255,255,255,0.45),inset_0_-6px_10px_rgba(155,82,10,0.2)]">
              <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">Next lesson</p>
              <p className="mt-1 text-sm font-semibold">{nextVideoTitle ?? "Starting the next lesson"}</p>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlayNext}
                  className="inline-flex items-center gap-2 rounded-full border border-orange-300/40 bg-gradient-to-br from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(232,135,30,0.26)]"
                >
                  <Play className="h-3.5 w-3.5 fill-white text-white" />
                  Play now
                </button>
                <button
                  type="button"
                  onClick={handleCancelAutoplay}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/15"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
