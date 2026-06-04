import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MatchIndicatorProps {
  score: number;
}

export function MatchIndicator({ score }: MatchIndicatorProps) {
  const pct = Math.round(score * 100);

  let colorClass: string;
  if (score > 0.7) {
    colorClass = 'bg-success text-success-foreground';
  } else if (score >= 0.4) {
    colorClass = 'bg-primary text-primary-foreground';
  } else {
    colorClass = 'bg-warning text-warning-foreground';
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${colorClass}`}
        >
          {pct}%
        </span>
      </TooltipTrigger>
      <TooltipContent>% de correspondance avec votre brief</TooltipContent>
    </Tooltip>
  );
}
