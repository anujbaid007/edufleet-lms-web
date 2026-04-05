import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { BookOpen, Clock, Flame } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface StatsOverviewProps {
  totalChapters: number;
  completedChapters: number;
  totalWatchTimeSeconds: number;
  streak: number;
  activeSubjects: number;
}

export function StatsOverview({
  totalChapters,
  completedChapters,
  totalWatchTimeSeconds,
  streak,
  activeSubjects,
}: StatsOverviewProps) {
  const completionPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  const streakStarted = streak > 0;
  const streakLabel = streakStarted ? "On a roll" : "Streak";
  const streakValue = streak === 1 ? "1 day" : `${streak} days`;
  const streakSubtext = streakStarted ? "Keep the learning rhythm going." : "Start one lesson today to begin your streak.";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Overall Progress */}
      <ClayCard hover={false} className="!p-4 sm:!p-5 flex items-center gap-4">
        <ProgressRing percentage={completionPercent} size={56} strokeWidth={6}>
          <span className="text-xs font-bold text-heading">{completionPercent}%</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-xs text-muted font-medium">Overall</p>
          <p className="text-lg font-bold text-heading">{completedChapters}/{totalChapters}</p>
          <p className="text-xs text-muted">chapters done</p>
        </div>
      </ClayCard>

      {/* Watch Time */}
      <ClayCard hover={false} className="!p-4 sm:!p-5 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-clay-sm clay-surface shadow-clay-pill sm:h-14 sm:w-14">
          <Clock className="w-6 h-6 text-orange-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted font-medium">Watch Time</p>
          <p className="text-lg font-bold text-heading">{formatDuration(totalWatchTimeSeconds)}</p>
          <p className="text-xs text-muted">total</p>
        </div>
      </ClayCard>

      {/* Streak */}
      <ClayCard
        hover={false}
        className={`!p-4 sm:!p-5 flex items-center gap-4 transition-colors ${
          streakStarted ? "bg-gradient-to-br from-white via-white to-orange-50/60" : "bg-gradient-to-br from-white via-white to-slate-50"
        }`}
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-clay-sm shadow-clay-pill sm:h-14 sm:w-14 ${
            streakStarted ? "bg-orange-50" : "bg-slate-50"
          }`}
        >
          <Flame className={`w-6 h-6 ${streakStarted ? "text-orange-500" : "text-slate-400"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted font-medium">{streakLabel}</p>
          <p className="text-lg font-bold text-heading">{streakValue}</p>
          <p className="max-w-[18ch] text-xs text-muted">{streakSubtext}</p>
        </div>
      </ClayCard>

      {/* Subjects */}
      <ClayCard hover={false} className="!p-4 sm:!p-5 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-clay-sm clay-surface shadow-clay-pill sm:h-14 sm:w-14">
          <BookOpen className="w-6 h-6 text-orange-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted font-medium">Subjects</p>
          <p className="text-lg font-bold text-heading">{activeSubjects}</p>
          <p className="text-xs text-muted">in progress</p>
        </div>
      </ClayCard>
    </div>
  );
}
