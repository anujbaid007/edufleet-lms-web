import { Skeleton } from "@/components/ui/loading-skeleton";

export default function WatchLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-72" />
      <div className="flex flex-col gap-6 -mt-2 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Skeleton className="aspect-video w-full rounded-clay" />
          <div className="mt-4">
            <Skeleton className="h-6 w-2/3 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="mt-5 hidden lg:block">
            <div className="clay-card !p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-5 w-44 mb-2" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-10 w-28 rounded-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="w-full shrink-0 lg:w-80">
          <div className="clay-card !p-4">
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-20 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-3 w-full mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
