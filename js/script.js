const circle = document.querySelector('.glow-circle');
const spacer = document.querySelector('.void-spacer');
const title = document.querySelector('.void-title');
const paragraphs = Array.from(document.querySelectorAll('.lorem p'));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BREATH_PERIOD = 4.5; // seconds per breath
const BREATH_DEPTH = 0.045;
const SMOOTHING = 8; // higher = snappier catch-up to the scroll position

// measured from the 200svh spacer so css and js agree on the viewport
// basis; envelopment finishes a little before the title is released
// from the bottom, so the page is already fully black at that moment
let envelope = Infinity;
let pinTop = 0;
let progress = 0;
let lastNow = performance.now();
let lastFrameKey = '';
const mist = paragraphs.map(() => 0);

function clamp01(v) {
  return Math.min(Math.max(v, 0), 1);
}

// one rAF loop drives both the scroll response and the breathing pulse:
// progress eases toward the scroll position with frame-rate-independent
// exponential smoothing, so the gradient glides instead of stepping
// through discrete scroll events
function frame(now) {
  // no upper cap on dt: the exponential form is stable for any gap, and a
  // long gap (throttled rAF, backgrounded tab) should land on the target
  const dt = (now - lastNow) / 1000;
  lastNow = now;

  const ease = reducedMotion ? 1 : 1 - Math.exp(-SMOOTHING * dt);

  const target = clamp01(window.scrollY / envelope);
  progress += (target - progress) * ease;
  if (Math.abs(target - progress) < 0.0005) progress = target;

  // body-text mist rides the same smoothing as the gradient, so it
  // glides through scroll steps instead of jumping with them
  const wh = window.innerHeight;
  const fadeStart = wh * 0.22;
  const fadeEnd = wh * 0.09;
  paragraphs.forEach((p, i) => {
    const t = clamp01((fadeStart - p.getBoundingClientRect().top) / (fadeStart - fadeEnd));
    const next = mist[i] + (t - mist[i]) * ease;
    if (Math.abs(next - mist[i]) > 0.0005 || (t === 0 && mist[i] !== 0)) {
      mist[i] = Math.abs(t - next) < 0.0005 ? t : next;
      p.style.setProperty('--mist', mist[i].toFixed(4));
    }
  });

  // full breathing at rest; amplitude eases out (smoothstep) over the
  // first stretch of scrolling and back in on returning to the top
  let pulse = 1;
  if (!reducedMotion) {
    let fade = 1 - clamp01(window.scrollY / (envelope * 0.15));
    fade = fade * fade * (3 - 2 * fade);
    pulse = 1 + Math.sin((now / 1000 / BREATH_PERIOD) * Math.PI * 2) * BREATH_DEPTH * fade;
  }

  // skip style writes on frames where nothing perceptible changed, and
  // quantize the blur to whole pixels so the filter re-rasterizes far
  // less often (fractional blur churn is the expensive part)
  const key = `${progress.toFixed(4)}|${pulse.toFixed(4)}`;
  if (key !== lastFrameKey) {
    lastFrameKey = key;
    circle.style.setProperty('--scale', 1 + progress * 6);
    circle.style.setProperty('--pulse', pulse);
    circle.style.setProperty('--alpha-core', 0.8 + progress * 0.2);
    circle.style.setProperty('--alpha-edge', progress * progress);
    circle.style.setProperty('--blur', `${Math.round(60 * (1 - progress))}px`);
  }

  requestAnimationFrame(frame);
}

function onScroll() {
  // relax the letter-spacing once the title pins at the top
  title.classList.toggle('is-pinned', title.getBoundingClientRect().top <= pinTop + 2);
}

function layout() {
  envelope = spacer.offsetHeight * 0.85;
  pinTop = spacer.offsetHeight * 0.03; // = 6svh
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
