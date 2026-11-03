// Tiny inline trend line for KPI cards and report cards. Decorative: the number beside it carries the meaning.
import { useId } from 'react';
import { cn } from '@/lib/utils';

export function Sparkline({
  data,
  color = 'var(--accent)',
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const id = useId();
  if (data.length < 2) return null;
  const W = 100;
  const H = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
