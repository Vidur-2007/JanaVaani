// KPIStatGov (Spec C §4): shared KPIStat plus a sparkline, click-through, and a soft pulse when a live value changes.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { KPIStat, type KPIStatProps } from '@/design/components';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

const PULSE_MS = 1200;

export interface KPIStatGovProps extends KPIStatProps {
  trend?: number[];
  to?: string;
}

function usePulse(value: number) {
  const last = useRef(value);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    setPulsing(true);
    const id = window.setTimeout(() => setPulsing(false), PULSE_MS);
    return () => window.clearTimeout(id);
  }, [value]);
  return pulsing;
}

export function KPIStatGov({ trend, to, className, hint, ...stat }: KPIStatGovProps) {
  const pulsing = usePulse(stat.value);
  const card = (
    <div data-pulsing={pulsing || undefined} className={cn('h-full rounded-[var(--radius-lg)] transition-shadow duration-700', pulsing && 'ring-signal/60 ring-2')}>
      <KPIStat
        {...stat}
        className={cn('h-full', to && 'hover:bg-surface-2 transition-colors', className)}
        hint={
          trend || hint ? (
            <>
              {hint}
              {trend && <Sparkline data={trend} className="mt-1" />}
            </>
          ) : undefined
        }
      />
    </div>
  );
  if (!to) return card;
  return (
    <Link to={to} className="block rounded-[var(--radius-lg)]">
      {card}
    </Link>
  );
}
