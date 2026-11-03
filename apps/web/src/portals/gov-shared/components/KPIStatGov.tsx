// KPIStatGov (Spec C §4, §8): count-up, delta, sparkline and click-through. The shared KPIStat restarts from 0 when a
// value changes, so this tweens from the number on screen and pulses softly instead.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { animate } from 'motion/react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { KPIStatProps } from '@/design/components';
import { countUpMs, easeOutExpo } from '@/design/motion';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

const PULSE_MS = 1200;

export interface KPIStatGovProps extends KPIStatProps {
  trend?: number[];
  to?: string;
}

function useTween(value: number) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: countUpMs / 1000,
      ease: easeOutExpo,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduced]);
  return shown;
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

export function KPIStatGov({
  label,
  value,
  format,
  decimals = 0,
  suffix = '',
  delta,
  upIsGood = true,
  icon: Icon,
  hint,
  trend,
  to,
  className,
}: KPIStatGovProps) {
  const fmt = useLangFormat();
  const shown = useTween(value);
  const pulsing = usePulse(value);
  const render = (n: number) => (format ? format(n) : fmt.number(+n.toFixed(decimals)));
  const good = delta ? delta > 0 === upIsGood : null;
  const card = (
    <div
      data-pulsing={pulsing || undefined}
      className={cn(
        'bg-surface h-full rounded-[var(--radius-lg)] border p-4 transition-shadow duration-700',
        to && 'hover:bg-surface-2',
        pulsing && 'ring-signal/60 ring-2',
        className,
      )}
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
        <span>{label}</span>
        {Icon && <Icon className="size-4" aria-hidden />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="font-display tabular text-3xl font-semibold tracking-tight"
          aria-label={`${render(value)}${suffix}`}
        >
          {render(shown)}
          {suffix}
        </span>
        {!!delta && (
          <span
            className={cn(
              'tabular inline-flex items-center text-xs font-medium',
              good ? 'text-success' : 'text-danger',
            )}
          >
            {delta > 0 ? (
              <ArrowUpRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden />
            )}
            {fmt.number(Math.abs(delta))}
          </span>
        )}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
      {trend && <Sparkline data={trend} className="mt-1" />}
    </div>
  );
  if (!to) return card;
  return (
    <Link to={to} className="block rounded-[var(--radius-lg)]">
      {card}
    </Link>
  );
}
