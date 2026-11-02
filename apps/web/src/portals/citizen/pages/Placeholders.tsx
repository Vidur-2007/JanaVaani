// Placeholders for citizen screens built in later phases (guide: P5).
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';
import { EmptyState, PageTransition } from '@/design/components';

function Placeholder({ titleKey, testId }: { titleKey: string; testId: string }) {
  const { t } = useTranslation('common');
  const { id } = useParams();
  return (
    <PageTransition className="space-y-4">
      <div data-testid={testId}>
        <h1 className="font-display text-2xl font-semibold">{t(titleKey)}</h1>
        <EmptyState
          icon={Construction}
          title={t('placeholder.coming_soon')}
          description={id ? id : t('placeholder.owner', { owner: 'A' })}
        />
      </div>
    </PageTransition>
  );
}

export const Guide = () => <Placeholder titleKey="nav.guide" testId="page-guide" />;
