import { Fragment, useMemo, useRef } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { projects, trackCode } from '../data/projects';
import { Cover } from './Cover';
import './CrateScene.css';

interface Props {
  hovered: number;
  pulling: boolean;
  returning: boolean;
  light: { level: number; smooth: boolean };
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}

const RECORD = 440;
const zOf = (i: number) => 240 - i * 92;
/** После какого индекса стоит разделитель «B · пет-проекты» */
const DIVIDER_AFTER = projects.findIndex((p) => p.side === 'B') - 1;

const TONES = ['#8d5c35', '#7e4f2c', '#97653b', '#845530', '#7a4c2a', '#93613a'];
const planks = (seed: number) =>
  [0, 1, 2].map((k) => ({ tone: TONES[(seed + k * 2) % TONES.length], off: -((seed * 137 + k * 311) % 700) }));

const WALLS = [
  { key: 'back', style: { left: 0, width: 500, transform: 'translateZ(-320px)', filter: 'brightness(.42)' }, planks: planks(1) },
  { key: 'right', style: { left: -70, width: 640, transform: 'rotateY(90deg) translateZ(250px)', filter: 'brightness(.4)' }, planks: planks(2) },
  { key: 'left', style: { left: -70, width: 640, transform: 'rotateY(-90deg) translateZ(250px)', filter: 'brightness(.78)' }, planks: planks(3), stamp: true },
  { key: 'front', style: { left: 0, width: 500, transform: 'translateZ(320px)' }, planks: planks(4), handle: true },
] as const;

const CAPS: CSSProperties[] = [
  { left: 0, width: 500, transform: 'translateZ(311px) rotateX(90deg)' },
  { left: 0, width: 500, transform: 'translateZ(-311px) rotateX(90deg)', filter: 'brightness(.7)' },
  { left: -70, width: 640, transform: 'rotateY(-90deg) translateZ(241px) rotateX(90deg)' },
  { left: -70, width: 640, transform: 'rotateY(90deg) translateZ(241px) rotateX(90deg)', filter: 'brightness(.7)' },
];

const SPINES = ['#2b2b2b', '#c9b89a', '#7e1a14', '#1d2b3a', '#d9d1c2', '#3a2a20', '#E0452C', '#141210', '#5a5a4e', '#b33a26', '#e9e1d2', '#24302a', '#8a6a3a', '#1a1a1a', '#c94a2c', '#efe6d4', '#3b4a52', '#6b2a1c']
  .map((c, k) => ({ c, w: 6 + ((k * 7) % 5), h: 130 + ((k * 13) % 22), t: 0 }))
  .concat([{ c: '#d8cbb3', w: 8, h: 148, t: 14 }, { c: '#1f1f1f', w: 7, h: 146, t: 15 }]);

const DUST = Array.from({ length: 16 }, (_, d) => ({
  x: 22 + ((d * 37) % 56), y: 12 + ((d * 53) % 74), s: 2 + (d % 3), dur: 7 + (d % 5) * 1.6, del: -((d * 1.3) % 9),
}));

function pose(i: number, hv: number, gone: boolean) {
  const base = `translateZ(${zOf(i)}px) `;
  if (gone && i === hv) return { tf: `${base}translateY(-860px) rotateX(-4deg)`, op: 0, shade: 0 };
  if (hv < 0) return { tf: `${base}rotateX(8deg)`, op: 1, shade: 0.07 * i };
  if (i === hv) return { tf: `${base}translateY(-255px) rotateX(-3deg)`, op: 1, shade: 0 };
  if (i < hv) return { tf: `${base}rotateX(-15deg)`, op: 1, shade: 0.18 };
  return { tf: `${base}rotateX(13deg)`, op: 1, shade: Math.min(0.6, 0.22 + 0.07 * (i - hv)) };
}

