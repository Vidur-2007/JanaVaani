// Placeholder for gov pages scheduled in later phases.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { EmptyState, PageTransition } from '@/design/components';

export function GovPlaceholder({ titleKey, children }: { titleKey: string; children?: ReactNode }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const { pathname } = useLocation();
  return (
    <PageTransition className="space-y-6">
      <header data-testid="gov-placeholder">
        <h1 className="font-display text-2xl font-semibold">{t(titleKey)}</h1>
        <p className="text-muted-foreground font-mono text-sm">{pathname}</p>
      </header>
      {children ?? (
        <EmptyState
          icon={Construction}
          title={tc('placeholder.coming_soon')}
          description={tc('placeholder.owner', { owner: 'C' })}
        />
      )}
    </PageTransition>
  );
}
