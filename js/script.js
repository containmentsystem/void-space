const circle = document.querySelector('.glow-circle');
const whiteCircle = document.querySelector('.glow-circle--white');
const spacer = document.querySelector('.void-spacer');
const title = document.querySelector('.void-title');
const duality = document.querySelector('.duality');
const paragraphs = Array.from(document.querySelectorAll('.lorem p, .duality .block'));
const orbitStage = document.querySelector('.orbit-stage');
const orbs = Array.from(document.querySelectorAll('.orb'));

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
let twilightStart = Infinity;
let twilightSpan = 1;
let twilightProgress = 0;

// orbit state: each orb carries its own smoothed slot angle, ring
// radius, scale, blur and opacity; the whole ring shares one slow spin
const TWO_PI = Math.PI * 2;
const ORB_FOG_BLUR = 10;
const orbState = orbs.map((el, i) => ({
  el,
  offset: (i / orbs.length) * TWO_PI, // smoothed slot angle within the ring
  targetOffset: (i / orbs.length) * TWO_PI,
  radius: 0,
  scale: 1,
  blur: ORB_FOG_BLUR,
  opacity: 0,
}));
let orbitAngle = 0;
let orbitRadius = 100;
let orbExpandScale = 3;
let centeredOrb = -1; // index of the orb resting in the middle, or -1
let populateStart = null;

