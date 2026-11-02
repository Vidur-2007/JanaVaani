// ChartCard (Spec C §4, §8): title, unit, formula tooltip, "view as table", PNG export and all four states.
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartNoAxesColumn, Download, Info, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/design/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/design/ui/popover';
import { EmptyState, ErrorState, Skeleton } from '@/design/components';
import { cn } from '@/lib/utils';

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface ChartCardProps {
  title: string;
  unit?: string;
  /** How the metric is computed. Shown in the info popover. */
  formula: string;
  table: ChartTable;
  children: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  height?: number;
  className?: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'chart';

export function ChartCard({
  title,
  unit,
  formula,
  table,
  children,
  isLoading,
  error,
  onRetry,
  isEmpty,
  height = 260,
  className,
}: ChartCardProps) {
  const { t } = useTranslation('gov');
  const [asTable, setAsTable] = useState(false);
  const [exporting, setExporting] = useState(false);
  const capture = useRef<HTMLDivElement>(null);
  const ready = !isLoading && !error && !isEmpty;

  const exportPng = async () => {
    if (!capture.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const background = getComputedStyle(document.body).getPropertyValue('background-color');
      const url = await toPng(capture.current, {
        backgroundColor: background,
        pixelRatio: 2,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug(title)}.png`;
      a.click();
    } catch {
      toast.error(t('chart.export_failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section
      ref={capture}
      aria-label={title}
      className={cn('bg-surface flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border p-4', className)}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display truncate text-sm font-semibold">{title}</h3>
          {unit && <p className="text-muted-foreground text-xs">{unit}</p>}
        </div>
        <div className="flex shrink-0 items-center" data-no-export>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="min-h-11 min-w-11 md:min-h-8 md:min-w-8" aria-label={t('chart.how_computed')}>
                <Info className="size-4" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-sm">
              <p className="mb-1 font-medium">{t('chart.how_computed')}</p>
              <p className="text-muted-foreground">{formula}</p>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
            aria-pressed={asTable}
            aria-label={asTable ? t('chart.view_chart') : t('chart.view_table')}
            disabled={!ready}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? (
              <ChartNoAxesColumn className="size-4" aria-hidden />
            ) : (
              <Table2 className="size-4" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="min-h-11 min-w-11 md:min-h-8 md:min-w-8"
            aria-label={t('chart.export_png')}
            disabled={!ready || exporting}
            onClick={exportPng}
          >
            <Download className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <div style={{ minHeight: height }}>
        {isLoading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : error ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState icon={ChartNoAxesColumn} title={t('chart.empty')} className="py-6" />
        ) : asTable ? (
          <div className="overflow-auto" style={{ maxHeight: height }}>
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="text-muted-foreground border-b px-2 py-1.5 text-start text-xs font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className="tabular border-b px-2 py-1.5">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
