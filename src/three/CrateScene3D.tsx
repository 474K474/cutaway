import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { projects, trackCode } from '../data/projects';
import { drawCover } from './drawCover';
import {
  beamAlpha, cardboardTexture, decalTexture, dotTexture, floorTexture, plankTexture,
  plasterBump, plasterTexture, rng, toTexture, vinylRoughness, vinylTexture,
} from './textures';
import '../components/CrateScene.css';
import './CrateScene3D.css';

interface Props {
  hovered: number;
  pulling: boolean;
  returning: boolean;
  light: { level: number; smooth: boolean };
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}

// ---------- Размеры (метры) ----------
const REC = 0.315; // конверт LP
const SLEEVE_T = 0.0045;
const W = 0.4; // ящик по X
const D = 0.52; // ящик по Z
const T = 0.016; // толщина доски
const PLANK_H = 0.07;
const GAP = 0.02;
const WALL_H = T + 3 * PLANK_H + 2 * GAP;
const SPACING = 0.062;
const zOf = (i: number) => D / 2 - T - 0.06 - i * SPACING;
const DIVIDER_AFTER = projects.findIndex((p) => p.side === 'B') - 1;
const CRATE_YAW = 0.78;

// ---------- Общие ресурсы ----------

function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setReady(true);
    Promise.all([
      document.fonts?.load('700 100px Oswald'),
      document.fonts?.load('700 40px Onest'),
      document.fonts?.load('800 40px Onest'),
    ]).then(done, done);
    const t = window.setTimeout(done, 2500);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);
  return ready;
}

/** Плавное приближение к цели, не зависящее от FPS. */
const damp = (cur: number, target: number, speed: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-speed * dt));

// ---------- Свет ----------

function Lights({ level }: { level: number }) {
  const key = useRef<THREE.SpotLight>(null);
  const wash = useRef<THREE.SpotLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const { scene, gl } = useThree();

  // Мягкие отражения от процедурной «комнаты» — без загрузки HDR-файлов.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);

  useEffect(() => {
    if (key.current) { key.current.target.position.set(0, 0.12, 0); key.current.target.updateMatrixWorld(); }
    if (wash.current) { wash.current.target.position.set(0, 1.0, -1.1); wash.current.target.updateMatrixWorld(); }
  }, []);

  useFrame(() => {
    if (key.current) key.current.intensity = 34 * level;
    if (wash.current) wash.current.intensity = 7 * level;
    if (hemi.current) hemi.current.intensity = 0.02 + 0.09 * level;
    if (fill.current) fill.current.intensity = 0.35 * level;
    scene.environmentIntensity = 0.03 + 0.09 * level;
  });

  return (
    <>
      <spotLight
        ref={key}
        position={[0.1, 2.25, 0.35]}
        angle={0.36}
        penumbra={0.85}
        decay={2}
        color="#ffb26a"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={7}
        shadow-blurSamples={16}
      />
      <spotLight ref={wash} position={[0, 2.6, 0.2]} angle={0.75} penumbra={1} decay={2} color="#ff9c55" />
      <hemisphereLight ref={hemi} args={['#ffd9ae', '#1a0e06', 0.3]} />
      <pointLight ref={fill} position={[-1.2, 0.7, 1.2]} color="#ff9f5c" decay={2} />
    </>
  );
}

