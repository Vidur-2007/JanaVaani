// Settings (Spec A §5.16): language, display, low-literacy, voice, privacy, AI transparency.
// Everything persists via the prefs store and applies globally (data-* attributes on <html>).
import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Accessibility,
  Bot,
  Contrast,
  EyeOff,
  Gauge,
  Languages,
  MapPin,
  Mic,
  MonitorSmartphone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Type,
  UserCheck,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { DeepLang } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Slider } from '@/design/ui/slider';
import { Switch } from '@/design/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';
import { AIBadge, LanguageSwitcher, ListenButton, PageTransition } from '@/design/components';
import { DEEP_LANGS, LANGUAGE_NAMES, setLanguage } from '@/lib/i18n';
import { usePrefs, type MotionPref, type ThemePref } from '@/lib/prefs/store';
import { hasBrowserVoice } from '@/lib/tts/useSpeak';
import { cn } from '@/lib/utils';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function Section({ id, icon: Icon, title, children }: { id: string; icon: Icon; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby={`set-${id}`}>
      <h2 id={`set-${id}`} className="font-display flex items-center gap-2 text-lg font-semibold">
        <Icon className="text-primary size-5" aria-hidden />
        {title}
      </h2>
      <div className="bg-surface divide-y rounded-[var(--radius-lg)] border">{children}</div>
    </section>
  );
}

function Row({ id, icon: Icon, label, hint, children }: { id?: string; icon?: Icon; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {Icon && <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />}
      {/* min width: wide controls (toggle groups) wrap under the label instead of crushing it */}
      <div className="min-w-[10rem] flex-1">
        <Label htmlFor={id} className="text-base">
          {label}
        </Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SwitchRow({ id, icon, label, hint, checked, onChange }: { id: string; icon?: Icon; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row id={id} icon={icon} label={label} hint={hint}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={`pref-${id}`} />
    </Row>
  );
}

type PermState = PermissionState | 'unsupported';
function usePermission(name: 'geolocation' | 'microphone'): PermState {
  const [state, setState] = useState<PermState>('unsupported');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state);
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener('change', update);
      })
      .catch(() => setState('unsupported'));
    return () => status?.removeEventListener('change', update);
  }, [name]);
  return state;
}

function PermissionBadge({ state }: { state: PermState }) {
  const { t } = useTranslation('citizen');
  const tone = state === 'granted' ? 'bg-success/12 text-success' : state === 'denied' ? 'bg-danger/12 text-danger' : 'bg-surface-2 text-muted-foreground';
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', tone)}>{t(`settings.perm.${state}`)}</span>;
}

