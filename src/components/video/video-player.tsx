"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, X } from "lucide-react";
import { updateVideoProgress } from "@/lib/actions/progress";

const MIN_SAVE_INTERVAL_MS = 60_000;
const MIN_PROGRESS_DELTA_SECONDS = 15;
const AUTOPLAY_SECONDS = 5;

interface VideoPlayerProps {
  videoId: string;
  s3Key: string;
  initialPosition?: number;
  durationSeconds: number;
  nextVideoId?: string | null;
  nextVideoTitle?: string | null;
}

export function VideoPlayer({
  videoId,
  s3Key,
  initialPosition = 0,
  durationSeconds,
  nextVideoId = null,
  nextVideoTitle = null,
}: VideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAutoplayPrompt, setShowAutoplayPrompt] = useState(false);
  const [countdown, setCountdown] = useState(AUTOPLAY_SECONDS);
  const lastSavedPositionRef = useRef(initialPosition);
  const lastSavedAtRef = useRef(0);

  // Fetch presigned URL
  useEffect(() => {
    setLoading(true);
    setError(false);
    setShowAutoplayPrompt(false);
    setCountdown(AUTOPLAY_SECONDS);
    fetch(`/api/presign?key=${encodeURIComponent(s3Key)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setVideoUrl(d.url);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [s3Key]);

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

    lastSavedPositionRef.current = currentTime;
    lastSavedAtRef.current = now;
    await updateVideoProgress(videoId, percentage, currentTime);
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
  };

  // Save on video end (100% completion)
  const handleEnded = async () => {
    lastSavedPositionRef.current = durationSeconds;
    lastSavedAtRef.current = Date.now();
    await updateVideoProgress(videoId, 100, durationSeconds);
    if (nextVideoId) {
      setCountdown(AUTOPLAY_SECONDS);
      setShowAutoplayPrompt(true);
    }
  };

  useEffect(() => {
    if (!showAutoplayPrompt || !nextVideoId) return;

    if (countdown <= 0) {
      router.push(`/dashboard/watch/${nextVideoId}`);
      return;
    }

    const timeout = window.setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [countdown, nextVideoId, router, showAutoplayPrompt]);

  const handleCancelAutoplay = () => {
    setShowAutoplayPrompt(false);
    setCountdown(AUTOPLAY_SECONDS);
  };

  const handlePlayNext = () => {
    if (!nextVideoId) return;
    router.push(`/dashboard/watch/${nextVideoId}`);
  };

  return (
    <div className="relative bg-gray-950 rounded-clay overflow-hidden" style={{ minHeight: 360 }}>
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
      {videoUrl && (
        <video
          ref={videoRef}
          key={videoUrl}
          src={videoUrl}
          controls
          autoPlay
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          className="w-full h-full object-contain"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        />
      )}

      {showAutoplayPrompt && nextVideoId ? (
        <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-orange-200/40 bg-[rgba(22,16,10,0.84)] p-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[360px]">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-300/35 bg-gradient-to-br from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] shadow-[0_14px_28px_rgba(232,135,30,0.28),inset_0_2px_1px_rgba(255,255,255,0.45),inset_0_-6px_10px_rgba(155,82,10,0.2)]">
              <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">Next lesson</p>
              <p className="mt-1 text-sm font-semibold">{nextVideoTitle ?? "Starting the next lesson"}</p>
              <p className="mt-1 text-xs text-white/75">
                Starting automatically in <span className="font-bold text-orange-200">{countdown}s</span>
              </p>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] transition-all"
                  style={{ width: `${((AUTOPLAY_SECONDS - countdown) / AUTOPLAY_SECONDS) * 100}%` }}
                />
              </div>

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