// the lantern: follows the mouse when there is one, otherwise wanders
let hasMouse = false;
let rawMouseX = 0;
let rawMouseY = 0;
let lanternX = window.innerWidth / 2;
let lanternY = window.innerHeight / 2;
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

  // act 4 progress: the page dims into the mid-grey twilight
  const twilightTarget = clamp01((window.scrollY - twilightStart) / twilightSpan);
  twilightProgress += (twilightTarget - twilightProgress) * ease;
  if (Math.abs(twilightTarget - twilightProgress) < 0.0005) twilightProgress = twilightTarget;

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
  const breath = reducedMotion
    ? 0
    : Math.sin((now / 1000 / BREATH_PERIOD) * Math.PI * 2) * BREATH_DEPTH;
  let fade = 1 - clamp01(window.scrollY / (envelope * 0.15));
  fade = fade * fade * (3 - 2 * fade);
  const pulse = 1 + breath * fade;

  // the lantern eases toward the mouse — or, with no mouse (touch, or
  // before the first move), wanders the field on a slow lissajous path
  let lanternTargetX = window.innerWidth / 2;
  let lanternTargetY = window.innerHeight / 2;
  if (!reducedMotion) {
    if (hasMouse) {
      lanternTargetX = rawMouseX;
      lanternTargetY = rawMouseY;
    } else {
      const t = now / 1000;
      lanternTargetX = window.innerWidth * (0.5 + 0.28 * Math.sin(t * 0.5));
      lanternTargetY = window.innerHeight * (0.5 + 0.22 * Math.sin(t * 0.33 + 1.7));
    }
  }
  const lanternEase = reducedMotion ? 1 : 1 - Math.exp(-2 * dt);
  lanternX += (lanternTargetX - lanternX) * lanternEase;
  lanternY += (lanternTargetY - lanternY) * lanternEase;

  // the orbit lives while its stage is on screen: circles populate one
  // by one, revolve slowly, and re-space themselves whenever one is
  // called to (or released from) the center
  const oRect = orbitStage.getBoundingClientRect();
  if (oRect.bottom > 0 && oRect.top < wh) {
    if (populateStart === null) populateStart = now;
    if (!reducedMotion) orbitAngle = (orbitAngle + (TWO_PI / 90) * dt) % TWO_PI;

    // evenly distribute the ring's slots, anchored on the first ring
    // orb's current angle so nobody swings further than needed
    const ring = orbState
      .filter((o, i) => i !== centeredOrb)
      .sort((a, b) => a.offset - b.offset);
    ring.forEach((o, j) => {
      let target = ring[0].offset + (j / ring.length) * TWO_PI;
      target -= TWO_PI * Math.round((target - o.offset) / TWO_PI);
      o.targetOffset = target;
    });
    if (centeredOrb >= 0) orbState[centeredOrb].targetOffset = orbState[centeredOrb].offset;

    const slotEase = reducedMotion ? 1 : 1 - Math.exp(-3.5 * dt);
    const fadeEase = reducedMotion ? 1 : 1 - Math.exp(-1.8 * dt);
    orbState.forEach((o, i) => {
      const isCenter = i === centeredOrb;
      const populated = reducedMotion || (now - populateStart) / 1000 > i * 0.5;

      o.offset += (o.targetOffset - o.offset) * slotEase;
      o.radius += ((isCenter ? 0 : orbitRadius) - o.radius) * slotEase;
      o.scale += ((isCenter ? orbExpandScale : 1) - o.scale) * slotEase;
      o.blur += ((isCenter ? 0 : ORB_FOG_BLUR) - o.blur) * (reducedMotion ? 1 : 1 - Math.exp(-3 * dt));
      o.opacity += ((populated ? 1 : 0) - o.opacity) * fadeEase;

      const angle = orbitAngle + o.offset;
      const x = Math.cos(angle) * o.radius;
      const y = Math.sin(angle) * o.radius;
      o.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${o.scale.toFixed(4)})`;
      o.el.style.filter = `blur(${(Math.round(o.blur * 2) / 2).toFixed(1)}px)`;
      o.el.style.opacity = o.opacity.toFixed(3);
      o.el.style.zIndex = isCenter ? 2 : 1;
    });
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
  // the lantern only matters once twilight has begun; keep it out of the
  // change-detection key until then so the page can idle
  const lanternKey = twilightProgress > 0.001
    ? `${lanternX.toFixed(1)},${lanternY.toFixed(1)}`
    : 'idle';

  const key = `${progress.toFixed(4)}|${whiteProgress.toFixed(4)}|${twilightProgress.toFixed(4)}|${pulse.toFixed(4)}|${driftX.toFixed(1)},${driftY.toFixed(1)}|${lanternKey}`;
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

    // twilight state + lantern position, read by the overlay, the light
    // pool, and the text mask
    document.body.style.setProperty('--twilight', twilightProgress.toFixed(4));
    document.body.style.setProperty('--lantern-x', `${lanternX.toFixed(1)}px`);
    document.body.style.setProperty('--lantern-y', `${lanternY.toFixed(1)}px`);
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

  // twilight begins once the white envelopment has finished, and is
  // clamped so full grey always arrives with scroll to spare
  twilightStart = duality.offsetTop + window.innerHeight * 0.6;
  twilightSpan = Math.min(window.innerHeight * 1.5, maxScroll - twilightStart);

  // ring geometry: orbs revolve just inside the stage edge, and the
  // centered orb may grow until it nearly touches the ring
  const orbSize = orbs[0].offsetWidth;
  orbitRadius = orbitStage.clientWidth / 2 - orbSize / 2 - 4;
  orbExpandScale = Math.max(1.5, ((orbitRadius - orbSize / 2 - 10) * 2) / orbSize);
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', layout);

if (!reducedMotion) {
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    rawMouseX = e.clientX;
    rawMouseY = e.clientY;
    hasMouse = true;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    mouseX = 0;
    mouseY = 0;
    hasMouse = false; // the lantern goes back to wandering on its own
  });
}

// clicking an orb calls it to the center, where it expands and unblurs;
// the rest of the ring re-spaces itself symmetrically. clicking the
// centered orb (or pressing escape) sends it back out to the ring.
orbs.forEach((el, i) => {
  el.addEventListener('click', () => {
    centeredOrb = centeredOrb === i ? -1 : i;
  });
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') centeredOrb = -1;
});

layout();
requestAnimationFrame(frame);
