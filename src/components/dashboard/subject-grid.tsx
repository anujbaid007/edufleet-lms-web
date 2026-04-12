"use client";

import Image from "next/image";
import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/language-context";

interface SubjectWithProgress {
  id: string;
  name: string;
  totalVideos: number;
  completedVideos: number;
  totalChapters: number;
  completedChapters: number;
}

interface SubjectGridProps {
  subjects: SubjectWithProgress[];
}

const subjectColors: Record<string, string> = {
  English: "#8B5CF6",
  Mathematics: "#3B82F6",
  Science: "#10B981",
  EVS: "#10B981",
  "Social Studies": "#F59E0B",
  Hindi: "#EF4444",
  Physics: "#6366F1",
  Chemistry: "#14B8A6",
  Biology: "#22C55E",
  Economics: "#F97316",
  "Computer": "#8B5CF6",
  default: "#E8871E",
};

const subjectArtwork: Record<string, { image: string; accent: string }> = {
  English: {
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
    accent: "from-violet-900/80 via-violet-700/35 to-transparent",
  },
  Mathematics: {
    image:
      "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80",
    accent: "from-sky-900/80 via-sky-700/30 to-transparent",
  },
  Science: {
    image:
      "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
    accent: "from-emerald-950/80 via-emerald-700/35 to-transparent",
  },
  EVS: {
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
    accent: "from-emerald-950/80 via-lime-700/30 to-transparent",
  },
  "Social Studies": {
    image:
      "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80",
    accent: "from-amber-950/80 via-amber-700/35 to-transparent",
  },
  Hindi: {
    image:
      "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80",
    accent: "from-rose-950/80 via-rose-700/35 to-transparent",
  },
  Physics: {
    image:
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1200&q=80",
    accent: "from-indigo-950/80 via-indigo-700/35 to-transparent",
  },
  Chemistry: {
    image:
      "https://images.unsplash.com/photo-1532634896-26909d0d4b6b?auto=format&fit=crop&w=1200&q=80",
    accent: "from-cyan-950/80 via-cyan-700/35 to-transparent",
  },
  Biology: {
    image:
      "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=1200&q=80",
    accent: "from-green-950/80 via-green-700/35 to-transparent",
  },
  Economics: {
    image:
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
    accent: "from-orange-950/80 via-orange-700/35 to-transparent",
  },
  Computer: {
    image:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
    accent: "from-fuchsia-950/80 via-fuchsia-700/35 to-transparent",
  },
  default: {
    image:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80",
    accent: "from-orange-950/80 via-orange-700/30 to-transparent",
  },
};

function getColor(name: string): string {
  return subjectColors[name] || subjectColors.default;
}

function getArtwork(name: string) {
  return subjectArtwork[name] || subjectArtwork.default;
}

export function SubjectGrid({ subjects }: SubjectGridProps) {
  const { t } = useLanguage();

  if (subjects.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-bold text-heading font-poppins mb-4">{t("subjects.title")}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => {
          const percent = subject.totalChapters > 0
            ? Math.round((subject.completedChapters / subject.totalChapters) * 100)
            : 0;
          const color = getColor(subject.name);
          const artwork = getArtwork(subject.name);

          return (
            <Link key={subject.id} href={`/dashboard/subjects/${subject.id}`}>
              <ClayCard className="group cursor-pointer overflow-hidden !p-0">
                <div className="relative h-28 overflow-hidden sm:h-32">
                  <Image
                    src={artwork.image}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-r ${artwork.accent}`} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#101828]/85 via-[#101828]/35 to-transparent px-4 pb-3 pt-10 sm:px-5 sm:pb-4 sm:pt-12">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                      {t("subjects.learningPath")}
                    </p>
                    <p className="mt-1 text-lg font-bold text-white sm:text-xl">{subject.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                  <ProgressRing percentage={percent} size={52} strokeWidth={5} color={color}>
                    <span className="text-[10px] font-bold text-heading">{percent}%</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-heading">{t("subjects.chaptersDone", { done: subject.completedChapters, total: subject.totalChapters })}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t("subjects.videosCompleted", { done: subject.completedVideos, total: subject.totalVideos })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-orange-primary" />
                </div>
              </ClayCard>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
