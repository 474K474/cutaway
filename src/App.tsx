import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { projects, trackCode } from './data/projects';
import { CrateScene } from './components/CrateScene';
import { CratePanel } from './components/CratePanel';
import { Player } from './components/Player';
import { SvgDefs } from './components/SvgDefs';
import { useLightFlicker } from './hooks/useLightFlicker';

// 3D-сцена грузится отдельным чанком; без WebGL остаётся CSS-версия ящика.
const CrateScene3D = lazy(() => import('./three/CrateScene3D'));
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();
const use3D = hasWebGL && !new URLSearchParams(window.location.search).has('css');

type View = 'crate' | 'player';

const PULL_MS = 850; // пластинка уезжает из ящика вверх
const LEAVE_MS = 2800; // игла уходит, диск тормозит, пластинку снимают
const n = projects.length;
const wrap = (i: number) => ((i % n) + n) % n;

export default function App() {
  const [view, setView] = useState<View>('crate');
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(-1);
  const [pulling, setPulling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const light = useLightFlicker();

  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const busy = pulling || returning || leaving;

  const hover = (i: number) => {
    if (busy) return;
    setHovered(i);
    if (i >= 0) setIndex(i);
  };

  const play = (i: number) => {
    if (busy) return;
    setHovered(i);
    setIndex(i);
    setPulling(true);
    later(() => {
      setPulling(false);
      setHovered(-1);
      setPlayKey((k) => k + 1);
      setView('player');
      window.scrollTo({ top: 0 });
    }, PULL_MS);
  };

  const back = () => {
    if (leaving) return;
    setLeaving(true);
    later(() => {
      setLeaving(false);
      setView('crate');
      // Пластинка опускается обратно в ящик сверху.
      setReturning(true);
      setHovered(index);
      later(() => setReturning(false), 80);
    }, LEAVE_MS);
  };

  const step = (d: number) => {
    setIndex((i) => wrap(i + d));
    setPlayKey((k) => k + 1);
  };

  return (
    <>
      <SvgDefs />
      {view === 'crate' ? (
        <main className="crate-layout fade-in">
          {use3D ? (
            <Suspense fallback={<div className="stage" />}>
              <CrateScene3D hovered={hovered} pulling={pulling} returning={returning} light={light} onHover={hover} onPick={play} />
            </Suspense>
          ) : (
            <CrateScene hovered={hovered} pulling={pulling} returning={returning} light={light} onHover={hover} onPick={play} />
          )}
          <CratePanel index={index} onHover={hover} onPlay={play} />
        </main>
      ) : (
        <main>
          <Player
            key={playKey}
            project={projects[index]}
            code={trackCode(projects, index)}
            nextTitle={projects[wrap(index + 1)].title}
            leaving={leaving}
            onBack={back}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
          />
        </main>
      )}
    </>
  );
}
