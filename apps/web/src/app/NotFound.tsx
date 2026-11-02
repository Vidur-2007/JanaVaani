import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { PageTransition } from '@/design/components';

export default function NotFound() {
  const { t } = useTranslation('common');
  return (
    <PageTransition className="grid min-h-[70dvh] place-items-center p-6">
      <div className="max-w-md space-y-4 text-center" data-testid="not-found">
        <div className="bg-surface-2 mx-auto grid size-16 place-items-center rounded-3xl">
          <Compass className="text-primary size-8" aria-hidden />
        </div>
        <p className="text-muted-foreground font-mono text-sm">404</p>
        <h1 className="font-display text-2xl font-semibold">{t('errors.not_found_title')}</h1>
        <p className="text-muted-foreground">{t('errors.not_found_body')}</p>
        <Button asChild className="touch-target">
          <Link to="/">{t('actions.go_home')}</Link>
        </Button>
      </div>
    </PageTransition>
  );
}
