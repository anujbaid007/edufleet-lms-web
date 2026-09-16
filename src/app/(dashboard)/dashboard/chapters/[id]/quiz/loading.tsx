import { Skeleton } from "@/components/ui/loading-skeleton";

export default function ChapterQuizLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-64" />
      <div className="clay-card !p-8">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-6 w-3/4 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-clay-sm" />
          ))}
        </div>
        <div className="mt-8 flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
