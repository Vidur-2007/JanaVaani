// Four portal cards with a 3D tilt on hover (pointer devices only; disabled under reduced motion).
import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { ArrowRight, Building2, Globe2, Landmark, UserRound } from 'lucide-react';
import { useReducedMotion } from '@/lib/prefs/store';

const PORTALS: { key: string; to: string; icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }[] = [
  { key: 'citizen', to: '/app', icon: UserRound, tone: 'var(--primary)' },
  { key: 'officer', to: '/officer', icon: Building2, tone: 'var(--accent)' },
  { key: 'admin', to: '/admin', icon: Landmark, tone: 'var(--ai)' },
  { key: 'public', to: '/public', icon: Globe2, tone: 'var(--success)' },
];

function TiltCard({ portal }: { portal: (typeof PORTALS)[number] }) {
  const { t } = useTranslation('landing');
  const reduced = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 300, damping: 25 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 300, damping: 25 });
  const glow = useTransform(
    [mx, my],
    ([x, y]) =>
      `radial-gradient(240px circle at ${(x as number) * 100}% ${(y as number) * 100}%, color-mix(in oklab, ${portal.tone} 22%, transparent), transparent 70%)`,
  );
  const Icon = portal.icon;
  return (
    <motion.div style={{ perspective: 900 }} className="h-full">
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={(e) => {
          if (reduced || e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width);
          my.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          mx.set(0.5);
          my.set(0.5);
        }}
        className="group relative h-full"
      >
        <Link
          to={portal.to}
          className="bg-surface relative flex h-full min-h-56 flex-col overflow-hidden rounded-[var(--radius-xl)] border p-6"
          data-testid={`portal-${portal.key}`}
        >
          <motion.span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: glow }}
            aria-hidden
          />
          <Icon className="relative size-8" style={{ color: portal.tone }} aria-hidden />
          <p className="font-display relative mt-auto pt-10 text-xl font-semibold">{t(`portals.${portal.key}`)}</p>
          <p className="text-muted-foreground relative text-sm">{t(`portals.${portal.key}_desc`)}</p>
          <ArrowRight className="rtl-flip text-muted-foreground group-hover:text-text relative mt-4 size-5 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden />
        </Link>
      </motion.div>
    </motion.div>
  );
}

export function Portals() {
  const { t } = useTranslation('landing');
  return (
    <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="portals-title">
      <h2 id="portals-title" className="font-display mb-8 text-3xl font-semibold md:text-4xl">
        {t('portals.title')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PORTALS.map((p) => (
          <TiltCard key={p.key} portal={p} />
        ))}
      </div>
    </section>
  );
}
