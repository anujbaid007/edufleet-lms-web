import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const ClayInput = forwardRef<HTMLInputElement, ClayInputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block text-sm font-semibold text-heading font-poppins">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "clay-input",
            error && "border-red-400 focus:border-red-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
      </div>
    );
  }
);
ClayInput.displayName = "ClayInput";
