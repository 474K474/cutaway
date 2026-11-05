import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Shot } from '../data/projects';
import { ArrowLeft, ArrowRight } from './icons';
import './Insert.css';

const url = (src: string) => `${import.meta.env.BASE_URL}${src}`;
const two = (n: number) => String(n).padStart(2, '0');

/** Скриншот в нейтральной рамке: окно приложения, браузер или телефон. */
function Frame({ shot, large = false }: { shot: Shot; large?: boolean }) {
  const img = (
    <img
      src={url(shot.src)}
      alt={shot.caption}
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );
  if (shot.frame === 'phone') {
    return <div className={`frame frame-phone${large ? ' large' : ''}`}><div className="frame-screen">{img}</div></div>;
  }
  return (
    <div className={`frame frame-${shot.frame}${large ? ' large' : ''}`}>
      <div className="frame-bar" aria-hidden="true">
        <span className="frame-dots"><i /><i /><i /></span>
        {shot.frame === 'browser'
          ? <span className="frame-url">{shot.title ?? ''}</span>
          : <span className="frame-title">{shot.title ?? ''}</span>}
      </div>
      <div className="frame-screen">{img}</div>
    </div>
  );
}

interface LightboxProps {
  shots: Shot[];
  index: number;
  code: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}

/** Полноэкранный просмотр кадров: стрелки, свайп, Esc. */
function Lightbox({ shots, index, code, onIndex, onClose }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const n = shots.length;
  const go = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, close]);

  // Соседние кадры подгружаем заранее, чтобы листание было мгновенным.
  useEffect(() => {
    [1, -1].forEach((d) => { const im = new Image(); im.src = url(shots[(index + d + n) % n].src); });
  }, [index, n, shots]);

  const down = (e: RPointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const up = (e: RPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
  };

  const shot = shots[index];
  return createPortal(
    <div
      className={closing ? 'lightbox closing' : 'lightbox'}
      role="dialog"
      aria-modal="true"
      aria-label={`Вкладыш ${code}: кадр ${index + 1} из ${n}`}
      onPointerDown={down}
      onPointerUp={up}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="lb-top">
        <span className="lb-count"><span className="serif">{code}</span> · дорожка {two(index + 1)} / {two(n)}</span>
        <button ref={closeRef} className="btn lb-close" onClick={close}>Закрыть <span aria-hidden="true">✕</span></button>
      </div>
      <div className="lb-stage" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div key={index} className="lb-shot"><Frame shot={shot} large /></div>
      </div>
      <div className="lb-bottom">
        {n > 1 && <button className="round" onClick={() => go(-1)} aria-label="Предыдущий кадр"><ArrowLeft /></button>}
        <p key={index} className="lb-caption serif">{shot.caption}</p>
        {n > 1 && <button className="round" onClick={() => go(1)} aria-label="Следующий кадр"><ArrowRight /></button>}
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  shots?: Shot[];
  code: string;
  /** Дорожка, на которой сейчас стоит игла. */
  active?: number;
  /** Выбор кадра — игла переходит на его дорожку. */
  onSelect?: (i: number) => void;
}

/** Вкладыш из конверта: кадры проекта как напечатанные фотографии. */
export function Insert({ shots, code, active = -1, onSelect }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const pick = useCallback((i: number) => { setOpen(i); onSelect?.(i); }, [onSelect]);
  const move = useCallback((i: number) => { setOpen(i); onSelect?.(i); }, [onSelect]);

  if (!shots?.length) {
    return (
      <div className="insert-empty">
        <span className="serif">Вкладыш пока пуст</span>
        <span className="muted small">Кадры этого проекта появятся позже.</span>
      </div>
    );
  }

  return (
    <>
      <ul className="insert" aria-label="Кадры проекта">
        {shots.map((s, i) => (
          <li key={s.src} style={{ ['--tilt' as string]: `${[-1.4, 1, -0.6, 1.5, -1.1, 0.7][i % 6]}deg`, ['--i' as string]: i }}>
            <button className={i === active ? 'print on' : 'print'} onClick={() => pick(i)} aria-label={`Открыть кадр ${i + 1}: ${s.caption}`}>
              <Frame shot={s} />
              <span className="print-cap">
                <span className="print-n">{code}·{i + 1}</span>
                <span className="serif">{s.caption}</span>
              </span>
              {i === active && <span className="print-needle" aria-hidden="true">игла здесь</span>}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox shots={shots} index={open} code={code} onIndex={move} onClose={() => setOpen(null)} />}
    </>
  );
}
