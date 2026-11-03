// DataTable (Spec C §4): TanStack Table v9 with sticky header, column visibility, selection and j/k navigation.
// Under 768 px each row renders through `renderCard`. Long lists use content-visibility so offscreen rows skip
// layout and paint; the data is server-paged, so this covers the >100 rows case without a virtualizer dependency.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import {
  columnVisibilityFeature,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Columns3 } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { Checkbox } from '@/design/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/design/ui/dropdown-menu';
import { durations, easeOutExpo } from '@/design/motion';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';
import { useIsMobile } from '../hooks/useIsMobile';

export const dataTableFeatures = tableFeatures({ columnVisibilityFeature, rowSelectionFeature });
export type DataColumn<T extends RowData> = ColumnDef<typeof dataTableFeatures, T, unknown> & {
  /** Visible name for the column menu and the screen-reader header. */
  title?: string;
};

export interface DataTableProps<T extends RowData> {
  data: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string;
  /** Accessible table name. */
  label: string;
  renderCard: (row: T, ctx: { selected: boolean; toggle: () => void }) => ReactNode;
  onRowOpen?: (row: T) => void;
  selection?: RowSelectionState;
  onSelectionChange?: (next: RowSelectionState) => void;
  /** Rows that just arrived: they slide in and hold a soft glow. */
  freshIds?: ReadonlySet<string>;
  /** Scroll container height, which is what makes the header stick. */
  maxHeight?: string;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  toolbar?: ReactNode;
}

const LONG_LIST = 100;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  label,
  renderCard,
  onRowOpen,
  selection,
  onSelectionChange,
  freshIds,
  maxHeight = 'calc(100dvh - 19rem)',
  rowClassName,
  className,
  toolbar,
}: DataTableProps<T>) {
  const { t } = useTranslation('gov');
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const selectable = !!onSelectionChange;
  const rowSelection = useMemo(() => selection ?? {}, [selection]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);

  const toggle = (id: string) => {
    if (!onSelectionChange) return;
    const next = { ...rowSelection };
    if (next[id]) delete next[id];
    else next[id] = true;
    onSelectionChange(next);
  };
  const ids = useMemo(() => data.map(getRowId), [data, getRowId]);
  const allSelected = ids.length > 0 && ids.every((id) => rowSelection[id]);
  const someSelected = ids.some((id) => rowSelection[id]);

  const table = useTable<typeof dataTableFeatures, T>({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row: T) => getRowId(row),
    state: { rowSelection, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  useEffect(() => setActive((i) => Math.min(i, data.length - 1)), [data.length]);

  // Page-level so j/k work on arrival; ignored while typing or when a dialog owns the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        setActive((i) => {
          const next = e.key === 'j' ? Math.min(i + 1, data.length - 1) : Math.max(i - 1, 0);
          wrapper.current
            ?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)
            ?.focus({ preventScroll: false });
          return next;
        });
      } else if (e.key === 'Enter' && active >= 0 && data[active] && !isInteractive(e.target)) {
        onRowOpen?.(data[active]);
      } else if (e.key === 'x' && active >= 0 && data[active]) {
        toggle(getRowId(data[active]));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const columnsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 min-w-11 md:min-h-9 md:min-w-0">
          <Columns3 className="size-4" aria-hidden />
          {t('table.columns')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllLeafColumns()
          .filter((c) => (c.columnDef as DataColumn<T>).title)
          .map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.getIsVisible()}
              onCheckedChange={(v) => c.toggleVisibility(!!v)}
              onSelect={(e) => e.preventDefault()}
            >
              {(c.columnDef as DataColumn<T>).title}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const bar = (toolbar || !mobile) && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="me-auto min-w-0">{toolbar}</div>
      {!mobile && columnsMenu}
    </div>
  );

  if (mobile) {
    return (
      <div className={cn('space-y-2', className)} ref={wrapper}>
        {bar}
        <ul className="space-y-2" aria-label={label}>
          {data.map((row, i) => {
            const id = getRowId(row);
            return (
              <motion.li
                key={id}
                data-row-index={i}
                tabIndex={-1}
                initial={freshIds?.has(id) && !reduced ? { opacity: 0, y: -10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: durations.slow, ease: easeOutExpo }}
              >
                {renderCard(row, { selected: !!rowSelection[id], toggle: () => toggle(id) })}
              </motion.li>
            );
          })}
        </ul>
      </div>
    );
  }

  const long = data.length > LONG_LIST;
  return (
    <div className={cn('space-y-2', className)}>
      {bar}
      <div
        ref={wrapper}
        className="bg-surface overflow-auto rounded-[var(--radius-md)] border"
        style={{ maxHeight }}
        // Scrollable regions must be reachable by keyboard.
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="bg-surface-2 sticky top-0 z-10">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {selectable && (
                  <th scope="col" className="w-10 border-b px-3 py-2">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      aria-label={t('table.select_all')}
                      onCheckedChange={(v) =>
                        onSelectionChange?.(v ? Object.fromEntries(ids.map((id) => [id, true])) : {})
                      }
                    />
                  </th>
                )}
                {group.headers.map((h) => (
                  <th
                    key={h.id}
                    scope="col"
                    className="text-muted-foreground border-b px-3 py-2 text-start text-xs font-medium whitespace-nowrap"
                  >
                    <table.FlexRender header={h} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => {
              const fresh = freshIds?.has(row.id);
              const selected = !!rowSelection[row.id];
              return (
                <motion.tr
                  key={row.id}
                  data-row-index={i}
                  data-testid="table-row"
                  data-fresh={fresh || undefined}
                  aria-selected={selectable ? selected : undefined}
                  tabIndex={-1}
                  initial={fresh && !reduced ? { opacity: 0, y: -10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: durations.slow, ease: easeOutExpo }}
                  onClick={() => {
                    setActive(i);
                    onRowOpen?.(row.original);
                  }}
                  onFocus={() => setActive(i)}
                  style={long ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' } : undefined}
                  className={cn(
                    'hover:bg-surface-2/70 focus-visible:bg-surface-2 transition-colors duration-700 [&>td]:border-b [&:last-child>td]:border-b-0',
                    onRowOpen && 'cursor-pointer',
                    selected && 'bg-primary/8',
                    fresh && 'bg-signal/10',
                    rowClassName?.(row.original),
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected}
                        aria-label={t('table.select_row', { id: row.id })}
                        onCheckedChange={() => toggle(row.id)}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground hidden text-[11px] lg:block">{t('table.keyboard_hint')}</p>
    </div>
  );
}

const isInteractive = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('a,button,[role="button"],[role="checkbox"]');
