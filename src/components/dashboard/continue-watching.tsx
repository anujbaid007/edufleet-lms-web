"use client";

import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { Play, ChevronRight } from "lucide-react";

interface ContinueItem {
  videoId: string;
  videoTitle: string;
  chapterTitle: string;
  subjectName: string;
  watchedPercentage: number;
  lastPosition: number;
}

interface ContinueWatchingProps {
  items: ContinueItem[];
}

export function ContinueWatching({ items }: ContinueWatchingProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-bold text-heading font-poppins mb-4">Continue Watching</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link key={item.videoId} href={`/dashboard/watch/${item.videoId}`}>
            <ClayCard className="!p-4 group cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-clay-sm clay-surface-orange flex items-center justify-center shadow-clay-orange group-hover:scale-105 transition-transform">
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-heading truncate">{item.videoTitle}</p>
                  <p className="text-xs text-muted truncate">{item.subjectName} · {item.chapterTitle}</p>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-orange-primary/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-primary to-orange-500 rounded-full transition-all"
                      style={{ width: `${item.watchedPercentage}%` }}
                    />
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted shrink-0" />
              </div>
            </ClayCard>
          </Link>
        ))}
      </div>
    </section>
  );
}
