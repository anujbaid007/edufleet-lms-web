import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-clay-sm shimmer-bg animate-shimmer",
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="clay-card">
      <Skeleton className="h-40 w-full mb-4 rounded-clay-sm" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
