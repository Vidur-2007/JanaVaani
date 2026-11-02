// P0 onboarding: language choice. P1 adds consent + accessibility steps (Spec A §5.2).
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design/ui/button';
import { LanguageSwitcher, PageTransition } from '@/design/components';
import { usePrefs } from '@/lib/prefs/store';

export default function Onboarding() {
  const { t } = useTranslation('citizen');
  const set = usePrefs((s) => s.set);
  const navigate = useNavigate();
  return (
    <PageTransition className="mx-auto max-w-md space-y-6 text-center">
      <h1 className="font-display text-2xl font-semibold">{t('onboarding.title')}</h1>
      <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
      <LanguageSwitcher variant="inline" className="justify-center" />
      <Button
        className="touch-target w-full"
        onClick={() => {
          set({ onboarded: true });
          navigate('/app');
        }}
      >
        {t('onboarding.start')}
      </Button>
    </PageTransition>
  );
}
