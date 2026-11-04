import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Project } from '../data/projects';
import { drawCover } from './drawCover';
import { rng, toTexture, vinylRoughness, vinylTexture } from './textures';

interface Props {
  project: Project;
  code: string;
  leaving: boolean;
}

// ---------- Геометрия (метры, плинт: верх на y = 0, центр платтера в начале координат) ----------
const PLATTER_R = 0.162;
const PLATTER_TOP = 0.026;
const MAT_T = 0.003;
const REC_R = 0.15;
const REC_T = 0.0018;
const REC_Y = PLATTER_TOP + MAT_T + REC_T / 2;
const PIVOT: [number, number] = [0.228, -0.112];
const ARM_Y = 0.049; // высота трубки над плинтом
const ARM_LEN = 0.222; // от оси до иглы
const YAW_REST = 0.08;
const YAW_PLAY = -0.55;
const LIFT = -0.075; // наклон при подъёме (отрицательный — головка вверх)
const RPM33 = (33.33 / 60) * Math.PI * 2;

// ---------- Тайминги (с) ----------
const IN = { land: 1.3, liftAt: 1.35, liftDur: 0.3, swingAt: 1.65, swingDur: 1.0, lowerAt: 2.65, lowerDur: 0.35, spinAt: 2.95 };
const OUT = { liftDur: 0.25, swingAt: 0.25, swingDur: 0.85, lowerAt: 1.1, lowerDur: 0.25, recAt: 1.45, recDur: 1.3 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => Math.pow(clamp01(x), 2.2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- Текстуры корпуса ----------

function brushedTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#121110';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(21);
  for (let y = 0; y < 512; y++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
    ctx.fillRect(0, y, 512, 1);
  }
  const t = toTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

/** Стробоскопические точки на боковине платтера. */
function strobeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, 2048, 64);
  const rows = [[4, 14, 180], [22, 32, 183], [40, 50, 177]];
  for (const [y0, y1, n] of rows) {
    const step = 2048 / n;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = '#e9e9e9';
      ctx.fillRect(k * step, y0, step / 2, y1 - y0);
    }
  }
  return toTexture(cv);
}

function feltTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(8);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    ctx.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1);
  }
  return toTexture(cv);
}

// ---------- Свет ----------

