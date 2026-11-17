// Display size. The whole interface can be scaled (Settings → Data & display → Display size).
// "Automatic" sizes it to the window, so it isn't tiny on ultrawide or high-resolution monitors
// running at 100% scaling, and adjusts again when the window is resized or moved to another monitor.
//
// When the page is scaled, positions read from the screen (mouse position, getBoundingClientRect)
// are in screen pixels while CSS left/top are in page pixels. Divide by uiZoom() to convert.

const KEY = 'sr.displaySize';
export const SIZES = ['auto', '0.9', '1', '1.15', '1.3', '1.5'];

export const uiZoom = () => Number(document.documentElement.style.zoom) || 1;
/** A rectangle from getBoundingClientRect in page pixels. */
export function pageRect(el) {
  const r = el.getBoundingClientRect();
  const z = uiZoom();
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
}
/** The window size in page pixels. */
export const viewW = () => innerWidth / uiZoom();
export const viewH = () => innerHeight / uiZoom();

export function getDisplaySize() {
  try {
    const v = localStorage.getItem(KEY);
    return SIZES.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

// Designed around a ~1700×1000 window: scale up from there, never down, at most 1.6×.
// Snapped to 5% steps so small resizes don't make the text jitter.
export function autoZoom(w = innerWidth, h = innerHeight) {
  const z = Math.min(1.6, Math.max(1, Math.min(w / 1700, h / 1000)));
  return Math.round(z * 20) / 20;
}

export function applyDisplaySize(pref = getDisplaySize()) {
  const z = pref === 'auto' ? autoZoom() : Number(pref) || 1;
  const html = document.documentElement;
  const next = z === 1 ? '' : String(z);
  if (html.style.zoom !== next) {
    html.style.zoom = next;
    dispatchEvent(new Event('uizoom'));
  }
  return z;
}

export function setDisplaySize(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable */
  }
  return applyDisplaySize(pref);
}

/** Keep "Automatic" right as the window is resized or moved between monitors. */
export function watchDisplaySize() {
  let t;
  const again = () => {
    clearTimeout(t);
    t = setTimeout(() => getDisplaySize() === 'auto' && applyDisplaySize('auto'), 120);
  };
  addEventListener('resize', again);
  // Moving to a monitor with a different pixel density changes devicePixelRatio.
  const watchDpr = () => {
    const mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      again();
      watchDpr();
    }, { once: true });
  };
  watchDpr();
  applyDisplaySize();
}
