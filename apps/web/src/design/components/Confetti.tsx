// P7: a short, tasteful confetti burst (canvas, no dependency). Brand colours, ~1.8 s, pointer-events off,
// aria-hidden. Renders nothing under reduced motion (OS setting or the in-app toggle) or high contrast.
import { useEffect, useRef } from 'react';
import { usePrefs, useReducedMotion } from '@/lib/prefs/store';

const COLORS = ['--primary', '--accent', '--success', '--warning', '--ai'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  w: number;
  h: number;
  color: string;
}

export function Confetti({ pieces = 90, origin = { x: 0.5, y: 0.35 } }: { pieces?: number; origin?: { x: number; y: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const contrast = usePrefs((s) => s.contrast);
  const off = reduced || contrast === 'high';

  useEffect(() => {
    const canvas = ref.current;
    if (off || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const palette = COLORS.map((c) => css.getPropertyValue(c).trim() || '#ff7a1a');
    const ox = W * origin.x;
    const oy = H * origin.y;
    const bits: Bit[] = Array.from({ length: pieces }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 7 + Math.random() * 7;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        color: palette[i % palette.length],
      };
    });
    const start = performance.now();
    const DURATION = 1800;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > DURATION - 500 ? Math.max(0, (DURATION - t) / 500) : 1;
      for (const b of bits) {
        b.vy += 0.32; // gravity
        b.vx *= 0.985; // air
        b.vy *= 0.985;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.spin;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.scale(1, Math.cos(b.r * 2)); // tumbling paper
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [off, pieces, origin.x, origin.y]);

  if (off) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[200] size-full" aria-hidden data-testid="confetti" />;
}
