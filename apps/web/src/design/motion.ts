// Motion presets — master spec §11. Only animate transform, opacity and filter.
import type { Transition, Variants } from 'motion/react';

export const durations = { fast: 0.15, base: 0.25, slow: 0.4, slower: 0.7 } as const;
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const spring = { type: 'spring', stiffness: 400, damping: 30 } as const satisfies Transition;
export const countUpMs = 900;
export const staggerMs = 40;
export const maxStaggered = 12;

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.35, ease: easeOutExpo } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.2, ease: easeOutExpo } },
};

/** Reduced-motion variant: crossfade only. */
export const pageTransitionReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.slow, ease: easeOutExpo } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.base } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: spring },
};

/** Parent variant that staggers children by 40 ms. Children beyond `maxStaggered` should not animate. */
export const stagger = (delayChildren = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: staggerMs / 1000, delayChildren } },
});

/** Use on list items: `custom={index}`; items past the 12th appear without animation. */
export const listItem: Variants = {
  initial: (i: number = 0) => (i < maxStaggered ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }),
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easeOutExpo } },
};

/** Scroll reveal props (play once). Spread onto a motion element. */
export const reveal = {
  initial: 'initial',
  whileInView: 'animate',
  viewport: { once: true, amount: 0.25 },
  variants: fadeUp,
} as const;

export const pressable = { whileTap: { scale: 0.97 }, transition: spring } as const;
