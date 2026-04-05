"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateVideoProgress } from "@/lib/actions/progress";

const MIN_SAVE_INTERVAL_MS = 60_000;
const MIN_PROGRESS_DELTA_SECONDS = 15;

interface VideoPlayerProps {
  videoId: string;
  s3Key: string;
  initialPosition?: number;
  durationSeconds: number;
}

export function VideoPlayer({ videoId, s3Key, initialPosition = 0, durationSeconds }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastSavedPositionRef = useRef(initialPosition);
  const lastSavedAtRef = useRef(0);

  // Fetch presigned URL
  useEffect(() => {
    setLoading(true);
    setError(false);
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
    </div>
  );
}
