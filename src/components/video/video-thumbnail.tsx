"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { buildThumbnailKey } from "@/lib/media";
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

const PRESIGNED_URL_TTL_MS = 45 * 60 * 1000;
const presignedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const presignedUrlPromises = new Map<string, Promise<string | null>>();
const thumbnailFailureKeys = new Set<string>();

function accentForSubject(subjectName: string) {
  return subjectAccent[subjectName] ?? subjectAccent.default;
}

async function getPresignedUrl(key: string) {
  const cached = presignedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) presignedUrlCache.delete(key);

  const pending = presignedUrlPromises.get(key);
  if (pending) return pending;

  const request = fetch(`/api/presign?key=${encodeURIComponent(key)}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) return null;
      presignedUrlCache.set(key, {
        url: payload.url,
        expiresAt: Date.now() + PRESIGNED_URL_TTL_MS,
      });
      return payload.url;
    })
    .catch(() => null)
    .finally(() => {
      presignedUrlPromises.delete(key);
    });

  presignedUrlPromises.set(key, request);
  return request;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { gradient } = accentForSubject(subjectName);
  const thumbnailKey = useMemo(() => buildThumbnailKey(s3Key), [s3Key]);
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => (thumbnailKey ? presignedUrlCache.get(thumbnailKey)?.url ?? null : null)
  );
  const [shouldLoad, setShouldLoad] = useState(Boolean(imageUrl));
  const [hasError, setHasError] = useState(Boolean(thumbnailKey && thumbnailFailureKeys.has(thumbnailKey)));

  useEffect(() => {
    setImageUrl(thumbnailKey ? presignedUrlCache.get(thumbnailKey)?.url ?? null : null);
    setShouldLoad(Boolean(thumbnailKey && presignedUrlCache.get(thumbnailKey)?.url));
    setHasError(Boolean(thumbnailKey && thumbnailFailureKeys.has(thumbnailKey)));
  }, [thumbnailKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !thumbnailKey || hasError) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "260px 0px", threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasError, thumbnailKey]);

  useEffect(() => {
    if (!shouldLoad || !thumbnailKey || imageUrl || hasError) return;

    let cancelled = false;
    void getPresignedUrl(thumbnailKey).then((url) => {
      if (cancelled || !url) return;
      setImageUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [hasError, imageUrl, shouldLoad, thumbnailKey]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/thumbnail relative aspect-video overflow-hidden rounded-[24px] border border-white/80 bg-gradient-to-br shadow-[0_16px_32px_rgba(214,153,68,0.10)]",
        gradient,
        className
      )}
    >
      {imageUrl && !hasError ? (
        <>
          <Image
            src={imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
            onError={() => {
              if (!thumbnailKey) return;
              thumbnailFailureKeys.add(thumbnailKey);
              setHasError(true);
              setImageUrl(null);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-black/5 to-black/20 group-hover/thumbnail:from-black/20 group-hover/thumbnail:to-black/35 transition-opacity duration-300" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/50 to-transparent" />
        </>
      )}

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
    </div>
  );
}
