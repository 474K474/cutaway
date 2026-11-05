import { useEffect, useRef, useState } from 'react';

/** Шаг мерцания: уровень света 0..1 и сколько держать его, мс. */
type Step = [level: number, ms: number];

// Включение старой лампы накаливания: пауза в темноте, несколько неровных вспышек,
// дрожание на половине мощности и затем мягкий разогрев до полного тёплого света.
const BOOT: Step[] = [
  [0, 650],
  [0.9, 60], [0, 120],
  [1, 45], [0.05, 260],
  [0.7, 90], [0.15, 70], [0.95, 50], [0, 420],
  [0.55, 110], [0.3, 60], [0.65, 140], [0.4, 90], [0.8, 70], [0.35, 160],
];

// Редкое «подмигивание» уже горящего света.
const IDLE: Step[][] = [
  [[0.55, 55], [1, 80], [0.7, 40]],
  [[0.75, 70], [0.95, 50], [0.6, 90], [0.9, 60]],
  [[0.4, 40], [1, 120]],
];

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Свет сцены. `level` — текущая яркость (0..1), `smooth` — включать ли CSS-переход
 * (во время мерцания переключения мгновенные, при разогреве — плавные).
 */
export function useLightFlicker() {
  const [level, setLevel] = useState(() => (reducedMotion() ? 1 : 0));
  const [smooth, setSmooth] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reducedMotion()) return;
    const later = (fn: () => void, ms: number) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    const play = (steps: Step[], done: () => void) => {
      let t = 0;
      for (const [lv, ms] of steps) {
        later(() => setLevel(lv), t);
        t += ms;
      }
      later(done, t);
    };

    const scheduleIdle = () => {
      later(() => {
        setSmooth(false);
        const seq = IDLE[Math.floor(Math.random() * IDLE.length)];
        play(seq, () => {
          setSmooth(true);
          setLevel(1);
          scheduleIdle();
        });
      }, 22000 + Math.random() * 26000);
    };

    // Ждём шрифты (но не дольше 1,5 с), чтобы мерцание не прошло, пока страница ещё не нарисована.
    let started = false;
    let alive = true;
    const start = () => {
      if (started || !alive) return;
      started = true;
      play(BOOT, () => {
        setSmooth(true);
        setLevel(1);
        scheduleIdle();
      });
    };
    document.fonts?.ready.then(start);
    later(start, 1500);

    const list = timers.current;
    return () => {
      alive = false;
      list.forEach((id) => window.clearTimeout(id));
      list.length = 0;
    };
  }, []);

  return { level, smooth };
}
