interface CanalBadgeProps {
  canal: 'Print' | 'Web' | 'NL';
}

const CANAL_STYLES: Record<string, string> = {
  Print: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  Web: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  NL: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

export function CanalBadge({ canal }: CanalBadgeProps) {
  const styles = CANAL_STYLES[canal] ?? 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${styles}`}
    >
      {canal}
    </span>
  );
}
