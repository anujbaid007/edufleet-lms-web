import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export function ClayButton({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ClayButtonProps) {
  return (
    <button
      className={cn(
        "clay-btn gap-2",
        {
          "clay-surface-orange text-white shadow-clay-orange hover:shadow-[12px_12px_30px_rgba(232,135,30,0.45),-6px_-6px_20px_rgba(255,200,140,0.35),inset_2px_2px_6px_rgba(255,255,255,0.4),inset_-2px_-2px_6px_rgba(180,80,0,0.18)] hover:-translate-y-0.5":
            variant === "primary",
          "clay-surface text-heading shadow-clay hover:shadow-clay-hover hover:-translate-y-0.5":
            variant === "secondary",
          "bg-transparent text-body hover:text-heading hover:bg-cream/50":
            variant === "ghost",
        },
        {
          "px-4 py-2 text-sm": size === "sm",
          "px-6 py-3 text-sm": size === "md",
          "px-8 py-4 text-base": size === "lg",
        },
        (disabled || loading) && "opacity-60 pointer-events-none",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