function VoiceAvailability() {
  const { t } = useTranslation('citizen');
  const [avail, setAvail] = useState<Partial<Record<DeepLang, boolean>>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(DEEP_LANGS.map(async (l) => [l, await hasBrowserVoice(l)] as const)).then((r) => alive && setAvail(Object.fromEntries(r)));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="px-4 py-3">
      <p className="text-muted-foreground mb-2 text-xs">{t('settings.voice_available')}</p>
      <ul className="flex flex-wrap gap-2">
        {DEEP_LANGS.map((l) => (
          <li
            key={l}
            lang={l}
            className={cn('rounded-full border px-3 py-1 text-sm', avail[l] ? 'border-success/40 text-success' : 'text-muted-foreground')}
            title={avail[l] ? t('settings.voice_yes') : t('settings.voice_no')}
          >
            {LANGUAGE_NAMES[l].native} {avail[l] === undefined ? '…' : avail[l] ? '✓' : '—'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const p = usePrefs();
  const navigate = useNavigate();
  const geo = usePermission('geolocation');
  const mic = usePermission('microphone');
  const ui = (i18n.resolvedLanguage ?? 'en') as DeepLang;

  return (
    <PageTransition className="max-w-2xl space-y-8">
      <h1 className="font-display text-2xl font-semibold md:text-3xl">{tc('nav.settings')}</h1>

      {/* ---- Language */}
      <Section id="language" icon={Languages} title={t('settings.language')}>
        <div className="space-y-2 px-4 py-3">
          <p className="font-medium">{t('settings.ui_language')}</p>
          <LanguageSwitcher variant="inline" />
        </div>
        <div className="space-y-2 px-4 py-3">
          <p className="font-medium">{t('settings.reply_language')}</p>
          <p className="text-muted-foreground text-xs">{t('settings.reply_language_hint')}</p>
          <ToggleGroup
            type="single"
            value={p.reply_lang}
            onValueChange={(v) => v && p.set({ reply_lang: v as DeepLang | 'ui' })}
            className="flex-wrap justify-start"
            aria-label={t('settings.reply_language')}
          >
            <ToggleGroupItem value="ui" className="h-11 px-3">
              {t('settings.same_as_screen')}
            </ToggleGroupItem>
            {DEEP_LANGS.map((l) => (
              <ToggleGroupItem key={l} value={l} lang={l} className="h-11 px-3">
                {LANGUAGE_NAMES[l].native}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </Section>

      {/* ---- Display */}
      <Section id="display" icon={MonitorSmartphone} title={t('settings.appearance')}>
        <Row label={t('settings.theme')}>
          <ToggleGroup type="single" value={p.theme} onValueChange={(v) => v && p.set({ theme: v as ThemePref })} aria-label={t('settings.theme')}>
            {(['auto', 'paper', 'ink'] as const).map((v) => (
              <ToggleGroupItem key={v} value={v} className="h-11 px-3" data-testid={`theme-${v}`}>
                {t(`settings.theme_${v}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        <SwitchRow id="font" icon={Type} label={t('settings.large_text')} checked={p.font === 'large'} onChange={(v) => p.set({ font: v ? 'large' : 'normal' })} />
        <SwitchRow
          id="contrast"
          icon={Contrast}
          label={t('settings.high_contrast')}
          checked={p.contrast === 'high'}
          onChange={(v) => p.set({ contrast: v ? 'high' : 'normal' })}
        />
        <Row icon={Gauge} label={t('settings.reduced_motion')} hint={t('settings.motion_hint')}>
          <ToggleGroup type="single" value={p.motion} onValueChange={(v) => v && p.set({ motion: v as MotionPref })} aria-label={t('settings.reduced_motion')}>
            {(['system', 'reduced', 'full'] as const).map((v) => (
              <ToggleGroupItem key={v} value={v} className="h-11 px-3">
                {t(`settings.motion_${v}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Row>
        <SwitchRow
          id="simple"
          icon={Wand2}
          label={t('settings.simple_mode')}
          hint={t('settings.simple_hint')}
          checked={p.simple_mode}
          onChange={(v) => p.set({ simple_mode: v })}
        />
      </Section>

      {/* ---- Low literacy */}
      <Section id="literacy" icon={Accessibility} title={t('settings.low_literacy')}>
        <SwitchRow
          id="low_literacy"
          label={t('settings.low_literacy')}
          hint={t('settings.low_literacy_hint')}
          checked={p.low_literacy}
          // Low-literacy implies voice-first input and spoken bot replies.
          onChange={(v) => p.set(v ? { low_literacy: true, voice_first: true, voice_autoplay: true } : { low_literacy: false })}
        />
        {p.low_literacy && (
          <ul className="text-muted-foreground grid gap-1 px-4 py-3 text-sm">
            {(['one_question', 'icons', 'auto_tts', 'big_buttons'] as const).map((k) => (
              <li key={k}>• {t(`settings.ll.${k}`)}</li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- Voice */}
      <Section id="voice" icon={Volume2} title={t('settings.voice')}>
        <SwitchRow
          id="voice_first"
          icon={Mic}
          label={t('settings.voice_first')}
          hint={t('settings.voice_first_hint')}
          checked={p.voice_first}
          onChange={(v) => p.set({ voice_first: v })}
        />
        <SwitchRow
          id="voice_autoplay"
          icon={Volume2}
          label={t('settings.autoplay')}
          hint={t('settings.autoplay_hint')}
          checked={p.voice_autoplay}
          onChange={(v) => p.set({ voice_autoplay: v })}
        />
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="tts-rate" className="text-base">
              {t('settings.speech_rate')}
            </Label>
            <span className="tabular font-mono text-sm">{p.tts_rate.toFixed(1)}×</span>
          </div>
          <Slider
            id="tts-rate"
            min={0.6}
            max={1.4}
            step={0.1}
            value={[p.tts_rate]}
            onValueChange={([v]) => p.set({ tts_rate: v })}
            aria-label={t('settings.speech_rate')}
          />
          <ListenButton text={t('settings.voice_sample')} lang={ui} variant="outline" />
        </div>
        <VoiceAvailability />
      </Section>

      {/* ---- Privacy */}
      <Section id="privacy" icon={ShieldCheck} title={t('settings.privacy')}>
        <div className="space-y-2 px-4 py-3 text-sm leading-relaxed">
          <p className="font-medium">{t('settings.what_we_store')}</p>
          <p className="text-muted-foreground">{t('onboarding.consent.store')}</p>
        </div>
        <SwitchRow
          id="anonymous_default"
          icon={EyeOff}
          label={t('settings.anonymous_default')}
          hint={t('settings.anonymous_hint')}
          checked={p.anonymous_default}
          onChange={(v) => p.set({ anonymous_default: v })}
        />
        <Row icon={MapPin} label={t('onboarding.consent_location')} hint={t('settings.perm_hint')}>
          <PermissionBadge state={geo} />
          <Switch id="consent_location" checked={p.consent_location === true} onCheckedChange={(v) => p.set({ consent_location: v })} aria-label={t('onboarding.consent_location')} />
        </Row>
        <Row icon={Mic} label={t('onboarding.consent_microphone')} hint={t('settings.perm_hint')}>
          <PermissionBadge state={mic} />
          <Switch id="consent_microphone" checked={p.consent_microphone === true} onCheckedChange={(v) => p.set({ consent_microphone: v })} aria-label={t('onboarding.consent_microphone')} />
        </Row>
      </Section>

      {/* ---- AI transparency */}
      <Section id="ai" icon={Bot} title={t('settings.ai_title')}>
        <div className="space-y-4 px-4 py-4 text-sm">
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="text-ai size-4" aria-hidden />
              {t('settings.ai_uses_title')}
            </p>
            <ul className="text-muted-foreground space-y-1">
              {(['translate', 'classify', 'priority', 'summarize', 'verify'] as const).map((k) => (
                <li key={k}>• {t(`settings.ai_uses.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <UserCheck className="text-signal size-4" aria-hidden />
              {t('settings.humans_title')}
            </p>
            <ul className="text-muted-foreground space-y-1">
              {(['emergency', 'critical', 'routing', 'closure'] as const).map((k) => (
                <li key={k}>• {t(`settings.humans.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AIBadge variant="approved" />
            <span className="text-muted-foreground text-xs">{t('settings.ai_badge_hint')}</span>
          </div>
          <p className="bg-warning/12 rounded-lg p-3 text-xs">{t('onboarding.synthetic_note')}</p>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="touch-target"
          onClick={() => {
            p.set({ onboarded: false });
            navigate('/onboarding?next=/app/settings');
          }}
        >
          <Languages className="size-4" aria-hidden />
          {t('settings.redo_onboarding')}
        </Button>
        <Button
          variant="ghost"
          className="touch-target"
          onClick={() => {
            p.reset();
            setLanguage(usePrefs.getState().ui_lang);
          }}
          data-testid="prefs-reset"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('settings.reset')}
        </Button>
      </div>
    </PageTransition>
  );
}
