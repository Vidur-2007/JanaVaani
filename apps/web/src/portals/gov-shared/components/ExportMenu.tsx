// Export menu (Spec C §6.9): CSV, Excel, PDF. `target` supplies the element to rasterize when text isn't Latin.
import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/design/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design/ui/dropdown-menu';
import {
  exportCsv,
  exportExcel,
  exportPdfRaster,
  exportPdfTables,
  hasNonLatin,
  type ExportSheet,
} from '../lib/export';

export function ExportMenu({
  sheets,
  filename,
  title,
  target,
  disabled,
}: {
  sheets: ExportSheet[];
  filename: string;
  title: string;
  target?: RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  const { t } = useTranslation('gov');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setBusy(false);
    }
  };
  const pdf = () => {
    if (hasNonLatin(sheets) && target?.current) return exportPdfRaster(target.current, filename);
    return exportPdfTables(sheets, filename, title);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-9"
          disabled={disabled || busy}
          data-testid="export-menu"
        >
          <Download className="size-4" aria-hidden />
          {busy ? t('export.working') : t('export.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => run(() => exportCsv(sheets, filename))}>
          {t('export.csv')}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => run(() => exportExcel(sheets, filename))}>
          {t('export.excel')}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 md:min-h-8" onSelect={() => run(pdf)}>
          {t('export.pdf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