/** Видимый луч света сверху и пылинки в нём. */
function Beam({ level }: { level: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const dustMat = useRef<THREE.PointsMaterial>(null);
  const pts = useRef<THREE.Points>(null);
  const alpha = useMemo(() => beamAlpha(), []);
  const dot = useMemo(() => dotTexture(), []);
  const { positions, speeds } = useMemo(() => {
    const r = rng(9);
    const n = 160;
    const positions = new Float32Array(n * 3);
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = r() * 2.1;
      const rad = (1 - y / 2.25) * 0.75 * Math.sqrt(r());
      const a = r() * Math.PI * 2;
      positions.set([0.1 + Math.cos(a) * rad, y, 0.35 + Math.sin(a) * rad], i * 3);
      speeds[i] = 0.01 + r() * 0.025;
    }
    return { positions, speeds };
  }, []);

  useFrame((state, dt) => {
    if (mat.current) mat.current.opacity = 0.055 * level;
    if (dustMat.current) dustMat.current.opacity = 0.6 * level;
    const g = pts.current?.geometry;
    if (!g) return;
    const p = g.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + speeds[i] * dt;
      if (y > 2.1) y = 0.05;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * 0.0004);
    }
    p.needsUpdate = true;
  });

  return (
    <>
      <mesh position={[0.1, 1.12, 0.35]} renderOrder={5}>
        <coneGeometry args={[0.8, 2.25, 48, 1, true]} />
        <meshBasicMaterial ref={mat} color="#ffb070" alphaMap={alpha} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={pts} renderOrder={6}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial ref={dustMat} map={dot} size={0.012} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} color="#ffd9b0" />
      </points>
    </>
  );
}

// ---------- Комната ----------

function Room({ covers }: { covers: HTMLCanvasElement[] | null }) {
  const floor = useMemo(() => {
    const t = floorTexture();
    t.repeat.set(5, 5);
    return t;
  }, []);
  const plaster = useMemo(() => plasterTexture(), []);
  const bump = useMemo(() => plasterBump(), []);
  const posterTex = useMemo(() => (covers ? toTexture(covers[3]) : null), [covers]);
  const spines = useMemo(() => {
    const r = rng(3);
    const colors = ['#2b2b2b', '#c9b89a', '#7e1a14', '#1d2b3a', '#d9d1c2', '#3a2a20', '#E0452C', '#141210', '#5a5a4e', '#b33a26', '#e9e1d2', '#24302a', '#8a6a3a', '#1a1a1a', '#c94a2c', '#efe6d4', '#3b4a52', '#6b2a1c'];
    let x = -0.27;
    return colors.map((c) => {
      const w = 0.006 + r() * 0.005;
      const h = 0.29 + r() * 0.025;
      const item = { c, w, h, x: x + w / 2 };
      x += w + 0.0015;
      return item;
    });
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial map={floor} color="#b8a090" roughness={0.68} metalness={0} />
      </mesh>
      <mesh position={[0, 1.6, -1.1]} receiveShadow>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial map={plaster} bumpMap={bump} bumpScale={0.6} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.045, -1.09]} castShadow receiveShadow>
        <boxGeometry args={[6, 0.09, 0.02]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.6} />
      </mesh>

      {/* Постер в раме */}
      <group position={[-0.5, 0.82, -1.085]} rotation-z={0.02}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.44, 0.022]} />
          <meshStandardMaterial color="#0e0d0c" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.0115]}>
          <planeGeometry args={[0.32, 0.4]} />
          <meshStandardMaterial color="#e6dfd2" roughness={0.9} />
        </mesh>
        {posterTex && (
          <mesh position={[0, 0.03, 0.012]}>
            <planeGeometry args={[0.26, 0.26]} />
            <meshStandardMaterial map={posterTex} roughness={0.8} />
          </mesh>
        )}
        <mesh position={[0, 0, 0.013]}>
          <planeGeometry args={[0.32, 0.4]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.06} roughness={0.05} metalness={0} clearcoat={1} />
        </mesh>
      </group>

      {/* Полка с пластинками */}
      <group position={[0.56, 0.58, -1.0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.6, 0.022, 0.18]} />
          <meshStandardMaterial color="#8a5a33" roughness={0.6} />
        </mesh>
        {spines.map((s, k) => (
          <mesh key={k} position={[s.x, 0.011 + s.h / 2, 0]} castShadow>
            <boxGeometry args={[s.w, s.h, 0.17]} />
            <meshStandardMaterial color={s.c} roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0.07, 0.011 + 0.15, 0]} rotation-z={-0.26} castShadow>
          <boxGeometry args={[0.008, 0.31, 0.17]} />
          <meshStandardMaterial color="#d8cbb3" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- Ящик ----------

function Plank({ size, position, tex }: { size: [number, number, number]; position: [number, number, number]; tex: THREE.Texture }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.78} metalness={0} />
    </mesh>
  );
}

