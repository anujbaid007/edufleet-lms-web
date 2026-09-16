import { Skeleton } from "@/components/ui/loading-skeleton";

export default function SubjectDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-56" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="clay-card !p-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-52 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
