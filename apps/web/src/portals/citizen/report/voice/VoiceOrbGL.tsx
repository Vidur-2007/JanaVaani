// Voice Orb (master §11 signature moment 2): an icosphere displaced by 3D noise whose amplitude follows the
// live microphone level. Lazy-loaded (three.js chunk). Colors shift by state: listening / thinking / speaking.
import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbState } from './Orb';

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uCalm;
  varying float vDisp;
  varying vec3 vNormal;
  // Ashima 3D simplex noise (MIT).
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  void main(){
    float speed = mix(0.35, 1.4, uLevel);
    float n = snoise(normal * (1.4 + uLevel) + uTime * speed);
    float amp = 0.06 + uLevel * 0.42 + uCalm * 0.04;
    vDisp = n;
    vNormal = normalize(normalMatrix * normal);
    vec3 p = position + normal * n * amp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uLevel;
  varying float vDisp;
  varying vec3 vNormal;
  void main(){
    float fres = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    vec3 col = mix(uColorA, uColorB, clamp(vDisp * 0.5 + 0.5, 0.0, 1.0));
    col += fres * (0.6 + uLevel);
    gl_FragColor = vec4(col, 0.92);
  }
`;

const PALETTE: Record<OrbState, [string, string]> = {
  idle: ['#3E5480', '#22D3C5'],
  listening: ['#FF7A1A', '#FFC23D'],
  thinking: ['#4F56E8', '#7C83FF'],
  speaking: ['#0E9F94', '#22D3C5'],
};

function Blob({ levelRef, state }: { levelRef: MutableRefObject<number>; state: OrbState }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const smooth = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uCalm: { value: 1 },
      uColorA: { value: new THREE.Color(PALETTE.idle[0]) },
      uColorB: { value: new THREE.Color(PALETTE.idle[1]) },
    }),
    [],
  );
  useFrame(({ clock }, dt) => {
    const m = mat.current;
    if (!m) return;
    // Thinking pulses on its own; speaking breathes; listening follows the microphone.
    const target = state === 'listening' ? levelRef.current : state === 'thinking' ? 0.25 + 0.15 * Math.sin(clock.elapsedTime * 4) : state === 'speaking' ? 0.3 + 0.2 * Math.abs(Math.sin(clock.elapsedTime * 6)) : 0.05;
    smooth.current += (target - smooth.current) * Math.min(1, dt * 10);
    m.uniforms.uTime.value = clock.elapsedTime;
    m.uniforms.uLevel.value = smooth.current;
    const [a, b] = PALETTE[state];
    (m.uniforms.uColorA.value as THREE.Color).lerp(new THREE.Color(a), Math.min(1, dt * 3));
    (m.uniforms.uColorB.value as THREE.Color).lerp(new THREE.Color(b), Math.min(1, dt * 3));
    if (mesh.current) mesh.current.rotation.y += dt * 0.2;
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.25, 48]} />
      <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent />
    </mesh>
  );
}

export default function VoiceOrbGL({ levelRef, state }: { levelRef: MutableRefObject<number>; state: OrbState }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 4.2], fov: 45 }} gl={{ alpha: true, antialias: true }} aria-hidden>
      <Blob levelRef={levelRef} state={state} />
    </Canvas>
  );
}
