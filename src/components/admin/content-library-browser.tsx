"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  BookOpen,
  Brain,
  ChevronRight,
  FlaskConical,
  Landmark,
  Languages,
  Leaf,
  Loader2,
  Monitor,
  Play,
  Volume2,
  X,
} from "lucide-react";
import { ClayPill } from "@/components/ui/clay-pill";
import { cn, formatDuration } from "@/lib/utils";

type SubjectIcon = typeof BookOpen;

export type LibraryChapterCard = {
  id: string;
  chapterNo: number;
  title: string;
  subjectName: string;
  classNum: number;
  board: string;
  medium: string;
  videoCount: number;
  previewVideo: {
    id: string;
    title: string;
    durationSeconds: number;
    s3Key: string | null;
  } | null;
};

type LibraryVideo = {
  id: string;
  title: string;
  durationSeconds: number;
  s3Key: string | null;
};

type LibraryChapterDetail = {
  id: string;
  chapterNo: number;
  title: string;
  subjectName: string;
  classNum: number;
  board: string;
  medium: string;
  videos: LibraryVideo[];
};

const INITIAL_MORE_COUNT = 16;
const MORE_BATCH = 16;

const presignedUrlCache = new Map<string, string>();
const presignedUrlPromises = new Map<string, Promise<string | null>>();
const thumbnailCache = new Map<string, string>();
const thumbnailPromises = new Map<string, Promise<string | null>>();
const thumbnailFailures = new Set<string>();
const chapterDetailCache = new Map<string, LibraryChapterDetail>();
const chapterDetailPromises = new Map<string, Promise<LibraryChapterDetail | null>>();

const knownSubjectMeta: Record<
  string,
  {
    icon: SubjectIcon;
    pill: string;
    gradient: string;
    order: number;
  }
> = {
  Mathematics: {
    icon: BookOpen,
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    gradient: "from-blue-50 to-indigo-50",
    order: 1,
  },
  Science: {
    icon: FlaskConical,
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gradient: "from-emerald-50 to-teal-50",
    order: 2,
  },
  English: {
    icon: BookOpen,
    pill: "bg-violet-50 text-violet-700 border-violet-200",
    gradient: "from-violet-50 to-purple-50",
    order: 3,
  },
  Hindi: {
    icon: Languages,
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    gradient: "from-rose-50 to-pink-50",
    order: 4,
  },
  "हिंदी व्याकरण": {
    icon: Languages,
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    gradient: "from-rose-50 to-pink-50",
    order: 5,
  },
  "Social Studies": {
    icon: Landmark,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    gradient: "from-amber-50 to-yellow-50",
    order: 6,
  },
  Geography: {
    icon: Landmark,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    gradient: "from-amber-50 to-yellow-50",
    order: 7,
  },
  History: {
    icon: Landmark,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    gradient: "from-amber-50 to-yellow-50",
    order: 8,
  },
  Civics: {
    icon: Landmark,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    gradient: "from-amber-50 to-yellow-50",
    order: 9,
  },
  EVS: {
    icon: Leaf,
    pill: "bg-green-50 text-green-700 border-green-200",
    gradient: "from-green-50 to-lime-50",
    order: 10,
  },
  Computer: {
    icon: Monitor,
    pill: "bg-cyan-50 text-cyan-700 border-cyan-200",
    gradient: "from-cyan-50 to-sky-50",
    order: 11,
  },
  "General Knowledge": {
    icon: Brain,
    pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    gradient: "from-fuchsia-50 to-pink-50",
    order: 12,
  },
};

function subjectMeta(subjectName: string) {
  return (
    knownSubjectMeta[subjectName] ?? {
      icon: BookOpen,
      pill: "bg-orange-50 text-orange-700 border-orange-200",
      gradient: "from-orange-50 to-amber-50",
      order: 99,
    }
  );
}

function classLabel(classNum: number) {
  if (classNum === 0) return "KG";
  if (classNum === 99) return "General";
  return `Class ${classNum}`;
}

