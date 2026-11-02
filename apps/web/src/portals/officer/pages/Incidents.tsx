// Incidents tab (Spec C §5.1): merged issues with their reach, plus one proof that resolves every open member.
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMarker } from 'react-leaflet';
import { CheckCheck, Upload, Users, Waypoints } from 'lucide-react';
import { toast } from 'sonner';
import type { Incident } from '@contracts/types';
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
import { Textarea } from '@/design/ui/textarea';
import {
  CardSkeleton,
  DepartmentBadge,
  EmptyState,
  ErrorState,
  LangBadge,
  MapView,
  PageTransition,
} from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { GovStatusChip } from '@/portals/gov-shared/components/GovStatusChip';
import { isOpenStatus } from '@/portals/gov-shared/lib/inbox';
import { InboxTabs } from '../components/InboxTabs';

function ResolveAllDialog({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');

  // No bulk resolve endpoint exists (gap G11), so one uploaded proof goes through #38 per open member.
  const resolve = useMutation({
    mutationFn: async () => {
      const media = await api.upload({ file: file!, purpose: 'resolution_proof' });
      const members = await Promise.all(incident.grievance_ids.map((id) => api.getGrievance(id)));
      const open = members.filter(
        (g) => isOpenStatus(g.status) && g.status !== 'resolved_pending_verification',
      );
      await Promise.all(open.map((g) => api.resolve(g.id, { media_ids: [media.id], note })));
      return open.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: qk.officer.all });
      qc.invalidateQueries({ queryKey: qk.grievances.all });
      toast.success(t('incidents.resolved', { count }));
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !resolve.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('incidents.resolve_all')}</DialogTitle>
          <DialogDescription>
            {t('incidents.resolve_body', { count: incident.grievance_ids.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('incidents.proof')}</Label>
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={t('incidents.proof')}
              data-testid="incident-proof"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="touch-target w-full justify-start"
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              <span className="truncate">{file?.name ?? t('incidents.choose_photo')}</span>
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-note">{t('incidents.note')}</Label>
            <Textarea id="incident-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="touch-target" disabled={resolve.isPending} onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button
            className="touch-target"
            disabled={!file || !note.trim() || resolve.isPending}
            onClick={() => resolve.mutate()}
          >
            {resolve.isPending ? tc('loading') : t('incidents.resolve_all')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentCard({ incident, onResolve }: { incident: Incident; onResolve: () => void }) {
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  return (
    <article
      data-testid="incident-card"
      className="bg-surface flex flex-col overflow-hidden rounded-[var(--radius-lg)] border"
    >
      <MapView
        center={incident.centroid}
        zoom={14}
        height={132}
        className="rounded-none border-0 border-b"
        ariaLabel={t('incidents.location', { title: incident.title_en })}
      >
        <CircleMarker
          center={[incident.centroid.lat, incident.centroid.lng]}
          radius={10}
          pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.4 }}
        />
      </MapView>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <DepartmentBadge department={incident.category} size="sm" />
          <GovStatusChip status={incident.status} className="ms-auto" />
        </div>
        <h2 className="font-display text-sm leading-snug font-semibold">{incident.title_en}</h2>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
          <span className="tabular">{t('incidents.members', { count: incident.grievance_ids.length })}</span>
          <span className="tabular inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {fmt.number(incident.support_count)}
          </span>
          <span className="font-mono text-[11px]">{incident.id}</span>
        </p>
        <div className="flex flex-wrap gap-1" aria-label={t('incidents.languages')}>
          {incident.languages.map((l) => (
            <LangBadge key={l} lang={l} />
          ))}
        </div>
        <Button variant="outline" size="sm" className="min-h-11 mt-auto md:min-h-9" onClick={onResolve}>
          <CheckCheck className="size-4" aria-hidden />
          {t('incidents.resolve_all')}
        </Button>
      </div>
    </article>
  );
}

export default function Incidents() {
  const { t } = useTranslation('gov');
  const [resolving, setResolving] = useState<Incident | null>(null);
  const q = useQuery({
    queryKey: qk.officer.incidents(),
    queryFn: ({ signal }) => api.incidents({}, signal),
  });
  return (
    <PageTransition className="space-y-3">
      <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{t('nav.incidents')}</h1>
      <InboxTabs />
      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={Waypoints} title={t('incidents.empty')} description={t('incidents.empty_hint')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((i) => (
            <IncidentCard key={i.id} incident={i} onResolve={() => setResolving(i)} />
          ))}
        </div>
      )}
      {resolving && <ResolveAllDialog incident={resolving} onClose={() => setResolving(null)} />}
    </PageTransition>
  );
}
