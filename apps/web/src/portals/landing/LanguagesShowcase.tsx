// "One complaint, any language": the same complaint in 4 scripts + Tenglish converging into one structured card.
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import type { Lang } from '@contracts/types';
import { AIBadge, DepartmentBadge, LangBadge, PriorityChip } from '@/design/components';
import { easeOutExpo } from '@/design/motion';

// Synthetic sample content: one pothole complaint (master §15 story 2), as citizens might type it.
const VERSIONS: { lang: Lang; mixed?: boolean; text: string; dir?: 'rtl' }[] = [
  { lang: 'te', text: 'మియాపూర్ క్రాస్ రోడ్స్ దగ్గర రోడ్డుపై పెద్ద గుంత ఉంది.' },
  { lang: 'hi', text: 'मियापुर चौराहे पर सड़क में बड़ा गड्ढा है।' },
  { lang: 'ur', text: 'میاپور چوراہے پر سڑک میں بڑا گڑھا ہے۔', dir: 'rtl' },
  { lang: 'en', text: 'Huge pothole at Miyapur X Roads.' },
  { lang: 'te', mixed: true, text: 'Miyapur X roads lo pedda gunta undi' },
];

export function LanguagesShowcase() {
  const { t } = useTranslation('landing');
  return (
    <section className="mx-auto max-w-6xl overflow-x-clip px-4 py-20" aria-labelledby="langs-title">
      <header className="mb-10 max-w-2xl">
        <h2 id="langs-title" className="font-display text-3xl font-semibold md:text-4xl">
          {t('languages.title')}
        </h2>
        <p className="text-muted-foreground mt-2 text-lg">{t('languages.subtitle')}</p>
      </header>
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <ul className="min-w-0 space-y-2">
          {VERSIONS.map((v, i) => (
            <motion.li
              key={i}
              className="bg-surface flex items-center gap-3 rounded-2xl border px-4 py-3"
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: easeOutExpo }}
            >
              <LangBadge lang={v.lang} codeMixed={v.mixed} className="shrink-0" />
              <span lang={v.lang} dir={v.dir} className="min-w-0 flex-1 truncate">
                {v.text}
              </span>
            </motion.li>
          ))}
        </ul>
        <motion.div
          className="text-primary hidden justify-center lg:flex"
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          aria-hidden
        >
          <ArrowRight className="rtl-flip size-10" />
        </motion.div>
        <motion.div
          className="bg-surface shadow-glow-ai min-w-0 space-y-4 rounded-[var(--radius-xl)] border p-5"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, delay: 0.6, ease: easeOutExpo }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs font-medium">{t('languages.structured')}</p>
            <AIBadge variant="suggested" />
          </div>
          <p className="font-display text-xl font-semibold">{t('languages.card_title')}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{t('languages.department')}</dt>
              <dd className="mt-1">
                <DepartmentBadge department="roads" size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('languages.priority')}</dt>
              <dd className="mt-1">
                <PriorityChip priority="high" score={71} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('languages.ward')}</dt>
              <dd className="mt-1 font-medium">Miyapur · Serilingampally</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('languages.reports')}</dt>
              <dd className="tabular mt-1 font-mono font-medium">32</dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">{t('languages.merged_note')}</p>
        </motion.div>
      </div>
    </section>
  );
}
