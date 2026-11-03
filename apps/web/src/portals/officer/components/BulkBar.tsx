// Bulk actions (Spec C §5.1): confirm first, then hold the POST for a few seconds behind an undo toast.
// The contract has no undo endpoint (gap G12), so "undo" simply means the request was never sent.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, ListChecks, UserRoundCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Grievance, Status } from '@contracts/types';
import { Button } from '@/design/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design/ui/dialog';
import { Label } from '@/design/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/design/ui/select';
import { api, qk, type BulkRequest } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';

const UNDO_MS = 5000;
const BULK_STATUSES: Status[] = ['assigned', 'in_progress'];

type Action = 'status' | 'assign' | 'merge';

export function BulkBar({ selected, onClear }: { selected: Grievance[]; onClear: () => void }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [value, setValue] = useState('');

  const officers = useQuery({
    queryKey: qk.officer.officers(),
    queryFn: ({ signal }) => api.officers({}, signal),
    enabled: action === 'assign',
  });
  const bulk = useMutation({
    mutationFn: (body: BulkRequest) => api.bulk(body),
    onSuccess: ({ updated }) => {
      qc.invalidateQueries({ queryKey: qk.officer.all });
      toast.success(t('bulk.done', { count: updated }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const incidentId = selected[0]?.incident_id;
  const canMerge = selected.length > 1 && !!incidentId && selected.every((g) => g.incident_id === incidentId);

  const close = () => {
    setAction(null);
    setValue('');
  };

  const confirm = () => {
    if (!action) return;
    const body: BulkRequest = {
      ids: selected.map((g) => g.id),
      action,
      payload:
        action === 'status'
          ? { status: value }
          : action === 'assign'
            ? { officer_id: value }
            : { incident_id: incidentId },
    };
    const timer = window.setTimeout(() => bulk.mutate(body), UNDO_MS);
    toast(t('bulk.pending', { count: body.ids.length }), {
      duration: UNDO_MS,
      action: {
        label: t('bulk.undo'),
        onClick: () => {
          window.clearTimeout(timer);
          toast.info(t('bulk.undone'));
        },
      },
    });
    onClear();
    close();
  };

  if (selected.length === 0) return null;
  const needsValue = action === 'status' || action === 'assign';

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('bulk.label')}
        data-testid="bulk-bar"
        className="flex flex-wrap items-center gap-1.5"
      >
        <span className="tabular px-1 text-sm font-medium" aria-live="polite">
          {t('bulk.selected', { count: selected.length })}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11 md:min-h-9 md:min-w-0"
          onClick={() => setAction('status')}
        >
          <ListChecks className="size-4" aria-hidden />
          {t('bulk.set_status')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11 md:min-h-9 md:min-w-0"
          onClick={() => setAction('assign')}
        >
          <UserRoundCheck className="size-4" aria-hidden />
          {t('bulk.assign')}
        </Button>
        {canMerge && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 min-w-11 md:min-h-9 md:min-w-0"
            onClick={() => setAction('merge')}
          >
            <GitMerge className="size-4" aria-hidden />
            {t('bulk.merge')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
          aria-label={t('bulk.clear')}
          onClick={onClear}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <Dialog open={!!action} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action && t(`bulk.confirm_${action}`, { count: selected.length })}</DialogTitle>
            <DialogDescription>{t('bulk.confirm_body', { seconds: UNDO_MS / 1000 })}</DialogDescription>
          </DialogHeader>
          {action === 'status' && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-value">{t('filters.status')}</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="bulk-value" className="touch-target w-full">
                  <SelectValue placeholder={t('bulk.choose_status')} />
                </SelectTrigger>
                <SelectContent>
                  {BULK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tc(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {action === 'assign' && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-value">{t('bulk.officer')}</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="bulk-value" className="touch-target w-full">
                  <SelectValue placeholder={t('bulk.choose_officer')} />
                </SelectTrigger>
                <SelectContent>
                  {(officers.data ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · {o.designation}
                      {o.open_cases != null && ` · ${t('bulk.open_cases', { count: o.open_cases })}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="touch-target" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button
              className="touch-target"
              disabled={needsValue && !value}
              onClick={confirm}
              data-testid="bulk-confirm"
            >
              {tc('actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
