import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Project } from '../data/projects';
import { drawCover } from './drawCover';
import { decalTexture, plankTexture, plasterTexture, rng, toTexture, vinylRoughness, vinylTexture } from './textures';

interface Props {
  project: Project;
  code: string;
  leaving: boolean;
  /** Сообщает наружу, крутится ли диск (для эквалайзера в карточке). */
  onMotor?: (running: boolean) => void;
}

// ---------- Геометрия (метры) ----------
// Верх деки — y = 0, центр платтера — начало координат. Пропорции близки к реальному Technics.
const BODY = { x0: -0.19, x1: 0.27, z0: -0.18, z1: 0.18, h: 0.075 };
const BODY_W = BODY.x1 - BODY.x0;
const BODY_D = BODY.z1 - BODY.z0;
const BODY_CX = (BODY.x0 + BODY.x1) / 2;
const PLATTER_R = 0.166;
const PLATTER_Y0 = 0.002;
const PLATTER_H = 0.03;
const MAT_T = 0.003;
const MAT_Y = PLATTER_Y0 + PLATTER_H + MAT_T / 2;
const REC_R = 0.15;
const REC_T = 0.0018;
const REC_Y = PLATTER_Y0 + PLATTER_H + MAT_T + REC_T / 2;
const PIVOT: [number, number] = [0.185, -0.1];
const ARM_Y = 0.0505;
const ARM_LEN = 0.222;
const YAW_REST = 0.05;
const YAW_PLAY = -0.45;
const LIFT = -0.075;
const RPM = { 33: (33.33 / 60) * Math.PI * 2, 45: (45 / 60) * Math.PI * 2 } as const;

// ---------- Тайминги (с) ----------
const IN = { land: 1.3, liftAt: 1.35, liftDur: 0.3, swingAt: 1.65, swingDur: 1.0, lowerAt: 2.65, lowerDur: 0.35, spinAt: 2.95 };
const OUT = { liftDur: 0.25, swingAt: 0.25, swingDur: 0.85, lowerAt: 1.1, lowerDur: 0.25, recAt: 1.45, recDur: 1.3 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => Math.pow(clamp01(x), 2.2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- Текстуры ----------

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

/** Матовая чёрная панель: мелкая неровность порошковой краски, без полос. */
function matteBlack() {
  const { cv, ctx } = canvas(512, 512);
  ctx.fillStyle = '#191817';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(31);
  for (let i = 0; i < 22000; i++) {
    const v = Math.floor(14 + r() * 22);
    ctx.fillStyle = `rgb(${v},${v - 1},${v - 2})`;
    ctx.fillRect(r() * 512, r() * 512, 1, 1);
  }
  const t = toTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** Стробоскопические точки на боковине платтера (три ряда — 50/60 Гц и 45 об/мин). */
function strobeTexture() {
  const { cv, ctx } = canvas(4096, 96);
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#c4c4c4'); g.addColorStop(1, '#8a8a8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4096, 96);
  const rows: [number, number, number][] = [[14, 30, 180], [40, 56, 183], [66, 82, 177]];
  for (const [y0, y1, n] of rows) {
    const step = 4096 / n;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = '#ececec';
      ctx.fillRect(k * step, y0, step * 0.5, y1 - y0);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(k * step + step * 0.5, y0, 1, y1 - y0);
    }
  }
  return toTexture(cv);
}

/** Резиновый мат с концентрическими рёбрами. */
function rubberMat() {
  const S = 1024, C = S / 2;
  const { cv, ctx } = canvas(S, S);
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, S, S);
  for (let r = C * 0.12; r < C; r += 9) {
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke();
  }
  return toTexture(cv);
}

/** Насечка на противовесе. */
function knurl() {
  const { cv, ctx } = canvas(256, 64);
  ctx.fillStyle = '#9d9d9d';
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 4) { ctx.fillStyle = '#5c5c5c'; ctx.fillRect(x, 0, 2, 64); }
  return toTexture(cv);
}

// ---------- Мелкие детали ----------

