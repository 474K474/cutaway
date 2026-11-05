// Общие помощники для canvas — без three.js, используются и десктопом, и мобильной версией.

export function makeCanvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

/** Детерминированный ГПСЧ: текстуры выглядят одинаково при каждой загрузке. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

let noiseTile: HTMLCanvasElement | null = null;
/** Плитка шума 256×256 — генерируется один раз. */
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const { cv, ctx } = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  const r = rng(1337);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return (noiseTile = cv);
}

/**
 * Зерно печати поверх уже нарисованного. Раньше это был попиксельный проход
 * getImageData/putImageData (≈1 млн итераций на 1024²); теперь — одна заливка паттерном.
 */
export function addGrain(ctx: CanvasRenderingContext2D, size: number, amount: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(1, amount * 2.2);
  ctx.fillStyle = ctx.createPattern(getNoiseTile(), 'repeat')!;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

/** Киношное зерно для CSS-оверлея (вместо полноэкранного SVG-фильтра feTurbulence). */
export function grainDataUrl() {
  const { cv, ctx } = makeCanvas(160, 160);
  const img = ctx.createImageData(160, 160);
  const r = rng(77);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = r() * 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

/** Ждём нужные начертания шрифтов (но не дольше timeout), чтобы надписи на canvas были верными. */
export function waitFonts(timeout = 2500): Promise<void> {
  const loads = document.fonts
    ? Promise.all([
      document.fonts.load('700 100px Oswald'),
      document.fonts.load('700 40px Onest'),
      document.fonts.load('800 40px Onest'),
    ]).then(() => undefined)
    : Promise.resolve();
  return Promise.race([loads, new Promise<void>((r) => setTimeout(r, timeout))]).catch(() => undefined);
}

export function fontsAlreadyReady() {
  try {
    return !!document.fonts?.check('700 100px Oswald') && !!document.fonts.check('700 40px Onest');
  } catch {
    return false;
  }
}
