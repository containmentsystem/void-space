const circle = document.querySelector('.glow-circle');
const whiteCircle = document.querySelector('.glow-circle--white');
const spacer = document.querySelector('.void-spacer');
const title = document.querySelector('.void-title');
const duality = document.querySelector('.duality');
const paragraphs = Array.from(document.querySelectorAll('.lorem p'));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BREATH_PERIOD = 4.5; // seconds per breath
const BREATH_DEPTH = 0.09;
const SMOOTHING = 8; // higher = snappier catch-up to the scroll position
const DRIFT_SMOOTHING = 2.5; // slower than scroll, so the lean feels heavy
const DRIFT_REACH = 0.04; // max lean toward the cursor, as a fraction of vmin

// measured from the 200svh spacer so css and js agree on the viewport
// basis; envelopment finishes a little before the title is released
// from the bottom, so the page is already fully black at that moment
let envelope = Infinity;
let pinTop = 0;
let progress = 0;
let whiteStart = Infinity;
let whiteSpan = 1;
let whiteProgress = 0;
let lastNow = performance.now();
let lastFrameKey = '';
const mist = paragraphs.map(() => 0);

// where the mouse is, as -1..1 from screen center; 0,0 when it leaves
let mouseX = 0;
let mouseY = 0;
let driftX = 0;
let driftY = 0;

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

  // the white counter-gradient grows as the duality section scrolls in
  const whiteTarget = clamp01((window.scrollY - whiteStart) / whiteSpan);
  whiteProgress += (whiteTarget - whiteProgress) * ease;
  if (Math.abs(whiteTarget - whiteProgress) < 0.0005) whiteProgress = whiteTarget;

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

  // the circle leans a little toward the cursor, on a heavier ease than
  // the scroll so it drifts with weight rather than tracking the mouse
  const reach = DRIFT_REACH * Math.min(window.innerWidth, wh);
  const driftEase = 1 - Math.exp(-DRIFT_SMOOTHING * dt);
  driftX += (mouseX * reach - driftX) * driftEase;
  driftY += (mouseY * reach - driftY) * driftEase;

  // skip style writes on frames where nothing perceptible changed, and
  // quantize the blur to whole pixels so the filter re-rasterizes far
  // less often (fractional blur churn is the expensive part)
  const key = `${progress.toFixed(4)}|${whiteProgress.toFixed(4)}|${pulse.toFixed(4)}|${driftX.toFixed(1)},${driftY.toFixed(1)}`;
  if (key !== lastFrameKey) {
    lastFrameKey = key;
    circle.style.setProperty('--scale', 1 + progress * 6);
    circle.style.setProperty('--pulse', pulse);
    circle.style.setProperty('--alpha-core', 0.8 + progress * 0.2);
    circle.style.setProperty('--alpha-edge', progress * progress);
    circle.style.setProperty('--blur', `${Math.round(60 * (1 - progress))}px`);
    circle.style.setProperty('--drift-x', `${driftX.toFixed(1)}px`);
    circle.style.setProperty('--drift-y', `${driftY.toFixed(1)}px`);

    // mirror of the opening: fades in soft and small, then grows and
    // hardens until the page is white again
    whiteCircle.style.setProperty('--scale', 0.5 + whiteProgress * 6.5);
    whiteCircle.style.setProperty('--alpha-core', Math.min(whiteProgress * 2, 1));
    whiteCircle.style.setProperty('--alpha-edge', whiteProgress * whiteProgress);
    whiteCircle.style.setProperty('--blur', `${Math.round(60 * (1 - whiteProgress))}px`);
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
  // white phase runs from the duality section entering the viewport
  // until it has been on screen for another half viewport, clamped so
  // full white is always reached by the end of the page
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  whiteStart = duality.offsetTop - window.innerHeight;
  whiteSpan = Math.min(window.innerHeight * 1.5, maxScroll - whiteStart);
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', layout);

if (!reducedMotion) {
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    mouseX = 0;
    mouseY = 0;
  });
}

layout();
requestAnimationFrame(frame);
