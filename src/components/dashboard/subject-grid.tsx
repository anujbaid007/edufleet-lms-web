import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ChevronRight } from "lucide-react";

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

function getColor(name: string): string {
  return subjectColors[name] || subjectColors.default;
}

export function SubjectGrid({ subjects }: SubjectGridProps) {
  if (subjects.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-bold text-heading font-poppins mb-4">Your Subjects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((subject) => {
          const percent = subject.totalChapters > 0
            ? Math.round((subject.completedChapters / subject.totalChapters) * 100)
            : 0;
          const color = getColor(subject.name);

          return (
            <Link key={subject.id} href={`/dashboard/subjects/${subject.id}`}>
              <ClayCard className="!p-5 group cursor-pointer">
                <div className="flex items-center gap-4">
                  <ProgressRing percentage={percent} size={52} strokeWidth={5} color={color}>
                    <span className="text-[10px] font-bold text-heading">{percent}%</span>
                  </ProgressRing>
                  <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-heading">{subject.name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {subject.completedChapters}/{subject.totalChapters} chapters · {subject.completedVideos}/{subject.totalVideos} videos
                  </p>
                </div>
                  <ChevronRight className="w-4 h-4 text-muted group-hover:text-orange-primary transition-colors shrink-0" />
                </div>
              </ClayCard>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
