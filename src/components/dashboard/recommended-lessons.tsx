import Link from "next/link";
import { ClayCard } from "@/components/ui/clay-card";
import { VideoThumbnail } from "@/components/video/video-thumbnail";

interface RecommendedItem {
  videoId: string;
  videoTitle: string;
  chapterTitle: string;
  subjectName: string;
  chapterNo: number;
  s3Key: string | null;
  lessonCountLabel?: string;
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
            <ClayCard className="!p-3 group cursor-pointer">
              <div className="space-y-3">
                <VideoThumbnail
                  s3Key={item.s3Key}
                  subjectName={item.subjectName}
                  chapterLabel={`Ch. ${item.chapterNo}`}
                  lessonCountLabel={item.lessonCountLabel}
                />
                <div className="px-1 pb-1">
                  <p className="mb-1 text-xs font-semibold text-orange-primary">{item.subjectName}</p>
                  <p className="truncate text-sm font-semibold text-heading">{item.videoTitle}</p>
                  <p className="mt-1 text-xs text-muted">Ch. {item.chapterNo} · {item.chapterTitle}</p>
                </div>
              </div>
            </ClayCard>
          </Link>
        ))}
      </div>
    </section>
  );
}
