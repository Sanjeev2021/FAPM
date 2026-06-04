import { cn } from "@/lib/utils";
import logo from "@/assets/LOGO.png";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingState({
  message,
  size = "md",
  className
}: LoadingStateProps) {
  const spinnerSize = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-14 h-14",
  };

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-gray-50", className)}>
      <div className="flex flex-col items-center gap-6">
        <img src={logo} alt="FLAIX" className="h-12 opacity-90" />

        {/* Gradient spinner */}
        <div className={cn("relative", spinnerSize[size])}>
          <svg className="animate-spin" viewBox="0 0 40 40" fill="none">
            <circle
              cx="20" cy="20" r="17"
              stroke="#E5E7EB"
              strokeWidth="3"
            />
            <circle
              cx="20" cy="20" r="17"
              stroke="url(#gradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80"
              strokeDashoffset="60"
            />
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                <stop offset="0%" stopColor="#7C8CF8" />
                <stop offset="50%" stopColor="#C084FC" />
                <stop offset="100%" stopColor="#F59AC0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {message && (
          <p className="text-sm font-light text-gray-400">{message}</p>
        )}
      </div>
    </div>
  );
}

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ className, lines = 3 }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded animate-shimmer"
          style={{ width: `${100 - i * 10}%` }}
        />
      ))}
    </div>
  );
}
