// Spec A §8: mascot-free onboarding illustrations — inline SVG in theme tokens (work in Ink, Paper and high
// contrast), drawn in with a stroke animation, a gentle float, decorative only (aria-hidden).
import { motion } from 'motion/react';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

type Kind = 'language' | 'consent' | 'access';

const draw = (delay = 0) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export function OnboardingArt({ kind, className }: { kind: Kind; className?: string }) {
  const reduced = useReducedMotion();
  const float = reduced
    ? {}
    : {
        animate: { y: [0, -4, 0] },
        transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
      };
  const d = (delay: number) => (reduced ? {} : draw(delay));
  return (
    <motion.svg
      viewBox="0 0 160 96"
      className={cn('h-24 w-40', className)}
      aria-hidden
      data-testid={`onb-art-${kind}`}
      {...float}
    >
      <defs>
        <radialGradient id={`onb-glow-${kind}`} cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="52" rx="74" ry="42" fill={`url(#onb-glow-${kind})`} />
      {kind === 'language' && (
        <g fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {[
            { x: 14, y: 14, c: 'var(--primary)', g: 'ఆ' },
            { x: 58, y: 6, c: 'var(--accent)', g: 'अ' },
            { x: 102, y: 16, c: 'var(--ai)', g: 'ع' },
            { x: 58, y: 52, c: 'var(--success)', g: 'A' },
          ].map((b, i) => (
            <g key={b.g}>
              <motion.path
                d={`M${b.x} ${b.y + 4}a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H${b.x + 14}l-6 6v-6h-4a4 4 0 0 1-4-4z`}
                stroke={b.c}
                {...d(i * 0.15)}
              />
              <motion.text
                x={b.x + 22}
                y={b.y + 20}
                textAnchor="middle"
                fontSize="15"
                fontWeight="600"
                fill={b.c}
                stroke="none"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.15 }}
              >
                {b.g}
              </motion.text>
            </g>
          ))}
        </g>
      )}
      {kind === 'consent' && (
        <g fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M80 10l30 11v22c0 20-13 33-30 41-17-8-30-21-30-41V21z"
            stroke="var(--accent)"
            {...d(0)}
          />
          <motion.path d="M66 50l10 10 20-22" stroke="var(--success)" strokeWidth="4" {...d(0.5)} />
          <motion.path
            d="M124 54h18v16h-18zM127 54v-5a6 6 0 0 1 12 0v5"
            stroke="var(--primary)"
            strokeWidth="2.5"
            {...d(0.3)}
          />
          <motion.path
            d="M18 60c6-9 14-9 20 0M14 52c9-14 23-14 32 0"
            stroke="var(--ai)"
            strokeWidth="2.5"
            {...d(0.4)}
          />
        </g>
      )}
      {kind === 'access' && (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <motion.text
            x="52"
            y="64"
            textAnchor="middle"
            fontSize="44"
            fontWeight="700"
            fill="var(--text)"
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* i18n-ignore: decorative type sample in an aria-hidden illustration */}
            Aa
          </motion.text>
          <motion.circle cx="112" cy="38" r="16" stroke="var(--text)" strokeWidth="3" {...d(0.2)} />
          <path d="M112 22a16 16 0 0 1 0 32z" fill="var(--text)" />
          <motion.path
            d="M100 72c4 6 20 6 24 0M96 64c7 12 25 12 32 0"
            stroke="var(--primary)"
            strokeWidth="2.5"
            {...d(0.5)}
          />
          <motion.path
            d="M136 70v8M141 66v16M146 70v8"
            stroke="var(--accent)"
            strokeWidth="2.5"
            {...d(0.7)}
          />
        </g>
      )}
    </motion.svg>
  );
}
