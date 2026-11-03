// Status, internal notes and reassign (Spec C §5.2).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BrainCircuit, EyeOff, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentId, Grievance } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/design/ui/select';
import { Textarea } from '@/design/ui/textarea';
import { DEPARTMENT_ICONS } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { Panel } from '@/portals/gov-shared/components/Panel';
import type { DelayReasonIn } from '@/portals/gov-shared/types-ext';
import { useCaseAction } from '../../hooks/useCaseAction';

const DEPARTMENTS = Object.keys(DEPARTMENT_ICONS) as DepartmentId[];
const DELAY_REASONS = ['materials', 'weather', 'other_department', 'access', 'staffing'] as const;
const AUTO = '__auto__';

export function StatusControl({ grievance: g }: { grievance: Grievance }) {
  const { t } = useTranslation('gov');
  const [delaying, setDelaying] = useState(false);
  const [reason, setReason] = useState('');
  const set = useCaseAction(
    g.id,
    (body: { status: Grievance['status']; delay_reason?: DelayReasonIn }) =>
      api.setStatus(g.id, body as Parameters<typeof api.setStatus>[1]),
    () => {
      setDelaying(false);
      setReason('');
      toast.success(t('status_control.updated'));
    },
  );
  const canStart = g.status === 'assigned' || g.status === 'reopened';
  return (
    <Panel title={t('status_control.title')}>
      <div className="flex gap-2">
        {canStart && (
          <Button
            id="case-status"
            size="sm"
            className="min-h-11 flex-1 md:min-h-9"
            disabled={set.isPending}
            onClick={() => set.mutate({ status: 'in_progress' })}
            aria-keyshortcuts="s"
          >
            <Play className="size-4" aria-hidden />
            {t('status_control.start')}
          </Button>
        )}
        <Button
          id={canStart ? undefined : 'case-status'}
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 md:min-h-9"
          aria-expanded={delaying}
          onClick={() => setDelaying((v) => !v)}
        >
          {t('status_control.delay')}
        </Button>
      </div>
      {delaying && (
        <div className="space-y-2">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger
              aria-label={t('status_control.delay_reason')}
              className="min-h-11 w-full md:min-h-9"
            >
              <SelectValue placeholder={t('status_control.delay_reason')} />
            </SelectTrigger>
            <SelectContent>
              {DELAY_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`status_control.reasons.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full md:min-h-9"
            disabled={!reason || set.isPending}
            onClick={() => set.mutate({ status: g.status, delay_reason: { reason } })}
          >
            {t('status_control.record_delay')}
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function NoteForm({ id }: { id: string }) {
  const { t } = useTranslation('gov');
  const [text, setText] = useState('');
  const add = useCaseAction(
    id,
    (note: string) => api.addNote(id, { text: note }),
    () => setText(''),
  );
  return (
    <Panel title={t('note.title')}>
      <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
        <EyeOff className="size-3.5" aria-hidden />
        {t('note.internal')}
      </p>
      <Textarea
        id="case-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        aria-label={t('note.title')}
        aria-keyshortcuts="n"
      />
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 w-full md:min-h-9"
        disabled={!text.trim() || add.isPending}
        onClick={() => add.mutate(text.trim())}
      >
        {t('note.add')}
      </Button>
    </Panel>
  );
}

export function ReassignForm({ grievance: g }: { grievance: Grievance }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const [department, setDepartment] = useState<DepartmentId>(g.category);
  const [officer, setOfficer] = useState(AUTO);
  const [reason, setReason] = useState('');
  const officers = useQuery({
    queryKey: qk.officer.officers(department),
    queryFn: ({ signal }) => api.officers({ department }, signal),
  });
  const list = [...(officers.data ?? [])].sort((a, b) => (a.open_cases ?? 0) - (b.open_cases ?? 0));
  const send = useCaseAction(
    g.id,
    () =>
      api.reassign(g.id, {
        department_id: department,
        officer_id: officer === AUTO ? undefined : officer,
        reason: reason.trim(),
      }),
    () => {
      setReason('');
      setOfficer(AUTO);
      toast.success(t('reassign.done'));
    },
  );
  return (
    <Panel title={t('reassign.title')}>
      <Select
        value={department}
        onValueChange={(v) => {
          setDepartment(v as DepartmentId);
          setOfficer(AUTO);
        }}
      >
        <SelectTrigger aria-label={t('filters.department')} className="min-h-11 w-full md:min-h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEPARTMENTS.map((d) => (
            <SelectItem key={d} value={d}>
              {tc(`departments.${d}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={officer} onValueChange={setOfficer}>
        <SelectTrigger aria-label={t('bulk.officer')} className="min-h-11 w-full md:min-h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>{t('reassign.least_loaded')}</SelectItem>
          {list.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
              {o.open_cases != null && ` · ${t('bulk.open_cases', { count: o.open_cases })}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="space-y-1">
        <Label htmlFor="reassign-reason" className="text-xs">
          {t('reassign.reason')}
        </Label>
        <Textarea id="reassign-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </div>
      <p className="text-ai flex items-center gap-1.5 text-xs">
        <BrainCircuit className="size-3.5 shrink-0" aria-hidden />
        {t('reassign.trains')}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 w-full md:min-h-9"
        disabled={!reason.trim() || send.isPending}
        onClick={() => send.mutate(undefined)}
      >
        {t('reassign.submit')}
      </Button>
    </Panel>
  );
}
