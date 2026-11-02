// KPIStatGov (Spec C §4): shared KPIStat plus a sparkline and click-through to a filtered list.
import { Link } from 'react-router';
import { KPIStat, type KPIStatProps } from '@/design/components';
import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';

export interface KPIStatGovProps extends KPIStatProps {
  trend?: number[];
  to?: string;
}

export function KPIStatGov({ trend, to, className, hint, ...stat }: KPIStatGovProps) {
  const card = (
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
  );
  if (!to) return card;
  return (
    <Link to={to} className="block rounded-[var(--radius-lg)]">
      {card}
    </Link>
  );
}