/** Верхняя торцевая доска со сквозным вырезом-ручкой. */
function HandlePlank({ width, position, tex }: { width: number; position: [number, number, number]; tex: THREE.Texture }) {
  const geo = useMemo(() => {
    const w = width / 2, h = PLANK_H / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h); shape.lineTo(-w, h); shape.closePath();
    const hw = 0.06, hh = 0.016, r = hh;
    const hole = new THREE.Path();
    hole.moveTo(-hw + r, -hh);
    hole.lineTo(hw - r, -hh);
    hole.absarc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    hole.lineTo(-hw + r, hh);
    hole.absarc(-hw + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0, -T / 2);
    // Перекладываем UV, чтобы волокно шло вдоль доски, как у остальных реек.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w) / width, (pos.getY(i) + h) / PLANK_H);
    uv.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [width]);
  return (
    <mesh geometry={geo} position={position} castShadow receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.78} metalness={0} />
    </mesh>
  );
}

function Crate() {
  const planks = useMemo(() => Array.from({ length: 6 }, (_, k) => plankTexture(k)), []);
  const stamp = useMemo(() => decalTexture(['M.S. RECORDS · № 01'], { w: 2048, h: 256, font: '700 118px Oswald, sans-serif', color: 'rgba(30,12,3,.62)', spacing: 22 }), []);
  const label = useMemo(() => decalTexture(['PORTFOLIO'], { w: 512, h: 128, font: '700 70px Oswald, sans-serif', color: '#2a1d12', bg: '#e9e1d2', spacing: 14 }), []);

  const rows = [0, 1, 2].map((k) => T + PLANK_H / 2 + k * (PLANK_H + GAP));
  const sideX = W / 2 - T / 2;
  const endZ = D / 2 - T / 2;
  const inner = W - 2 * T;
  const postX = W / 2 - T - 0.015;
  const postZ = D / 2 - T - 0.015;

  return (
    <group>
      <Plank size={[W, T, D]} position={[0, T / 2, 0]} tex={planks[5]} />
      {rows.map((y, k) => (
        <group key={k}>
          <Plank size={[T, PLANK_H, D]} position={[-sideX, y, 0]} tex={planks[k % 6]} />
          <Plank size={[T, PLANK_H, D]} position={[sideX, y, 0]} tex={planks[(k + 2) % 6]} />
          {k === 2 ? (
            <>
              <HandlePlank width={inner} position={[0, y, endZ]} tex={planks[(k + 3) % 6]} />
              <HandlePlank width={inner} position={[0, y, -endZ]} tex={planks[(k + 4) % 6]} />
            </>
          ) : (
            <>
              <Plank size={[inner, PLANK_H, T]} position={[0, y, endZ]} tex={planks[(k + 3) % 6]} />
              <Plank size={[inner, PLANK_H, T]} position={[0, y, -endZ]} tex={planks[(k + 4) % 6]} />
            </>
          )}
        </group>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => (
        <Plank key={k} size={[0.03, WALL_H - T, 0.03]} position={[sx * postX, T + (WALL_H - T) / 2, sz * postZ]} tex={planks[(k + 1) % 6]} />
      ))}
      {/* Наклейка и штамп */}
      <mesh position={[0, rows[0], D / 2 + 0.0008]} rotation-z={-0.03}>
        <planeGeometry args={[0.12, 0.03]} />
        <meshStandardMaterial map={label} roughness={0.9} />
      </mesh>
      <mesh position={[-W / 2 - 0.0006, rows[1], 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[0.44, 0.055]} />
        <meshStandardMaterial map={stamp} transparent roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---------- Пластинки ----------

interface RecordProps {
  index: number;
  hovered: number;
  gone: boolean;
  front: THREE.Texture;
  vinyl: THREE.Texture;
  vinylRough: THREE.Texture;
  card: THREE.Texture;
}

function poseFor(i: number, hv: number, gone: boolean) {
  if (gone && i === hv) return { y: 1.5, rot: 0.04, peek: 0 };
  if (hv < 0) return { y: 0, rot: -0.14, peek: 0 };
  if (i === hv) return { y: 0.235, rot: 0.04, peek: 0.1 };
  if (i < hv) return { y: 0, rot: 0.2, peek: 0 };
  return { y: 0, rot: -0.23, peek: 0 };
}

function RecordMesh({ index, hovered, gone, front, vinyl, vinylRough, card }: RecordProps) {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const initial = useRef(poseFor(index, hovered, gone));
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ map: card, roughness: 0.85 });
    return [
      edge, edge, edge, edge,
      new THREE.MeshPhysicalMaterial({ map: front, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: card, roughness: 0.85 }),
    ];
  }, [front, card]);
  const discMats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 });
    const face = new THREE.MeshPhysicalMaterial({ map: vinyl, roughnessMap: vinylRough, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    return [side, face, face];
  }, [vinyl, vinylRough]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = poseFor(index, hovered, gone);
    const sp = gone && index === hovered ? 6 : 3.6;
    g.position.y = damp(g.position.y, p.y, sp, dt);
    g.rotation.x = damp(g.rotation.x, p.rot, sp, dt);
    if (disc.current) disc.current.position.y = damp(disc.current.position.y, REC / 2 + p.peek, 3.2, dt);
  });

  return (
    <group ref={group} position={[0, T + initial.current.y, zOf(index)]} rotation-x={initial.current.rot}>
      <mesh ref={disc} position={[0, REC / 2, 0]} rotation-x={Math.PI / 2} castShadow material={discMats}>
        <cylinderGeometry args={[0.148, 0.148, 0.0018, 96, 1]} />
      </mesh>
      <mesh position={[0, REC / 2, 0]} castShadow receiveShadow material={materials}>
        <boxGeometry args={[REC, REC, SLEEVE_T]} />
      </mesh>
    </group>
  );
}

