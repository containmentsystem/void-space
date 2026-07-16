const circle = document.querySelector('.glow-circle');
const spacer = document.querySelector('.void-spacer');

// measured from the 200svh spacer so css and js agree on the viewport
// basis; envelopment finishes a little before the title is released
// from the bottom, so the page is already fully black at that moment
let envelope = Infinity;

function onScroll() {
  const progress = Math.min(Math.max(window.scrollY / envelope, 0), 1);

  circle.style.setProperty('--scale', 1 + progress * 6);
  circle.style.setProperty('--alpha-core', 0.8 + progress * 0.2);
  circle.style.setProperty('--alpha-edge', progress * progress);
  circle.style.setProperty('--blur', `${60 * (1 - progress)}px`);
}

function layout() {
  envelope = spacer.offsetHeight * 0.85;
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', layout);
layout();