function scheduleWhenIdle(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(() => callback(), { timeout: 1200 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = setTimeout(callback, 150);
  return () => clearTimeout(timeoutId);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildThumbnailCandidateTimes(duration: number, key: string) {
  if (!Number.isFinite(duration) || duration <= 0.25) return [0];

  const ratios = [0.18, 0.32, 0.46, 0.58, 0.72];
  const rotation = hashString(key) % ratios.length;
  const rotatedRatios = ratios.map((_, index) => ratios[(index + rotation) % ratios.length]);
  const maxTime = Math.max(duration - 0.12, 0);

  return Array.from(
    new Set(
      rotatedRatios.map((ratio) => Number(Math.min(maxTime, Math.max(0.1, duration * ratio)).toFixed(3)))
    )
  );
}

function scoreFrameSample(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return 0;

  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let colorSpreadSum = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    luminanceSum += luminance;
    luminanceSquareSum += luminance * luminance;
    colorSpreadSum += Math.max(red, green, blue) - Math.min(red, green, blue);
  }

  const luminanceMean = luminanceSum / pixelCount;
  const luminanceVariance = luminanceSquareSum / pixelCount - luminanceMean * luminanceMean;
  const averageColorSpread = colorSpreadSum / pixelCount;

  return luminanceVariance + averageColorSpread * 1.35;
}

async function getPresignedUrl(key: string) {
  const cached = presignedUrlCache.get(key);
  if (cached) return cached;

  const pending = presignedUrlPromises.get(key);
  if (pending) return pending;

  const request = fetch(`/api/presign?key=${encodeURIComponent(key)}`, { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) return null;
      presignedUrlCache.set(key, payload.url);
      return payload.url;
    })
    .catch(() => null)
    .finally(() => {
      presignedUrlPromises.delete(key);
    });

  presignedUrlPromises.set(key, request);
  return request;
}

async function createVideoThumbnail(key: string) {
  if (thumbnailFailures.has(key)) return null;

  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  const pending = thumbnailPromises.get(key);
  if (pending) return pending;

  const task = (async () => {
    const url = await getPresignedUrl(key);
    if (!url) return null;

    return new Promise<string | null>((resolve) => {
      const video = document.createElement("video");
      const outputCanvas = document.createElement("canvas");
      const sampleCanvas = document.createElement("canvas");
      let settled = false;
      let timeoutId: number | null = null;

      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        video.pause();
        video.removeAttribute("src");
        video.load();
        thumbnailPromises.delete(key);
        if (value) {
          thumbnailCache.set(key, value);
        } else {
          thumbnailFailures.add(key);
        }
        resolve(value);
      };

      const renderCurrentFrame = () => {
        if (!video.videoWidth || !video.videoHeight) {
          return null;
        }

        outputCanvas.width = video.videoWidth;
        outputCanvas.height = video.videoHeight;

        const context = outputCanvas.getContext("2d");
        if (!context) {
          return null;
        }

        try {
          context.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
          return outputCanvas.toDataURL("image/jpeg", 0.72);
        } catch {
          return null;
        }
      };

      const scoreCurrentFrame = () => {
        if (!video.videoWidth || !video.videoHeight) return null;

        sampleCanvas.width = 32;
        sampleCanvas.height = 18;
        const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        try {
          context.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
          return scoreFrameSample(context, sampleCanvas.width, sampleCanvas.height);
        } catch {
          return null;
        }
      };

      const waitForPaint = () =>
        new Promise<void>((resolveNext) => {
          window.requestAnimationFrame(() => resolveNext());
        });

      const seekTo = (time: number) =>
        new Promise<boolean>((resolveNext) => {
          const cleanup = (result: boolean) => {
            video.removeEventListener("seeked", handleSeeked);
            video.removeEventListener("error", handleError);
            resolveNext(result);
          };

          const handleSeeked = () => cleanup(true);
          const handleError = () => cleanup(false);

          video.addEventListener("seeked", handleSeeked, { once: true });
          video.addEventListener("error", handleError, { once: true });

          try {
            if (Math.abs(video.currentTime - time) < 0.05) {
              window.requestAnimationFrame(() => cleanup(true));
              return;
            }

            video.currentTime = time;
          } catch {
            cleanup(false);
          }
        });

      const chooseBestFrame = async () => {
        const candidateTimes = buildThumbnailCandidateTimes(video.duration || 0, key);
        let bestTime = candidateTimes[0] ?? 0;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const candidateTime of candidateTimes) {
          const didSeek = await seekTo(candidateTime);
          if (!didSeek) continue;

          await waitForPaint();
          const score = scoreCurrentFrame();
          if (score === null) continue;

          if (score > bestScore) {
            bestScore = score;
            bestTime = candidateTime;
          }
        }

        const didSeekBest = await seekTo(bestTime);
        if (!didSeekBest) {
          finish(null);
          return;
        }

        await waitForPaint();
        finish(renderCurrentFrame());
      };

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.onloadedmetadata = () => {
        void chooseBestFrame();
      };
      video.onloadeddata = () => {
        if ((video.duration || 0) <= 0.25) {
          finish(renderCurrentFrame());
        }
      };
      video.onerror = () => finish(null);

      timeoutId = window.setTimeout(() => finish(null), 9000);
      video.src = url;
    });
  })();

  thumbnailPromises.set(key, task);
  return task;
}

