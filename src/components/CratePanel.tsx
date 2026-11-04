import { projects, trackCode, SIDE_NAMES } from '../data/projects';
import { GithubIcon, PlayIcon } from './icons';
import './CratePanel.css';

interface Props {
  index: number;
  onHover: (i: number) => void;
  onPlay: (i: number) => void;
}

/** Правая колонка у ящика: инфо о выбранной пластинке и треклист по сторонам. */
export function CratePanel({ index, onHover, onPlay }: Props) {
  const p = projects[index];
  const code = trackCode(projects, index);
  const rows = projects.map((x, i) => ({ x, i, code: trackCode(projects, i) }));

  return (
    <aside className="crate-panel">
      <header className="cp-header">
        <div>
          <div className="cp-name">Михаил Сыпачев</div>
          <div className="muted cp-role">Продакт-менеджер · фронтенд · 1С</div>
        </div>
        <nav aria-label="Контакты" className="cp-nav">
          <a href="https://github.com/474K474" target="_blank" rel="noopener">GitHub ↗</a>
          <a href="#">[Telegram]</a>
          <a href="#">[Email]</a>
        </nav>
      </header>

      <section key={index} className="cp-current swap" aria-live="polite">
        <div className="cp-code-row">
          <span className="serif cp-code">{code}</span>
          <span className="cp-eyebrow">{SIDE_NAMES[p.side]} · {p.year}</span>
        </div>
        <h1>{p.title}</h1>
        <p className="muted cp-kind">{p.kind}</p>
        <p className="cp-about">{p.about}</p>
        <div className="cp-actions">
          <button className="btn primary" onClick={() => onPlay(index)}><PlayIcon />Поставить на проигрыватель</button>
          {p.github && <a className="btn" href={p.github} target="_blank" rel="noopener"><GithubIcon />GitHub</a>}
        </div>
      </section>

      <section className="cp-tracklist" aria-label="Треклист">
        {(['A', 'B'] as const).map((side) => (
          <div key={side}>
            <div className="serif cp-side">{SIDE_NAMES[side]}</div>
            {rows.filter((r) => r.x.side === side).map((r) => (
              <button
                key={r.x.id}
                className={r.i === index ? 'track on' : 'track'}
                onMouseEnter={() => onHover(r.i)}
                onFocus={() => onHover(r.i)}
                onClick={() => onPlay(r.i)}
              >
                <span className="code">{r.code}</span>
                <span>{r.x.title}</span>
                <span className="lead" />
                <span className="year">{r.x.year}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
    </aside>
  );
}
