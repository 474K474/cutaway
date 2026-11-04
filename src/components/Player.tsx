import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Project } from '../data/projects';
import { Cover } from './Cover';
import { ArrowLeft, ArrowRight, GithubIcon } from './icons';
import './Player.css';

interface Props {
  project: Project;
  code: string;
  nextTitle: string;
  /** Идёт анимация «обратно в ящик» */
  leaving: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
}

type Side = 'a' | 'b' | 'c';
const SIDES: [Side, string][] = [
  ['a', 'Сторона A — о проекте'],
  ['b', 'Сторона B — стек'],
  ['c', 'Бонус — ссылки'],
];

/** Угол поворота элемента из его текущей CSS-матрицы — чтобы диск тормозил с того места, где был. */
function currentAngle(el: HTMLElement | null): number {
  if (!el) return 0;
  const m = getComputedStyle(el).transform;
  if (!m || !m.startsWith('matrix(')) return 0;
  const [a, b] = m.slice(7, -1).split(',').map(Number);
  return Math.round((Math.atan2(b, a) * 180) / Math.PI);
}

/** Проигрыватель: половина пластинки слева, справа карточка проекта. Ремоунт по key = новая анимация. */
export function Player({ project: p, code, nextTitle, leaving, onBack, onPrev, onNext }: Props) {
  const [side, setSide] = useState<Side>('a');
  const [stopAngle, setStopAngle] = useState(0);
  const spinRef = useRef<HTMLDivElement>(null);

  const back = () => {
    if (leaving) return;
    setStopAngle(currentAngle(spinRef.current));
    onBack();
  };

  const L = leaving;
  const discStyle = { '--a': `${stopAngle}deg` } as CSSProperties;

  return (
    <div className="player">
      <div className="deck">
        <div className="deck-inner">
          <div className="platter" aria-hidden="true" />
          <div className="platter-strobe" aria-hidden="true" />
          <div className="platter-rim" aria-hidden="true" />
          <div className="mat" aria-hidden="true" />

          <div className={L ? 'disc-wrap disc-out' : 'disc-wrap disc-in'}>
            <div ref={spinRef} className={`disc vinyl ${L ? 'spin-down' : 'spin'}`} style={discStyle}>
              <div className="disc-label">
                <div className="disc-label-art"><Cover project={p} size={300} code={code} /></div>
                <div className="disc-label-shine" />
              </div>
            </div>
            <div className="disc-sheen" aria-hidden="true" />
            <div className="spindle" aria-hidden="true" />
          </div>

          <div className="arm-base" aria-hidden="true" />
          <div className="arm-bearing" aria-hidden="true" />
          <div className="antiskate" aria-hidden="true"><span /></div>
          <div className="antiskate-label" aria-hidden="true">ANTI-SKATE</div>
          <div className="cue-base" aria-hidden="true"><div className={L ? 'cue-lever cue-up' : 'cue-lever cue-down'} /></div>
          <div className="arm-rest" aria-hidden="true"><span /></div>
          <div className="adapter45" aria-hidden="true"><span /></div>
          <div className="adapter45-label" aria-hidden="true">45 RPM</div>

          <div className={L ? 'arm arm-up' : 'arm arm-drop'} aria-hidden="true">
            <div className="arm-weight" />
            <div className="arm-stub chrome" />
            <div className="arm-tube chrome" />
            <div className="arm-head">
              <div className="arm-head-body" />
              <div className="arm-finger chrome" />
              <div className="arm-cart" />
              <div className="arm-stylus" />
            </div>
            <div className="arm-pivot" />
          </div>

          <div className="pitch" aria-hidden="true"><div className="pitch-knob"><span /></div></div>
          <div className="pitch-mark plus" aria-hidden="true">+8</div>
          <div className="pitch-mark minus" aria-hidden="true">−8</div>

          <div className="deck-controls">
            <span className="startstop" aria-hidden="true">START·STOP</span>
            <span className="speed on"><span className={L ? 'led led-off' : 'led led-on'} />33</span>
            <span className="speed"><span className="led" />45</span>
          </div>
        </div>
        <div className="deck-wood" aria-hidden="true" />
      </div>

      <div className="panel-wrap">
        <div className="panel-glow" aria-hidden="true" style={{ background: `radial-gradient(ellipse at center, ${p.cover.bg}, transparent 65%)` }} />
        <div className={L ? 'panel panel-out' : 'panel'}>
          <div className="panel-top">
            <button className="btn" onClick={back}><ArrowLeft />Обратно в ящик</button>
            <span className="now-playing">
              <span className={L ? 'eq off' : 'eq'} aria-hidden="true"><span /><span /><span /></span>
              Сейчас играет · {code}
            </span>
          </div>

          <div className="panel-head">
            <div className="panel-sleeve">
              <Cover project={p} size={220} code={code} />
              <span className="wear" />
            </div>
            <div className="r1 panel-title">
              <div className="muted">{p.kind}</div>
              <h2>{p.title}</h2>
              <div className="serif tagline">{p.cover.tagline}</div>
            </div>
          </div>

          <div className="r2 tags">
            {p.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>

          <div className="r3">
            <div role="tablist" aria-label="Стороны пластинки" className="tabs">
              {SIDES.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={side === id} className={side === id ? 'tab on' : 'tab'} onClick={() => setSide(id)}>{label}</button>
              ))}
            </div>
            <div className="tab-body">
              {side === 'a' && (
                <>
                  <p className="about">{p.about}</p>
                  <p className="role">Моя роль — <span>{p.role}</span></p>
                </>
              )}
              {side === 'b' && (
                <ol className="stack">
                  {p.stack.map((s, j) => (
                    <li key={s + j}><span className="serif">{String(j + 1).padStart(2, '0')}</span>{s}</li>
                  ))}
                </ol>
              )}
              {side === 'c' && (
                <>
                  <div className="links">
                    {p.github
                      ? <a className="btn primary" href={p.github} target="_blank" rel="noopener"><GithubIcon />GitHub</a>
                      : <span className="btn disabled">GitHub [ссылка]</span>}
                    {p.demo
                      ? <a className="btn" href={p.demo} target="_blank" rel="noopener">Демо ↗</a>
                      : <span className="btn disabled">Демо [ссылка]</span>}
                  </div>
                  <p className="muted small">Скриншоты и презентация проекта появятся здесь.</p>
                </>
              )}
            </div>
          </div>

          <div className="r4 panel-nav">
            <button className="round" onClick={() => !L && onPrev()} aria-label="Предыдущая пластинка"><ArrowLeft /></button>
            <button className="round" onClick={() => !L && onNext()} aria-label="Следующая пластинка"><ArrowRight /></button>
            <span className="muted">Следующая: <span className="light">{nextTitle}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