function Engrave({ text, x, z, w, rot = 0 }: { text: string; x: number; z: number; w: number; rot?: number }) {
  const tex = useMemo(
    () => decalTexture([text], { w: 512, h: 96, font: '600 60px Onest, sans-serif', color: 'rgba(214,206,192,.7)', spacing: 8 }),
    [text],
  );
  return (
    <mesh position={[x, 0.0004, z]} rotation={[-Math.PI / 2, 0, rot]}>
      <planeGeometry args={[w, w * (96 / 512)]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Нажимаемая кнопка на панели. */
function PushButton({ position, size, color = '#2a2725', active = false, label, onPress }: {
  position: [number, number, number]; size: [number, number, number]; color?: string; active?: boolean; label: string; onPress: () => void;
}) {
  const cap = useRef<THREE.Mesh>(null);
  const press = useRef(0);
  useFrame((_, dt) => {
    press.current = Math.max(0, press.current - dt * 6);
    if (cap.current) cap.current.position.y = size[1] / 2 + 0.001 - press.current * 0.0035 - (active ? 0.0008 : 0);
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    press.current = 1;
    onPress();
  };
  return (
    <group position={position}>
      <mesh position={[0, 0.0005, 0]} receiveShadow>
        <boxGeometry args={[size[0] + 0.004, 0.001, size[2] + 0.004]} />
        <meshStandardMaterial color="#070707" roughness={0.9} />
      </mesh>
      <mesh
        ref={cap}
        castShadow
        onClick={click}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
        name={label}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
      </mesh>
    </group>
  );
}

// ---------- Свет и комната ----------

function Lights() {
  const key = useRef<THREE.SpotLight>(null);
  const { scene, gl } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.22;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  useEffect(() => {
    if (!key.current) return;
    key.current.target.position.set(0.03, 0, 0);
    key.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <spotLight
        ref={key}
        position={[-0.35, 1.25, 0.45]}
        angle={0.55}
        penumbra={0.9}
        decay={2}
        intensity={14}
        color="#ffcb98"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.008}
        shadow-radius={6}
        shadow-blurSamples={16}
      />
      <pointLight position={[0.55, 0.45, -0.55]} intensity={0.9} color="#ff9a52" decay={2} />
      <hemisphereLight args={['#ffd8b0', '#140a04', 0.12]} />
    </>
  );
}

function Room() {
  const table = useMemo(() => {
    const t = plankTexture(1);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.4, 6);
    t.rotation = Math.PI / 2;
    return t;
  }, []);
  const wall = useMemo(() => plasterTexture(), []);
  return (
    <group>
      {/* Тумба, на которой стоит проигрыватель */}
      <mesh position={[0.05, -0.122, 0.05]} receiveShadow>
        <boxGeometry args={[2.4, 0.04, 1.1]} />
        <meshStandardMaterial map={table} color="#5e4434" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.6, -0.75]} receiveShadow>
        <planeGeometry args={[4, 2]} />
        <meshStandardMaterial map={wall} color="#9a8070" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ---------- Проигрыватель ----------

function Turntable({ project, code, leaving, onMotor }: Props) {
  const walnut = useMemo(() => plankTexture(4), []);
  const black = useMemo(() => matteBlack(), []);
  const strobe = useMemo(() => strobeTexture(), []);
  const mat = useMemo(() => rubberMat(), []);
  const knurlTex = useMemo(() => knurl(), []);
  const cover = useMemo(() => drawCover(project, code, 1024), [project, code]);
  const vinyl = useMemo(() => vinylTexture(cover), [cover]);
  const vRough = useMemo(() => vinylRoughness(), []);

  // Материалы: сатинированный алюминий вместо зеркального хрома — так металл читается как металл.
  const alu = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9c9c7', metalness: 1, roughness: 0.38 }), []);
  const aluDark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8b8a88', metalness: 1, roughness: 0.45 }), []);
  const blackMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1b1a', metalness: 0.5, roughness: 0.5 }), []);
  const plastic = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141312', metalness: 0, roughness: 0.6 }), []);
  const rubber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.95 }), []);
  const platterMats = useMemo(() => [
    new THREE.MeshStandardMaterial({ map: strobe, metalness: 0.9, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: '#9c9c9a', metalness: 1, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: '#777', metalness: 1, roughness: 0.5 }),
  ], [strobe]);
  const matMats = useMemo(() => [rubber, new THREE.MeshStandardMaterial({ map: mat, roughness: 0.95 }), rubber], [mat, rubber]);
  const recordMats = useMemo(() => {
    const { cv, ctx } = canvas(256, 256);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(128, 128, 128 * 0.345, 0, Math.PI * 2); ctx.fill();
    const face = new THREE.MeshPhysicalMaterial({
      map: vinyl, roughnessMap: vRough, roughness: 1,
      clearcoat: 0.55, clearcoatMap: toTexture(cv, { srgb: false }), clearcoatRoughness: 0.28,
    });
    return [new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.35 }), face, face];
  }, [vinyl, vRough]);
  const lidMat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#3a2e26', transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
  }), []);
  const lidEdge = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#2a201a', transparent: true, opacity: 0.55, roughness: 0.1 }), []);

  const record = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const armYaw = useRef<THREE.Group>(null);
  const armPitch = useRef<THREE.Group>(null);
  const cue = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const strobeLight = useRef<THREE.PointLight>(null);

  const start = useRef<number | null>(null);
  const leaveAt = useRef<number | null>(null);
  const omega = useRef(0);
  const autoStarted = useRef(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<33 | 45>(33);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  runningRef.current = running;
  speedRef.current = speed;

  useEffect(() => { onMotor?.(running && !leaving); }, [running, leaving, onMotor]);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    if (leaving && leaveAt.current === null) leaveAt.current = now;
    const t = now - start.current;

    let rx = 0, ry = REC_Y, rz = 0, tilt = 0;
    let yaw = YAW_REST, pitch = 0, cueA = 0;
    let motor = runningRef.current;

    if (leaveAt.current === null) {
      const p = easeOut(t / IN.land);
      rx = lerp(0.36, 0, p);
      rz = lerp(-0.22, 0, p);
      ry = REC_Y + 0.13 * Math.pow(1 - p, 1.6);
      tilt = lerp(-0.4, 0, p);
      const lift = smooth((t - IN.liftAt) / IN.liftDur);
      const swing = smooth((t - IN.swingAt) / IN.swingDur);
      const lower = smooth((t - IN.lowerAt) / IN.lowerDur);
      yaw = lerp(YAW_REST, YAW_PLAY, swing);
      pitch = LIFT * (lift - lower);
      cueA = lift - lower;
      if (!autoStarted.current && t > IN.spinAt) {
        autoStarted.current = true;
        setRunning(true);
        motor = true;
      }
    } else {
      const u = now - leaveAt.current;
      const lift = smooth(u / OUT.liftDur);
      const swing = smooth((u - OUT.swingAt) / OUT.swingDur);
      const lower = smooth((u - OUT.lowerAt) / OUT.lowerDur);
      yaw = lerp(YAW_PLAY, YAW_REST, swing);
      pitch = LIFT * (lift - lower);
      cueA = lift - lower;
      motor = false;
      const q = easeIn((u - OUT.recAt) / OUT.recDur);
      ry = REC_Y + 0.2 * q + 0.03 * smooth((u - OUT.recAt) / 0.3);
      rx = lerp(0, 0.3, q);
      rz = lerp(0, -0.45, q);
      tilt = lerp(0, 0.35, q);
    }

    // Разгон и выбег диска с инерцией тяжёлого платтера.
    const target = motor ? RPM[speedRef.current] : 0;
    const k = target > omega.current ? 1.5 : 0.9;
    omega.current += (target - omega.current) * (1 - Math.exp(-k * dt));
    if (spin.current) spin.current.rotation.y -= omega.current * dt;

    if (record.current) {
      record.current.position.set(rx, ry, rz);
      record.current.rotation.set(tilt, 0, tilt * 0.3);
    }
    if (armYaw.current) armYaw.current.rotation.y = yaw;
    if (armPitch.current) armPitch.current.rotation.x = pitch;
    if (cue.current) cue.current.rotation.x = -0.6 * cueA;
    const on = Math.min(1, omega.current / RPM[33]);
    if (led.current) led.current.emissiveIntensity = 0.1 + 2.6 * (motor ? 1 : 0);
    if (strobeLight.current) strobeLight.current.intensity = 0.05 * (0.3 + 0.7 * on);
  });

  const busy = () => leaveAt.current !== null;

  return (
    <group>
      {/* Корпус: ореховый плинт на демпфирующих ножках, сверху матовая чёрная панель */}
      <mesh position={[BODY_CX, -BODY.h / 2 - 0.004, 0]} castShadow receiveShadow>
        <boxGeometry args={[BODY_W, BODY.h, BODY_D]} />
        <meshStandardMaterial map={walnut} color="#6e4c33" roughness={0.55} />
      </mesh>
      <mesh position={[BODY_CX, -0.002, 0]} receiveShadow>
        <boxGeometry args={[BODY_W - 0.004, 0.004, BODY_D - 0.004]} />
        <meshStandardMaterial map={black} color="#9a9a9a" roughness={0.8} metalness={0.1} />
      </mesh>
      {[[BODY.x0 + 0.04, BODY.z0 + 0.04], [BODY.x1 - 0.04, BODY.z0 + 0.04], [BODY.x0 + 0.04, BODY.z1 - 0.04], [BODY.x1 - 0.04, BODY.z1 - 0.04]].map(([x, z], i) => (
        <group key={i} position={[x, -BODY.h - 0.004, z]}>
          <mesh position={[0, -0.009, 0]} castShadow material={aluDark}>
            <cylinderGeometry args={[0.028, 0.03, 0.018, 40]} />
          </mesh>
          <mesh position={[0, -0.0175, 0]} material={rubber}>
            <cylinderGeometry args={[0.026, 0.026, 0.003, 40]} />
          </mesh>
        </group>
      ))}

      {/* Платтер со стробоскопом, резиновый мат, шпиндель */}
      <mesh position={[0, PLATTER_Y0 + PLATTER_H / 2, 0]} castShadow receiveShadow material={platterMats}>
        <cylinderGeometry args={[PLATTER_R, PLATTER_R, PLATTER_H, 160, 1]} />
      </mesh>
      <mesh position={[0, MAT_Y, 0]} receiveShadow material={matMats}>
        <cylinderGeometry args={[REC_R + 0.002, REC_R + 0.002, MAT_T, 128]} />
      </mesh>
      <mesh position={[0, MAT_Y + 0.011, 0]} castShadow material={alu}>
        <cylinderGeometry args={[0.0036, 0.0036, 0.02, 24]} />
      </mesh>

      {/* Стробоскопическая лампа подсвечивает точки на платтере */}
      <group position={[-0.165, 0, 0.122]}>
        <mesh position={[0, 0.012, 0]} castShadow material={blackMetal}>
          <cylinderGeometry args={[0.011, 0.012, 0.024, 24]} />
        </mesh>
        <mesh position={[0.004, 0.018, -0.004]}>
          <sphereGeometry args={[0.004, 12, 12]} />
          <meshStandardMaterial color="#ff8a3c" emissive="#ff7a2c" emissiveIntensity={1.4} />
        </mesh>
        <pointLight ref={strobeLight} position={[0.01, 0.02, -0.01]} color="#ff7a30" distance={0.1} decay={2} />
      </group>

      {/* Пластинка */}
      <group ref={record}>
        <group ref={spin}>
          <mesh castShadow receiveShadow material={recordMats}>
            <cylinderGeometry args={[REC_R, REC_R, REC_T, 128, 1]} />
          </mesh>
        </group>
      </group>

      {/* Тонарм */}
      <group position={[PIVOT[0], 0, PIVOT[1]]}>
        <mesh position={[0, 0.005, 0]} castShadow receiveShadow material={blackMetal}>
          <cylinderGeometry args={[0.04, 0.042, 0.01, 64]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} material={aluDark}>
          <cylinderGeometry args={[0.036, 0.036, 0.001, 64]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} castShadow material={alu}>
          <cylinderGeometry args={[0.02, 0.024, 0.018, 48]} />
        </mesh>
        <group ref={armYaw}>
          <mesh position={[0, 0.036, 0]} castShadow material={blackMetal}>
            <boxGeometry args={[0.026, 0.024, 0.026]} />
          </mesh>
          <group ref={armPitch} position={[0, ARM_Y, 0]}>
            <mesh position={[0, 0, ARM_LEN / 2 - 0.012]} rotation-x={Math.PI / 2} castShadow material={alu}>
              <cylinderGeometry args={[0.004, 0.004, ARM_LEN - 0.024, 24]} />
            </mesh>
            <mesh position={[0, 0, -0.022]} rotation-x={Math.PI / 2} castShadow material={aluDark}>
              <cylinderGeometry args={[0.005, 0.005, 0.03, 16]} />
            </mesh>
            <mesh position={[0, 0, -0.054]} rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 0.03, 40]} />
              <meshStandardMaterial map={knurlTex} metalness={1} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0, -0.07]} rotation-x={Math.PI / 2} material={blackMetal}>
              <cylinderGeometry args={[0.0165, 0.0165, 0.003, 40]} />
            </mesh>
            {/* Головка: корпус, пальчик-лифт, картридж, игла */}
            <group position={[0, -0.004, ARM_LEN - 0.013]} rotation-y={-0.36}>
              <mesh castShadow material={plastic}>
                <boxGeometry args={[0.019, 0.0045, 0.036]} />
              </mesh>
              <mesh position={[0.016, 0.0005, -0.008]} rotation-z={0.25} castShadow material={alu}>
                <boxGeometry args={[0.016, 0.0016, 0.004]} />
              </mesh>
              <mesh position={[0, -0.007, 0.004]} castShadow>
                <boxGeometry args={[0.014, 0.01, 0.019]} />
                <meshStandardMaterial color="#c23a26" roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.0128, 0.011]} material={alu}>
                <cylinderGeometry args={[0.0005, 0.0003, 0.003, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Подставка тонарма с зажимом */}
      <group position={[0.195, 0, 0.09]}>
        <mesh position={[0, 0.022, 0]} castShadow material={blackMetal}>
          <cylinderGeometry args={[0.0045, 0.006, 0.044, 16]} />
        </mesh>
        <mesh position={[0, 0.0455, 0]} castShadow material={rubber}>
          <boxGeometry args={[0.018, 0.005, 0.009]} />
        </mesh>
      </group>

      {/* Микролифт, антискейтинг, адаптер 45 */}
      <group position={[0.24, 0, -0.045]}>
        <mesh position={[0, 0.006, 0]} castShadow material={blackMetal}>
          <boxGeometry args={[0.014, 0.012, 0.028]} />
        </mesh>
        <group ref={cue} position={[0, 0.012, 0.008]}>
          <mesh position={[0, 0.011, 0]} castShadow material={alu}>
            <boxGeometry args={[0.003, 0.022, 0.003]} />
          </mesh>
        </group>
      </group>
      <mesh position={[0.24, 0.006, -0.11]} castShadow material={blackMetal}>
        <cylinderGeometry args={[0.012, 0.013, 0.012, 40]} />
      </mesh>
      <mesh position={[0.24, 0.0122, -0.11]} material={alu}>
        <boxGeometry args={[0.002, 0.0004, 0.01]} />
      </mesh>
      <mesh position={[0.235, 0.004, 0.012]} castShadow receiveShadow material={alu}>
        <cylinderGeometry args={[0.018, 0.018, 0.008, 48]} />
      </mesh>
      <mesh position={[0.235, 0.0082, 0.012]} material={blackMetal}>
        <cylinderGeometry args={[0.0075, 0.0075, 0.001, 32]} />
      </mesh>

      {/* Питч-фейдер */}
      <mesh position={[0.24, 0.0003, 0.11]} receiveShadow>
        <boxGeometry args={[0.006, 0.0008, 0.1]} />
        <meshStandardMaterial color="#030303" roughness={1} />
      </mesh>
      <mesh position={[0.24, 0.006, 0.11]} castShadow material={plastic}>
        <boxGeometry args={[0.022, 0.011, 0.014]} />
      </mesh>
      <mesh position={[0.24, 0.0118, 0.11]}>
        <boxGeometry args={[0.016, 0.0006, 0.0016]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.6} />
      </mesh>

      {/* Кнопки: старт/стоп и скорость — кликабельные */}
      <PushButton position={[-0.135, 0, 0.15]} size={[0.056, 0.008, 0.03]} label="start-stop" onPress={() => { if (!busy()) setRunning((r) => !r); }} />
      <PushButton position={[-0.06, 0, 0.162]} size={[0.02, 0.006, 0.012]} color={speed === 33 ? '#3a3633' : '#242120'} active={speed === 33} label="33" onPress={() => setSpeed(33)} />
      <PushButton position={[-0.034, 0, 0.162]} size={[0.02, 0.006, 0.012]} color={speed === 45 ? '#3a3633' : '#242120'} active={speed === 45} label="45" onPress={() => setSpeed(45)} />
      <mesh position={[-0.06 + (speed === 33 ? 0 : 0.026), 0.0015, 0.152]}>
        <sphereGeometry args={[0.0016, 12, 12]} />
        <meshStandardMaterial ref={led} color="#ff5a3c" emissive="#ff4a2c" emissiveIntensity={0.1} />
      </mesh>

      {/* Гравировки */}
      <Engrave text="START · STOP" x={-0.135} z={0.172} w={0.05} />
      <Engrave text="33" x={-0.06} z={0.175} w={0.014} />
      <Engrave text="45" x={-0.034} z={0.175} w={0.014} />
      <Engrave text="PITCH" x={0.24} z={0.168} w={0.026} />
      <Engrave text="ANTI-SKATE" x={0.24} z={-0.128} w={0.034} />
      <Engrave text="M.S. · SL-01  DIRECT DRIVE" x={-0.06} z={-0.17} w={0.11} />

      {/* Пылезащитная крышка — открыта, дымчатый акрил */}
      <group position={[BODY_CX, 0.0, BODY.z0 + 0.004]} rotation-x={-1.22}>
        <mesh position={[0, 0.072, BODY_D / 2]} material={lidMat}>
          <boxGeometry args={[BODY_W, 0.003, BODY_D]} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[(sx * BODY_W) / 2, 0.036, BODY_D / 2]} material={lidMat}>
            <boxGeometry args={[0.003, 0.072, BODY_D]} />
          </mesh>
        ))}
        <mesh position={[0, 0.036, BODY_D]} material={lidMat}>
          <boxGeometry args={[BODY_W, 0.072, 0.003]} />
        </mesh>
        <mesh position={[0, 0.0725, BODY_D / 2]} material={lidEdge}>
          <boxGeometry args={[BODY_W + 0.002, 0.0015, 0.003]} />
        </mesh>
      </group>
      {[BODY.x0 + 0.07, BODY.x1 - 0.07].map((x) => (
        <mesh key={x} position={[x, 0.004, BODY.z0 + 0.008]} castShadow material={blackMetal}>
          <boxGeometry args={[0.04, 0.012, 0.016]} />
        </mesh>
      ))}
    </group>
  );
}

/** 3D-проигрыватель в ракурсе 3/4, на тумбе в той же тёплой комнате. */
export default function Player3D(props: Props) {
  return (
    <Canvas
      className="player3d"
      shadows={{ type: THREE.VSMShadowMap }}
      dpr={[1, 1.75]}
      camera={{ position: [0.16, 0.6, 0.78], fov: 38, near: 0.01, far: 6 }}
      onCreated={({ camera }) => camera.lookAt(0.015, -0.03, -0.03)}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#0d0907']} />
      <fog attach="fog" args={['#0d0907', 1.2, 2.6]} />
      <Lights />
      <Room />
      <Turntable {...props} />
    </Canvas>
  );
}
