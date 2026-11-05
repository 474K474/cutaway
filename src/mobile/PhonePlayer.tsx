import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Project } from '../data/projects';
import { tick } from './assets';

interface Props {
  project: Project;
  code: string;
  cover: string | null;
  nextTitle: string;
  leaving: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}

type Side = 'a' | 'b' | 'c';
const SIDES: [Side, string][] = [['a', 'О проекте'], ['b', 'Стек'], ['c', 'Ссылки']];

const RPM = { 33: (33.33 / 60) * Math.PI * 2, 45: (45 / 60) * Math.PI * 2 } as const;
const ARM_PLAY = 24; // градусы
const IN = { liftAt: 1.3, liftDur: 0.25, swingAt: 1.6, swingDur: 0.9, lowerAt: 2.55, lowerDur: 0.3, motorAt: 2.9 };
const OUT = { liftDur: 0.25, swingAt: 0.25, swingDur: 0.8, lowerAt: 1.05, lowerDur: 0.25 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/**
 * Телефон как проигрыватель: пластинка сверху, крутится; пальцем её можно поймать и поскретчить,
 * отпустишь — мотор снова разгонит до 33⅓.
 */
export function PhonePlayer({ project: p, code, cover, nextTitle, leaving, onBack, onPrev, onNext }: Props) {
  const [side, setSide] = useState<Side>('a');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<33 | 45>(33);
  const [scratching, setScratching] = useState(false);

  const disc = useRef<HTMLDivElement>(null);
  const platter = useRef<HTMLDivElement>(null);
  const arm = useRef<HTMLDivElement>(null);
  const st = useRef({ angle: 0, omega: 0, running: false, speed: 33 as 33 | 45, leaveAt: -1, started: false });
  const grab = useRef<{ a: number; last: number; lt: number; acc: number } | null>(null);

  st.current.running = running;
  st.current.speed = speed;

  useEffect(() => {
    if (leaving && st.current.leaveAt < 0) st.current.leaveAt = performance.now();
  }, [leaving]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      const t = (now - t0) / 1000;
      let angleArm = 0, lift = 0;
      if (s.leaveAt < 0) {
        const l = smooth((t - IN.liftAt) / IN.liftDur) - smooth((t - IN.lowerAt) / IN.lowerDur);
        angleArm = ARM_PLAY * smooth((t - IN.swingAt) / IN.swingDur);
        lift = l;
        if (!s.started && t > IN.motorAt) { s.started = true; setRunning(true); s.running = true; }
      } else {
        const u = (now - s.leaveAt) / 1000;
        lift = smooth(u / OUT.liftDur) - smooth((u - OUT.lowerAt) / OUT.lowerDur);
        angleArm = ARM_PLAY * (1 - smooth((u - OUT.swingAt) / OUT.swingDur));
        s.running = false;
      }
      if (!grab.current) {
        const target = s.running ? RPM[s.speed] : 0;
        const k = target > s.omega ? 1.6 : 1.0;
        s.omega += (target - s.omega) * (1 - Math.exp(-k * dt));
        s.angle += s.omega * dt;
      }
      if (disc.current) disc.current.style.transform = `rotate(${s.angle}rad)`;
      if (arm.current) {
        arm.current.style.transform = `rotate(${angleArm}deg) scale(${1 + lift * 0.035})`;
        arm.current.style.filter = `drop-shadow(${1 + lift * 5}px ${2 + lift * 9}px ${2 + lift * 6}px rgba(0,0,0,${0.6 - lift * 0.2}))`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const angleAt = (e: PointerEvent) => {
    const r = platter.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  const down = (e: PointerEvent) => {
    if (leaving) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    grab.current = { a: angleAt(e), last: performance.now(), lt: performance.now(), acc: 0 };
    st.current.omega = 0;
    setScratching(true);
  };
  const move = (e: PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    const a = angleAt(e);
    let d = a - g.a;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    g.a = a;
    const now = performance.now();
    const dt = Math.max(0.008, (now - g.lt) / 1000);
    g.lt = now;
    st.current.angle += d;
    st.current.omega = st.current.omega * 0.6 + (d / dt) * 0.4;
    g.acc += Math.abs(d);
    if (g.acc > 0.5) { g.acc = 0; tick(4); }
  };
  const up = () => {
    grab.current = null;
    setScratching(false);
  };

  return (
    <section className={`pp${leaving ? ' leaving' : ''}`}>
      <div className="pp-deck">
        <div className="pp-plinth" aria-hidden="true" />
        <div ref={platter} className="pp-platter" aria-hidden="true">
          <div className="pp-strobe" />
          <div className="pp-mat" />
        </div>

        <div className={`pp-disc-wrap ${leaving ? 'out' : 'in'}`}>
          <div
            ref={disc}
            className="pp-disc"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            role="img"
            aria-label={`Пластинка «${p.title}». Её можно поймать пальцем и поскретчить`}
          >
            <div className="pp-label" style={cover ? { backgroundImage: `url(${cover})` } : { background: p.cover.bg }} />
          </div>
          <div className="pp-sheen" aria-hidden="true" />
          <div className="pp-spindle" aria-hidden="true" />
        </div>

        <div className="pp-arm-base" aria-hidden="true" />
        <div className="pp-rest" aria-hidden="true" />
        <div ref={arm} className="pp-arm" aria-hidden="true">
          <span className="pp-weight" />
          <span className="pp-tube" />
          <span className="pp-head"><i /></span>
          <span className="pp-pivot" />
        </div>
        <div className="pp-pitch" aria-hidden="true"><span /></div>

        <div className="pp-controls">
          <button className={`pp-start${running ? ' on' : ''}`} onClick={() => !leaving && setRunning((r) => !r)} aria-pressed={running}>
            START · STOP
          </button>
          <button className={`pp-speed${speed === 33 ? ' on' : ''}`} onClick={() => setSpeed(33)} aria-pressed={speed === 33}>33</button>
          <button className={`pp-speed${speed === 45 ? ' on' : ''}`} onClick={() => setSpeed(45)} aria-pressed={speed === 45}>45</button>
        </div>
        {scratching && <div className="pp-scratch">скретч</div>}
      </div>

      <div className="pp-card">
        <div className="pp-top">
          <button className="m-back inline" onClick={onBack}>← В ящик</button>
          <span className="now-playing">
            <span className={running && !leaving ? 'eq' : 'eq off'} aria-hidden="true"><span /><span /><span /></span>
            {running && !leaving ? 'Играет' : 'Пауза'} · {code}
          </span>
        </div>
        <div className="r1">
          <div className="m-kind">{p.kind}</div>
          <h2 className="pp-title">{p.title}</h2>
          <div className="serif pp-tagline">{p.cover.tagline}</div>
        </div>
        <div className="r2 tags">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
        <div className="r3">
          <div role="tablist" aria-label="Стороны пластинки" className="tabs">
            {SIDES.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={side === id} className={side === id ? 'tab on' : 'tab'} onClick={() => setSide(id)}>{label}</button>
            ))}
          </div>
          <div className="pp-tab-body">
            {side === 'a' && (<><p className="m-about">{p.about}</p><p className="role">Моя роль — <span>{p.role}</span></p></>)}
            {side === 'b' && (
              <ol className="stack">{p.stack.map((s, j) => <li key={s + j}><span className="serif">{String(j + 1).padStart(2, '0')}</span>{s}</li>)}</ol>
            )}
            {side === 'c' && (
              <div className="links">
                {p.github ? <a className="btn primary" href={p.github} target="_blank" rel="noopener">GitHub</a> : <span className="btn disabled">GitHub [ссылка]</span>}
                {p.demo ? <a className="btn" href={p.demo} target="_blank" rel="noopener">Демо ↗</a> : <span className="btn disabled">Демо [ссылка]</span>}
              </div>
            )}
          </div>
        </div>
        <div className="r4 pp-nav">
          <button className="round" onClick={() => !leaving && onPrev()} aria-label="Предыдущая пластинка">←</button>
          <button className="round" onClick={() => !leaving && onNext()} aria-label="Следующая пластинка">→</button>
          <span className="muted">Дальше: <span className="light">{nextTitle}</span></span>
        </div>
      </div>
    </section>
  );
}
