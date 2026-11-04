import * as THREE from 'three';
import { addGrain } from './drawCover';

// Все текстуры генерируются кодом на canvas — без внешних файлов, сайт целиком статичный.

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

/** Детерминированный ГПСЧ, чтобы доски выглядели одинаково при каждой загрузке. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function toTexture(cv: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: [number, number] } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...opts.repeat);
  }
  return t;
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/** Волокно дерева вдоль длинной стороны: годовые кольца, сучки, неровный тон. */
function paintWood(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, rand: () => number, lines = 70) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(base, 1.08));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, 0.86));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < lines; i++) {
    const y0 = rand() * h;
    const amp = 1 + rand() * (h / 14);
    const freq = 0.002 + rand() * 0.006;
    const ph = rand() * 10;
    const dark = rand() < 0.65;
    ctx.strokeStyle = dark ? `rgba(40,18,6,${0.06 + rand() * 0.22})` : `rgba(255,220,170,${0.03 + rand() * 0.08})`;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.7 + ph) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Сучки
  const knots = rand() < 0.6 ? 1 + Math.floor(rand() * 2) : 0;
  for (let k = 0; k < knots; k++) {
    const kx = rand() * w;
    const ky = h * (0.25 + rand() * 0.5);
    const r = h * (0.08 + rand() * 0.1);
    for (let j = 6; j > 0; j--) {
      ctx.strokeStyle = `rgba(45,20,6,${0.08 + (6 - j) * 0.05})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * j * 0.55 * 2.4, r * j * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,16,4,.55)';
    ctx.beginPath(); ctx.ellipse(kx, ky, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** Доска ящика. Несколько вариантов, чтобы рейки не были одинаковыми. */
export function plankTexture(seed: number) {
  const tones = ['#9a6539', '#8a5a33', '#a26c3e', '#8f5e35', '#96633a', '#85552f'];
  const rand = rng(seed * 7919 + 13);
  const { cv, ctx } = canvas(1024, 192);
  paintWood(ctx, 1024, 192, tones[seed % tones.length], rand, 90);
  // Затемнение кромок — фаска
  const e = ctx.createLinearGradient(0, 0, 0, 192);
  e.addColorStop(0, 'rgba(255,225,190,.18)');
  e.addColorStop(0.06, 'rgba(0,0,0,0)');
  e.addColorStop(0.92, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, 1024, 192);
  return toTexture(cv);
}

/** Паркет из длинных досок с торцевыми стыками вразбежку. */
export function floorTexture() {
  const rand = rng(4242);
  const W = 2048, H = 2048, boards = 8, bw = W / boards;
  const { cv, ctx } = canvas(W, H);
  const tones = ['#4a2f1c', '#55371f', '#432a19', '#5a3b22', '#4e321e'];
  for (let b = 0; b < boards; b++) {
    let y = -rand() * 900;
    while (y < H) {
      const len = 700 + rand() * 900;
      const tone = tones[Math.floor(rand() * tones.length)];
      const piece = canvas(Math.ceil(len), bw);
      paintWood(piece.ctx, Math.ceil(len), bw, tone, rand, 40);
      ctx.save();
      ctx.translate(b * bw + bw, y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(piece.cv, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(b * bw, y + len - 2, bw, 3);
      y += len;
    }
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(b * bw, 0, 3, H);
    ctx.fillStyle = 'rgba(255,215,170,.05)';
    ctx.fillRect(b * bw + 3, 0, 1, H);
  }
  return toTexture(cv, { repeat: [2, 2] });
}

/** Штукатурка с неровной фактурой и тёплым тоном. */
export function plasterTexture() {
  const rand = rng(77);
  const { cv, ctx } = canvas(1024, 1024);
  ctx.fillStyle = '#4a3527';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 1400; i++) {
    const x = rand() * 1024, y = rand() * 1024, r = 10 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.5;
    g.addColorStop(0, dark ? 'rgba(20,10,4,.07)' : 'rgba(255,220,180,.035)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  addGrain(ctx, 1024, 0.07);
  return toTexture(cv, { repeat: [3, 2] });
}

/** Карта неровностей для штукатурки (линейная, не sRGB). */
export function plasterBump() {
  const rand = rng(91);
  const { cv, ctx } = canvas(512, 512);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = rand() * 512, y = rand() * 512, r = 4 + rand() * 30;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  addGrain(ctx, 512, 0.25);
  return toTexture(cv, { srgb: false, repeat: [6, 4] });
}

/** Лицевая сторона винила: бороздки, межтрековые паузы, этикетка с обложкой. */
export function vinylTexture(cover: HTMLCanvasElement | null, labelColor = '#E0452C') {
  const S = 1024, C = S / 2;
  const { cv, ctx } = canvas(S, S);
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath(); ctx.arc(C, C, C, 0, Math.PI * 2); ctx.fill();
  for (let r = C * 0.36; r < C * 0.975; r += 1.6) {
    const t = r / C;
    const gap = [0.53, 0.69, 0.84].some((g) => Math.abs(t - g) < 0.006);
    ctx.strokeStyle = gap ? '#050505' : (Math.floor(r / 1.6) % 2 ? '#141414' : '#0e0e0e');
    ctx.lineWidth = gap ? 2.4 : 1;
    ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke();
  }
  // Гладкий бортик
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(C, C, C * 0.985, 0, Math.PI * 2); ctx.stroke();
  // Этикетка
  const lr = C * 0.335;
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, lr, 0, Math.PI * 2); ctx.clip();
  if (cover) ctx.drawImage(cover, C - lr * 1.25, C - lr * 1.25, lr * 2.5, lr * 2.5);
  else { ctx.fillStyle = labelColor; ctx.fillRect(0, 0, S, S); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(C, C, lr, 0, Math.PI * 2); ctx.stroke();
  // Отверстие
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(C, C, C * 0.022, 0, Math.PI * 2); ctx.fill();
  return toTexture(cv);
}

/** Шероховатость винила: бороздки матовее, пауза и бортик глянцевее (линейная). */
export function vinylRoughness() {
  const S = 512, C = S / 2;
  const { cv, ctx } = canvas(S, S);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, 0, S, S);
  for (let r = C * 0.36; r < C * 0.975; r += 1.2) {
    ctx.strokeStyle = Math.floor(r / 1.2) % 2 ? '#6e6e6e' : '#3c3c3c';
    ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#b0b0b0';
  ctx.beginPath(); ctx.arc(C, C, C * 0.335, 0, Math.PI * 2); ctx.fill();
  return toTexture(cv, { srgb: false });
}

/** Картон конверта: изнанка и торцы. */
export function cardboardTexture() {
  const rand = rng(5);
  const { cv, ctx } = canvas(512, 512);
  ctx.fillStyle = '#cbbfa8';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(90,70,40,${rand() * 0.08})`;
    ctx.beginPath();
    const y = rand() * 512;
    ctx.moveTo(0, y); ctx.lineTo(512, y + (rand() - 0.5) * 20);
    ctx.stroke();
  }
  addGrain(ctx, 512, 0.12);
  return toTexture(cv);
}

/** Текстовая наклейка/штамп на прозрачном фоне. */
export function decalTexture(lines: string[], opts: { w: number; h: number; font: string; color: string; bg?: string; spacing?: number }) {
  const { cv, ctx } = canvas(opts.w, opts.h);
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, opts.w, opts.h); }
  ctx.fillStyle = opts.color;
  ctx.font = opts.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${opts.spacing ?? 0}px`;
  lines.forEach((l, k) => ctx.fillText(l, opts.w / 2, (opts.h / (lines.length + 1)) * (k + 1)));
  return toTexture(cv);
}

/** Вертикальный градиент прозрачности для светового конуса (линейная). */
export function beamAlpha() {
  const { cv, ctx } = canvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#000');
  g.addColorStop(0.12, '#bbb');
  g.addColorStop(0.55, '#555');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return toTexture(cv, { srgb: false });
}

/** Мягкое круглое пятнышко для пылинок. */
export function dotTexture() {
  const { cv, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,220,1)');
  g.addColorStop(0.4, 'rgba(255,220,180,.5)');
  g.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(cv);
}
