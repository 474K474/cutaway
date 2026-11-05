import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { projects, trackCode, SIDE_NAMES } from '../data/projects';
import { requestTiltPermission, tick, useTilt, woodDataUrl } from './assets';

interface Props {
  covers: string[] | null;
  index: number;
  light: { level: number; smooth: boolean };
  /** Пластинку достают — запускаем выезд и переход к осмотру. */
  pulling: boolean;
  onIndex: (i: number) => void;
  onPick: (i: number) => void;
}

const n = projects.length;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Диггинг: стопка пластинок в ящике. Свайп вниз — переднюю пластинку отгибаешь к себе,
 * открывается следующая. Свайп вверх — назад. Тап — достать.
 */
export function Stack({ covers, index, light, pulling, onIndex, onPick }: Props) {
  const [pos, setPos] = useState(index);
  const posRef = useRef(index);
  const drag = useRef<{ y: number; p: number; t: number; vy: number; lastY: number; lastT: number; moved: number } | null>(null);
  const anim = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useTilt();
  const wood = useMemo(() => woodDataUrl(5), []);

  const set = (p: number) => {
    const prev = Math.round(posRef.current);
    posRef.current = p;
    setPos(p);
    const cur = Math.round(clamp(p, 0, n - 1));
    if (cur !== prev) { tick(); onIndex(cur); }
  };

  const springTo = (target: number) => {
    cancelAnimationFrame(anim.current);
    let v = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const x = posRef.current;
      v += ((target - x) * 140 - v * 20) * dt;
      const nx = x + v * dt;
      if (Math.abs(target - nx) < 0.002 && Math.abs(v) < 0.01) { set(target); return; }
      set(nx);
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  // Внешняя смена индекса (кнопки) — плавно доезжаем.
  useEffect(() => {
    if (!drag.current && Math.round(posRef.current) !== index) springTo(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const unit = () => (stage.current?.clientHeight ?? 600) * 0.28;

  const down = (e: PointerEvent) => {
    if (pulling) return;
    requestTiltPermission();
    cancelAnimationFrame(anim.current);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, p: posRef.current, t: performance.now(), vy: 0, lastY: e.clientY, lastT: performance.now(), moved: 0 };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.vy = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY; d.lastT = now;
    d.moved = Math.max(d.moved, Math.abs(e.clientY - d.y));
    let p = d.p + (e.clientY - d.y) / unit();
    // Резиновые края
    if (p < 0) p = -Math.pow(-p, 0.7) * 0.35;
    if (p > n - 1) p = n - 1 + Math.pow(p - (n - 1), 0.7) * 0.35;
    set(p);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved < 8 && performance.now() - d.t < 350) {
      onPick(Math.round(clamp(posRef.current, 0, n - 1)));
      return;
    }
    const fling = (d.vy * 1000) / unit() * 0.18;
    springTo(Math.round(clamp(posRef.current + fling, 0, n - 1)));
  };

  const cur = Math.round(clamp(pos, 0, n - 1));
  const p = projects[cur];

  return (
    <section className="m-stack">
      <header className="m-head">
        <div>
          <div className="m-name">Михаил Сыпачев</div>
          <div className="m-role">Продакт · фронтенд · 1С</div>
        </div>
        <a className="m-gh" href="https://github.com/474K474" target="_blank" rel="noopener">GitHub ↗</a>
      </header>

      <div
        ref={stage}
        className={`m-crate${light.smooth ? ' light-smooth' : ''}`}
        style={{ '--light': light.level } as CSSProperties}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div className="m-wall light-layer" aria-hidden="true" />
        <div className="m-beam light-layer" aria-hidden="true" />
        <div className="m-records">
          {projects.map((proj, i) => {
            const k = i - pos;
            if (k < -1.4 || k > 5.5) return null;
            const isPulled = pulling && i === cur;
            let tf: string;
            let shade = 0;
            let op = 1;
            if (isPulled) {
              tf = 'translate3d(0, -115%, 120px) rotateX(-6deg)';
            } else if (k < 0) {
              // Отогнутая к себе — ложится вперёд на переднюю стенку
              const t = Math.min(1, -k);
              tf = `translate3d(0, ${t * 34}%, ${t * 70}px) rotateX(${-12 - t * 62}deg)`;
              shade = t * 0.35;
              op = 1 - Math.max(0, -k - 1) * 2.5;
            } else {
              tf = `translate3d(0, ${-k * 9}%, ${-k * 52}px) rotateX(-12deg)`;
              shade = Math.min(0.7, k * 0.17);
            }
            const front = k > -0.5 && k < 0.5;
            const glossX = 40 + tilt.y * 40 - k * 10;
            return (
              <div
                key={proj.id}
                className={`m-sleeve${isPulled ? ' pulled' : ''}${front ? ' front' : ''}`}
                style={{ transform: tf, opacity: op, zIndex: 100 - Math.round(k * 10) } as CSSProperties}
                aria-hidden={!front}
              >
                {covers ? <img src={covers[i]} alt="" draggable={false} /> : <div className="m-sleeve-ph" style={{ background: proj.cover.bg }} />}
                <span className="m-vinyl-peek" aria-hidden="true" />
                {proj.cover.sticker && <span className="m-sticker" style={{ background: proj.cover.sticker.bg, color: proj.cover.sticker.fg }}>{proj.cover.sticker.text}</span>}
                <span className="m-gloss" style={{ backgroundPosition: `${glossX}% 0` }} />
                <span className="m-shade" style={{ opacity: shade }} />
              </div>
            );
          })}
        </div>
        <div className="m-crate-front" style={{ backgroundImage: `url(${wood})` }} aria-hidden="true">
          <span className="m-handle" />
          <span className="m-label">Portfolio</span>
        </div>
        <div className="m-dark" aria-hidden="true" />
      </div>

      <div className="m-info swap" key={cur}>
        <div className="m-code-row">
          <span className="serif m-code">{trackCode(projects, cur)}</span>
          <span className="m-eyebrow">{SIDE_NAMES[p.side]} · {p.year}</span>
        </div>
        <h1>{p.title}</h1>
        <p className="m-kind">{p.kind}</p>
      </div>

      <div className="m-stack-nav">
        <button className="round" aria-label="Предыдущая пластинка" onClick={() => onIndex(Math.max(0, cur - 1))} disabled={cur === 0}>↑</button>
        <div className="m-dots" aria-hidden="true">
          {projects.map((x, i) => <span key={x.id} className={i === cur ? 'on' : ''} />)}
        </div>
        <button className="round" aria-label="Следующая пластинка" onClick={() => onIndex(Math.min(n - 1, cur + 1))} disabled={cur === n - 1}>↓</button>
        <button className="btn primary m-pull" onClick={() => onPick(cur)}>Достать</button>
      </div>
      <p className="m-hint">Листай стопку пальцем · тап по пластинке — достать</p>
    </section>
  );
}
