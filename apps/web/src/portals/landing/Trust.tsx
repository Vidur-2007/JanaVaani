// Trust section: citizen-verified closure, AI verification, tamper-evident audit, privacy — each with a micro-animation.
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { BadgeCheck, EyeOff, Link2, ScanSearch } from 'lucide-react';
import { easeOutExpo } from '@/design/motion';
import { useReducedMotion } from '@/lib/prefs/store';

function VerifiedAnim() {
  return (
    <svg viewBox="0 0 64 64" className="text-success size-16" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="currentColor" opacity=".12" />
      <motion.path
        d="M20 33 l8 8 l16 -18"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.2 }}
      />
    </svg>
  );
}

function ScanAnim() {
  const reduced = useReducedMotion();
  return (
    <div className="bg-ai/10 relative size-16 overflow-hidden rounded-2xl" aria-hidden>
      <ScanSearch className="text-ai absolute inset-0 m-auto size-8" />
      {!reduced && (
        <motion.span
          className="bg-ai/70 absolute inset-x-0 h-0.5 shadow-[0_0_12px_var(--ai)]"
          animate={{ top: ['10%', '90%', '10%'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}

function ChainAnim() {
  return (
    <div className="flex h-16 items-center gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="grid size-9 place-items-center rounded-lg border"
          initial={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          whileInView={{ borderColor: 'var(--success)', color: 'var(--success)' }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.25, duration: 0.3 }}
        >
          <Link2 className="size-4" />
        </motion.span>
      ))}
    </div>
  );
}

function PrivacyAnim() {
  return (
    <div className="relative grid size-16 place-items-center" aria-hidden>
      <motion.span
        className="bg-signal/20 absolute inset-0 rounded-2xl"
        initial={{ filter: 'blur(0px)', opacity: 0.4 }}
        whileInView={{ filter: 'blur(6px)', opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <EyeOff className="text-signal relative size-8" />
    </div>
  );
}

const ITEMS = [
  { key: 'verified', Anim: VerifiedAnim, Icon: BadgeCheck },
  { key: 'ai_check', Anim: ScanAnim, Icon: ScanSearch },
  { key: 'audit', Anim: ChainAnim, Icon: Link2 },
  { key: 'privacy', Anim: PrivacyAnim, Icon: EyeOff },
] as const;

export function Trust() {
  const { t } = useTranslation('landing');
  return (
    <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="trust-title">
      <header className="mb-10 max-w-2xl">
        <h2 id="trust-title" className="font-display text-3xl font-semibold md:text-4xl">
          {t('trust.title')}
        </h2>
        <p className="text-muted-foreground mt-2 text-lg">{t('trust.subtitle')}</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ key, Anim }, i) => (
          <motion.li
            key={key}
            className="bg-surface space-y-4 rounded-[var(--radius-xl)] border p-5"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: easeOutExpo }}
          >
            <Anim />
            <h3 className="font-display text-lg font-semibold">{t(`trust.items.${key}.title`)}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{t(`trust.items.${key}.body`)}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
