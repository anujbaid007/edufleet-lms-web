"use client";

import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { ChevronRight } from "lucide-react";
import { VideoThumbnail } from "@/components/video/video-thumbnail";
import { useLanguage } from "@/context/language-context";

interface ContinueItem {
  videoId: string;
  videoTitle: string;
  chapterTitle: string;
  subjectName: string;
  s3Key: string | null;
  watchedPercentage: number;
  lastPosition: number;
}

interface ContinueWatchingProps {
  items: ContinueItem[];
}

export function ContinueWatching({ items }: ContinueWatchingProps) {
  const { t } = useLanguage();

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-bold text-heading font-poppins mb-4">{t("cw.title")}</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link key={item.videoId} href={`/dashboard/watch/${item.videoId}`}>
            <ClayCard className="!p-3 group cursor-pointer">
              <div className="space-y-3">
                <VideoThumbnail
                  s3Key={item.s3Key}
                  subjectName={item.subjectName}
                  chapterLabel={item.subjectName}
                />

                <div className="flex items-start gap-3 px-1 pb-1">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-heading">{item.videoTitle}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{item.subjectName} · {item.chapterTitle}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-orange-primary/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-primary to-orange-500 transition-all"
                        style={{ width: `${item.watchedPercentage}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-muted">{t("cw.watched", { pct: item.watchedPercentage })}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" />
                </div>
              </div>
            </ClayCard>
          </Link>
        ))}
      </div>
    </section>
  );
}
