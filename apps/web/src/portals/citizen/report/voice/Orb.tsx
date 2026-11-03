// Voice Orb wrapper: WebGL orb when available (lazy), CSS orb under reduced motion / no WebGL / while loading.
// The orb is also the tap target that ends a turn or starts listening.
import { lazy, Suspense, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useReducedMotion } from '@/lib/prefs/store';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const VoiceOrbGL = lazy(() => import('./VoiceOrbGL'));

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

const CSS_TONE: Record<OrbState, string> = {
  idle: 'from-[#3E5480] to-[#22D3C5]',
  listening: 'from-[#FF7A1A] to-[#FFC23D]',
  thinking: 'from-[#4F56E8] to-[#7C83FF]',
  speaking: 'from-[#0E9F94] to-[#22D3C5]',
};

/** CSS fallback: a gradient sphere whose scale follows the level (read each frame, no React re-render). */
export function CssOrb({ levelRef, state }: { levelRef: MutableRefObject<number>; state: OrbState }) {
  const el = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    let raf = 0;
    let s = 0;
    const loop = () => {
      const target = state === 'listening' ? levelRef.current : state === 'thinking' ? 0.2 : state === 'speaking' ? 0.25 : 0;
      s += (target - s) * 0.2;
      if (el.current) el.current.style.transform = `scale(${1 + (reduced ? s * 0.15 : s * 0.45)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, state, reduced]);
  return (
    <div className="grid size-full place-items-center" aria-hidden>
      <div
        ref={el}
        className={cn('size-[62%] rounded-full bg-gradient-to-br shadow-[0_0_80px_-10px_currentColor] transition-colors duration-500', CSS_TONE[state])}
        style={{ color: state === 'listening' ? '#FF7A1A' : '#22D3C5' }}
      />
    </div>
  );
}

export function Orb({ levelRef, state, className }: { levelRef: MutableRefObject<number>; state: OrbState; className?: string }) {
  const reduced = useReducedMotion();
  const [gl] = useState(hasWebGL);
  const fallback = <CssOrb levelRef={levelRef} state={state} />;
  return (
    <div className={cn('relative', className)} data-testid="voice-orb" data-state={state}>
      {gl && !reduced ? (
        <Suspense fallback={fallback}>
          <VoiceOrbGL levelRef={levelRef} state={state} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
