import type { Project } from '../data/projects';

// Рисует постерную обложку на canvas — та же композиция, что и в DOM-компоненте Cover,
// но в текстуру для 3D. Координаты — в units: 1 unit = 1% стороны обложки.

const STAR = [50, 0, 55.7, 28.7, 75, 6.7, 65.6, 34.4, 93.3, 25, 71.3, 44.3, 100, 50, 71.3, 55.7, 93.3, 75, 65.6, 65.6, 75, 93.3, 55.7, 71.3, 50, 100, 44.3, 71.3, 25, 93.3, 34.4, 65.6, 6.7, 75, 28.7, 55.7, 0, 50, 28.7, 44.3, 6.7, 25, 34.4, 34.4, 25, 6.7, 44.3, 28.7];

export function drawCover(project: Project, code: string, size = 1024): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const U = size / 100;
  const c = project.cover;

  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * U, y * U, w * U, h * U);
  };
  const strokeRect = (x: number, y: number, w: number, h: number, lw: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * U;
    ctx.strokeRect((x + lw / 2) * U, (y + lw / 2) * U, (w - lw) * U, (h - lw) * U);
  };
  const text = (
    s: string, x: number, y: number, fs: number, color: string,
    opts: { font?: 'oswald' | 'onest'; align?: CanvasTextAlign; lh?: number; spacing?: number; fromBottom?: boolean } = {},
  ) => {
    const lines = s.toUpperCase().split('\n');
    const lh = opts.lh ?? 0.84;
    ctx.font = opts.font === 'onest' ? `700 ${fs * U}px Onest, sans-serif` : `700 ${fs * U}px Oswald, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(opts.spacing ?? 0) * fs * U}px`;
    const total = lines.length * lh * fs;
    const top = opts.fromBottom ? y - total : y;
    lines.forEach((line, k) => {
      // базовая линия ≈ 0.78 кегля от верха строки для кондансед-гротеска
      ctx.fillText(line, x * U, (top + k * lh * fs + 0.8 * fs * Math.min(lh, 1)) * U);
    });
  };
  const halftone = (cx: number, cy: number, r: number, dot: number, step: number, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx * U, cy * U, r * U, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = color;
    for (let y = cy - r; y <= cy + r; y += step) {
      for (let x = cx - r; x <= cx + r; x += step) {
        ctx.beginPath();
        ctx.arc((x + step / 2) * U, (y + step / 2) * U, dot * U, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };
  const star = (x: number, y: number, s: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < STAR.length; k += 2) {
      const px = (x + (STAR[k] / 100) * s) * U;
      const py = (y + (STAR[k + 1] / 100) * s) * U;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };

  rect(0, 0, 100, 100, c.bg);

  if (c.layout === 'sun') {
    text('M.S. Records', 5.5, 5, 2.4, c.fg, { font: 'onest', spacing: 0.1, lh: 1 });
    text(`Vol.01 / ${code}`, 94.5, 5, 2.4, c.fg, { font: 'onest', spacing: 0.1, lh: 1, align: 'right' });
    rect(5.5, 10.5, 89, 0.5, c.fg);
    text(c.word, 4.5, 12, c.wordSize, c.fg);
    halftone(26, 68, 18, 0.42, 1.5, c.accent);
    star(63, 47, 30, c.fg);
    text(c.tagline, 5.5, 95, 4.6, c.fg, { lh: 0.95, fromBottom: true });
    for (let x = 0; x < 17; x += 1.9) { rect(77.5 + x, 88, 0.6, 7, c.fg); rect(77.5 + x + 1, 88, 0.25, 7, c.fg); }
  }

  if (c.layout === 'tall') {
    halftone(78, 80, 32, 0.5, 1.6, c.fg);
    text(c.word, 5, 4.5, c.wordSize, c.accent, { lh: 0.8 });
    star(68, 6, 26, c.accent);
    text(c.tagline, 5, 88, 4.2, c.fg, { lh: 0.95, fromBottom: true });
    text(`${code} · M.S. Records`, 5, 95, 2.4, c.fg, { font: 'onest', spacing: 0.1, lh: 1, fromBottom: true });
  }

  if (c.layout === 'grid') {
    rect(5, 5, 43, 40, c.fg);
    const lines = c.word.split('\n').length;
    text(c.word, 8, 43 - 0.84 * c.wordSize * lines, c.wordSize, c.bg);
    strokeRect(50, 5, 45, 40, 0.5, c.fg);
    ctx.save();
    ctx.beginPath();
    ctx.rect(50.5 * U, 5.5 * U, 44 * U, 39 * U);
    ctx.clip();
    ctx.globalAlpha = 0.9;
    for (let y = 5.5; y < 45; y += 1.4) for (let x = 50.5; x < 95; x += 1.4) {
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc((x + 0.7) * U, (y + 0.7) * U, 0.38 * U, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    strokeRect(5, 47, 28, 48, 0.5, c.fg);
    ctx.save();
    ctx.translate(19 * U, 69 * U);
    ctx.fillStyle = c.fg;
    for (let a = 0; a < 3; a++) {
      ctx.rotate((a === 0 ? 0 : 60) * (Math.PI / 180));
      ctx.fillRect(-1.76 * U, -11 * U, 3.52 * U, 22 * U);
    }
    ctx.restore();
    rect(35, 47, 60, 48, c.fg);
    text(c.tagline, 39, 51, 7.5, c.bg, { lh: 0.9 });
    text(`${code} · ${project.year}`, 39, 85, 2.4, c.bg, { font: 'onest', spacing: 0.1, lh: 1 });
  }

  if (c.layout === 'night') {
    text(`M.S. Records · ${code}`, 50, 6, 2.4, c.fg, { font: 'onest', spacing: 0.14, lh: 1, align: 'center' });
    text(c.word, 50, 11, c.wordSize, c.fg, { align: 'center', lh: 0.88 });
    halftone(50, 72, 30, 0.55, 1.6, c.accent);
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.arc(50 * U, 70 * U, 12 * U, 0, Math.PI * 2); ctx.fill();
    text(project.kind, 50, 95, 2.3, c.fg, { font: 'onest', spacing: 0.14, lh: 1, align: 'center', fromBottom: true });
  }

  // Стикер на плёнке
  if (c.sticker) {
    const s = c.sticker;
    ctx.save();
    ctx.translate(85 * U, 14.5 * U);
    ctx.rotate((12 * Math.PI) / 180);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 0.8 * U; ctx.shadowOffsetY = 0.4 * U;
    ctx.fillStyle = s.bg;
    ctx.beginPath(); ctx.arc(0, 0, 9.5 * U, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = s.fg;
    ctx.font = `800 ${3.4 * U}px Onest, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = s.text.toUpperCase().split('\n');
    lines.forEach((l, k) => ctx.fillText(l, 0, (k - (lines.length - 1) / 2) * 3.6 * U));
    ctx.restore();
  }

  // Потёртый круг от пластинки, зерно печати и виньетка
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1.6 * U;
  ctx.beginPath(); ctx.arc(50 * U, 50 * U, 45.8 * U, 0, Math.PI * 2); ctx.stroke();
  addGrain(ctx, size, 0.16);
  const vg = ctx.createRadialGradient(50 * U, 50 * U, 30 * U, 50 * U, 50 * U, 72 * U);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.32)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, size, size);

  return cv;
}

/** Мелкое тёмно-светлое зерно поверх уже нарисованного. */
export function addGrain(ctx: CanvasRenderingContext2D, size: number, amount: number) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
