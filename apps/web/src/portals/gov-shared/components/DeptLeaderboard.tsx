// Department ranking (Spec C §6.1, §6.3). `limit` gives the top-5 card; `onSelect` opens the drawer.
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { DepartmentId, DepartmentPerformance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/design/ui/popover';
import { DepartmentBadge } from '@/design/components';
import { useLangFormat } from '@/lib/i18n/useLangFormat';

export function ScoreFormula() {
  const { t } = useTranslation('gov');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
          aria-label={t('departments.formula_label')}
        >
          <Info className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        <p className="mb-1 font-medium">{t('departments.formula_label')}</p>
        <p className="text-muted-foreground">{t('departments.formula')}</p>
      </PopoverContent>
    </Popover>
  );
}

export function DeptLeaderboard({
  rows,
  limit,
  onSelect,
}: {
  rows: DepartmentPerformance[];
  limit?: number;
  onSelect?: (id: DepartmentId) => void;
}) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const list = [...rows].sort((a, b) => a.rank - b.rank).slice(0, limit);
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('nav.departments')}>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('nav.departments')}</caption>
        <thead>
          <tr className="text-muted-foreground text-start text-xs">
            <th scope="col" className="px-2 py-1.5 text-start font-medium">
              #
            </th>
            <th scope="col" className="px-2 py-1.5 text-start font-medium">
              {t('inbox.column.department')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-end font-medium">
              {t('departments.score')}
            </th>
            <th scope="col" className="px-2 py-1.5 text-end font-medium">
              {t('departments.sla')}
            </th>
            {!limit && (
              <>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  {t('departments.avg_resolution')}
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  {t('departments.satisfaction')}
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  {t('departments.reopen')}
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  {t('kpi.open')}
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  {t('kpi.overdue')}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="tabular">
          {list.map((d) => (
            <tr key={d.department_id} className="border-t" data-testid="leaderboard-row">
              <td className="text-muted-foreground px-2 py-1.5 font-mono text-xs">{d.rank}</td>
              <td className="px-2 py-1.5">
                {onSelect ? (
                  <button
                    type="button"
                    className="min-h-11 md:min-h-7"
                    onClick={() => onSelect(d.department_id)}
                    aria-label={t('departments.open', { name: tc(`departments.${d.department_id}`) })}
                  >
                    <DepartmentBadge department={d.department_id} size="sm" />
                  </button>
                ) : (
                  <DepartmentBadge department={d.department_id} size="sm" />
                )}
              </td>
              <td className="px-2 py-1.5 text-end font-mono font-medium">{fmt.number(d.score)}</td>
              <td className="px-2 py-1.5 text-end">{fmt.percent(d.sla_compliance_pct)}</td>
              {!limit && (
                <>
                  <td className="px-2 py-1.5 text-end">{d.resolved ? `${fmt.number(d.avg_resolution_hours)} h` : '–'}</td>
                  <td className="px-2 py-1.5 text-end">{d.satisfaction_avg ? fmt.number(d.satisfaction_avg) : '–'}</td>
                  <td className="px-2 py-1.5 text-end">{fmt.percent(d.reopen_rate)}</td>
                  <td className="px-2 py-1.5 text-end">{fmt.number(d.open)}</td>
                  <td className="px-2 py-1.5 text-end">{fmt.number(d.overdue)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