async function getChapterDetail(chapterId: string) {
  const cached = chapterDetailCache.get(chapterId);
  if (cached) return cached;

  const pending = chapterDetailPromises.get(chapterId);
  if (pending) return pending;

  const request = fetch(`/api/content-library/chapters/${chapterId}`, { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as { chapter?: LibraryChapterDetail };
      if (!payload.chapter) return null;
      chapterDetailCache.set(chapterId, payload.chapter);
      return payload.chapter;
    })
    .catch(() => null)
    .finally(() => {
      chapterDetailPromises.delete(chapterId);
    });

  chapterDetailPromises.set(chapterId, request);
  return request;
}

function useProgressiveReveal(itemCount: number, initialCount: number, step: number, resetKey: string) {
  const [visibleCount, setVisibleCount] = useState(Math.min(itemCount, initialCount));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(Math.min(itemCount, initialCount));
  }, [initialCount, itemCount, resetKey]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || visibleCount >= itemCount) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + step, itemCount));
      },
      { rootMargin: "320px 0px", threshold: 0 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [itemCount, step, visibleCount]);

  return {
    sentinelRef,
    visibleCount,
  };
}

function VideoThumbnail({
  s3Key,
  subjectName,
  chapterNo,
}: {
  s3Key: string;
  subjectName: string;
  chapterNo: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [posterSrc, setPosterSrc] = useState<string | null>(() => thumbnailCache.get(s3Key) ?? null);
  const [hasStarted, setHasStarted] = useState(Boolean(thumbnailCache.get(s3Key)));
  const colors = subjectMeta(subjectName);

  useEffect(() => {
    setPosterSrc(thumbnailCache.get(s3Key) ?? null);
    setHasStarted(Boolean(thumbnailCache.get(s3Key)));
  }, [s3Key]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || thumbnailCache.has(s3Key) || thumbnailFailures.has(s3Key)) return;

    let cancelIdle: () => void = () => undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        observer.disconnect();
        setHasStarted(true);
        cancelIdle = scheduleWhenIdle(() => {
          void createVideoThumbnail(s3Key).then((thumbnail) => {
            if (thumbnail) setPosterSrc(thumbnail);
          });
        });
      },
      { rootMargin: "220px 0px", threshold: 0.1 }
    );

    observer.observe(element);

    return () => {
      cancelIdle();
      observer.disconnect();
    };
  }, [s3Key]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "aspect-video rounded-clay-sm relative overflow-hidden border border-white/80",
        `bg-gradient-to-br ${colors.gradient}`
      )}
    >
      {posterSrc ? (
        <>
          <Image src={posterSrc} alt="" fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 25vw" />
          <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/35" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.28),transparent_52%)]" />
          <div className="absolute inset-x-4 bottom-4 h-6 rounded-full bg-black/10 blur-xl" />
          <div className="absolute top-3 right-3 h-8 w-8 rounded-full border border-white/50 bg-white/30" />
          <div className="absolute bottom-4 left-4 right-16 flex items-end gap-2">
            <div className="h-10 w-10 rounded-2xl border border-white/60 bg-white/55" />
            <div className="flex-1">
              <div className="mb-2 h-3 rounded-full bg-white/60" />
              <div className="h-2.5 w-2/3 rounded-full bg-white/45" />
            </div>
          </div>
          {!hasStarted && <div className="absolute inset-0 animate-pulse bg-white/10" />}
        </>
      )}

      <div className="absolute left-3 top-3 rounded-md bg-black/30 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
        Ch. {chapterNo}
      </div>
    </div>
  );
}