/** Комната с деревянным ящиком пластинок, стоящим по диагонали. Пластинка под курсором выезжает вверх. */
export function CrateScene({ hovered, pulling, returning, light, onHover, onPick }: Props) {
  const anchors = useRef<(HTMLSpanElement | null)[]>([]);
  const gone = pulling || returning;

  const onMove = (e: MouseEvent) => {
    let best = -1;
    let bestD = Infinity;
    let curD = Infinity;
    anchors.current.forEach((el, id) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      if (id === hovered) curD = d;
      if (d < bestD) { bestD = d; best = id; }
    });
    if (bestD > 240) return onHover(-1);
    // Небольшой «люфт», чтобы выбор не дрожал на границе соседних пластинок.
    if (hovered >= 0 && best !== hovered && curD - bestD < 12) return;
    onHover(best);
  };

  const divider = useMemo(() => {
    const dz = (zOf(DIVIDER_AFTER) + zOf(DIVIDER_AFTER + 1)) / 2;
    let tf = 'rotateX(8deg)';
    let shade = 0.15;
    if (hovered > DIVIDER_AFTER) { tf = 'rotateX(-15deg)'; shade = 0.18; }
    else if (hovered >= 0) { tf = 'rotateX(13deg)'; shade = Math.min(0.6, 0.22 + 0.07 * (DIVIDER_AFTER + 1 - hovered)); }
    return { tf: `translateZ(${dz}px) ${tf}`, shade };
  }, [hovered]);

  const stageStyle = { '--light': light.level } as CSSProperties;

  return (
    <div
      className={`stage${light.smooth ? ' light-smooth' : ''}`}
      style={stageStyle}
      onMouseMove={onMove}
      onMouseLeave={() => onHover(-1)}
      onClick={() => hovered >= 0 && onPick(hovered)}
    >
      {/* Стена */}
      <div className="wall-bg" aria-hidden="true">
        <div className="wall-light light-layer" />
        <svg className="fill-svg wall-texture"><rect width="100%" height="100%" filter="url(#plaster)" /></svg>
        <div className="wall-ao" />
        <div className="wall-sides" />
      </div>

      {/* Постер в раме */}
      <div className="poster" aria-hidden="true">
        <div className="poster-art"><Cover project={projects[3]} size={140} code="00" /></div>
        <div className="poster-caption">M.S. Records · Vol. 01</div>
        <div className="poster-glass" />
      </div>

      {/* Полка с пластинками */}
      <div className="shelf" aria-hidden="true">
        <div className="shelf-spines">
          {SPINES.map((s, k) => (
            <span key={k} style={{ width: s.w, height: s.h, background: s.c, transform: `rotate(${s.t}deg)` }} />
          ))}
        </div>
        <div className="shelf-board" />
        <div className="shelf-bracket left" />
        <div className="shelf-bracket right" />
      </div>

      {/* Пол */}
      <div className="floor" aria-hidden="true">
        <div className="floor-plane">
          <svg className="fill-svg floor-grain" preserveAspectRatio="none"><rect width="3200" height="1800" filter="url(#floorgrain)" /></svg>
          <div className="floor-seams" />
        </div>
        <div className="floor-pool light-layer" />
        <div className="floor-shade" />
      </div>
      <div className="baseboard" aria-hidden="true" />

      {/* Свет сверху (источник за кадром) */}
      <div className="light-rig light-layer" aria-hidden="true">
        <div className="light-glow" />
        <div className="light-cone">
          <div className="light-beam" />
          {DUST.map((d, k) => (
            <span key={k} className="dust" style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, animationDuration: `${d.dur}s`, animationDelay: `${d.del}s` }} />
          ))}
        </div>
      </div>

      {/* Ящик */}
      <div className="world">
        <div className="crate3d">
          <div className="plane crate-shadow" aria-hidden="true" />
          <div className="wall crate-floor" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((k) => (
              <div key={k} className="plank" style={{ background: TONES[k] }}>
                <svg className="fill-svg grain" preserveAspectRatio="none"><rect x={-k * 140} width="1400" height="100%" filter="url(#woodgrain)" transform="rotate(90 0 0)" /></svg>
              </div>
            ))}
          </div>

          {WALLS.map((w) => (
            <div key={w.key} className="wall" aria-hidden="true" style={{ top: 0, height: 250, ...w.style }}>
              {w.planks.map((p, k) => (
                <div key={k} className="plank" style={{ background: p.tone }}>
                  <svg className="fill-svg grain" preserveAspectRatio="none"><rect x={p.off} width="1600" height="100%" filter="url(#woodgrain)" /></svg>
                </div>
              ))}
              {'handle' in w && (
                <>
                  <div className="crate-handle" />
                  <div className="bracket tl" /><div className="bracket tr" /><div className="bracket bl" /><div className="bracket br" />
                  <div className="crate-label">Portfolio</div>
                </>
              )}
              {'stamp' in w && (
                <>
                  <div className="crate-stamp">M.S. Records · № 01</div>
                  <div className="bracket tl" /><div className="bracket tr" />
                </>
              )}
            </div>
          ))}

          {CAPS.map((s, k) => (
            <div key={k} className="cap" aria-hidden="true" style={{ top: -9, height: 18, ...s }} />
          ))}

          <div className="divider" aria-hidden="true" style={{ transform: divider.tf }}>
            <div className="divider-card" />
            <div className="divider-tab">B · Пет-проекты</div>
            <div className="divider-shade" style={{ opacity: divider.shade }} />
          </div>

          {projects.map((p, i) => {
            const ps = pose(i, hovered, gone);
            const lifted = i === hovered && !gone;
            return (
              <Fragment key={p.id}>
                <span ref={(el) => { anchors.current[i] = el; }} className="anchor" style={{ transform: `translateZ(${zOf(i)}px)` }} />
                <button
                  className="rec3"
                  style={{ transform: ps.tf, opacity: ps.op, width: RECORD, height: RECORD }}
                  aria-label={`Достать пластинку «${p.title}»`}
                  onFocus={() => onHover(i)}
                  onClick={(e) => { e.stopPropagation(); onPick(hovered >= 0 ? hovered : i); }}
                >
                  <span className="back3" aria-hidden="true" />
                  <span className={`disc3 vinyl${lifted ? ' out' : ''}`} aria-hidden="true" />
                  <span className="sleeve3">
                    <Cover project={p} size={RECORD} code={trackCode(projects, i)} />
                    <span className="wear" />
                    {p.cover.sticker && (
                      <span className="sticker" style={{ background: p.cover.sticker.bg, color: p.cover.sticker.fg }}>{p.cover.sticker.text}</span>
                    )}
                    <span className={`gloss${lifted ? ' lit' : ''}`} />
                    <span className="shade" style={{ opacity: ps.shade }} />
                  </span>
                  <span className="edgeT" aria-hidden="true" />
                  <span className="edgeR" aria-hidden="true" />
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="warm-grade light-layer" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="room-dark" aria-hidden="true" />
      <div className="film-grain" aria-hidden="true" />
      <div className="stage-hint">Веди курсором вдоль ящика · клик — достать пластинку</div>
    </div>
  );
}
