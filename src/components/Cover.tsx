import type { CSSProperties } from 'react';
import type { Project } from '../data/projects';
import './Cover.css';

interface Props {
  project: Project;
  /** Сторона обложки в px; вся геометрия — в долях обложки (1 unit = size / 100) */
  size: number;
  code: string;
}

const STAR =
  '50,0 55.7,28.7 75,6.7 65.6,34.4 93.3,25 71.3,44.3 100,50 71.3,55.7 93.3,75 65.6,65.6 75,93.3 55.7,71.3 50,100 44.3,71.3 25,93.3 34.4,65.6 6.7,75 28.7,55.7 0,50 28.7,44.3 6.7,25 34.4,34.4 25,6.7 44.3,28.7';

const META = 2.4; // размер мелкого текста в units

/** Переводит units обложки в em элемента со своим font-size `fs` (тоже в units). */
const u = (n: number, fs = 1) => `${n / fs}em`;

function dots(color: string, dot: number, step: number): CSSProperties {
  return {
    backgroundImage: `radial-gradient(${color} ${dot}em, transparent ${dot * 1.4}em)`,
    backgroundSize: `${step}em ${step}em`,
  };
}

/** Постерная обложка пластинки: зерно, растр, огромный кондансед-шрифт. */
export function Cover({ project, size, code }: Props) {
  const c = project.cover;
  const ws = c.wordSize;
  const lines = c.word.split('\n').length;
  const root: CSSProperties = { fontSize: size / 100, background: c.bg, color: c.fg };
  const word = (s: CSSProperties): CSSProperties => ({ fontSize: `${ws}em`, ...s });
  const meta = (s: CSSProperties): CSSProperties => ({ fontSize: `${META}em`, ...s });

  return (
    <div className="cover" style={root} aria-hidden="true">
      {c.layout === 'sun' && (
        <>
          <div className="cv-meta" style={meta({ top: u(5, META), left: u(5.5, META), right: u(5.5, META) })}>
            <span>M.S. Records</span>
            <span>Vol.01 / {code}</span>
          </div>
          <div className="cv-abs" style={{ top: '10.5em', left: '5.5em', right: '5.5em', height: '.5em', background: c.fg }} />
          <div className="cv-word" style={word({ top: u(12, ws), left: u(4.5, ws) })}>{c.word}</div>
          <div className="cv-abs" style={{ left: '8em', top: '50em', width: '36em', height: '36em', borderRadius: '50%', ...dots(c.accent, 0.42, 1.5) }} />
          <svg viewBox="0 0 100 100" className="cv-abs" style={{ right: '7em', top: '47em', width: '30em', height: '30em' }}>
            <polygon fill={c.fg} points={STAR} />
          </svg>
          <div className="cv-tag" style={{ fontSize: '4.6em', left: u(5.5, 4.6), bottom: u(5, 4.6) }}>{c.tagline}</div>
          <div className="cv-abs" style={{
            right: '5.5em', bottom: '5em', width: '17em', height: '7em',
            background: `repeating-linear-gradient(90deg, ${c.fg} 0 .6em, transparent .6em 1em, ${c.fg} 1em 1.25em, transparent 1.25em 1.9em)`,
          }} />
        </>
      )}

      {c.layout === 'tall' && (
        <>
          <div className="cv-word" style={word({ top: u(4.5, ws), left: u(5, ws), lineHeight: 0.8, color: c.accent })}>{c.word}</div>
          <svg viewBox="0 0 100 100" className="cv-abs" style={{ right: '6em', top: '6em', width: '26em', height: '26em' }}>
            <polygon fill={c.accent} points={STAR} />
          </svg>
          <div className="cv-abs" style={{ right: '-10em', bottom: '-12em', width: '64em', height: '64em', borderRadius: '50%', ...dots(c.fg, 0.5, 1.6) }} />
          <div className="cv-tag" style={{ fontSize: '4.2em', left: u(5, 4.2), bottom: u(12, 4.2) }}>{c.tagline}</div>
          <div className="cv-meta" style={meta({ left: u(5, META), bottom: u(5, META) })}><span>{code} · M.S. Records</span></div>
        </>
      )}

      {c.layout === 'grid' && (
        <>
          <div className="cv-abs" style={{ top: '5em', left: '5em', width: '43em', height: '40em', background: c.fg }} />
          <div className="cv-word" style={word({ top: u(43 - 0.84 * ws * lines, ws), left: u(8, ws), color: c.bg })}>{c.word}</div>
          <div className="cv-abs" style={{ top: '5em', left: '50em', width: '45em', height: '40em', border: `.5em solid ${c.fg}`, ...dots(c.accent, 0.38, 1.4) }} />
          <div className="cv-abs" style={{ top: '47em', left: '5em', width: '28em', height: '48em', border: `.5em solid ${c.fg}` }} />
          <svg viewBox="0 0 100 100" className="cv-abs" style={{ top: '58em', left: '8em', width: '22em', height: '22em' }}>
            <g fill={c.fg}>
              <rect x="42" y="0" width="16" height="100" />
              <rect x="42" y="0" width="16" height="100" transform="rotate(60 50 50)" />
              <rect x="42" y="0" width="16" height="100" transform="rotate(120 50 50)" />
            </g>
          </svg>
          <div className="cv-abs" style={{ top: '47em', left: '35em', width: '60em', height: '48em', background: c.fg }} />
          <div className="cv-tag" style={{ fontSize: '7.5em', top: u(51, 7.5), left: u(39, 7.5), color: c.bg }}>{c.tagline}</div>
          <div className="cv-meta" style={meta({ top: u(85, META), left: u(39, META), color: c.bg })}><span>{code} · {project.year}</span></div>
        </>
      )}

      {c.layout === 'night' && (
        <>
          <div className="cv-meta cv-center" style={meta({ top: u(6, META) })}><span>M.S. Records · {code}</span></div>
          <div className="cv-word cv-center" style={word({ top: u(11, ws), lineHeight: 0.88 })}>{c.word}</div>
          <div className="cv-abs" style={{ left: '20em', top: '42em', width: '60em', height: '60em', borderRadius: '50%', ...dots(c.accent, 0.55, 1.6) }} />
          <div className="cv-abs" style={{ left: '38em', top: '58em', width: '24em', height: '24em', borderRadius: '50%', background: c.accent }} />
          <div className="cv-meta cv-center" style={meta({ bottom: u(5, META) })}><span>{project.kind}</span></div>
        </>
      )}

      <svg className="cv-grain"><rect width="100%" height="100%" filter="url(#cover-grain)" /></svg>
      <div className="cv-vignette" />
    </div>
  );
}