function ChapterCard({
  chapter,
  onClick,
}: {
  chapter: LibraryChapterCard;
  onClick: () => void;
}) {
  const colors = subjectMeta(chapter.subjectName);
  const SubjectIcon = colors.icon;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={onKeyDown} className="cursor-pointer outline-none">
      <div
        className={cn(
          "group relative overflow-hidden rounded-clay p-6 transition-all duration-300",
          "ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          "border-[2.5px] border-white/80 bg-gradient-to-br from-white via-[#FDF8F3] to-[#FFF5EB]",
          "shadow-clay hover:-translate-y-1.5 hover:shadow-clay-hover"
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 45%)" }}
        />

        <div className="relative z-10">
          <div className="relative mb-4">
            {chapter.previewVideo?.s3Key ? (
              <VideoThumbnail
                s3Key={chapter.previewVideo.s3Key}
                subjectName={chapter.subjectName}
                chapterNo={chapter.chapterNo}
              />
            ) : (
              <div className={cn("aspect-video rounded-clay-sm border border-white/80 bg-gradient-to-br", colors.gradient)} />
            )}

            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-colors duration-300 group-hover:bg-orange-primary">
                <Play className="ml-0.5 h-6 w-6 text-orange-primary transition-colors group-hover:text-white" />
              </div>
            </div>

            <span className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              <BookOpen className="h-3 w-3" />
              {chapter.videoCount} lessons
            </span>
          </div>

          <div className="mb-2.5 flex flex-wrap gap-2">
            <span className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", colors.pill)}>
              <SubjectIcon className="mr-1 inline h-3.5 w-3.5" />
              {chapter.subjectName}
            </span>
            <span className="rounded-lg border border-white/80 bg-gradient-to-br from-white to-cream px-2.5 py-1 text-xs font-medium text-body">
              {classLabel(chapter.classNum)}
            </span>
            <span className="rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600">
              {chapter.medium} Medium
            </span>
          </div>

          <h3 className="text-sm font-bold text-heading font-poppins">{chapter.title}</h3>
        </div>
      </div>
    </div>
  );
}

function VideoModal({
  chapter,
  onClose,
}: {
  chapter: LibraryChapterCard;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<LibraryChapterDetail | null>(() => chapterDetailCache.get(chapter.id) ?? null);
  const [activeVideo, setActiveVideo] = useState<LibraryVideo | null>(
    detail?.videos[0] ??
      (chapter.previewVideo
        ? {
            id: chapter.previewVideo.id,
            title: chapter.previewVideo.title,
            durationSeconds: chapter.previewVideo.durationSeconds,
            s3Key: chapter.previewVideo.s3Key,
          }
        : null)
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(!detail);
  const [loadingVideo, setLoadingVideo] = useState(Boolean(activeVideo));
  const [error, setError] = useState<string | null>(null);
  const colors = subjectMeta(chapter.subjectName);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoadingDetail(true);
      setError(null);
      const nextDetail = await getChapterDetail(chapter.id);

      if (cancelled) return;
      if (!nextDetail) {
        setError("This chapter preview is not available yet.");
        setLoadingDetail(false);
        return;
      }

      setDetail(nextDetail);
      const matchingVideo = activeVideo
        ? nextDetail.videos.find((video) => video.id === activeVideo.id) ?? nextDetail.videos[0] ?? null
        : nextDetail.videos[0] ?? null;
      setActiveVideo(matchingVideo);
      setLoadingDetail(false);
    }

    if (!detail) {
      void loadDetail();
    } else {
      setLoadingDetail(false);
    }

    return () => {
      cancelled = true;
    };
  }, [activeVideo, chapter.id, detail]);

  useEffect(() => {
    if (!activeVideo?.s3Key) {
      setVideoUrl(null);
      setLoadingVideo(false);
      return;
    }

    const currentVideoKey = activeVideo.s3Key;
    let cancelled = false;

    async function loadVideo() {
      setLoadingVideo(true);
      setError(null);
      const url = await getPresignedUrl(currentVideoKey);

      if (cancelled) return;
      if (!url) {
        setVideoUrl(null);
        setError("Failed to load video preview.");
        setLoadingVideo(false);
        return;
      }

      setVideoUrl(url);
      setLoadingVideo(false);
    }

    void loadVideo();
    return () => {
      cancelled = true;
    };
  }, [activeVideo]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <button
        type="button"
        aria-label="Close video"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_32px_80px_rgba(0,0,0,0.25)] md:flex-row"
      >
        <div className="flex min-h-[240px] flex-1 flex-col bg-black">
          <div className="relative flex flex-1 items-center justify-center bg-gray-950" style={{ minHeight: 240 }}>
            {(loadingDetail || loadingVideo) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                <p className="text-sm text-gray-400">Loading video...</p>
              </div>
            )}

            {!loadingDetail && error && !videoUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-medium text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    setVideoUrl(null);
                  }}
                  className="text-xs text-orange-400 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {videoUrl && (
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                autoPlay
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                onContextMenu={(event) => event.preventDefault()}
                className="h-full w-full object-contain"
                style={{ maxHeight: "calc(90vh - 80px)" }}
              />
            )}
          </div>

          <div className="flex items-center gap-3 bg-gray-900 px-5 py-3">
            <Volume2 className="h-4 w-4 shrink-0 text-orange-400" />
            <div>
              <p className="text-sm font-semibold leading-tight text-white">
                {activeVideo?.title ?? chapter.previewVideo?.title ?? chapter.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                Ch. {chapter.chapterNo} — {chapter.title}
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col overflow-hidden border-l border-gray-100 bg-white md:w-72">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className={cn("mb-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold", colors.pill)}>
                  {chapter.subjectName} · {classLabel(chapter.classNum)}
                </span>
                <h3 className="text-sm font-bold leading-snug text-heading font-poppins">{chapter.title}</h3>
                <p className="mt-1 text-xs text-muted">{detail?.videos.length ?? chapter.videoCount} lessons</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingDetail && (
              <div className="flex h-full items-center justify-center px-6 py-10">
                <div className="text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-orange-primary" />
                  <p className="mt-3 text-sm text-muted">Preparing chapter playlist...</p>
                </div>
              </div>
            )}

            {!loadingDetail &&
              detail?.videos.map((video, index) => {
                const isActive = activeVideo?.id === video.id;

                return (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => setActiveVideo(video)}
                    className={cn(
                      "w-full border-b border-gray-50 px-5 py-3.5 text-left transition-all hover:bg-orange-50/60",
                      "flex items-center gap-3",
                      isActive && "border-l-2 border-l-orange-primary bg-orange-50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                        isActive ? "bg-orange-primary text-white shadow-md" : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {isActive ? <Play className="ml-0.5 h-3 w-3 fill-white" /> : index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-snug", isActive ? "font-semibold text-heading" : "text-body")}>
                        {video.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted">{formatDuration(video.durationSeconds)}</p>
                    </div>
                    {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-orange-primary" />}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContentLibraryBrowser({
  chapters,
  searchAccessory,
}: {
  chapters: LibraryChapterCard[];
  searchAccessory?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedMedium, setSelectedMedium] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<LibraryChapterCard | null>(null);
  const searchLower = search.trim().toLowerCase();

  const boardOptions = useMemo(
    () => Array.from(new Set(chapters.map((chapter) => chapter.board).filter(Boolean))).sort(),
    [chapters]
  );
  const gradeOptions = useMemo(
    () =>
      Array.from(new Set(chapters.map((chapter) => chapter.classNum)))
        .sort((left, right) => left - right),
    [chapters]
  );
  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          chapters
            .filter((chapter) => {
              if (selectedBoard && chapter.board !== selectedBoard) return false;
              if (selectedGrade !== null && chapter.classNum !== selectedGrade) return false;
              if (selectedMedium && chapter.medium !== selectedMedium) return false;
              return Boolean(chapter.subjectName);
            })
            .map((chapter) => chapter.subjectName)
        )
      ).sort((left, right) => {
        const leftMeta = subjectMeta(left);
        const rightMeta = subjectMeta(right);
        if (leftMeta.order !== rightMeta.order) return leftMeta.order - rightMeta.order;
        return left.localeCompare(right);
      }),
    [chapters, selectedBoard, selectedGrade, selectedMedium]
  );
  const mediumOptions = useMemo(
    () =>
      Array.from(
        new Set(
          chapters
            .filter((chapter) => {
              if (selectedBoard && chapter.board !== selectedBoard) return false;
              if (selectedGrade !== null && chapter.classNum !== selectedGrade) return false;
              if (selectedSubject && chapter.subjectName !== selectedSubject) return false;
              return Boolean(chapter.medium);
            })
            .map((chapter) => chapter.medium)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [chapters, selectedBoard, selectedGrade, selectedSubject]
  );

  useEffect(() => {
    if (selectedSubject && !subjectOptions.includes(selectedSubject)) {
      setSelectedSubject(null);
    }
  }, [selectedSubject, subjectOptions]);

  useEffect(() => {
    if (selectedMedium && !mediumOptions.includes(selectedMedium)) {
      setSelectedMedium(null);
    }
  }, [mediumOptions, selectedMedium]);

  const matchesSharedFilters = useCallback((chapter: LibraryChapterCard) => {
    if (selectedBoard && chapter.board !== selectedBoard) return false;
    if (selectedMedium && chapter.medium !== selectedMedium) return false;
    if (selectedSubject && chapter.subjectName !== selectedSubject) return false;
    if (searchLower) {
      const searchableText = [
        chapter.title,
        chapter.subjectName,
        chapter.medium,
        chapter.board,
        classLabel(chapter.classNum),
        chapter.previewVideo?.title ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchLower)) return false;
    }
    return true;
  }, [searchLower, selectedBoard, selectedMedium, selectedSubject]);

  const featuredGroups = useMemo(() => {
    const highlightedChapters = chapters.filter((chapter) => {
      if (!matchesSharedFilters(chapter)) return false;
      if (selectedGrade !== null) return chapter.classNum === selectedGrade;
      return chapter.classNum === 1 && chapter.medium === "English";
    });

    const groups = new Map<
      string,
      {
        classNum: number;
        medium: string;
        chapters: LibraryChapterCard[];
      }
    >();

    for (const chapter of highlightedChapters) {
      const key = `${chapter.classNum}-${chapter.medium}`;
      const existing = groups.get(key);
      if (existing) {
        existing.chapters.push(chapter);
      } else {
        groups.set(key, {
          classNum: chapter.classNum,
          medium: chapter.medium,
          chapters: [chapter],
        });
      }
    }

    return Array.from(groups.values()).sort((left, right) => {
      if (left.classNum !== right.classNum) return left.classNum - right.classNum;
      return left.medium.localeCompare(right.medium);
    });
  }, [chapters, matchesSharedFilters, selectedGrade]);

  const moreContentChapters = useMemo(() => {
    const featuredIds = new Set(featuredGroups.flatMap((group) => group.chapters.map((chapter) => chapter.id)));
    return chapters.filter((chapter) => {
      if (!matchesSharedFilters(chapter)) return false;
      if (selectedGrade !== null && chapter.classNum !== selectedGrade) return false;
      return !featuredIds.has(chapter.id);
    });
  }, [chapters, featuredGroups, matchesSharedFilters, selectedGrade]);

  const moreReveal = useProgressiveReveal(
    moreContentChapters.length,
    INITIAL_MORE_COUNT,
    MORE_BATCH,
    `${selectedBoard ?? "all"}-${selectedSubject ?? "all"}-${selectedGrade ?? "all"}-more`
  );

  const visibleMoreContent = moreContentChapters.slice(0, moreReveal.visibleCount);
  const hasResults = featuredGroups.length > 0 || visibleMoreContent.length > 0;

  return (
    <>
      {activeChapter ? <VideoModal chapter={activeChapter} onClose={() => setActiveChapter(null)} /> : null}

      <div className="space-y-8">
        <section className="rounded-[30px] border-[2.5px] border-white/80 bg-gradient-to-br from-white via-[#FDF8F3] to-[#FFF5EB] px-6 py-8 shadow-clay md:px-10 md:py-10">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-clay-pill border border-orange-primary/10 bg-gradient-to-r from-orange-50 to-orange-100/50 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-primary">Content Library</span>
            </div>
            <h1 className="text-3xl font-bold text-shadow-clay md:text-4xl">
              20,000+ Videos. <span className="text-gradient-orange">Every Board That Matters.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-body">
              Browse the LMS library with the same public-facing experience, but with real chapter previews and on-demand lesson playlists for authenticated users.
            </p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-heading">Search Content</h3>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search chapters, subjects, lessons, classes..."
                className="clay-input w-full max-w-xl px-4 py-3 text-sm"
              />
            </div>
            {searchAccessory ? <div className="shrink-0 lg:pb-0.5">{searchAccessory}</div> : null}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-heading">Filter by Board</h3>
          <div className="flex flex-wrap gap-2">
            <ClayPill active={selectedBoard === null} onClick={() => setSelectedBoard(null)}>All Boards</ClayPill>
            {boardOptions.map((board) => (
              <ClayPill
                key={board}
                active={selectedBoard === board}
                onClick={() => setSelectedBoard(selectedBoard === board ? null : board)}
              >
                {board}
              </ClayPill>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-heading">Filter by Grade</h3>
          <div className="flex flex-wrap gap-2">
            <ClayPill active={selectedGrade === null} onClick={() => setSelectedGrade(null)}>All Grades</ClayPill>
            {gradeOptions.map((grade) => (
              <ClayPill
                key={grade}
                active={selectedGrade === grade}
                onClick={() => setSelectedGrade(selectedGrade === grade ? null : grade)}
              >
                {classLabel(grade)}
              </ClayPill>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-heading">Filter by Medium</h3>
          <div className="flex flex-wrap gap-2">
            <ClayPill active={selectedMedium === null} onClick={() => setSelectedMedium(null)}>All Mediums</ClayPill>
            {mediumOptions.map((medium) => (
              <ClayPill
                key={medium}
                active={selectedMedium === medium}
                onClick={() => setSelectedMedium(selectedMedium === medium ? null : medium)}
              >
                {medium} Medium
              </ClayPill>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-heading">Filter by Subject</h3>
          <div className="flex flex-wrap gap-2">
            <ClayPill active={selectedSubject === null} onClick={() => setSelectedSubject(null)}>All Subjects</ClayPill>
            {subjectOptions.map((subjectName) => {
              const SubjectIcon = subjectMeta(subjectName).icon;
              return (
                <ClayPill
                  key={subjectName}
                  active={selectedSubject === subjectName}
                  onClick={() => setSelectedSubject(selectedSubject === subjectName ? null : subjectName)}
                >
                  <SubjectIcon className="h-3.5 w-3.5" />
                  {subjectName}
                </ClayPill>
              );
            })}
          </div>
        </section>

        {featuredGroups.map((group) => (
          <section key={`${group.classNum}-${group.medium}`} className="mb-2">
            <div className="mb-6 flex items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-heading font-poppins">
                  {classLabel(group.classNum)} — {group.medium} Medium
                </h2>
                <p className="mt-0.5 text-xs text-muted">Live demo content · Streamed from EduFleet cloud</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-semibold text-green-700">Live</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.chapters.map((chapter) => (
                <ChapterCard key={chapter.id} chapter={chapter} onClick={() => setActiveChapter(chapter)} />
              ))}
            </div>
          </section>
        ))}

        {visibleMoreContent.length > 0 ? (
          <section>
            {featuredGroups.length > 0 ? (
              <h2 className="mb-6 text-lg font-bold text-heading font-poppins">More Content</h2>
            ) : null}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleMoreContent.map((chapter) => (
                <ChapterCard key={chapter.id} chapter={chapter} onClick={() => setActiveChapter(chapter)} />
              ))}
            </div>
            {moreReveal.visibleCount < moreContentChapters.length ? <div ref={moreReveal.sentinelRef} className="h-6" /> : null}
          </section>
        ) : null}

        {!hasResults ? (
          <div className="py-16 text-center">
            <div className="mx-auto max-w-md rounded-clay border-[2.5px] border-white/80 bg-gradient-to-br from-white via-[#FDF8F3] to-[#FFF5EB] p-12 shadow-clay">
              <p className="text-lg text-body">No chapters match your current filters.</p>
              <p className="mt-2 text-sm text-muted">Try changing the board, subject, or grade selection.</p>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
