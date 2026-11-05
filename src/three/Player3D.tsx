import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { Project } from '../data/projects';
import { coverCanvas } from './coverCache';
import { decalTexture, plankTexture, plasterTexture, rng, toTexture, vinylRoughness, vinylTexture } from './textures';
import { makeCanvas } from '../util/canvas';

interface Props {
  project: Project;
  code: string;
  leaving: boolean;
  /** Сообщает наружу, крутится ли диск (для эквалайзера в карточке). */
  onMotor?: (running: boolean) => void;
}

interface StageProps extends Props {
  /** Номер «сеанса»: при смене пластинка заново ставится на проигрыватель. */
  session: number;
  /** Проигрыватель на экране. Пока скрыт — сцена не рисуется, но уже собрана и скомпилирована. */
  active: boolean;
}

// ---------- Геометрия (метры) ----------
// Верх деки — y = 0, центр платтера — начало координат.
// Стиль — немецкий проигрыватель 60-х: ореховая рамка, светлая алюминиевая панель, чёрная планка тонарма справа.
const BODY = { x0: -0.2, x1: 0.29, z0: -0.2, z1: 0.2, h: 0.07 };
const FRAME = 0.016; // ширина ореховой рамки
const BOARD_X0 = 0.19; // начало чёрной планки тонарма
const BOARD_X1 = BODY.x1 - FRAME;
const PLATE = { x0: BODY.x0 + FRAME, x1: BOARD_X0, z0: BODY.z0 + FRAME, z1: BODY.z1 - FRAME };
const BODY_W = BODY.x1 - BODY.x0;
const BODY_D = BODY.z1 - BODY.z0;
const BODY_CX = (BODY.x0 + BODY.x1) / 2;
const PLATTER_R = 0.153;
const PLATTER_Y0 = 0.002;
const PLATTER_H = 0.022;
const MAT_T = 0.003;
const MAT_Y = PLATTER_Y0 + PLATTER_H + MAT_T / 2;
const REC_R = 0.15;
const REC_T = 0.0018;
const REC_Y = PLATTER_Y0 + PLATTER_H + MAT_T + REC_T / 2;
const PIVOT: [number, number] = [(BOARD_X0 + BOARD_X1) / 2, -0.15];
const ARM_Y = 0.043;
const ARM_LEN = 0.24;
const YAW_REST = 0;
const YAW_PLAY = -0.48; // игла попадает на начало дорожки (≈0.136 м от центра)
const LIFT = -0.075;
const RPM = { 33: (33.33 / 60) * Math.PI * 2, 45: (45 / 60) * Math.PI * 2 } as const;

