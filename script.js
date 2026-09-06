const performer = document.querySelector('.performer');
const theater = document.querySelector('.theater');
const crtOverlay = document.querySelector('.crt-overlay');
const cards = [...document.querySelectorAll('.story-card')];
const navItems = [...document.querySelectorAll('.chapter-nav a')];
const counter = document.querySelector('.stage-counter span');
const performerImage = performer.querySelector('img');
const sceneSections = [...document.querySelectorAll('.scroll-track section')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobilePerformerDrop = 12;
const GLITCH_MIN_MS = 4200;
const GLITCH_MAX_MS = 6800;

const scenes = [
  { x: 70, y: 56, mobileY: 35, r: 5 },
  { x: 27, y: 60, mobileY: 37, r: -9 },
  { x: 74, y: 58, mobileY: 36, r: 8 },
  { x: 26, y: 61, mobileY: 38, r: -7 },
];

let currentScene = -1;
let ticking = false;
let snapLocked = false;
let wheelIntent = 0;
let wheelResetTimer;
let snapUnlockTimer;
let snapLockUntil = 0;
let glitchTimer;
let glitchClearTimer;

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function triggerGlitch() {
  if (reduceMotion.matches) return;

  theater.classList.remove('is-glitching');
  crtOverlay?.classList.remove('is-glitching');
  // Force reflow so repeated glitch bursts retrigger CSS animations.
  void theater.offsetWidth;

  theater.classList.add('is-glitching');
  crtOverlay?.classList.add('is-glitching');

  clearTimeout(glitchClearTimer);
  glitchClearTimer = setTimeout(() => {
    theater.classList.remove('is-glitching');
    crtOverlay?.classList.remove('is-glitching');
  }, 450);
}

function scheduleGlitch() {
  clearTimeout(glitchTimer);
  if (reduceMotion.matches) return;
  glitchTimer = setTimeout(() => {
    triggerGlitch();
    scheduleGlitch();
  }, randBetween(GLITCH_MIN_MS, GLITCH_MAX_MS));
}

function updateScene() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const rawProgress = Math.min(1, Math.max(0, scrollY / maxScroll));
  const timeline = rawProgress * (scenes.length - 1);
  const fromIndex = Math.min(scenes.length - 2, Math.floor(timeline));
  const localProgress = timeline - fromIndex;
  const segmentProgress = smoothstep(localProgress);
  const from = scenes[fromIndex];
  const to = scenes[fromIndex + 1];

  const travelDirection = Math.sign(to.x - from.x);
  const routeArc = Math.sin(localProgress * Math.PI);
  const x = mix(from.x, to.x, segmentProgress) + routeArc * travelDirection * 2.4;
  const baseY = mix(from.y, to.y, segmentProgress);
  const lift = -routeArc * 8.5;
  const bob = Math.sin(localProgress * Math.PI * 3.2) * routeArc * 2.2;
  const tilt = mix(from.r, to.r, segmentProgress)
    + Math.sin(localProgress * Math.PI * 2.4) * routeArc * 3.2;

  const isCompact = innerWidth <= 780;
  const renderedY = isCompact
    ? mix(from.mobileY, to.mobileY, segmentProgress) - lift * 0.68 + bob * 0.55 + mobilePerformerDrop
    : baseY + lift + bob;

  performer.style.setProperty('--performer-x', `${x}vw`);
  performer.style.setProperty('--performer-y', `${renderedY}vh`);
  performer.style.setProperty('--performer-r', `${tilt}deg`);
  theater.style.setProperty('--performer-x', `${x}vw`);
  theater.style.setProperty('--scene', timeline.toFixed(3));

  const nextScene = Math.min(scenes.length - 1, Math.max(0, Math.round(timeline)));
  if (nextScene !== currentScene) {
    currentScene = nextScene;
    cards.forEach((card, index) => card.classList.toggle('is-active', index === currentScene));
    navItems.forEach((item, index) => item.classList.toggle('is-active', index === currentScene));
    counter.textContent = String(currentScene).padStart(2, '0');
  }

  ticking = false;
}

function requestUpdate() {
  if (!ticking) {
    requestAnimationFrame(updateScene);
    ticking = true;
  }
}

function nearestSceneIndex() {
  return Math.min(
    sceneSections.length - 1,
    Math.max(0, Math.round(scrollY / Math.max(1, innerHeight))),
  );
}

function goToScene(index) {
  const targetIndex = Math.min(sceneSections.length - 1, Math.max(0, index));
  snapLocked = true;
  snapLockUntil = performance.now() + (reduceMotion.matches ? 80 : 720);
  sceneSections[targetIndex].scrollIntoView({
    behavior: reduceMotion.matches ? 'auto' : 'smooth',
    block: 'start',
  });

  clearTimeout(snapUnlockTimer);
  snapUnlockTimer = setTimeout(() => {
    snapLocked = false;
    wheelIntent = 0;
  }, reduceMotion.matches ? 80 : 720);
}

function handleWheel(event) {
  if (event.ctrlKey) return;
  event.preventDefault();
  if (snapLocked) {
    clearTimeout(snapUnlockTimer);
    const remainingAnimation = Math.max(0, snapLockUntil - performance.now());
    snapUnlockTimer = setTimeout(() => {
      snapLocked = false;
      wheelIntent = 0;
    }, Math.max(220, remainingAnimation));
    return;
  }

  wheelIntent += event.deltaY;
  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => { wheelIntent = 0; }, 140);

  if (Math.abs(wheelIntent) < 18) return;
  goToScene(nearestSceneIndex() + Math.sign(wheelIntent));
}

function handleKeys(event) {
  const forwardKeys = ['ArrowDown', 'PageDown'];
  const backwardKeys = ['ArrowUp', 'PageUp'];
  const isSpace = event.code === 'Space';
  if (![...forwardKeys, ...backwardKeys].includes(event.key) && !isSpace) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

  event.preventDefault();
  if (snapLocked) return;
  const direction = backwardKeys.includes(event.key) || (isSpace && event.shiftKey) ? -1 : 1;
  goToScene(nearestSceneIndex() + direction);
}

// Keep a local fallback so future remote character assets cannot break the theater.
performerImage.addEventListener('error', () => {
  performerImage.src = './placeholder-character.svg';
});

reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) {
    clearTimeout(glitchTimer);
    clearTimeout(glitchClearTimer);
    theater.classList.remove('is-glitching');
    crtOverlay?.classList.remove('is-glitching');
  } else {
    scheduleGlitch();
  }
});

addEventListener('scroll', requestUpdate, { passive: true });
addEventListener('wheel', handleWheel, { passive: false });
addEventListener('keydown', handleKeys);
addEventListener('resize', requestUpdate);
addEventListener('pageshow', requestUpdate);
updateScene();
setTimeout(requestUpdate, 80);
scheduleGlitch();
