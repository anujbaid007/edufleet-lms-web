import { Skeleton } from "@/components/ui/loading-skeleton";

export default function StudentsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="clay-card !p-5 text-center">
            <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
            <Skeleton className="h-7 w-14 mx-auto mb-1" />
            <Skeleton className="h-3 w-20 mx-auto" />
          </div>
        ))}
      </div>
      <div className="clay-card !p-5">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-40 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-2 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
