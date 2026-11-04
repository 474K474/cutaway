/** Общие SVG-фильтры: зерно обложек, волокно дерева, штукатурка, паркет, киношное зерно. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id="cover-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.3 -0.5" />
      </filter>
      <filter id="woodgrain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.17" numOctaves={3} seed={7} />
        <feColorMatrix values="0 0 0 0 0.20  0 0 0 0 0.10  0 0 0 0 0.03  1.9 0 0 0 -0.66" />
      </filter>
      <filter id="plaster" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves={5} seed={3} />
        <feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.03  0 0 0 0 0.02  1.6 0 0 0 -0.55" />
      </filter>
      <filter id="floorgrain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.14 0.004" numOctaves={3} seed={11} />
        <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0 0.02  1.8 0 0 0 -0.6" />
      </filter>
      <filter id="filmgrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 -0.35" />
      </filter>
    </svg>
  );
}
