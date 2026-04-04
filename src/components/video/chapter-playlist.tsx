"use client";

import Link from "next/link";
import { Play, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";

interface PlaylistVideo {
  id: string;
  title: string;
  durationSeconds: number;
  completed: boolean;
  watchedPercentage: number;
}

interface ChapterPlaylistProps {
  chapterTitle: string;
  chapterNo: number;
  subjectName: string;
  videos: PlaylistVideo[];
  activeVideoId: string;
}

export function ChapterPlaylist({
  chapterTitle,
  chapterNo,
  subjectName,
  videos,
  activeVideoId,
}: ChapterPlaylistProps) {
  return (
    <div className="clay-surface rounded-clay overflow-hidden border-2 border-white/60" style={{
      boxShadow: "10px 10px 30px rgba(200,160,120,0.15), -8px -8px 24px rgba(255,255,255,0.9)",
    }}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-orange-primary/10">
        <p className="text-xs font-semibold text-orange-primary">{subjectName}</p>
        <h3 className="font-poppins font-bold text-heading text-sm mt-0.5">
          Ch. {chapterNo}: {chapterTitle}
        </h3>
        <p className="text-xs text-muted mt-1">{videos.length} lessons</p>
      </div>

      {/* Playlist */}
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
        {videos.map((video, i) => {
          const isActive = video.id === activeVideoId;
          return (
            <Link
              key={video.id}
              href={`/dashboard/watch/${video.id}`}
              className={cn(
                "flex items-center gap-3 px-5 py-3.5 border-b border-orange-primary/5 transition-all hover:bg-cream/60",
                isActive && "bg-orange-50 border-l-2 border-l-orange-primary"
              )}
            >
              <div className={cn(
                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                video.completed
                  ? "bg-green-100 text-green-600"
                  : isActive
                  ? "bg-orange-primary text-white shadow-md"
                  : "bg-gray-100 text-gray-500"
              )}>
                {video.completed ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : isActive ? (
                  <Play className="w-3 h-3 fill-white ml-0.5" />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn("text-sm leading-snug", isActive ? "font-semibold text-heading" : "text-body")}>
                  {video.title}
                </span>
                <p className="text-[10px] text-muted mt-0.5">{formatDuration(video.durationSeconds)}</p>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-orange-primary shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
