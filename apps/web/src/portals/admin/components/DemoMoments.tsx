// One-click jumps to the master §16 moments. Targets come from live alerts, so they work on any seed.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BrainCircuit, CircleAlert, ShieldAlert, Siren, TrendingUp } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { api, qk } from '@/lib/api/endpoints';
import { Panel } from '@/portals/gov-shared/components/Panel';

export function DemoMoments() {
  const { t } = useTranslation('gov');
  const alerts = useQuery({ queryKey: qk.admin.alerts, queryFn: ({ signal }) => api.alerts(signal) });
  const first = (kind: string) => alerts.data?.find((a) => a.kind === kind)?.grievance_ids[0];
  const suspicious = first('suspicious_closure');
  const emergency = first('emergency_unconfirmed');
  const moments = [
    { key: 'inbox', icon: CircleAlert, to: '/officer' },
    { key: 'suspicious', icon: ShieldAlert, to: suspicious ? `/officer/case/${suspicious}` : '/supervisor?kind=disputed' },
    { key: 'emergency', icon: Siren, to: emergency ? `/officer/case/${emergency}` : '/supervisor?kind=emergency' },
    { key: 'spike', icon: TrendingUp, to: '/admin/alerts' },
    { key: 'ai', icon: BrainCircuit, to: '/admin/ai' },
  ];
  return (
    <Panel title={t('demo.moments')} className="lg:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="demo-moments">
        {moments.map((m) => (
          <Button key={m.key} asChild variant="outline" size="sm" className="min-h-11 justify-start md:min-h-9">
            <Link to={m.to} data-testid={`moment-${m.key}`}>
              <m.icon className="size-4" aria-hidden />
              {t(`demo.moment.${m.key}`)}
            </Link>
          </Button>
        ))}
      </div>
    </Panel>
  );
}
