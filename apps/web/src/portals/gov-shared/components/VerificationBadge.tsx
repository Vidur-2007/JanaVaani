// AI verdict on a resolution photo. `detailed` adds confidence, reasons and the individual checks.
import { useTranslation } from 'react-i18next';
import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AIVerification } from '@contracts/types';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { cn } from '@/lib/utils';

const VERDICT = {
  verified: { icon: ShieldCheck, cls: 'bg-success/12 text-success border-success/40' },
  suspicious: { icon: ShieldAlert, cls: 'bg-danger/12 text-danger border-danger/40' },
  unclear: { icon: CircleHelp, cls: 'bg-warning/15 text-warning border-warning/40' },
} as const;

export function VerificationBadge({
  verification,
  detailed,
  className,
}: {
  verification: AIVerification;
  detailed?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const { icon: Icon, cls } = VERDICT[verification.verdict];
  const badge = (
    <span
      data-testid="verification-badge"
      data-verdict={verification.verdict}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap',
        cls,
        !detailed && className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`verification.${verification.verdict}`)}
    </span>
  );
  if (!detailed) return badge;

  const { same_location, issue_resolved_visible, duplicate_photo, distance_m } = verification.checks;
  const yesNo = (v: boolean | null) =>
    t(v == null ? 'verification.unknown' : v ? 'verification.yes' : 'verification.no');
  const checks = [
    [t('verification.same_location'), yesNo(same_location)],
    [t('verification.issue_resolved'), yesNo(issue_resolved_visible)],
    [t('verification.duplicate_photo'), yesNo(duplicate_photo)],
    [
      t('verification.distance'),
      distance_m == null ? t('verification.unknown') : `${fmt.number(distance_m)} m`,
    ],
  ];
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        {badge}
        <span className="text-muted-foreground tabular font-mono text-xs">
          {fmt.percent(Math.round(verification.confidence * 100))}
        </span>
      </div>
      {verification.reasons_en.length > 0 && (
        <ul className="list-disc space-y-0.5 ps-4 text-sm">
          {verification.reasons_en.map((r) => (
            <li key={r}>
              <bdi lang="en">{r}</bdi>
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
        {checks.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
