// City Pulse (Spec A §5.1, master §11 signature moment 1): a 3D point cloud of Hyderabad.
// City "fabric" points are sampled around ward centroids; complaint points (from /public/map) glow by
// department. Ring pulses appear at a recent complaint every 2–4 s, with an occasional green "resolved" flash.
// Lazy-loaded (three.js is its own chunk). DPR ≤ 1.5, ≤ 8k points desktop / ≤ 2k mobile, paused off-screen.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DepartmentId, MapPoint, Ward } from '@contracts/types';

const CENTER = { lat: 17.405, lng: 78.46 };
const SCALE = 42; // degrees → scene units

export const toScene = (lat: number, lng: number): [number, number] => [(lng - CENTER.lng) * SCALE, -(lat - CENTER.lat) * SCALE];

const DEPT_HEX: Record<DepartmentId, string> = {
  roads: '#FF8A3D',
  sanitation: '#A3E635',
  water: '#38BDF8',
  streetlights: '#FACC15',
  power: '#F472B6',
  drainage: '#2DD4BF',
  traffic: '#FB7185',
  health: '#C084FC',
  education: '#60A5FA',
  town_planning: '#F59E0B',
  other: '#94A3B8',
};

/** Deterministic PRNG so the city looks the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

const vertex = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float phase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.6 + phase * 6.2831) * 0.04 * size;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.7 + phase * 40.0);
    gl_PointSize = size * uPixelRatio * (70.0 / -mv.z) * twinkle;
    vColor = color;
    vAlpha = clamp(size / 3.0, 0.25, 1.0);
  }
`;
const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, core * core * vAlpha);
  }
`;

function buildCloud(wards: Ward[], points: MapPoint[], budget: number) {
  const r = rng(20260101);
  const complaintCount = Math.min(points.length, Math.floor(budget * 0.15));
  const fabricCount = Math.max(0, budget - complaintCount);
  const total = fabricCount + complaintCount;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const size = new Float32Array(total);
  const phase = new Float32Array(total);
  const fabric = new THREE.Color('#8FA3C8');
  const fabric2 = new THREE.Color('#3E5480');
  const perWard = wards.length ? Math.floor(fabricCount / wards.length) : 0;
  let i = 0;
  for (const w of wards) {
    for (let k = 0; k < perWard && i < fabricCount; k++, i++) {
      const [x, z] = toScene(w.centroid.lat + gauss(r) * 0.011, w.centroid.lng + gauss(r) * 0.012);
      pos.set([x, 0, z], i * 3);
      const c = r() < 0.18 ? fabric : fabric2;
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = 0.9 + r() * 1.1;
      phase[i] = r();
    }
  }
  const tmp = new THREE.Color();
  for (let k = 0; k < complaintCount; k++, i++) {
    const p = points[k];
    const [x, z] = toScene(p.lat, p.lng);
    pos.set([x, 0.05, z], i * 3);
    tmp.set(DEPT_HEX[p.category] ?? DEPT_HEX.other);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
    size[i] = p.priority === 'critical' ? 5 : p.priority === 'high' ? 4 : 3.2;
    phase[i] = r();
  }
  return { pos: pos.subarray(0, i * 3), col: col.subarray(0, i * 3), size: size.subarray(0, i), phase: phase.subarray(0, i) };
}

function Cloud({ wards, points, budget }: { wards: Ward[]; points: MapPoint[]; budget: number }) {
  const { gl } = useThree();
  const mat = useRef<THREE.ShaderMaterial>(null);
  const cloud = useMemo(() => buildCloud(wards, points, budget), [wards, points, budget]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 1.5) } }), [gl]);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[cloud.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[cloud.col, 3]} />
        <bufferAttribute attach="attributes-size" args={[cloud.size, 1]} />
        <bufferAttribute attach="attributes-phase" args={[cloud.phase, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface Pulse {
  id: number;
  x: number;
  z: number;
  color: string;
  born: number;
  resolved: boolean;
}

/** Ring pulses at recent complaints every 2–4 s; ~1 in 4 is a green "resolved" flash. */
function Pulses({ points }: { points: MapPoint[] }) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const next = useRef(0.8);
  const seq = useRef(0);
  const r = useMemo(() => rng(7), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t > next.current && points.length) {
      next.current = t + 2 + r() * 2;
      const p = points[Math.floor(r() * points.length)];
      const [x, z] = toScene(p.lat, p.lng);
      const resolved = r() < 0.25;
      setPulses((cur) => [
        ...cur.filter((q) => t - q.born < 2.6),
        { id: seq.current++, x, z, color: resolved ? '#2BD67B' : DEPT_HEX[p.category], born: t, resolved },
      ]);
    }
  });
  return (
    <>
      {pulses.map((p) => (
        <Ring key={p.id} pulse={p} />
      ))}
    </>
  );
}

function Ring({ pulse }: { pulse: Pulse }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const age = clock.elapsedTime - pulse.born;
    const k = Math.min(1, age / 2.4);
    const eased = 1 - Math.pow(1 - k, 3);
    if (mesh.current) mesh.current.scale.setScalar(0.15 + eased * (pulse.resolved ? 1.6 : 2.4));
    if (mat.current) mat.current.opacity = (1 - k) * (pulse.resolved ? 1 : 0.85);
  });
  return (
    <mesh ref={mesh} position={[pulse.x, 0.06, pulse.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.82, 1, 48]} />
      <meshBasicMaterial ref={mat} color={pulse.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Tilted plane, slow drift and mouse parallax (disabled on touch devices). */
function Rig({ children, parallax, offsetX }: { children: ReactNode; parallax: boolean; offsetX: number }) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!parallax) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [parallax]);
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    // Camera looks down ~33°; tilting the plane +0.35 rad gives a ~55° oblique "map" view.
    const drift = Math.sin(clock.elapsedTime * 0.05) * 0.25;
    const tx = 0.35 + pointer.current.y * 0.06;
    const ty = drift + pointer.current.x * 0.12;
    g.rotation.x += (tx - g.rotation.x) * Math.min(1, dt * 2.5);
    g.rotation.y += (ty - g.rotation.y) * Math.min(1, dt * 2.5);
  });
  return (
    <group position={[offsetX, 0, 0]}>
      <group ref={group}>{children}</group>
    </group>
  );
}

export interface CityPulseProps {
  wards: Ward[];
  points: MapPoint[];
  mobile: boolean;
}

export default function CityPulse({ wards, points, mobile }: CityPulseProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const budget = mobile ? 2000 : 8000;
  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ position: [0, 9, 14], fov: mobile ? 60 : 42 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      >
        {/* Desktop: city sits to the right of the headline. Mobile: centered behind it. */}
        <Rig parallax={!mobile} offsetX={mobile ? 0 : 3.5}>
          <Cloud wards={wards} points={points} budget={budget} />
          <Pulses points={points} />
        </Rig>
      </Canvas>
    </div>
  );
}
