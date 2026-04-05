import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Crumb = {
  href: string;
  label: string;
};

export function PageBreadcrumbs({
  backHref,
  backLabel,
  crumbs,
  className,
}: {
  backHref: string;
  backLabel: string;
  crumbs: Crumb[];
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 self-start rounded-full border border-orange-primary/10 bg-white/85 px-4 py-2 text-sm font-semibold text-heading shadow-[0_10px_24px_rgba(214,153,68,0.10)] transition hover:-translate-y-0.5 hover:border-orange-primary/20 hover:text-orange-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>{backLabel}</span>
      </Link>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted sm:justify-end">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-2">
              <Link
                href={crumb.href}
                className={cn(
                  "rounded-full px-3 py-1.5 transition",
                  isLast
                    ? "bg-orange-50 font-semibold text-orange-primary"
                    : "bg-white/80 text-muted hover:text-heading"
                )}
              >
                {crumb.label}
              </Link>
              {!isLast ? <ChevronRight className="h-3.5 w-3.5 text-muted/70" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
