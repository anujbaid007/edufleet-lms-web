import { cn } from "@/lib/utils";

interface ClayPillProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ClayPill({ children, active, onClick, className }: ClayPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "clay-pill gap-1.5 transition-all duration-200",
        active
          ? "clay-surface-orange text-white shadow-clay-orange"
          : "text-body hover:text-heading hover:shadow-clay-hover",
        className
      )}
    >
      {children}
    </button>
  );
}