// ---------- Тайминги (с) ----------
// Установка: перенос над корпусом (carry) → вертикальное опускание на шпиндель (drop) → тонарм.
const IN = { carry: 0.9, drop: 0.55, land: 1.45, liftAt: 1.5, liftDur: 0.3, swingAt: 1.8, swingDur: 1.0, lowerAt: 2.8, lowerDur: 0.35, spinAt: 3.1 };
// Высота переноса: заметно выше тонарма и блока противовеса (их верх ≈ 0.06 м).
const CARRY_Y = 0.115;
// Снятие: тонарм на подставку → пластинку поднимают вертикально (rise) → уносят влево, прочь от тонарма (away).
const OUT = { liftDur: 0.25, swingAt: 0.25, swingDur: 0.85, lowerAt: 1.1, lowerDur: 0.25, recAt: 1.45, rise: 0.45, away: 0.9 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => Math.pow(clamp01(x), 2.2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- Текстуры ----------

const canvas = makeCanvas;


/** Стробоскопические точки на боковине платтера (три ряда — 50/60 Гц и 45 об/мин). */
function strobeTexture() {
  const { cv, ctx } = canvas(2048, 96);
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#c4c4c4'); g.addColorStop(1, '#8a8a8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2048, 96);
  const rows: [number, number, number][] = [[14, 30, 180], [40, 56, 183], [66, 82, 177]];
  for (const [y0, y1, n] of rows) {
    const step = 2048 / n;
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


/**
 * Направление анизотропии винила: по касательной к бороздкам.
 * Именно это даёт настоящей пластинке «крест» из блика, который стоит на месте, пока диск крутится.
 */
function vinylAniso() {
  const S = 512, C = S / 2;
  const { cv, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - C + 0.5, dy = y - C + 0.5;
      const r = Math.hypot(dx, dy) / C;
      const i = (y * S + x) * 4;
      const tx = -dy / (r * C || 1), ty = dx / (r * C || 1);
      d[i] = (tx * 0.5 + 0.5) * 255;
      d[i + 1] = (ty * 0.5 + 0.5) * 255;
      d[i + 2] = r > 0.36 && r < 0.975 ? 255 : 0;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(cv, { srgb: false });
}

/**
 * Карта шероховатости «с жизнью»: отпечатки пальцев, разводы, пыль и микроцарапины.
 * Без неё любая поверхность выглядит как идеальный пластик.
 */
function grime(seed: number, base: number, opts: { prints?: number; scratches?: number; dust?: number; smudge?: number } = {}, S = 1024) {
  const k = S / 1024;
  const { cv, ctx } = canvas(S, S);
  const r = rng(seed);
  const g = Math.round(base * 255);
  ctx.fillStyle = `rgb(${g},${g},${g})`;
  ctx.fillRect(0, 0, S, S);
  // Крупные разводы — неравномерная протирка
  for (let i = 0; i < (opts.smudge ?? 26); i++) {
    const x = r() * S, y = r() * S, rad = (60 + r() * 220) * k;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const v = r() < 0.5 ? 0 : 255;
    gr.addColorStop(0, `rgba(${v},${v},${v},${0.05 + r() * 0.07})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Отпечатки пальцев — завитки чуть более гладкие (жир)
  for (let i = 0; i < (opts.prints ?? 5); i++) {
    const x = r() * S, y = r() * S, w = (26 + r() * 14) * k, rot = r() * Math.PI;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.lineWidth = 1.3 * Math.max(0.5, k);
    for (let k = 2; k < 15; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * (k / 15), w * 1.35 * (k / 15), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Микроцарапины — светлее (шероховатее)
  for (let i = 0; i < (opts.scratches ?? 260); i++) {
    const x = r() * S, y = r() * S, len = (8 + r() * 70) * k, a = r() * Math.PI;
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
    ctx.lineWidth = (0.6 + r() * 0.7) * Math.max(0.5, k);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Пыль
  for (let i = 0; i < Math.round((opts.dust ?? 900) * k * k); i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
    ctx.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  const t = toTexture(cv, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Светлые пылинки и волоски на виниле — поверх цветовой карты. */
function dustOnVinyl(tex: THREE.Texture, seed: number) {
  const cv = tex.image as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  const r = rng(seed);
  const S = cv.width, C = S / 2;
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2, rad = C * (0.38 + r() * 0.58);
    const x = C + Math.cos(a) * rad, y = C + Math.sin(a) * rad;
    ctx.fillStyle = `rgba(200,195,185,${0.25 + r() * 0.4})`;
    ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2, rad = C * (0.45 + r() * 0.45);
    const x = C + Math.cos(a) * rad, y = C + Math.sin(a) * rad;
    ctx.strokeStyle = 'rgba(190,185,175,.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 10, y - 14, x + 22, y + 6, x + 30 + r() * 20, y - 4);
    ctx.stroke();
  }
  tex.needsUpdate = true;
  return tex;
}

/** Шкала переключателя скоростей: 16 · 33 · 45 · 78 по кругу. */
function speedDialTexture() {
  const S = 512, C = S / 2;
  const { cv, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(C * 0.8, C * 0.7, 10, C, C, C);
  g.addColorStop(0, '#f4f3ef'); g.addColorStop(0.6, '#cfcdc8'); g.addColorStop(1, '#8f8d88');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  for (let r = 40; r < C; r += 3) { ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 64px Onest, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const marks: [string, number][] = [['16', -2.3], ['33', -0.8], ['45', 0.8], ['78', 2.3]];
  for (const [t, a] of marks) {
    ctx.save();
    ctx.translate(C + Math.sin(a) * C * 0.72, C - Math.cos(a) * C * 0.72);
    ctx.rotate(a);
    ctx.fillStyle = t === '33' || t === '45' ? '#b8341f' : '#1a1a1a';
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }
  return toTexture(cv);
}

/** Фаска верхней кромки платтера — полированный поясок, на котором ловится блик. */
function chamferRing(R: number, h: number) {
  const pts = [
    new THREE.Vector2(R - h * 1.2, 0),
    new THREE.Vector2(R - h * 0.5, -h * 0.15),
    new THREE.Vector2(R - h * 0.12, -h * 0.55),
    new THREE.Vector2(R, -h * 1.2),
  ];
  return new THREE.LatheGeometry(pts, 160);
}

// ---------- Общие ресурсы: создаются один раз на сессию ----------

// CC0-ассеты Poly Haven (взяты из набора pmndrs/assets) лежат отдельными файлами в public/ —
// грузятся параллельно и не раздувают JS.
const BASE = import.meta.env.BASE_URL;
const HDRI_URL = `${BASE}env/apartment.exr`;

const engraveCache = new Map<string, THREE.Texture>();
function engraveTex(text: string) {
  let t = engraveCache.get(text);
  if (!t) {
    t = decalTexture([text], { w: 512, h: 96, font: '600 60px Onest, sans-serif', color: 'rgba(214,206,192,.7)', spacing: 8 });
    engraveCache.set(text, t);
  }
  return t;
}

const buttonCache = new Map<string, { geo: THREE.BufferGeometry; grime: THREE.Texture }>();
function buttonRes(size: [number, number, number]) {
  const key = size.join(',');
  let r = buttonCache.get(key);
  if (!r) {
    r = {
      geo: new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(size[0], size[1], size[2]) * 0.3),
      grime: grime(Math.round(size[0] * 1000), 0.42, { prints: 1, scratches: 30, smudge: 6 }, 256),
    };
    buttonCache.set(key, r);
  }
  return r;
}

function buildKit() {
  const loadNormal = (name: string, rx: number, ry: number) => {
    const t = new THREE.TextureLoader().load(`${BASE}normals/${name}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  };
  const brushed = loadNormal('0004', 6, 1.5);
  const brushedFine = brushed.clone();
  brushedFine.repeat.set(3, 0.4);
  const normals = {
    brushed,
    brushedFine,
    powder: loadNormal('0021', 7, 7),
    rubber: loadNormal('0018', 10, 10),
    wood: loadNormal('0019', 1, 4),
  };
  const plate = grime(11, 0.6, { prints: 7, scratches: 320, dust: 1400 }, 1024);
  plate.repeat.set(1.4, 1.1);
  const grimes = {
    plate,
    vinyl: grime(23, 0.22, { prints: 3, scratches: 420, dust: 400, smudge: 18 }, 512),
    metal: grime(37, 0.34, { prints: 2, scratches: 500, dust: 300 }, 512),
    plastic: grime(41, 0.46, { prints: 2, scratches: 120 }, 512),
  };
  const strobe = strobeTexture();
  const mat = rubberMat();
  const geo = {
    body: new RoundedBoxGeometry(BODY_W, BODY.h, BODY_D, 4, 0.006),
    plate: new RoundedBoxGeometry(BODY_W - 0.004, 0.004, BODY_D - 0.004, 2, 0.0018),
    headshell: new RoundedBoxGeometry(0.019, 0.0045, 0.036, 2, 0.0018),
    cart: new RoundedBoxGeometry(0.014, 0.01, 0.019, 2, 0.0016),
    pivotBlock: new RoundedBoxGeometry(0.026, 0.024, 0.026, 3, 0.004),
    fader: new RoundedBoxGeometry(0.022, 0.011, 0.014, 2, 0.003),
    cueBox: new RoundedBoxGeometry(0.014, 0.012, 0.028, 2, 0.003),
    hinge: new RoundedBoxGeometry(0.04, 0.012, 0.016, 2, 0.003),
    chamfer: chamferRing(PLATTER_R, 0.004),
    vplate: new RoundedBoxGeometry(PLATE.x1 - PLATE.x0, 0.004, PLATE.z1 - PLATE.z0, 2, 0.0015),
    board: new RoundedBoxGeometry(BOARD_X1 - BOARD_X0, 0.006, PLATE.z1 - PLATE.z0, 2, 0.002),
    armBox: new RoundedBoxGeometry(0.03, 0.022, 0.05, 3, 0.004),
    armWeight: new RoundedBoxGeometry(0.026, 0.02, 0.034, 3, 0.003),
    shell: new RoundedBoxGeometry(0.022, 0.005, 0.048, 2, 0.0018),
  };
  // Материалы: шлифованный алюминий с анизотропным бликом, матовая порошковая краска, резина.
  const rubber = new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.92, normalMap: normals.rubber, normalScale: new THREE.Vector2(0.3, 0.3) });
  const ccMask = (() => {
    const { cv, ctx } = canvas(256, 256);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(128, 128, 128 * 0.345, 0, Math.PI * 2); ctx.fill();
    return toTexture(cv, { srgb: false });
  })();
  return {
    walnut: plankTexture(4),
    vRough: vinylRoughness(),
    aniso: vinylAniso(),
    ccMask,
    grimes,
    geo,
    normals,
    alu: new THREE.MeshPhysicalMaterial({ color: '#a3a29f', metalness: 1, roughness: 1, roughnessMap: grimes.metal, anisotropy: 0.75, normalMap: normals.brushedFine, normalScale: new THREE.Vector2(0.12, 0.12) }),
    // Трубка тонарма: шлифовка вдоль длины, поэтому анизотропия повёрнута на 90°.
    armTube: new THREE.MeshPhysicalMaterial({ color: '#b2b1ae', metalness: 1, roughness: 1, roughnessMap: grimes.metal, anisotropy: 0.9, anisotropyRotation: Math.PI / 2 }),
    aluPolished: new THREE.MeshPhysicalMaterial({ color: '#d6d5d2', metalness: 1, roughness: 0.14 }),
    aluDark: new THREE.MeshPhysicalMaterial({ color: '#7a7977', metalness: 1, roughness: 1, roughnessMap: grimes.metal, anisotropy: 0.5, normalMap: normals.brushedFine, normalScale: new THREE.Vector2(0.1, 0.1) }),
    blackMetal: new THREE.MeshPhysicalMaterial({ color: '#1d1c1b', metalness: 0.6, roughness: 1, roughnessMap: grimes.plastic, normalMap: normals.powder, normalScale: new THREE.Vector2(0.3, 0.3), clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    plastic: new THREE.MeshPhysicalMaterial({ color: '#161514', metalness: 0, roughness: 1, roughnessMap: grimes.plastic, clearcoat: 0.3, clearcoatRoughness: 0.45 }),
    rubber,
    platterMats: [
      new THREE.MeshStandardMaterial({ map: strobe, metalness: 0.9, roughness: 0.32 }),
      new THREE.MeshPhysicalMaterial({ color: '#7c7c7a', metalness: 1, roughness: 0.42, anisotropy: 0.7, normalMap: normals.brushed, normalScale: new THREE.Vector2(0.1, 0.1) }),
      new THREE.MeshStandardMaterial({ color: '#777', metalness: 1, roughness: 0.5 }),
    ],
    matMats: [rubber, new THREE.MeshStandardMaterial({ map: mat, roughness: 0.9, normalMap: normals.rubber, normalScale: new THREE.Vector2(0.35, 0.35) }), rubber],
    recordEdge: new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.32 }),
    // Светлая сатинированная алюминиевая панель, как на проигрывателях 60-х
    plateAlu: new THREE.MeshPhysicalMaterial({
      color: '#a9a7a1', metalness: 0.65, roughness: 1, roughnessMap: (() => { const t = grimes.plate.clone(); t.needsUpdate = true; return t; })(),
      anisotropy: 0.45, normalMap: brushedFine, normalScale: new THREE.Vector2(0.08, 0.08), clearcoat: 0.15, clearcoatRoughness: 0.4,
    }),
    // Чёрная планка тонарма — гладкий лакированный пластик
    boardMat: new THREE.MeshPhysicalMaterial({ color: '#0f0f0f', metalness: 0, roughness: 0.55, roughnessMap: grimes.plastic, clearcoat: 0.55, clearcoatRoughness: 0.2 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: '#e4e3df', metalness: 1, roughness: 0.16, roughnessMap: grimes.metal }),
    hook: new THREE.MeshPhysicalMaterial({ color: '#b9b8b3', metalness: 0.2, roughness: 0.4, clearcoat: 0.5 }),
    dial: speedDialTexture(),
    badge: decalTexture(['M.S.  studio'], { w: 512, h: 112, font: '600 64px Onest, sans-serif', color: '#d8d6d0', bg: '#141414', spacing: 6 }),
    table: (() => {
      const t = plankTexture(1);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1.4, 6);
      t.rotation = Math.PI / 2;
      return t;
    })(),
    wall: plasterTexture(),
  };
}

let kitInstance: ReturnType<typeof buildKit> | null = null;
/** Все текстуры, геометрия и материалы проигрывателя — один экземпляр на всю сессию. */
export function getKit() {
  return (kitInstance ??= buildKit());
}

const recordCache = new Map<string, THREE.Material[]>();
/** Материал пластинки для проекта: обложка на этикетке, пыль, анизотропия. Кэшируется. */
function recordMaterials(project: Project, code: string) {
  let mats = recordCache.get(project.id);
  if (!mats) {
    const kit = getKit();
    const vinyl = dustOnVinyl(vinylTexture(coverCanvas(project, code, 1024), undefined, 1024), 7);
    const face = new THREE.MeshPhysicalMaterial({
      map: vinyl, roughnessMap: kit.vRough, roughness: 0.85,
      // Анизотропный блик по бороздкам + тонкий «лак» со следами пальцев и пылью
      anisotropy: 0.92, anisotropyMap: kit.aniso,
      clearcoat: 0.4, clearcoatMap: kit.ccMask,
      clearcoatRoughness: 1, clearcoatRoughnessMap: kit.grimes.vinyl,
    });
    mats = [kit.recordEdge, face, face];
    recordCache.set(project.id, mats);
  }
  return mats;
}

// ---------- Мелкие детали ----------

function Engrave({ text, x, z, w, rot = 0 }: { text: string; x: number; z: number; w: number; rot?: number }) {
  const tex = engraveTex(text);
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
  const { geo: capGeo, grime: grimeMap } = buttonRes(size);
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
        geometry={capGeo}
      >
        <meshPhysicalMaterial color={color} roughness={0.38} metalness={0.05} clearcoat={0.35} clearcoatRoughness={0.4} roughnessMap={grimeMap} />
      </mesh>
    </group>
  );
}

// ---------- Свет и комната ----------

RectAreaLightUniformsLib.init();

let hdriPromise: Promise<THREE.Texture | null> | null = null;
let hdriTex: THREE.Texture | null = null;
/** HDRI-окружение: начинаем грузить сразу при импорте модуля, используем один экземпляр на сессию. */
function loadHdri() {
  return (hdriPromise ??= new Promise((resolve) => {
    new EXRLoader().load(HDRI_URL, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      resolve((hdriTex = tex));
    }, undefined, () => resolve(null));
  }));
}
loadHdri();

/** Большой мягкий «софтбокс» — широкие плавные блики на виниле и металле, как на предметной съёмке. */
function Softbox() {
  const ref = useRef<THREE.RectAreaLight>(null);
  useEffect(() => { ref.current?.lookAt(0.08, 0, 0); }, []);
  return <rectAreaLight ref={ref} position={[-0.32, 0.42, -0.26]} width={0.5} height={0.22} intensity={7} color="#ffe2c4" />;
}

function Lights() {
  const key = useRef<THREE.SpotLight>(null);
  const { scene, gl } = useThree();
  useEffect(() => {
    // HDRI-окружение даёт честные отражения в металле и виниле. Оно грузится заранее (при импорте модуля),
    // поэтому окружение задаётся один раз и шейдеры не перекомпилируются посреди анимации.
    let alive = true;
    let fallback: THREE.Texture | null = null;
    const apply = (tex: THREE.Texture | null) => {
      if (!alive) return;
      if (tex) {
        scene.environment = tex;
        scene.environmentIntensity = 0.24;
        scene.environmentRotation.set(0, 1.2, 0);
      } else {
        // EXR не загрузился — процедурная комната.
        const pmrem = new THREE.PMREMGenerator(gl);
        const room = new RoomEnvironment();
        fallback = pmrem.fromScene(room, 0.04).texture;
        room.dispose();
        pmrem.dispose();
        scene.environment = fallback;
        scene.environmentIntensity = 0.3;
      }
    };
    if (hdriTex) apply(hdriTex);
    else loadHdri().then(apply);
    return () => { alive = false; fallback?.dispose(); };
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
        position={[-0.45, 0.95, 0.35]}
        angle={0.6}
        penumbra={0.85}
        decay={2}
        intensity={5.5}
        color="#ffe0c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.008}
        shadow-radius={6}
        shadow-blurSamples={16}
      />
      <pointLight position={[0.55, 0.45, -0.55]} intensity={0.9} color="#ff9a52" decay={2} />
      <hemisphereLight args={['#ffd8b0', '#140a04', 0.16]} />
      <Softbox />
    </>
  );
}

function Room() {
  const { table, wall } = getKit();
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
  const {
    walnut, geo, normals,
    armTube, aluPolished, plastic, platterMats, matMats,
    plateAlu, boardMat, chrome, hook, dial, badge,
  } = getKit();
  const recordMats = useMemo(() => recordMaterials(project, code), [project, code]);

  const record = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const armYaw = useRef<THREE.Group>(null);
  const armPitch = useRef<THREE.Group>(null);
  const cue = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);

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
      // Пластинку приносят слева, высоко над корпусом, почти ровно…
      const c = smooth(t / IN.carry);
      const cOut = easeOut(t / IN.carry);
      rx = lerp(-0.5, 0, cOut);
      rz = lerp(-0.08, 0, c);
      // …и над шпинделем опускают строго вертикально, мягко притормаживая у мата.
      const d = smooth((t - IN.carry) / IN.drop);
      ry = lerp(CARRY_Y + 0.03 * (1 - c), REC_Y, d);
      tilt = 0.12 * (1 - c);
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
      // Сначала строго вверх, над тонармом…
      const up = smooth((u - OUT.recAt) / OUT.rise);
      // …затем влево, за край кадра, с лёгким наклоном «в руке».
      const aw = easeIn((u - OUT.recAt - OUT.rise) / OUT.away);
      ry = lerp(REC_Y, CARRY_Y, up) + 0.04 * aw;
      rx = lerp(0, -0.55, aw);
      rz = lerp(0, -0.06, aw);
      tilt = 0.12 * aw;
    }

    // Разгон и выбег диска с инерцией тяжёлого платтера.
    const target = motor ? RPM[speedRef.current] : 0;
    const k = target > omega.current ? 1.5 : 0.9;
    omega.current += (target - omega.current) * (1 - Math.exp(-k * dt));
    if (spin.current) spin.current.rotation.y -= omega.current * dt;

    if (record.current) {
      record.current.position.set(rx, ry, rz);
      record.current.rotation.set(tilt * 0.4, 0, tilt);
    }
    if (armYaw.current) armYaw.current.rotation.y = yaw;
    if (armPitch.current) armPitch.current.rotation.x = pitch;
    if (cue.current) cue.current.rotation.x = -0.6 * cueA;
    if (led.current) led.current.emissiveIntensity = 0.1 + 2.6 * (motor ? 1 : 0);
  });

  const busy = () => leaveAt.current !== null;

  return (
    <group>
      {/* Корпус: ореховая рамка */}
      <mesh position={[BODY_CX, -BODY.h / 2, 0]} castShadow receiveShadow geometry={geo.body}>
        <meshPhysicalMaterial map={walnut} color="#5e3a22" roughness={0.5} normalMap={normals.wood} normalScale={new THREE.Vector2(0.35, 0.35)} clearcoat={0.5} clearcoatRoughness={0.3} />
      </mesh>
      {/* Светлая алюминиевая панель — чуть утоплена в рамку */}
      <mesh position={[(PLATE.x0 + PLATE.x1) / 2, -0.0012, (PLATE.z0 + PLATE.z1) / 2]} receiveShadow geometry={geo.vplate} material={plateAlu} />
      {/* Чёрная планка тонарма справа */}
      <mesh position={[(BOARD_X0 + BOARD_X1) / 2, -0.0005, (PLATE.z0 + PLATE.z1) / 2]} receiveShadow castShadow geometry={geo.board} material={boardMat} />

      {/* Платтер (почти не виден из-под пластинки), резиновый мат, шпиндель */}
      <mesh position={[0, PLATTER_Y0 + PLATTER_H / 2, 0]} castShadow receiveShadow material={platterMats}>
        <cylinderGeometry args={[PLATTER_R, PLATTER_R, PLATTER_H, 160, 1]} />
      </mesh>
      <mesh position={[0, PLATTER_Y0 + PLATTER_H + 0.0001, 0]} geometry={geo.chamfer} material={aluPolished} />
      <mesh position={[0, MAT_Y, 0]} receiveShadow material={matMats}>
        <cylinderGeometry args={[REC_R + 0.001, REC_R + 0.001, MAT_T, 128]} />
      </mesh>
      <mesh position={[0, MAT_Y + 0.011, 0]} castShadow material={chrome}>
        <cylinderGeometry args={[0.0036, 0.0036, 0.02, 24]} />
      </mesh>

      {/* Пластинка */}
      <group ref={record}>
        <group ref={spin}>
          <mesh castShadow receiveShadow material={recordMats}>
            <cylinderGeometry args={[REC_R, REC_R, REC_T, 128, 1]} />
          </mesh>
        </group>
      </group>

      {/* Тонарм: угловатый блок-ось, прямая трубка квадратного сечения, плоская головка */}
      <group position={[PIVOT[0], 0, PIVOT[1]]}>
        <mesh position={[0, 0.006, 0]} castShadow receiveShadow material={boardMat}>
          <cylinderGeometry args={[0.022, 0.024, 0.012, 48]} />
        </mesh>
        <group ref={armYaw}>
          {/* Корпус оси — серебристый блок с чёрной крышкой */}
          <mesh position={[0, 0.028, 0.006]} castShadow geometry={geo.armBox} material={chrome} />
          <mesh position={[0, 0.0395, 0.006]} castShadow material={boardMat}>
            <boxGeometry args={[0.026, 0.002, 0.042]} />
          </mesh>
          <group ref={armPitch} position={[0, ARM_Y, 0]}>
            {/* Противовес — блок позади оси */}
            <mesh position={[0, -0.004, -0.038]} castShadow geometry={geo.armWeight} material={chrome} />
            <mesh position={[0, 0.0065, -0.038]} material={boardMat}>
              <boxGeometry args={[0.02, 0.0012, 0.026]} />
            </mesh>
            {/* Трубка */}
            <mesh position={[0, -0.006, ARM_LEN / 2 + 0.006]} castShadow material={armTube}>
              <boxGeometry args={[0.0075, 0.0075, ARM_LEN - 0.034]} />
            </mesh>
            {/* Головка: плоская, под углом, с пальчиком-лифтом */}
            <group position={[0, -0.009, ARM_LEN - 0.014]} rotation-y={-0.42}>
              <mesh castShadow geometry={geo.shell} material={boardMat} />
              <mesh position={[0, 0.0028, 0]} material={chrome}>
                <boxGeometry args={[0.016, 0.0006, 0.04]} />
              </mesh>
              <mesh position={[0.019, 0.001, 0.008]} rotation-z={0.3} castShadow material={chrome}>
                <boxGeometry args={[0.018, 0.0016, 0.006]} />
              </mesh>
              <mesh position={[0, -0.006, 0.004]} castShadow material={plastic}>
                <boxGeometry args={[0.014, 0.008, 0.018]} />
              </mesh>
              <mesh position={[0, -0.0112, 0.01]} material={chrome}>
                <cylinderGeometry args={[0.0005, 0.0003, 0.003, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* Подставка тонарма — светло-серый крючок */}
      <group position={[PIVOT[0] + 0.004, 0, PIVOT[1] + ARM_LEN - 0.075]}>
        <mesh position={[0, 0.016, 0]} castShadow material={hook}>
          <boxGeometry args={[0.006, 0.032, 0.006]} />
        </mesh>
        <mesh position={[0.006, 0.031, 0]} castShadow material={hook}>
          <boxGeometry args={[0.016, 0.004, 0.008]} />
        </mesh>
      </group>

      {/* Рычаг подъёма (микролифт) */}
      <group position={[BOARD_X1 - 0.014, 0, -0.07]}>
        <mesh position={[0, 0.004, 0]} castShadow material={boardMat}>
          <boxGeometry args={[0.012, 0.008, 0.024]} />
        </mesh>
        <group ref={cue} position={[0, 0.008, 0.006]}>
          <mesh position={[0, 0.007, 0]} castShadow material={chrome}>
            <boxGeometry args={[0.004, 0.014, 0.004]} />
          </mesh>
        </group>
      </group>
      <Engrave text="LIFT" x={BOARD_X1 - 0.014} z={-0.092} w={0.018} />

      {/* Переключатель скоростей — круглая хромированная ручка (клик: 33 ↔ 45) */}
      <group position={[(BOARD_X0 + BOARD_X1) / 2 + 0.006, 0, PLATE.z1 - 0.032]}>
        <mesh position={[0, 0.002, 0]} receiveShadow material={boardMat}>
          <cylinderGeometry args={[0.03, 0.03, 0.004, 64]} />
        </mesh>
        <mesh
          position={[0, 0.008, 0]}
          rotation-y={speed === 33 ? 0.8 : -0.8}
          castShadow
          onClick={(e) => { e.stopPropagation(); setSpeed((v) => (v === 33 ? 45 : 33)); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        >
          <cylinderGeometry args={[0.024, 0.025, 0.01, 64]} />
          <meshPhysicalMaterial attach="material-0" color="#bdbbb6" metalness={1} roughness={0.3} />
          <meshPhysicalMaterial attach="material-1" map={dial} metalness={0.6} roughness={0.28} clearcoat={0.8} />
          <meshPhysicalMaterial attach="material-2" color="#8a8884" metalness={1} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.0135, 0]} material={chrome}>
          <cylinderGeometry args={[0.009, 0.01, 0.002, 40]} />
        </mesh>
        {/* Указатель */}
        <mesh position={[0, 0.0034, -0.028]}>
          <boxGeometry args={[0.0018, 0.0006, 0.004]} />
          <meshStandardMaterial color="#e8e2d8" />
        </mesh>
      </group>

      {/* START·STOP — красная клавиша-индикатор на нижней кромке панели */}
      <PushButton
        position={[0.105, 0, PLATE.z1 - 0.013]}
        size={[0.026, 0.004, 0.011]}
        color={running ? '#d8402a' : '#6e1a12'}
        active={running}
        label="start-stop"
        onPress={() => { if (!busy()) setRunning((r) => !r); }}
      />
      <mesh position={[0.105, 0.0062, PLATE.z1 - 0.013]}>
        <boxGeometry args={[0.02, 0.0004, 0.006]} />
        <meshStandardMaterial ref={led} color="#ff5a3c" emissive="#ff3a1c" emissiveIntensity={0.1} transparent opacity={0.8} />
      </mesh>

      {/* Шильдик */}
      <mesh position={[PLATE.x0 + 0.05, 0.0012, PLATE.z1 - 0.013]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.07, 0.0153]} />
        <meshStandardMaterial map={badge} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** 3D-проигрыватель сверху: половина пластинки у левого края, тонарм и органы управления справа. */
/** Компилирует все шейдеры сцены заранее, пока проигрыватель ещё скрыт, — без паузы при первом показе. */
function Prewarm() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let alive = true;
    loadHdri().then(() => {
      // Ждём кадр, чтобы окружение успело примениться, затем собираем все программы шейдеров.
      requestAnimationFrame(() => {
        if (!alive) return;
        try {
          gl.compile(scene, camera);
          gl.render(scene, camera);
        } catch { /* необязательная оптимизация */ }
      });
    });
    return () => { alive = false; };
  }, [gl, scene, camera]);
  return null;
}

/**
 * 3D-проигрыватель сверху: половина пластинки у левого края, тонарм и органы управления справа.
 * Canvas живёт всю сессию; при смене пластинки пересоздаётся только сам проигрыватель (по session).
 */
export default function Player3D({ session, active, ...props }: StageProps) {
  return (
    <Canvas
      className="player3d"
      frameloop={active ? 'always' : 'never'}
      shadows={{ type: THREE.VSMShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [0.165, 0.655, 0.115], fov: 36, near: 0.01, far: 6 }}
      onCreated={({ camera }) => camera.lookAt(0.165, 0, -0.008)}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={['#0d0907']} />
      <fog attach="fog" args={['#0d0907', 1.2, 2.6]} />
      <Lights />
      <Room />
      <Turntable key={session} {...props} />
      <Prewarm />
    </Canvas>
  );
}
