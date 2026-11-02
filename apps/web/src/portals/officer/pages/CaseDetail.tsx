// Officer cockpit (Spec C §5.2): citizen's words, case work, actions. Three columns on desktop, stacked on mobile.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CircleMarker } from 'react-leaflet';
import { MapPin, QrCode } from 'lucide-react';
import type { Location } from '@contracts/types';
import { Switch } from '@/design/ui/switch';
import { Label } from '@/design/ui/label';
import { ErrorState, MapView, PageSkeleton, PageTransition, Timeline } from '@/design/components';
import { api, qk } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/useAuth';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { AuditChain, type AuditChainHandle } from '@/portals/gov-shared/components/AuditChain';
import { CaseHeader } from '@/portals/gov-shared/components/CaseHeader';
import { EmergencyDecision } from '@/portals/gov-shared/components/EmergencyDecision';
import { EvidenceViewer } from '@/portals/gov-shared/components/EvidenceViewer';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { PriorityFactorList } from '@/portals/gov-shared/components/PriorityFactorList';
import { RoutingExplain } from '@/portals/gov-shared/components/RoutingExplain';
import { SLACountdownGov } from '@/portals/gov-shared/components/SLACountdownGov';
import { TranslationSplit } from '@/portals/gov-shared/components/TranslationSplit';
import { canResolve, isOpenStatus } from '@/portals/gov-shared/lib/inbox';
import { AIBriefCard } from '../components/case/AIBriefCard';
import { NoteForm, ReassignForm, StatusControl } from '../components/case/ActionForms';
import { MessageThread } from '../components/case/MessageThread';
import { ReplyComposer } from '../components/case/ReplyComposer';
import { ResolveForm, VerificationResult } from '../components/case/ResolveForm';
import { CaseFlags, EscalationDots } from '../components/InboxRow';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Addresses often already contain the landmark, ward or zone, so each part only adds what is new. */
function locationLine(l: Location) {
  return [l.address, l.landmark, l.ward_name, l.zone]
    .reduce<string[]>((parts, p) => {
      if (p && !parts.join(' ').toLowerCase().includes(p.toLowerCase())) parts.push(p);
      return parts;
    }, [])
    .join(' · ');
}

export default function CaseDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation('gov');
  const fmt = useLangFormat();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const chain = useRef<AuditChainHandle>(null);
  const [formal, setFormal] = useState(false);
  const q = useQuery({
    queryKey: qk.grievances.detail(id),
    queryFn: ({ signal }) => api.getGrievance(id, {}, signal),
    retry: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const focus = (target: string) => {
        e.preventDefault();
        document.getElementById(target)?.focus();
      };
      if (e.key === 'r') focus('case-reply');
      else if (e.key === 'n') focus('case-note');
      else if (e.key === 's') focus('case-status');
      else if (e.key === 'v') chain.current?.verify();
      else if (e.key === 'Escape') navigate('/officer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const g = q.data;
  const open = isOpenStatus(g.status);
  const working = open && g.status !== 'resolved_pending_verification';
  const lead = profile?.role === 'supervisor' || profile?.role === 'admin';
  const text = formal ? g.formal_text : g.description;

  return (
    <PageTransition className="space-y-3">
      <CaseHeader grievance={g} flags={<CaseFlags g={g} />} />
      <div
        className="grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,22rem)]"
        data-testid="case-cockpit"
      >
        <div className="space-y-3">
          <Panel
            title={t('case.citizen_words')}
            action={
              <span className="flex items-center gap-1.5">
                <Switch id="formal-toggle" checked={formal} onCheckedChange={setFormal} />
                <Label htmlFor="formal-toggle" className="text-xs">
                  {t('case.formal')}
                </Label>
              </span>
            }
          >
            <TranslationSplit text={text} codeMixed={g.is_code_mixed} />
            <p className="text-muted-foreground border-t pt-2 text-xs">
              {g.is_anonymous ? t('case.anonymous') : (g.citizen_display_name ?? t('case.anonymous'))}
              {' · '}
              {t(`case.sentiment.${g.sentiment}`)}
              {' · '}
              <time dateTime={g.created_at}>{fmt.dateTime(g.created_at)}</time>
            </p>
          </Panel>
          <Panel title={t('case.location')}>
            <MapView center={g.location} zoom={15} height={160} ariaLabel={t('case.location')}>
              <CircleMarker
                center={[g.location.lat, g.location.lng]}
                radius={9}
                pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.45 }}
              />
            </MapView>
            <p className="flex items-start gap-1.5 text-sm">
              <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
              {locationLine(g.location)}
            </p>
            {g.asset_id && (
              <p className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                <QrCode className="size-3.5" aria-hidden />
                {g.asset_id}
              </p>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <AIBriefCard id={g.id} />
          <Panel title={t('case.evidence')}>
            <EvidenceViewer media={g.media} />
          </Panel>
          <Panel title={t('case.messages')}>
            <MessageThread messages={g.messages} />
          </Panel>
          <Panel title={t('case.timeline')}>
            <AuditChain ref={chain} grievanceId={g.id} events={g.timeline} />
            <Timeline events={g.timeline} hideInternal={false} showChain reverse />
          </Panel>
        </div>

        <div className="space-y-3 lg:col-span-2 xl:col-span-1">
          <VerificationResult grievance={g} />
          {working && <StatusControl grievance={g} />}
          <ReplyComposer grievance={g} />
          <NoteForm id={g.id} />
          {canResolve(g.status) && <ResolveForm grievance={g} />}
          {working && <ReassignForm grievance={g} />}
          <Panel ai title={t('case.routing')}>
            <RoutingExplain routing={g.routing} />
          </Panel>
          <Panel title={t('case.priority')}>
            <PriorityFactorList factors={g.priority_factors} score={g.priority_score} />
            {lead && g.is_emergency && g.emergency_confirmed === null && <EmergencyDecision id={g.id} />}
          </Panel>
          <Panel title={t('case.sla')}>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('case.due')}</dt>
              <dd>{fmt.dateTime(g.sla.due_at)}</dd>
              <dt className="text-muted-foreground">{t('case.remaining')}</dt>
              <dd>
                <SLACountdownGov grievance={g} />
              </dd>
              {g.sla.eta_at && (
                <>
                  <dt className="text-muted-foreground">{t('case.eta')}</dt>
                  <dd>{fmt.dateTime(g.sla.eta_at)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('case.escalation')}</dt>
              <dd>
                <EscalationDots level={g.escalation_level} />
              </dd>
              <dt className="text-muted-foreground">{t('case.delay_risk')}</dt>
              <dd>{t(`case.risk.${g.sla.delay_risk}`)}</dd>
            </dl>
          </Panel>
        </div>
      </div>
      <p className="text-muted-foreground hidden text-[11px] lg:block">{t('case.keyboard_hint')}</p>
    </PageTransition>
  );
}
