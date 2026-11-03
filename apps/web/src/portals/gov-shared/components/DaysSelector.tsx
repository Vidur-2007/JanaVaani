// 7/30/90 day range, kept in the URL so a view can be shared (Spec C §6.1).
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';

const OPTIONS = [7, 30, 90];

export function useDays() {
  const [params] = useSearchParams();
  const days = Number(params.get('days'));
  return OPTIONS.includes(days) ? days : 30;
}

export function DaysSelector() {
  const { t } = useTranslation('gov');
  const [, setParams] = useSearchParams();
  const days = useDays();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={String(days)}
      aria-label={t('admin.date_range')}
      onValueChange={(v) =>
        v &&
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('days', v);
            return next;
          },
          { replace: true },
        )
      }
    >
      {OPTIONS.map((d) => (
        <ToggleGroupItem
          key={d}
          value={String(d)}
          className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary min-h-11 min-w-11 md:min-h-8"
        >
          {t('admin.days', { count: d })}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
