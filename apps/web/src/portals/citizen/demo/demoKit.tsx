// P7: demo-path helpers (master §16), shown only when VITE_DEMO_MODE=true. They pre-fill the exact rehearsed
// inputs so the live demo never depends on typing speed, stage Wi-Fi or a flaky microphone. Nothing is sent
// automatically: the presenter still presses Send / Confirm.
import { useTranslation } from 'react-i18next';
import { Clapperboard } from 'lucide-react';
import type { Location } from '@contracts/types';
import { DEMO_MODE } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Exact demo inputs. The live-wire phrase is the one B's emergency rules match (కరెంట్ తీగ / తీగ తెగి). */
export const DEMO_PHRASES = {
  live_wire: {
    lang: 'te',
    text: 'మా స్కూల్ దగ్గర కరెంట్ తీగ తెగి రోడ్డుపై పడింది, పిల్లలు అటుగా వెళ్తున్నారు',
  },
  pothole: { lang: 'en', text: 'Miyapur X roads lo pedda gunta undi' },
  water: { lang: 'ur', text: 'فلک نما میں تین دن سے نل کا پانی گندا اور بدبودار آ رہا ہے' },
} as const;
export type DemoPhraseKey = keyof typeof DEMO_PHRASES;

/**
 * Miyapur X Roads as the demo data places it: within ~70 m of the seeded 32-report pothole incident in both the
 * mocks (17.4968, 78.3614) and B's seed (ward centroid + 0.0012/0.0008), so the duplicate check finds it.
 */
export const DEMO_MIYAPUR: Location = {
  lat: 17.4974,
  lng: 78.3617,
  address: 'Miyapur X Roads',
  landmark: 'Miyapur X Roads',
  source: 'pin',
  accuracy_m: 10,
};

/** Kukatpally school lane (live-wire story, master §15.1). */
export const DEMO_KUKATPALLY: Location = {
  lat: 17.4849,
  lng: 78.4138,
  address: 'Near ZPHS School, Kukatpally',
  landmark: 'ZPHS School',
  source: 'pin',
  accuracy_m: 10,
};

export const DEMO_STREETLIGHT_CASES = ['GRV-2026-000645', 'GRV-2026-000119'] as const;

/** The synthetic pothole photo bundled in /public/demo (generated, no real imagery). */
export async function loadDemoPhoto(): Promise<File> {
  const res = await fetch('/demo/pothole-miyapur.jpg');
  const blob = await res.blob();
  return new File([blob], 'pothole-miyapur.jpg', { type: 'image/jpeg' });
}

export const demoEnabled = () => DEMO_MODE;

/** Small dashed "demo" chips. Renders nothing outside demo mode. */
export function DemoChips({
  keys,
  onPick,
  className,
}: {
  keys: DemoPhraseKey[];
  onPick: (key: DemoPhraseKey) => void;
  className?: string;
}) {
  const { t } = useTranslation('citizen');
  if (!DEMO_MODE) return null;
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label={t('demo.inputs')}
      data-testid="demo-chips"
    >
      <Clapperboard className="text-muted-foreground size-4" aria-hidden />
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPick(k)}
          className="jv-press text-muted-foreground hover:text-text hover:border-primary/50 min-h-9 rounded-full border border-dashed px-3 text-xs font-medium"
          data-testid={`demo-${k}`}
        >
          {t(`demo.${k}`)}
        </button>
      ))}
    </div>
  );
}
