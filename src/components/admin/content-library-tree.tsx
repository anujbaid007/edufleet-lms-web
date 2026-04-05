"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Languages,
  Loader2,
  Play,
  Volume2,
  X,
} from "lucide-react";
import { ClayCard } from "@/components/ui/clay-card";
import { cn, formatDuration } from "@/lib/utils";

type ChapterVideo = {
  id: string;
  title: string;
  durationSeconds: number;
  s3Key: string | null;
  sortOrder: number;
};

type ChapterItem = {
  id: string;
  chapterNo: number;
  title: string;
  videoCount: number;
  classNum: number;
  medium: string;
  subjectName: string;
  videos: ChapterVideo[];
};

type SubjectGroup = {
  subjectName: string;
  chapters: ChapterItem[];
  totalVideos: number;
};

type MediumGroup = {
  medium: string;
  subjects: SubjectGroup[];
  totalChapters: number;
  totalVideos: number;
};

type ClassGroup = {
  classNum: number;
  mediums: MediumGroup[];
  totalChapters: number;
  totalVideos: number;
};

function classLabel(n: number) {
  if (n === 0) return "Kindergarten";
  if (n === 99) return "General";
  return `Class ${n}`;
}

function classBadge(n: number) {
  if (n === 0) return "KG";
  if (n === 99) return "G";
  return String(n);
}