function Divider({ hovered }: { hovered: number }) {
  const group = useRef<THREE.Group>(null);
  const tab = useMemo(() => decalTexture(['B · ПЕТ-ПРОЕКТЫ'], { w: 512, h: 128, font: '700 54px Oswald, sans-serif', color: '#2a1d12', bg: '#c9a46f', spacing: 6 }), []);
  const z = (zOf(DIVIDER_AFTER) + zOf(DIVIDER_AFTER + 1)) / 2;
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    let rot = -0.14;
    if (hovered > DIVIDER_AFTER) rot = 0.2;
    else if (hovered >= 0) rot = -0.23;
    g.rotation.x = damp(g.rotation.x, rot, 3.6, dt);
  });
  return (
    <group ref={group} position={[0, T, z]} rotation-x={-0.14}>
      <mesh position={[0, 0.165, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.33, 0.33, 0.0025]} />
        <meshStandardMaterial color="#c09a64" roughness={0.9} />
      </mesh>
      <mesh position={[-0.09, 0.345, 0]} castShadow>
        <boxGeometry args={[0.12, 0.03, 0.0025]} />
        <meshStandardMaterial color="#c09a64" roughness={0.9} />
      </mesh>
      <mesh position={[-0.09, 0.345, 0.0014]}>
        <planeGeometry args={[0.12, 0.03]} />
        <meshStandardMaterial map={tab} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---------- Камера ----------

const CAM_REST = { pos: new THREE.Vector3(0.02, 0.88, 1.3), look: new THREE.Vector3(0, 0.3, 0) };
const CAM_UP = { pos: new THREE.Vector3(0.05, 1.12, 1.12), look: new THREE.Vector3(0.02, 0.86, -0.05) };

/** Камера провожает пластинку вверх, когда её достают, и опускается обратно при возвращении. */
function CameraRig({ gone }: { gone: boolean }) {
  const { camera } = useThree();
  const k = useRef(gone ? 1 : 0);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    k.current = damp(k.current, gone ? 1 : 0, gone ? 2.6 : 1.9, dt);
    const e = k.current * k.current * (3 - 2 * k.current);
    camera.position.lerpVectors(CAM_REST.pos, CAM_UP.pos, e);
    look.lerpVectors(CAM_REST.look, CAM_UP.look, e);
    camera.lookAt(look);
  });
  return null;
}

