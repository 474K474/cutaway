import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Project } from '../data/projects';
import { tick, useTilt } from './assets';

interface Props {
  project: Project;
  code: string;
  cover: string | null;
  leaving: boolean;
  onPlay: () => void;
  onBack: () => void;
}

const MAX_Y = 70; // насколько можно повернуть конверт вбок
const MAX_X = 28;

/** Плавный «осмотр» как в CS: при открытии конверт сам поворачивается, потом его можно крутить пальцем. */
const INTRO: [number, number, number][] = [
  // [время, с], [rotY], [rotX]
  [0, 0, 0], [0.55, 0, 0], [1.15, -42, 8], [1.85, 30, -6], [2.45, 0, 0],
];

function introAt(t: number): [number, number] {
  for (let i = 1; i < INTRO.length; i++) {
    const [t1, y1, x1] = INTRO[i];
    const [t0, y0, x0] = INTRO[i - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const e = u * u * (3 - 2 * u);
      return [y0 + (y1 - y0) * e, x0 + (x1 - x0) * e];
    }
  }
  return [0, 0];
}

export function Inspect({ project: p, code, cover, leaving, onPlay, onBack }: Props) {
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const rotRef = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; rx: number; ry: number; lx: number; ly: number; lt: number } | null>(null);
  const introDone = useRef(false);
  const lastTick = useRef(0);
  const tilt = useTilt();

  // Один цикл анимации: интро → пружина назад к фронту после отпускания.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      if (!introDone.current) {
        const [y, x] = introAt(t);
        rotRef.current = { x, y };
        if (t > INTRO[INTRO.length - 1][0]) introDone.current = true;
      } else if (!drag.current) {
        const r = rotRef.current, v = vel.current;
        v.y += (-r.y * 38 - v.y * 7) * dt;
        v.x += (-r.x * 38 - v.x * 7) * dt;
        r.y += v.y * dt; r.x += v.x * dt;
      }
      setRot({ ...rotRef.current });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rubber = (v: number, max: number) => (Math.abs(v) <= max ? v : Math.sign(v) * (max + (Math.abs(v) - max) * 0.25));

  const down = (e: PointerEvent) => {
    introDone.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rx: rotRef.current.x, ry: rotRef.current.y, lx: e.clientX, ly: e.clientY, lt: performance.now() };
    vel.current = { x: 0, y: 0 };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lt) / 1000;
    vel.current = { y: ((e.clientX - d.lx) * 0.45) / dt, x: (-(e.clientY - d.ly) * 0.3) / dt };
    d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
    const y = rubber(d.ry + (e.clientX - d.x) * 0.45, MAX_Y);
    const x = rubber(d.rx - (e.clientY - d.y) * 0.3, MAX_X);
    if (Math.abs(y - lastTick.current) > 18) { lastTick.current = y; tick(4); }
    rotRef.current = { x, y };
  };
  const up = () => {
    drag.current = null;
    vel.current = { x: vel.current.x * 0.35, y: vel.current.y * 0.35 };
  };

  const ry = rot.y + tilt.y * 8;
  const rx = rot.x - tilt.x * 6;
  const light = 1 - Math.min(0.45, Math.abs(ry) / 160) + (ry < 0 ? 0.04 : 0);
  const glossX = 50 + ry * 0.9;
  const box = { '--ry': `${ry}deg`, '--rx': `${rx}deg` } as CSSProperties;

  return (
    <section className={`m-inspect${leaving ? ' leaving' : ''}`}>
      <button className="m-back" onClick={onBack}>← В ящик</button>

      <div className="m-insp-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="m-insp-shadow" style={{ transform: `translateX(${ry * 0.4}px) scaleX(${1 - Math.abs(ry) / 200})` }} aria-hidden="true" />
        <div className="m-insp-fly">
          <div className="m-insp-box" style={box}>
            {/* Пластинка торчит из открытого края конверта */}
            <div className="m-insp-vinyl" aria-hidden="true">
              <div className="m-insp-label" style={cover ? { backgroundImage: `url(${cover})` } : { background: p.cover.bg }} />
            </div>
            <div className="m-face m-front" style={{ filter: `brightness(${light})` }}>
              {cover && <img src={cover} alt={`Обложка «${p.title}»`} draggable={false} />}
              {p.cover.sticker && <span className="m-sticker big" style={{ background: p.cover.sticker.bg, color: p.cover.sticker.fg }}>{p.cover.sticker.text}</span>}
              <span className="m-ring" />
              <span className="m-gloss" style={{ backgroundPosition: `${glossX}% 0` }} />
            </div>
            <div className="m-face m-back-face" style={{ filter: `brightness(${2 - light - 0.1})` }}>
              <div className="m-back-in">
                <div className="m-back-top"><span>M.S. RECORDS</span><span>{code}</span></div>
                <div className="m-back-title">{p.title}</div>
                <ol>
                  {p.stack.map((s, i) => <li key={s + i}><span>{String(i + 1).padStart(2, '0')}</span>{s}</li>)}
                </ol>
                <div className="m-back-bar" />
              </div>
            </div>
            <div className="m-edge m-edge-l" />
            <div className="m-edge m-edge-t" />
            <div className="m-edge m-edge-b" />
          </div>
        </div>
      </div>

      <div className="m-insp-info r2">
        <div className="m-code-row">
          <span className="serif m-code">{code}</span>
          <span className="m-eyebrow">{p.kind}</span>
        </div>
        <h2>{p.title}</h2>
        <p className="m-about">{p.about}</p>
        <div className="m-actions">
          <button className="btn primary" onClick={onPlay}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
            Поставить на проигрыватель
          </button>
        </div>
        <p className="m-hint">Крути конверт пальцем — осмотри со всех сторон</p>
      </div>
    </section>
  );
}
