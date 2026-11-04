// Есть ли WebGL у посетителя. Без него остаётся CSS-версия сцены (её можно открыть и вручную: ?css в адресе).
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

export const use3D = hasWebGL && !new URLSearchParams(window.location.search).has('css');
