"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { updateVideoProgress } from "@/lib/actions/progress";

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
  const lastSavedRef = useRef(0);

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

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const currentTime = video.currentTime;
    const percentage = (currentTime / video.duration) * 100;

    // Only save if moved at least 5 seconds since last save
    if (Math.abs(currentTime - lastSavedRef.current) < 5) return;

    lastSavedRef.current = currentTime;
    await updateVideoProgress(videoId, percentage, currentTime);
  }, [videoId]);

  // Set up progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Save on pause
    const handlePause = () => saveProgress();

    // Save periodically during playback (every 10 seconds)
    const interval = setInterval(() => {
      if (video && !video.paused) saveProgress();
    }, 10000);

    // Save on unload
    const handleBeforeUnload = () => saveProgress();

    video.addEventListener("pause", handlePause);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      video.removeEventListener("pause", handlePause);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(interval);
      saveProgress();
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
