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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Overall Progress */}
      <ClayCard hover={false} className="!p-5 flex items-center gap-4">
        <ProgressRing percentage={completionPercent} size={56} strokeWidth={6}>
          <span className="text-xs font-bold text-heading">{completionPercent}%</span>
        </ProgressRing>
        <div>
          <p className="text-xs text-muted font-medium">Overall</p>
          <p className="text-lg font-bold text-heading">{completedChapters}/{totalChapters}</p>
          <p className="text-xs text-muted">chapters done</p>
        </div>
      </ClayCard>

      {/* Watch Time */}
      <ClayCard hover={false} className="!p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
          <Clock className="w-6 h-6 text-orange-primary" />
        </div>
        <div>
          <p className="text-xs text-muted font-medium">Watch Time</p>
          <p className="text-lg font-bold text-heading">{formatDuration(totalWatchTimeSeconds)}</p>
          <p className="text-xs text-muted">total</p>
        </div>
      </ClayCard>

      {/* Streak */}
      <ClayCard
        hover={false}
        className={`!p-5 flex items-center gap-4 transition-colors ${
          streakStarted ? "bg-gradient-to-br from-white via-white to-orange-50/60" : "bg-gradient-to-br from-white via-white to-slate-50"
        }`}
      >
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-clay-sm shadow-clay-pill ${
            streakStarted ? "bg-orange-50" : "bg-slate-50"
          }`}
        >
          <Flame className={`w-6 h-6 ${streakStarted ? "text-orange-500" : "text-slate-400"}`} />
        </div>
        <div>
          <p className="text-xs text-muted font-medium">{streakLabel}</p>
          <p className="text-lg font-bold text-heading">{streakValue}</p>
          <p className="max-w-[18ch] text-xs text-muted">{streakSubtext}</p>
        </div>
      </ClayCard>

      {/* Subjects */}
      <ClayCard hover={false} className="!p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
          <BookOpen className="w-6 h-6 text-orange-primary" />
        </div>
        <div>
          <p className="text-xs text-muted font-medium">Subjects</p>
          <p className="text-lg font-bold text-heading">{activeSubjects}</p>
          <p className="text-xs text-muted">in progress</p>
        </div>
      </ClayCard>
    </div>
  );
}