function Lights() {
  const key = useRef<THREE.SpotLight>(null);
  const { scene, gl } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;
    return () => { env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  useEffect(() => {
    if (!key.current) return;
    key.current.target.position.set(0.12, 0, 0);
    key.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <spotLight
        ref={key}
        position={[-0.45, 0.95, 0.35]}
        angle={0.62}
        penumbra={0.8}
        decay={2}
        intensity={7.5}
        color="#ffd6b0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.01}
        shadow-radius={5}
        shadow-blurSamples={16}
      />
      <hemisphereLight args={['#ffe0c0', '#120a05', 0.18]} />
      <pointLight position={[0.6, 0.5, -0.4]} intensity={0.5} color="#ff9d5c" decay={2} />
    </>
  );
}

// ---------- Проигрыватель ----------

function Turntable({ project, code, leaving }: Props) {
  const brushed = useMemo(() => brushedTexture(), []);
  const strobe = useMemo(() => strobeTexture(), []);
  const felt = useMemo(() => feltTexture(), []);
  const cover = useMemo(() => drawCover(project, code, 1024), [project, code]);
  const vinyl = useMemo(() => vinylTexture(cover), [cover]);
  const vRough = useMemo(() => vinylRoughness(), []);

  const chrome = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d9d9', metalness: 1, roughness: 0.22 }), []);
  const darkMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2826', metalness: 0.7, roughness: 0.45 }), []);
  const blackPlastic = useMemo(() => new THREE.MeshStandardMaterial({ color: '#111', metalness: 0.1, roughness: 0.5 }), []);
  const platterMats = useMemo(() => [
    new THREE.MeshStandardMaterial({ map: strobe, metalness: 0.9, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#8d8d8d', metalness: 1, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: '#888', metalness: 1, roughness: 0.4 }),
  ], [strobe]);
  const recordMats = useMemo(() => {
    const face = new THREE.MeshPhysicalMaterial({ map: vinyl, roughnessMap: vRough, roughness: 1, clearcoat: 0.7, clearcoatRoughness: 0.22 });
    return [new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.35 }), face, face];
  }, [vinyl, vRough]);

  const record = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const armYaw = useRef<THREE.Group>(null);
  const armPitch = useRef<THREE.Group>(null);
  const cue = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);

  const start = useRef<number | null>(null);
  const leaveAt = useRef<number | null>(null);
  const omega = useRef(0);

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    if (leaving && leaveAt.current === null) leaveAt.current = now;
    const t = now - start.current;

    let rx = 0, ry = REC_Y, rz = 0, tilt = 0; // пластинка
    let yaw = YAW_REST, pitch = 0, cueA = 0, target = 0;

    if (leaveAt.current === null) {
      // Установка: пластинку приносят сверху-справа и кладут на мат.
      const p = easeOut(t / IN.land);
      rx = lerp(0.42, 0, p);
      rz = lerp(-0.12, 0, p);
      ry = REC_Y + 0.11 * Math.pow(1 - p, 1.6);
      tilt = lerp(-0.35, 0, p);
      // Тонарм: микролифт вверх → перенос → опускание.
      const lift = smooth((t - IN.liftAt) / IN.liftDur);
      const swing = smooth((t - IN.swingAt) / IN.swingDur);
      const lower = smooth((t - IN.lowerAt) / IN.lowerDur);
      yaw = lerp(YAW_REST, YAW_PLAY, swing);
      pitch = LIFT * (lift - lower);
      cueA = lift - lower;
      target = t > IN.spinAt ? RPM33 : 0;
    } else {
      // Снятие: игла вверх → тонарм на подставку → диск останавливается → пластинку поднимают.
      const u = now - leaveAt.current;
      const lift = smooth(u / OUT.liftDur);
      const swing = smooth((u - OUT.swingAt) / OUT.swingDur);
      const lower = smooth((u - OUT.lowerAt) / OUT.lowerDur);
      yaw = lerp(YAW_PLAY, YAW_REST, swing);
      pitch = LIFT * (lift - lower);
      cueA = lift - lower;
      target = 0;
      const q = easeIn((u - OUT.recAt) / OUT.recDur);
      ry = REC_Y + 0.16 * q + 0.03 * smooth((u - OUT.recAt) / 0.3);
      rx = lerp(0, 0.28, q);
      rz = lerp(0, -0.55, q);
      tilt = lerp(0, 0.3, q);
    }

    // Разгон/торможение диска — с инерцией.
    const k = target > omega.current ? 1.6 : 1.4;
    omega.current += (target - omega.current) * (1 - Math.exp(-k * dt));
    if (spin.current) spin.current.rotation.y -= omega.current * dt;

    if (record.current) {
      record.current.position.set(rx, ry, rz);
      record.current.rotation.set(tilt, 0, tilt * 0.4);
    }
    if (armYaw.current) armYaw.current.rotation.y = yaw;
    if (armPitch.current) armPitch.current.rotation.x = pitch;
    if (cue.current) cue.current.rotation.x = -0.5 * cueA;
    if (led.current) led.current.emissiveIntensity = 0.2 + 3 * Math.min(1, omega.current / RPM33);
  });

  return (
    <group>
      {/* Плинт */}
      <mesh position={[0.1, -0.03, 0]} receiveShadow>
        <boxGeometry args={[1.0, 0.06, 1.1]} />
        <meshStandardMaterial map={brushed} metalness={0.25} roughness={0.62} />
      </mesh>

      {/* Платтер, мат, шпиндель */}
      <mesh position={[0, PLATTER_TOP / 2, 0]} castShadow receiveShadow material={platterMats}>
        <cylinderGeometry args={[PLATTER_R, PLATTER_R, PLATTER_TOP, 128, 1]} />
      </mesh>
      <mesh position={[0, PLATTER_TOP + MAT_T / 2, 0]} receiveShadow>
        <cylinderGeometry args={[REC_R + 0.002, REC_R + 0.002, MAT_T, 128]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>
      <mesh position={[0, PLATTER_TOP + 0.012, 0]} castShadow material={chrome}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.024, 24]} />
      </mesh>

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
        <mesh position={[0, 0.006, 0]} castShadow receiveShadow material={darkMetal}>
          <cylinderGeometry args={[0.045, 0.048, 0.012, 64]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} castShadow material={chrome}>
          <cylinderGeometry args={[0.022, 0.026, 0.018, 48]} />
        </mesh>
        <group ref={armYaw}>
          <mesh position={[0, 0.036, 0]} castShadow material={chrome}>
            <cylinderGeometry args={[0.014, 0.016, 0.03, 32]} />
          </mesh>
          <group ref={armPitch} position={[0, ARM_Y, 0]}>
            {/* трубка */}
            <mesh position={[0, 0, ARM_LEN / 2 - 0.01]} rotation-x={Math.PI / 2} castShadow material={chrome}>
              <cylinderGeometry args={[0.0042, 0.0042, ARM_LEN - 0.02, 20]} />
            </mesh>
            {/* противовес */}
            <mesh position={[0, 0, -0.055]} rotation-x={Math.PI / 2} castShadow material={chrome}>
              <cylinderGeometry args={[0.014, 0.014, 0.034, 32]} />
            </mesh>
            <mesh position={[0, 0, -0.03]} rotation-x={Math.PI / 2} castShadow material={darkMetal}>
              <cylinderGeometry args={[0.0045, 0.0045, 0.03, 16]} />
            </mesh>
            {/* головка с картриджем и лифтом */}
            <group position={[0, -0.004, ARM_LEN - 0.012]} rotation-y={-0.32}>
              <mesh castShadow material={blackPlastic}>
                <boxGeometry args={[0.018, 0.004, 0.034]} />
              </mesh>
              <mesh position={[0.016, 0.001, -0.006]} castShadow material={chrome}>
                <boxGeometry args={[0.016, 0.002, 0.004]} />
              </mesh>
              <mesh position={[0, -0.007, 0.005]} castShadow>
                <boxGeometry args={[0.014, 0.01, 0.018]} />
                <meshStandardMaterial color="#d8402a" roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.0125, 0.011]} material={chrome}>
                <cylinderGeometry args={[0.0005, 0.0003, 0.003, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Подставка тонарма */}
      <group position={[PIVOT[0] + 0.018, 0, PIVOT[1] + 0.205]}>
        <mesh position={[0, 0.022, 0]} castShadow material={darkMetal}>
          <cylinderGeometry args={[0.005, 0.006, 0.044, 16]} />
        </mesh>
        <mesh position={[0, 0.045, 0]} castShadow material={blackPlastic}>
          <boxGeometry args={[0.02, 0.006, 0.01]} />
        </mesh>
      </group>

      {/* Микролифт */}
      <group position={[PIVOT[0] + 0.058, 0, PIVOT[1] + 0.04]}>
        <mesh position={[0, 0.006, 0]} castShadow material={darkMetal}>
          <boxGeometry args={[0.014, 0.012, 0.03]} />
        </mesh>
        <group ref={cue} position={[0, 0.012, 0.01]}>
          <mesh position={[0, 0.012, 0]} castShadow material={chrome}>
            <boxGeometry args={[0.003, 0.024, 0.003]} />
          </mesh>
        </group>
      </group>

      {/* Антискейтинг */}
      <mesh position={[PIVOT[0] + 0.06, 0.006, PIVOT[1] - 0.035]} castShadow material={darkMetal}>
        <cylinderGeometry args={[0.012, 0.012, 0.012, 32]} />
      </mesh>

      {/* Адаптер 45 */}
      <mesh position={[0.29, 0.004, 0.09]} castShadow receiveShadow material={chrome}>
        <cylinderGeometry args={[0.019, 0.019, 0.008, 48]} />
      </mesh>

      {/* Питч-фейдер */}
      <mesh position={[0.31, 0.0005, -0.03]} receiveShadow>
        <boxGeometry args={[0.012, 0.002, 0.12]} />
        <meshStandardMaterial color="#060606" roughness={0.9} />
      </mesh>
      <mesh position={[0.31, 0.006, -0.03]} castShadow material={blackPlastic}>
        <boxGeometry args={[0.024, 0.01, 0.014]} />
      </mesh>
      <mesh position={[0.31, 0.0115, -0.03]}>
        <boxGeometry args={[0.018, 0.0006, 0.0015]} />
        <meshStandardMaterial color="#e0452c" emissive="#e0452c" emissiveIntensity={0.6} />
      </mesh>

      {/* Старт/стоп и скорости */}
      <mesh position={[0.2, 0.004, 0.2]} castShadow receiveShadow material={blackPlastic}>
        <boxGeometry args={[0.05, 0.008, 0.026]} />
      </mesh>
      <mesh position={[0.25, 0.003, 0.2]} castShadow material={blackPlastic}>
        <boxGeometry args={[0.018, 0.006, 0.012]} />
      </mesh>
      <mesh position={[0.25, 0.0065, 0.192]}>
        <sphereGeometry args={[0.0018, 12, 12]} />
        <meshStandardMaterial ref={led} color="#ff5a3c" emissive="#ff4a2c" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0.275, 0.003, 0.2]} castShadow material={blackPlastic}>
        <boxGeometry args={[0.018, 0.006, 0.012]} />
      </mesh>
    </group>
  );
}

/** 3D-проигрыватель: половина пластинки у левого края, тонарм справа, настоящие тени. */
export default function Player3D(props: Props) {
  return (
    <Canvas
      className="player3d"
      shadows={{ type: THREE.VSMShadowMap }}
      dpr={[1, 1.75]}
      camera={{ position: [0.165, 0.74, 0.2], fov: 36, near: 0.01, far: 5 }}
      onCreated={({ camera }) => camera.lookAt(0.165, 0, 0.01)}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#0f0d0c']} />
      <Lights />
      <Turntable {...props} />
    </Canvas>
  );
}