function ChapterPreviewModal({
  chapter,
  activeVideo,
  onClose,
  onSelectVideo,
}: {
  chapter: ChapterItem;
  activeVideo: ChapterVideo;
  onClose: () => void;
  onSelectVideo: (video: ChapterVideo) => void;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchUrl = useCallback(async (video: ChapterVideo) => {
    if (!video.s3Key) {
      setVideoUrl(null);
      setError(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    setVideoUrl(null);

    try {
      const res = await fetch(`/api/presign?key=${encodeURIComponent(video.s3Key)}`);
      const data = await res.json();
      if (data.url) {
        setVideoUrl(data.url);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUrl(activeVideo);
  }, [activeVideo, fetchUrl]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.button
          type="button"
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onClose}
          aria-label="Close preview"
        />

        <motion.div
          className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_32px_80px_rgba(0,0,0,0.25)]"
          style={{ maxHeight: "90vh" }}
          initial={{ scale: 0.94, opacity: 0, y: 18 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 18 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          <div className="flex max-h-[90vh] flex-col lg:flex-row">
            <div className="flex min-h-[260px] flex-1 flex-col bg-[#090d1a]">
              <div className="relative flex-1 bg-black" style={{ minHeight: 260 }}>
                {loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                    <p className="text-sm text-gray-400">Loading video...</p>
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm font-medium text-red-300">This video preview is not available yet.</p>
                    <button
                      type="button"
                      onClick={() => fetchUrl(activeVideo)}
                      className="text-xs text-orange-300 underline"
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
                    style={{ maxHeight: "calc(90vh - 92px)" }}
                  />
                )}
              </div>

              <div className="flex items-center gap-3 border-t border-white/10 bg-[#171c2b] px-5 py-4">
                <Volume2 className="h-4 w-4 shrink-0 text-orange-300" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{activeVideo.title}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Ch. {chapter.chapterNo} — {chapter.title}
                  </p>
                </div>
                <Link
                  href={`/dashboard/watch/${activeVideo.id}`}
                  className="ml-auto hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 lg:inline-flex"
                >
                  Open full player
                </Link>
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col border-l border-orange-primary/10 bg-white lg:w-80">
              <div className="border-b border-orange-primary/10 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center rounded-full border border-orange-primary/10 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-primary">
                      {chapter.subjectName} · {classLabel(chapter.classNum)}
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-heading">{chapter.title}</h3>
                    <p className="mt-1 text-xs text-muted">{chapter.videos.length} lessons</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[42vh] overflow-y-auto lg:max-h-[90vh]">
                {chapter.videos.map((video, index) => {
                  const isActive = video.id === activeVideo.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => onSelectVideo(video)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-orange-primary/5 px-5 py-4 text-left transition hover:bg-orange-50/60",
                        isActive && "bg-orange-50 border-l-2 border-l-orange-primary"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                          isActive
                            ? "bg-orange-primary text-white shadow-md"
                            : "bg-gray-100 text-gray-500"
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
                      {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-orange-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function ContentLibraryTree({ tree }: { tree: ClassGroup[] }) {
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [mediumFilter, setMediumFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeChapter, setActiveChapter] = useState<ChapterItem | null>(null);
  const [activeVideo, setActiveVideo] = useState<ChapterVideo | null>(null);

  useEffect(() => {
    document.body.style.overflow = activeChapter ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeChapter]);

  const toggleClass = (n: number) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const toggleSubject = (key: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedClasses(new Set(tree.map((c) => c.classNum)));
    const allSubs: string[] = [];
    tree.forEach((c) =>
      c.mediums.forEach((m) =>
        m.subjects.forEach((s) => allSubs.push(`${c.classNum}-${m.medium}-${s.subjectName}`))
      )
    );
    setExpandedSubjects(new Set(allSubs));
  };

  const collapseAll = () => {
    setExpandedClasses(new Set());
    setExpandedSubjects(new Set());
  };

  const openPreview = (chapter: ChapterItem) => {
    if (chapter.videos.length === 0) return;
    setActiveChapter(chapter);
    setActiveVideo(chapter.videos[0]);
  };

  const closePreview = () => {
    setActiveChapter(null);
    setActiveVideo(null);
  };

  const searchLower = search.toLowerCase();

  return (
    <>
      {activeChapter && activeVideo && (
        <ChapterPreviewModal
          chapter={activeChapter}
          activeVideo={activeVideo}
          onClose={closePreview}
          onSelectVideo={setActiveVideo}
        />
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search chapters or subjects..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (event.target.value) expandAll();
            }}
            className="clay-input w-64 px-4 py-2 text-sm"
          />
          <select
            value={mediumFilter}
            onChange={(event) => setMediumFilter(event.target.value)}
            className="clay-input px-4 py-2 text-sm"
          >
            <option value="all">All Mediums</option>
            <option value="English">English</option>
            <option value="Hindi">Hindi</option>
          </select>
          <div className="ml-auto flex gap-1">
            <button onClick={expandAll} className="text-xs text-orange-primary hover:underline">
              Expand All
            </button>
            <span className="text-xs text-muted">·</span>
            <button onClick={collapseAll} className="text-xs text-orange-primary hover:underline">
              Collapse All
            </button>
          </div>
        </div>

        {tree.map((cls) => {
          const filteredMediums = cls.mediums
            .filter((m) => mediumFilter === "all" || m.medium === mediumFilter)
            .map((m) => ({
              ...m,
              subjects: m.subjects
                .map((s) => ({
                  ...s,
                  chapters: searchLower
                    ? s.chapters.filter(
                        (ch) =>
                          ch.title.toLowerCase().includes(searchLower) ||
                          s.subjectName.toLowerCase().includes(searchLower) ||
                          ch.videos.some((video) => video.title.toLowerCase().includes(searchLower))
                      )
                    : s.chapters,
                }))
                .filter((s) => s.chapters.length > 0),
            }))
            .filter((m) => m.subjects.length > 0);

          if (filteredMediums.length === 0) return null;

          const isClassExpanded = expandedClasses.has(cls.classNum);
          const filteredChapterCount = filteredMediums.reduce(
            (sum, medium) => sum + medium.subjects.reduce((inner, subject) => inner + subject.chapters.length, 0),
            0
          );
          const filteredVideoCount = filteredMediums.reduce(
            (sum, medium) =>
              sum +
              medium.subjects.reduce(
                (inner, subject) => inner + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.videoCount, 0),
                0
              ),
            0
          );

          return (
            <ClayCard key={cls.classNum} hover={false} className="!p-0 overflow-hidden">
              <button
                onClick={() => toggleClass(cls.classNum)}
                className="flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-cream/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted transition-transform",
                    isClassExpanded && "rotate-90"
                  )}
                />
                <div className="clay-surface-orange flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-clay-orange">
                  <span className="text-xs font-bold text-white">{classBadge(cls.classNum)}</span>
                </div>
                <span className="text-sm font-bold text-heading">{classLabel(cls.classNum)}</span>
                <div className="ml-auto flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    {filteredChapterCount} ch
                  </span>
                  <span className="flex items-center gap-1">
                    <Play className="h-3.5 w-3.5" />
                    {filteredVideoCount} videos
                  </span>
                </div>
              </button>

              {isClassExpanded && (
                <div className="border-t border-orange-primary/10">
                  {filteredMediums.map((medium) => (
                    <div key={medium.medium}>
                      <div className="flex items-center gap-2 border-b border-orange-primary/5 bg-cream/30 px-12 py-2">
                        <Languages className="h-3.5 w-3.5 text-orange-primary" />
                        <span className="text-xs font-semibold text-heading">{medium.medium}</span>
                        <span className="text-[10px] text-muted">
                          {medium.subjects.reduce((sum, subject) => sum + subject.chapters.length, 0)} chapters
                        </span>
                      </div>

                      {medium.subjects.map((subject) => {
                        const subKey = `${cls.classNum}-${medium.medium}-${subject.subjectName}`;
                        const isSubExpanded = expandedSubjects.has(subKey);

                        return (
                          <div key={subKey}>
                            <button
                              onClick={() => toggleSubject(subKey)}
                              className="flex w-full items-center gap-2 py-2.5 pl-14 pr-5 transition-colors hover:bg-cream/40"
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
                                  isSubExpanded && "rotate-90"
                                )}
                              />
                              <GraduationCap className="h-4 w-4 shrink-0 text-orange-primary" />
                              <span className="text-sm font-medium text-heading">{subject.subjectName}</span>
                              <span className="ml-1 text-[10px] text-muted">
                                {subject.chapters.length} ch ·{" "}
                                {subject.chapters.reduce((sum, chapter) => sum + chapter.videoCount, 0)} videos
                              </span>
                            </button>

                            {isSubExpanded && (
                              <div className="space-y-1 pb-3">
                                {subject.chapters.map((chapter) => {
                                  const isActiveChapter = activeChapter?.id === chapter.id;

                                  return (
                                    <div
                                      key={chapter.id}
                                      className={cn(
                                        "mx-4 flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all",
                                        isActiveChapter
                                          ? "border-orange-primary/20 bg-orange-50/80 shadow-[0_10px_24px_rgba(232,135,30,0.12)]"
                                          : "border-transparent hover:border-orange-primary/10 hover:bg-cream/50"
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openPreview(chapter)}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                      >
                                        <span className="w-7 shrink-0 text-right font-mono text-xs text-muted">
                                          {chapter.chapterNo}.
                                        </span>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-body">{chapter.title}</p>
                                          <p className="mt-0.5 text-[10px] text-muted">
                                            {chapter.videoCount} {chapter.videoCount === 1 ? "lesson" : "lessons"}
                                          </p>
                                        </div>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => openPreview(chapter)}
                                        disabled={chapter.videos.length === 0}
                                        className={cn(
                                          "clay-surface-orange inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-white shadow-clay-orange transition hover:-translate-y-0.5",
                                          chapter.videos.length === 0 && "pointer-events-none opacity-50"
                                        )}
                                        aria-label={`Preview ${chapter.title}`}
                                      >
                                        <Play className="h-3 w-3 fill-white" />
                                        Preview
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          );
        })}
      </div>
    </>
  );
}
