"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

const subjectAccent: Record<string, { gradient: string }> = {
  English: { gradient: "from-violet-200 via-violet-100 to-white" },
  Mathematics: { gradient: "from-sky-200 via-sky-100 to-white" },
  Maths: { gradient: "from-sky-200 via-sky-100 to-white" },
  EVS: { gradient: "from-emerald-200 via-emerald-100 to-white" },
  Science: { gradient: "from-emerald-200 via-emerald-100 to-white" },
  Hindi: { gradient: "from-rose-200 via-rose-100 to-white" },
  default: { gradient: "from-orange-200 via-orange-100 to-white" },
};

function accentForSubject(subjectName: string) {
  return subjectAccent[subjectName] ?? subjectAccent.default;
}

export function VideoThumbnail({
  s3Key,
  subjectName,
  className,
  chapterLabel,
  lessonCountLabel,
}: {
  s3Key: string | null;
  subjectName: string;
  className?: string;
  chapterLabel?: string;
  lessonCountLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const { gradient } = accentForSubject(subjectName);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !s3Key) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        fetch(`/api/presign?key=${encodeURIComponent(s3Key)}`)
          .then((response) => response.json())
          .then((data) => {
            if (data.url) setUrl(data.url);
          })
          .catch(() => {});
      },
      { threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [s3Key]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) video.currentTime = 1.25;
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    setFrameReady(true);
    video.src = "";
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/thumbnail relative aspect-video overflow-hidden rounded-[24px] border border-white/80 bg-gradient-to-br shadow-[0_16px_32px_rgba(214,153,68,0.10)]",
        gradient,
        className
      )}
    >
      {url && !frameReady && (
        <video
          ref={videoRef}
          src={url}
          preload="metadata"
          muted
          playsInline
          className="hidden"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
        />
      )}

      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
          frameReady ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
          frameReady ? "from-black/10 via-black/5 to-black/20 group-hover/thumbnail:from-black/20 group-hover/thumbnail:to-black/35" : "from-white/20 to-transparent"
        )}
      />

      {chapterLabel ? (
        <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
          {chapterLabel}
        </span>
      ) : null}

      {lessonCountLabel ? (
        <span className="absolute bottom-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
          {lessonCountLabel}
        </span>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-orange-300/40 bg-gradient-to-br from-[#f6a14a] via-[#ea8a25] to-[#cf6f14] shadow-[0_16px_30px_rgba(232,135,30,0.32),inset_0_2px_1px_rgba(255,255,255,0.45),inset_0_-6px_10px_rgba(155,82,10,0.22)] transition duration-300 group-hover/thumbnail:scale-105 group-hover/thumbnail:shadow-[0_20px_38px_rgba(232,135,30,0.4),inset_0_2px_1px_rgba(255,255,255,0.5),inset_0_-6px_10px_rgba(155,82,10,0.24)]">
          <Play className="ml-0.5 h-5 w-5 fill-white text-white drop-shadow-[0_1px_1px_rgba(136,70,8,0.35)]" />
        </div>
      </div>

      {!frameReady && (
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/50 to-transparent" />
      )}
    </div>
  );
}
