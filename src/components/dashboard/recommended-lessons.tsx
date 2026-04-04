import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { Play } from "lucide-react";

interface RecommendedItem {
  videoId: string;
  videoTitle: string;
  chapterTitle: string;
  subjectName: string;
  chapterNo: number;
}

interface RecommendedLessonsProps {
  items: RecommendedItem[];
}

export function RecommendedLessons({ items }: RecommendedLessonsProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-heading font-poppins">Up Next</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link key={item.videoId} href={`/dashboard/watch/${item.videoId}`}>
            <ClayCard className="!p-4 group cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full clay-surface flex items-center justify-center shadow-clay-pill group-hover:clay-surface-orange group-hover:shadow-clay-orange transition-all">
                  <Play className="w-4 h-4 text-orange-primary group-hover:text-white ml-0.5 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-primary font-semibold mb-0.5">{item.subjectName}</p>
                  <p className="text-sm font-semibold text-heading truncate">{item.videoTitle}</p>
                  <p className="text-xs text-muted mt-0.5">Ch. {item.chapterNo} · {item.chapterTitle}</p>
                </div>
              </div>
            </ClayCard>
          </Link>
        ))}
      </div>
    </section>
  );
}
