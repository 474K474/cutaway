import { useEffect, useState } from 'react';
import { projects, trackCode } from '../data/projects';
import { drawCover } from '../three/drawCover';
import { rng, waitFonts } from '../util/canvas';

// Лёгкие ассеты для мобильной версии: всё рисуется на canvas, three.js не грузится.

/** Обложки всех пластинок как data-URL (после загрузки шрифтов, чтобы надписи были правильным шрифтом). */
export function useCoverImages() {
  const [urls, setUrls] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    // Blob + objectURL вместо синхронного toDataURL: кодирование JPEG идёт вне основного потока.
    waitFonts().then(async () => {
      for (let i = 0; i < projects.length; i++) {
        if (!alive) return;
        const cv = drawCover(projects[i], trackCode(projects, i), 720);
        const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.86));
        made.push(blob ? URL.createObjectURL(blob) : cv.toDataURL('image/jpeg', 0.86));
      }
      if (alive) setUrls(made);
    });
    return () => {
      alive = false;
      made.forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u));
    };
  }, []);
  return urls;
}

/** Доски ящика с волокном — та же эстетика, что у 3D-ящика на десктопе. */
export function woodDataUrl(seed = 3, w = 900, h = 360, boards = 3) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const r = rng(seed);
  const tones = ['#9a6539', '#8a5a33', '#a26c3e', '#8f5e35', '#96633a'];
  const bh = h / boards;
  for (let b = 0; b < boards; b++) {
    const y0 = b * bh;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + bh);
    const base = tones[Math.floor(r() * tones.length)];
    g.addColorStop(0, base); g.addColorStop(1, '#6b4325');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, w, bh);
    for (let i = 0; i < 46; i++) {
      const yy = y0 + r() * bh, amp = 1 + r() * 6, f = 0.003 + r() * 0.008, ph = r() * 10;
      ctx.strokeStyle = r() < 0.65 ? `rgba(40,18,6,${0.08 + r() * 0.22})` : `rgba(255,220,170,${0.04 + r() * 0.08})`;
      ctx.lineWidth = 0.6 + r() * 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = yy + Math.sin(x * f + ph) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Щель между досками и фаска
    ctx.fillStyle = 'rgba(255,225,190,.22)';
    ctx.fillRect(0, y0, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, y0 + bh - 4, w, 4);
  }
  return cv.toDataURL('image/jpeg', 0.85);
}

/** Короткий тактильный «тик» (Android; на iOS вибрация из браузера недоступна). */
export function tick(ms = 7) {
  try { navigator.vibrate?.(ms); } catch { /* нет вибромотора */ }
}

/** Наклон телефона (гироскоп) → небольшое смещение для бликов и поворота конверта. */
export function useTilt() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let raf = 0;
    let next = { x: 0, y: 0 };
    const on = (e: DeviceOrientationEvent) => {
      const g = Math.max(-25, Math.min(25, e.gamma ?? 0));
      const b = Math.max(-25, Math.min(25, (e.beta ?? 45) - 45));
      next = { x: b / 25, y: g / 25 };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTilt(next); });
    };
    window.addEventListener('deviceorientation', on);
    return () => { window.removeEventListener('deviceorientation', on); cancelAnimationFrame(raf); };
  }, []);
  return tilt;
}

/** iOS требует явного разрешения на гироскоп — запрашиваем по первому касанию. */
export function requestTiltPermission() {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  D?.requestPermission?.().catch(() => undefined);
}
