// PLACEHOLDER page used by the P0 gov stubs — Laptop C replaces each page.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { EmptyState, PageTransition } from '@/design/components';

export function GovPlaceholder({ titleKey, children }: { titleKey: string; children?: ReactNode }) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  return (
    <PageTransition className="space-y-6">
      <header data-testid="gov-placeholder">
        <h1 className="font-display text-2xl font-semibold">{t(titleKey)}</h1>
        <p className="text-muted-foreground font-mono text-sm">{pathname}</p>
      </header>
      {children ?? <EmptyState icon={Construction} title={t('placeholder.coming_soon')} description={t('placeholder.owner', { owner: 'C' })} />}
    </PageTransition>
  );
}
