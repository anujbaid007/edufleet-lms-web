import { Skeleton } from "@/components/ui/loading-skeleton";

export default function AiTutorLoading() {
  return (
    <div className="h-[calc(100dvh-7rem)] min-h-[560px] lg:h-[calc(100dvh-6rem)]">
      <div className="clay-card flex h-full flex-col !p-5">
        <div className="flex items-center gap-3 border-b border-black/5 pb-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex-1 space-y-4 py-6">
          <Skeleton className="h-16 w-3/4 rounded-clay-sm" />
          <Skeleton className="h-12 w-2/3 rounded-clay-sm ml-auto" />
          <Skeleton className="h-20 w-4/5 rounded-clay-sm" />
        </div>
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}
