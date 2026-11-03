// FilterBar (Spec C §4): department, priority, status, ward/zone, dates, overdue, language, search. URL-synced.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { DepartmentId, Priority, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/design/ui/select';
import { Switch } from '@/design/ui/switch';
import { api, qk } from '@/lib/api/endpoints';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useDebounced } from '../hooks/useDebounced';
import { useIsMobile } from '../hooks/useIsMobile';
import { useUrlFilters, type FilterKey } from '../hooks/useUrlFilters';

const DEPARTMENTS: DepartmentId[] = [
  'roads',
  'sanitation',
  'water',
  'streetlights',
  'power',
  'drainage',
  'traffic',
  'health',
  'education',
  'town_planning',
  'other',
];
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];
const STATUSES: Status[] = [
  'registered',
  'needs_review',
  'assigned',
  'in_progress',
  'resolved_pending_verification',
  'reopened',
  'closed',
  'rejected',
  'merged',
];
const LANGS = ['en', 'te', 'hi', 'ur'] as const;
const ALL = '__all__';

type Control = 'category' | 'priority' | 'status' | 'ward' | 'dates' | 'overdue' | 'lang' | 'q';

function FilterSelect({
  field,
  label,
  children,
}: {
  field: FilterKey;
  label: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('gov');
  const { filters, setFilters } = useUrlFilters();
  return (
    <Select value={filters[field] ?? ALL} onValueChange={(v) => setFilters({ [field]: v === ALL ? '' : v })}>
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn('min-h-11 w-full md:min-h-9 md:w-auto', filters[field] && 'border-primary/60')}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          {label}: {t('filters.all')}
        </SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

export interface FilterBarProps {
  controls?: Control[];
  searchPlaceholder?: string;
  className?: string;
}

export function FilterBar({
  controls = ['q', 'category', 'priority', 'status', 'ward', 'lang', 'dates', 'overdue'],
  searchPlaceholder,
  className,
}: FilterBarProps) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const { filters, setFilters, clear, activeCount } = useUrlFilters();
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  // On phones the filters fold away so the first case stays on screen; search always shows.
  const has = (c: Control) => controls.includes(c) && (c === 'q' || !mobile || expanded);

  const wards = useQuery({
    queryKey: qk.meta.wards,
    queryFn: ({ signal }) => api.wards(signal),
    staleTime: Infinity,
    enabled: has('ward'),
  });
  const others = controls.filter((c) => c !== 'q').length;
  const zones = useMemo(() => [...new Set((wards.data ?? []).map((w) => w.zone))].sort(), [wards.data]);

  const urlText = filters.q ?? '';
  const [text, setText] = useState(urlText);
  const debounced = useDebounced(text, 350);
  useEffect(() => setText(urlText), [urlText]);
  useEffect(() => {
    if (debounced !== urlText) setFilters({ q: debounced });
    // Only a settled keystroke writes the URL; external URL changes flow in through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <section
      aria-label={t('filters.label')}
      className={cn('grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center', className)}
    >
      {has('q') && (
        <div className="relative col-span-2 md:min-w-64 md:flex-1">
          <Search
            className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={searchPlaceholder ?? t('filters.search')}
            aria-label={searchPlaceholder ?? t('filters.search')}
            className="min-h-11 min-w-11 ps-9 md:min-h-9 md:min-w-0"
            data-testid="filter-search"
          />
        </div>
      )}
      {mobile && others > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="col-span-2 min-h-11"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {activeCount > 0 ? `${t('filters.label')} (${activeCount})` : t('filters.label')}
        </Button>
      )}
      {has('category') && (
        <FilterSelect field="category" label={t('filters.department')}>
          {DEPARTMENTS.map((d) => (
            <SelectItem key={d} value={d}>
              {tc(`departments.${d}`)}
            </SelectItem>
          ))}
        </FilterSelect>
      )}
      {has('priority') && (
        <FilterSelect field="priority" label={t('filters.priority')}>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {tc(`priority.${p}`)}
            </SelectItem>
          ))}
        </FilterSelect>
      )}
      {has('status') && (
        <FilterSelect field="status" label={t('filters.status')}>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`status.${s}`, { defaultValue: tc(`status.${s}`) })}
            </SelectItem>
          ))}
        </FilterSelect>
      )}
      {has('ward') && (
        <FilterSelect field="ward" label={t('filters.ward')}>
          <SelectGroup>
            <SelectLabel>{t('filters.zones')}</SelectLabel>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>{t('filters.wards')}</SelectLabel>
            {(wards.data ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </FilterSelect>
      )}
      {has('lang') && (
        <FilterSelect field="lang" label={t('filters.language')}>
          {LANGS.map((l) => (
            <SelectItem key={l} value={l}>
              {LANGUAGE_NAMES[l].en}
            </SelectItem>
          ))}
        </FilterSelect>
      )}
      {has('dates') && (
        <>
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 md:col-auto">
            <Label htmlFor="filter-from" className="text-muted-foreground shrink-0 text-xs">
              {t('filters.from')}
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={filters.from ?? ''}
              max={filters.to}
              onChange={(e) => setFilters({ from: e.target.value })}
              className="min-h-11 min-w-0 md:min-h-9 md:w-36"
            />
          </div>
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 md:col-auto">
            <Label htmlFor="filter-to" className="text-muted-foreground shrink-0 text-xs">
              {t('filters.to')}
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={filters.to ?? ''}
              min={filters.from}
              onChange={(e) => setFilters({ to: e.target.value })}
              className="min-h-11 min-w-0 md:min-h-9 md:w-36"
            />
          </div>
        </>
      )}
      {has('overdue') && (
        <div className="flex min-h-11 items-center gap-2 md:min-h-9">
          <Switch
            id="filter-overdue"
            checked={filters.overdue === 'true'}
            onCheckedChange={(v) => setFilters({ overdue: v ? 'true' : '' })}
          />
          <Label htmlFor="filter-overdue" className="text-sm">
            {t('filters.overdue_only')}
          </Label>
        </div>
      )}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="min-h-11 min-w-11 md:min-h-9 md:min-w-0" onClick={clear}>
          <X className="size-4" aria-hidden />
          {t('filters.clear', { count: activeCount })}
        </Button>
      )}
    </section>
  );
}
