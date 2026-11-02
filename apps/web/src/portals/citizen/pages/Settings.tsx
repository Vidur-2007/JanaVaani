// P0 settings: language + accessibility toggles wired to the prefs store (Spec A §5.16 — P1 completes it).
import { useTranslation } from 'react-i18next';
import { Switch } from '@/design/ui/switch';
import { Label } from '@/design/ui/label';
import { LanguageSwitcher, PageTransition, ThemeToggle } from '@/design/components';
import { usePrefs } from '@/lib/prefs/store';

export default function Settings() {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const p = usePrefs();
  const toggles = [
    { id: 'contrast', label: t('settings.high_contrast'), checked: p.contrast === 'high', set: (v: boolean) => p.set({ contrast: v ? 'high' : 'normal' }) },
    { id: 'font', label: t('settings.large_text'), checked: p.font === 'large', set: (v: boolean) => p.set({ font: v ? 'large' : 'normal' }) },
    { id: 'motion', label: t('settings.reduced_motion'), checked: p.motion === 'reduced', set: (v: boolean) => p.set({ motion: v ? 'reduced' : 'system' }) },
    { id: 'simple', label: t('settings.simple_mode'), checked: p.simple_mode, set: (v: boolean) => p.set({ simple_mode: v }) },
  ];
  return (
    <PageTransition className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{tc('nav.settings')}</h1>
      <section className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4">
        <h2 className="font-display font-semibold">{t('settings.language')}</h2>
        <LanguageSwitcher variant="inline" />
      </section>
      <section className="bg-surface divide-y rounded-[var(--radius-lg)] border">
        <div className="flex items-center justify-between gap-4 p-4">
          <h2 className="font-display font-semibold">{t('settings.appearance')}</h2>
          <ThemeToggle />
        </div>
        {toggles.map((x) => (
          <div key={x.id} className="flex min-h-14 items-center justify-between gap-4 px-4">
            <Label htmlFor={`pref-${x.id}`} className="flex-1 text-base">
              {x.label}
            </Label>
            <Switch id={`pref-${x.id}`} checked={x.checked} onCheckedChange={x.set} />
          </div>
        ))}
      </section>
    </PageTransition>
  );
}