// ---------- Сцена ----------

type Projector = (clientX: number) => { best: number; bestD: number; dists: number[] };

function SceneContent({ hovered, gone, level, projector }: { hovered: number; gone: boolean; level: number; projector: MutableRefObject<Projector | null> }) {
  const fontsReady = useFontsReady();
  const crate = useRef<THREE.Group>(null);
  const { camera, size, gl } = useThree();

  const covers = useMemo(
    () => (fontsReady ? projects.map((p, i) => drawCover(p, trackCode(projects, i), 1024)) : null),
    [fontsReady],
  );
  const fronts = useMemo(() => covers?.map((c) => toTexture(c)) ?? null, [covers]);
  const vinyls = useMemo(() => covers?.map((c) => vinylTexture(c)) ?? null, [covers]);
  const vinylRough = useMemo(() => vinylRoughness(), []);
  const card = useMemo(() => cardboardTexture(), []);

  // Экранная X каждой пластинки — для выбора курсором без «перекрытия» соседями.
  useEffect(() => {
    const v = new THREE.Vector3();
    projector.current = (clientX: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const dists: number[] = [];
      let best = -1;
      let bestD = Infinity;
      projects.forEach((_, i) => {
        if (!crate.current) return;
        v.set(0, T + 0.12, zOf(i));
        crate.current.localToWorld(v);
        v.project(camera);
        const x = rect.left + ((v.x + 1) / 2) * rect.width;
        const d = Math.abs(clientX - x);
        dists[i] = d;
        if (d < bestD) { bestD = d; best = i; }
      });
      return { best, bestD, dists };
    };
  }, [camera, gl, projector, size]);

  return (
    <>
      <color attach="background" args={['#0d0907']} />
      <fog attach="fog" args={['#0d0907', 2.4, 5]} />
      <CameraRig gone={gone} />
      <Lights level={level} />
      <Room covers={covers} />
      <group ref={crate} rotation-y={CRATE_YAW}>
        <Crate />
        <Divider hovered={hovered} />
        {fronts && vinyls && projects.map((p, i) => (
          <RecordMesh key={p.id} index={i} hovered={hovered} gone={gone} front={fronts[i]} vinyl={vinyls[i]} vinylRough={vinylRough} card={card} />
        ))}
      </group>
      <Beam level={level} />
    </>
  );
}

/** 3D-версия сцены с ящиком: настоящий свет, тени и материалы. */
export default function CrateScene3D({ hovered, pulling, returning, light, onHover, onPick }: Props) {
  const projector = useRef<Projector | null>(null);
  const gone = pulling || returning;

  const onMove = (clientX: number) => {
    const res = projector.current?.(clientX);
    if (!res) return;
    if (res.bestD > 170) return onHover(-1);
    if (hovered >= 0 && res.best !== hovered && (res.dists[hovered] ?? Infinity) - res.bestD < 10) return;
    onHover(res.best);
  };

  const style = { '--light': light.level } as CSSProperties;

  return (
    <div
      className={`stage stage3d${light.smooth ? ' light-smooth' : ''}`}
      style={style}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => onHover(-1)}
      onClick={() => hovered >= 0 && onPick(hovered)}
    >
      <Canvas
        shadows={{ type: THREE.VSMShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: [0.02, 0.88, 1.3], fov: 36, near: 0.05, far: 20 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <SceneContent hovered={hovered} gone={gone} level={light.level} projector={projector} />
      </Canvas>

      <div className="vignette" aria-hidden="true" />
      <div className="room-dark room-dark-3d" aria-hidden="true" />
      <svg className="fill-svg film-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#filmgrain)" /></svg>
      <div className="stage-hint">Веди курсором вдоль ящика · клик — достать пластинку</div>

      {/* Клавиатурный доступ к пластинкам */}
      <div className="sr-only">
        {projects.map((p, i) => (
          <button key={p.id} onFocus={() => onHover(i)} onClick={(e) => { e.stopPropagation(); onPick(i); }}>
            Достать пластинку «{p.title}»
          </button>
        ))}
      </div>
    </div>
  );
}
