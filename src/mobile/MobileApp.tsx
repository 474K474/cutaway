import { useCallback, useEffect, useRef, useState } from 'react';
import { projects, trackCode } from '../data/projects';
import { useLightFlicker } from '../hooks/useLightFlicker';
import { SvgDefs } from '../components/SvgDefs';
import { useCoverImages } from './assets';
import { Stack } from './Stack';
import { Inspect } from './Inspect';
import { PhonePlayer } from './PhonePlayer';
import './mobile.css';

type View = 'stack' | 'inspect' | 'player';

const n = projects.length;
const wrap = (i: number) => ((i % n) + n) % n;
const PULL_MS = 700;
const FADE_MS = 380;
const PLAYER_LEAVE_MS = 2700;

/**
 * Мобильная и планшетная версия: стопка → осмотр конверта → телефон-проигрыватель.
 * Всё на CSS/canvas, без three.js — чтобы летало на любом телефоне.
 */
export default function MobileApp() {
  const [view, setView] = useState<View>('stack');
  const [index, setIndex] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const covers = useCoverImages();
  const light = useLightFlicker();

  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const go = (next: View, delay: number) => {
    later(() => setExiting(true), Math.max(0, delay - FADE_MS));
    later(() => {
      setExiting(false);
      setPulling(false);
      setLeaving(false);
      setView(next);
      window.scrollTo({ top: 0 });
    }, delay);
  };

  const pick = (i: number) => {
    if (pulling) return;
    setIndex(i);
    setPulling(true);
    go('inspect', PULL_MS);
  };
  const toStack = () => go('stack', FADE_MS);
  const toPlayer = () => { setPlayKey((k) => k + 1); go('player', FADE_MS); };
  const leavePlayer = () => {
    if (leaving) return;
    setLeaving(true);
    go('stack', PLAYER_LEAVE_MS);
  };
  const step = (d: number) => { setIndex((i) => wrap(i + d)); setPlayKey((k) => k + 1); };

  const p = projects[index];
  const code = trackCode(projects, index);
  const cover = covers?.[index] ?? null;

  return (
    <div className="m-root">
      <SvgDefs />
      <main className={`view-in${exiting ? ' view-out' : ''}`} key={view}>
        {view === 'stack' && (
          <Stack covers={covers} index={index} light={light} pulling={pulling} onIndex={setIndex} onPick={pick} />
        )}
        {view === 'inspect' && (
          <Inspect project={p} code={code} cover={cover} leaving={exiting} onPlay={toPlayer} onBack={toStack} />
        )}
        {view === 'player' && (
          <PhonePlayer
            key={playKey}
            project={p}
            code={code}
            cover={cover}
            nextTitle={projects[wrap(index + 1)].title}
            leaving={leaving}
            onBack={leavePlayer}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
          />
        )}
      </main>
      <svg className="m-grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#filmgrain)" /></svg>
    </div>
  );
}
