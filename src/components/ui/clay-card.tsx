import { cn } from "@/lib/utils";

interface ClayCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hover?: boolean;
}

export function ClayCard({ children, hover = true, className, ...props }: ClayCardProps) {
  return (
    <div
      className={cn(
        "clay-card",
        !hover && "hover:transform-none hover:shadow-clay",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
