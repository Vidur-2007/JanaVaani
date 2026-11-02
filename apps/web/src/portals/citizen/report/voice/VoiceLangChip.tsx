// Voice language chip: the user's language by default, any deep language, or Auto-detect (→ server transcription).
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Wand2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design/ui/dropdown-menu';
import { DEEP_LANGS, LANGUAGE_NAMES } from '@/lib/i18n';
import type { VoiceLang } from './useVoiceInput';

export function VoiceLangChip({ value, onChange, disabled }: { value: VoiceLang; onChange: (v: VoiceLang) => void; disabled?: boolean }) {
  const { t } = useTranslation('citizen');
  const label = value === 'auto' ? t('voice.auto') : LANGUAGE_NAMES[value].native;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur"
        aria-label={t('voice.language')}
        data-testid="voice-lang"
      >
        {value === 'auto' && <Wand2 className="size-4" aria-hidden />}
        <span lang={value === 'auto' ? undefined : value}>{label}</span>
        <ChevronDown className="size-4 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="z-[120]">
        {(['auto', ...DEEP_LANGS] as VoiceLang[]).map((l) => (
          <DropdownMenuItem key={l} onSelect={() => onChange(l)} className="min-h-11 justify-between gap-6" data-testid={`voice-lang-${l}`}>
            <span lang={l === 'auto' ? undefined : l}>{l === 'auto' ? t('voice.auto') : LANGUAGE_NAMES[l].native}</span>
            {value === l && <Check className="text-primary size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
