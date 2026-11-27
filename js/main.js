import { LofiRadio } from './lofi.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const radio = new LofiRadio();
let room = null;

/* ================= BOOT ================= */
const bootLines = [
  ['samson.dev bios v2.7 ', 'hl', '☾'],
  ['[ OK ] ', 'ok', 'mounting ~/brooklyn → ~/san-diego'],
  ['[ OK ] ', 'ok', 'loading math-cs.ko, data-science.ko'],
  ['[ OK ] ', 'ok', 'steeping tea (3 min, no more)'],
  ['[ OK ] ', 'ok', 'waking babylm (≤100M words)… still sleepy'],
  ['[ OK ] ', 'ok', 'cat located: windowsill'],
  ['[ ·· ] ', 'hl', 'tuning lofi radio — waiting for you'],
];
const bootLog = $('#boot-log');
let booted = false;

async function typeBoot() {
  const quick = reduceMotion || sessionStorage.getItem('booted');
  for (const [tag, cls, text] of bootLines) {
    const line = document.createElement('div');
    const t = document.createElement('span');
    t.className = cls;
    t.textContent = tag;
    line.append(t);
    const rest = document.createElement('span');
    line.append(rest);
    bootLog.append(line);
    if (quick) { rest.textContent = text; continue; }
    for (let i = 0; i < text.length; i++) {
      rest.textContent = text.slice(0, i + 1);
      await wait(9 + Math.random() * 14);
    }
    await wait(90);
  }
  const cur = document.createElement('span');
  cur.className = 'cur';
  bootLog.lastChild.append(' ', cur);
  $('#boot-actions').classList.add('show');
  $('#enter-music').focus({ preventScroll: true });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function enter(withMusic) {
  if (booted) return;
  booted = true;
  try { sessionStorage.setItem('booted', '1'); } catch {}
  $('#boot').classList.add('gone');
  document.body.classList.remove('is-booting');
  if (withMusic) radio.play();
  setTimeout(() => $('#boot').remove(), 900);
}
$('#enter-music').addEventListener('click', () => enter(true));
$('#enter-quiet').addEventListener('click', () => enter(false));
window.addEventListener('keydown', (e) => {
  if (booted) return;
  if (e.key === 'Enter') { e.preventDefault(); enter(true); }
  if (e.key === 'Escape') enter(false);
});
typeBoot();

/* ================= 3D ROOM ================= */
const hero = $('#hero');
const words = $$('.word');
const heroSticky = $('.hero-sticky');
const contentEl = $('#content');
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const scrollHint = $('.scroll-hint');
const clickHint = $('.click-hint');
const hoverLabel = $('#hover-label');
const swipeHint = $('#swipe-hint');
swipeHint.textContent = finePointer ? '← drag to look around →' : '← swipe to look around →';
window.addEventListener('keydown', (e) => {
  if (!booted || !room || heroProgress() > 0.7 || e.target.matches('input, textarea, button')) return;
  if (e.key === 'ArrowLeft') room.nudge(-0.25);
  if (e.key === 'ArrowRight') room.nudge(0.25);
});
let mouse = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (hoverLabel.classList.contains('on')) hoverLabel.style.transform = `translate(${mouse.x + 16}px, ${mouse.y + 16}px)`;
});

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

if (webglOK()) {
  import('./scene.js')
    .then(({ createRoom }) => {
      room = createRoom({
        canvas: $('#room'),
        onHover(label) {
          hoverLabel.textContent = label || '';
          hoverLabel.classList.toggle('on', !!label);
          hoverLabel.style.transform = `translate(${mouse.x + 16}px, ${mouse.y + 16}px)`;
        },
        onPan() { swipeHint.classList.add('done'); },
        onBubble(text, obj) {
          const p = room.project(obj);
          showBubble(text, p.x, p.y);
        },
      });
      room.setRain(radio.rainOn);
      onScroll();
    })
    .catch((err) => {
      console.error(err);
      document.body.classList.add('no-webgl');
    });
} else {
  document.body.classList.add('no-webgl');
}

function heroProgress() {
  const r = hero.getBoundingClientRect();
  const total = r.height - innerHeight;
  return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
}

function onScroll() {
  const p = heroProgress();
  const r = hero.getBoundingClientRect();
  if (room) {
    room.setProgress(p);
    room.setRunning(r.bottom > 0 && p < 0.99);
  }
  words.forEach((w) => w.classList.toggle('on', p >= +w.dataset.in && p < +w.dataset.out));
  // Hand-off from the laptop screen to the page: the content overlaps the last screen of the
  // hero (margin-top: -100vh), so as the camera fills the laptop screen the room fades away to
  // the same starry sky the content sits on, and the name tag fades in right where the screen's was.
  // No empty screen in between.
  if (!document.body.classList.contains('no-webgl')) {
    heroSticky.style.opacity = (1 - clamp01((p - 0.87) / 0.06)).toFixed(3);
    const cin = clamp01((p - 0.915) / 0.06);
    contentEl.style.opacity = cin.toFixed(3);
    contentEl.style.pointerEvents = cin > 0.5 ? '' : 'none';
  }
  scrollHint.style.opacity = p > 0.03 ? 0 : 1;
  clickHint.style.opacity = p > 0.5 ? 0 : 1;
  swipeHint.style.opacity = p > 0.6 ? 0 : '';
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

$('#back-room').addEventListener('click', (e) => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
});

/* ================= BUBBLE ================= */
const bubble = $('#bubble');
let bubbleTimer;
function showBubble(text, x, y) {
  bubble.textContent = text;
  bubble.style.left = x + 'px';
  bubble.style.top = y + 'px';
  bubble.classList.add('on');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('on'), 1600);
}

/* ================= PLAYER ================= */
const player = $('#player');
const pill = $('#player-pill');
const playBtn = $('#p-play');
const chordEl = $('#p-chord');
const metaEl = $('#p-meta');
const radioStatus = $('#st-radio');

playBtn.addEventListener('click', () => radio.toggle());
$('#p-skip').addEventListener('click', () => { if (!radio.playing) radio.play(); else radio.skip(); });
$('#p-rain').addEventListener('click', (e) => {
  radio.setRain(!radio.rainOn);
  e.currentTarget.classList.toggle('on', radio.rainOn);
});
$('#p-vol').addEventListener('input', (e) => radio.setVolume(+e.target.value));
$('#p-min').addEventListener('click', () => { player.classList.add('min'); pill.classList.add('show'); });
pill.addEventListener('click', () => { player.classList.remove('min'); pill.classList.remove('show'); });
window.addEventListener('keydown', (e) => {
  if (!booted || e.target.matches('input, textarea')) return;
  if (e.key === 'm' || e.key === 'M') radio.toggle();
});

radio.on('state', (on) => {
  playBtn.textContent = on ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  player.classList.toggle('playing', on);
  pill.classList.toggle('playing', on);
  if (!on) chordEl.textContent = 'paused ☾';
  radioStatus.innerHTML = on
    ? '<i class="ok">[ ♪♪ ]</i> lofi radio'
    : '<i class="wait">[ ·· ]</i> lofi radio';
});
radio.on('chord', ({ name, next }) => {
  if (!radio.playing) return;
  chordEl.textContent = `♪ ${name}`;
  chordEl.title = `next: ${next}`;
});
radio.on('section', ({ key, bpm }) => { metaEl.textContent = `key of ${key} · ${bpm} bpm · never repeats`; });
radio.on('rain', (on) => room?.setRain(on));

// visualizer
const viz = $('#viz');
const vctx = viz.getContext('2d');
const bins = new Uint8Array(64);
function drawViz() {
  requestAnimationFrame(drawViz);
  if (player.classList.contains('min')) return;
  const w = viz.width, h = viz.height;
  vctx.clearRect(0, 0, w, h);
  const data = radio.playing ? radio.levels(bins) : null;
  const n = 24;
  for (let i = 0; i < n; i++) {
    const v = data ? data[Math.floor(i * 1.6) + 1] / 255 : 0.04;
    const bh = Math.max(2, v * h);
    vctx.fillStyle = i % 3 === 0 ? '#ff7a8a' : i % 3 === 1 ? '#6a5acd' : '#5fcfac';
    vctx.fillRect(i * (w / n) + 1, h - bh, w / n - 2, bh);
  }
}
drawViz();

/* ================= STARFIELD ================= */
const sky = $('#sky');
const sctx = sky.getContext('2d');
let stars = [];
let shooting = null;
function sizeSky() {
  const dpr = Math.min(devicePixelRatio, 2);
  sky.width = innerWidth * dpr;
  sky.height = innerHeight * dpr;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.round((innerWidth * innerHeight) / 5200);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight * 1.6,
    s: Math.random() < 0.12 ? 2 : 1,
    d: 0.1 + Math.random() * 0.5,
    t: Math.random() * Math.PI * 2,
    c: Math.random() < 0.15 ? '#ffd27a' : Math.random() < 0.15 ? '#b9aeff' : '#ffffff',
  }));
}
sizeSky();
addEventListener('resize', sizeSky);
function drawSky(now) {
  requestAnimationFrame(drawSky);
  if (heroProgress() < 0.85) return; // hidden behind the 3D room
  const t = now / 1000;
  const g = sctx.createLinearGradient(0, 0, 0, innerHeight);
  g.addColorStop(0, '#0e0f2b');
  g.addColorStop(1, '#1b1846');
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, innerWidth, innerHeight);
  const sy = scrollY;
  for (const s of stars) {
    const y = (((s.y - sy * s.d * 0.15) % (innerHeight * 1.6)) + innerHeight * 1.6) % (innerHeight * 1.6);
    if (y > innerHeight) continue;
    const a = reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + s.d) + s.t));
    sctx.globalAlpha = a;
    sctx.fillStyle = s.c;
    sctx.fillRect(s.x, y, s.s, s.s);
    if (s.s === 2 && a > 0.92) {
      sctx.globalAlpha = (a - 0.92) * 6;
      sctx.fillRect(s.x - 3, y + 0.5, 8, 1);
      sctx.fillRect(s.x + 0.5, y - 3, 1, 8);
    }
  }
  sctx.globalAlpha = 1;
  if (!reduceMotion) {
    if (!shooting && Math.random() < 0.003) {
      shooting = { x: Math.random() * innerWidth * 0.8 + innerWidth * 0.2, y: Math.random() * innerHeight * 0.4, life: 1 };
    }
    if (shooting) {
      const s = shooting;
      s.x -= 9; s.y += 4; s.life -= 0.02;
      const grad = sctx.createLinearGradient(s.x, s.y, s.x + 90, s.y - 40);
      grad.addColorStop(0, `rgba(255,240,200,${s.life})`);
      grad.addColorStop(1, 'rgba(255,240,200,0)');
      sctx.strokeStyle = grad;
      sctx.lineWidth = 2;
      sctx.beginPath();
      sctx.moveTo(s.x, s.y);
      sctx.lineTo(s.x + 90, s.y - 40);
      sctx.stroke();
      if (s.life <= 0) shooting = null;
    }
  }
}
requestAnimationFrame(drawSky);

/* ================= MOON PHASE + SD TIME ================= */
function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - ref) / 86400000;
  const age = ((days % synodic) + synodic) % synodic;
  const frac = age / synodic;
  const illum = (1 - Math.cos(frac * 2 * Math.PI)) / 2;
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const name = names[Math.round(frac * 8) % 8];
  return { frac, illum, name };
}
function drawMoon() {
  const c = $('#moon-phase');
  const ctx = c.getContext('2d');
  const { frac, illum, name } = moonPhase();
  const r = 50, cx = 60, cy = 60;
  ctx.clearRect(0, 0, 120, 120);
  ctx.fillStyle = '#2b2d5e';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // lit part: right side while waxing, left side while waning
  const waxing = frac < 0.5;
  const k = Math.cos(frac * 2 * Math.PI); // 1 new → -1 full
  ctx.fillStyle = '#fff3d1';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
  ctx.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0 ? waxing : !waxing);
  ctx.fill();
  ctx.strokeStyle = '#0b0b14';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  $('#moon-name').textContent = name;
  $('#moon-illum').textContent = `${Math.round(illum * 100)}% lit tonight`;
}
drawMoon();
function sdTime() {
  const t = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
  const h = +new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
  const mood = h < 6 ? 'probably coding' : h < 12 ? 'morning tea' : h < 18 ? 'in class / lab' : h < 22 ? 'ping pong o\'clock' : 'lofi hours';
  $('#sd-time').textContent = `san diego · ${t} · ${mood}`;
}
sdTime();
setInterval(sdTime, 30000);

/* ================= VISITS ================= */
const visits = (+store.get('visits') || 0) + 1;
store.set('visits', visits);
$('#visits').textContent = String(visits).padStart(4, '0');
$('#yr').textContent = new Date().getFullYear();

/* ================= ABLATION ================= */
const abText = {
  base: '<b>Baseline:</b> standard pretraining on the BabyLM budget. Every other cell is compared against this.',
  rw: '<b>Reweight only:</b> examples get dynamic weights based on their loss, so the model spends its limited data where it learns the most.',
  dist: '<b>Distill only:</b> the model also learns from an exponential-moving-average copy of itself, a teacher that comes for free.',
  both: '<b>Combined ✦:</b> EMA self-distillation + loss-based reweighting together. The model sharpens its own learning signal with no external teacher and no extra data.',
};
const abDesc = $('#ab-desc');
$$('.ab-cell').forEach((b) => b.addEventListener('click', () => {
  $$('.ab-cell').forEach((x) => x.classList.toggle('is-active', x === b));
  abDesc.innerHTML = abText[b.dataset.k];
}));
abDesc.innerHTML = abText.base;

/* ================= REVEAL + COUNTERS ================= */
function countUp(el) {
  const to = parseFloat(el.dataset.to);
  const dec = +(el.dataset.dec || 0);
  const suffix = el.dataset.suffix || '';
  if (reduceMotion) { el.textContent = to.toFixed(dec) + suffix; return; }
  const start = performance.now();
  const dur = 1400;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to * e).toFixed(dec) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    en.target.querySelectorAll('.count').forEach(countUp);
    en.target.querySelectorAll('.budget').forEach((b) => b.classList.add('in'));
    io.unobserve(en.target);
  });
}, { threshold: 0.12 });
$$('.reveal').forEach((el) => io.observe(el));

/* ================= SPARKLE TRAIL ================= */
if (finePointer && !reduceMotion) {
  let lastSpark = 0;
  const glyphs = ['✦', '✧', '⋆', '☆'];
  addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - lastSpark < 45 || heroProgress() < 0.95) return;
    lastSpark = now;
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px');
    s.style.color = ['#ffc94a', '#ff9fb2', '#7fe0c3', '#b9aeff'][Math.floor(Math.random() * 4)];
    document.body.append(s);
    setTimeout(() => s.remove(), 900);
  });
}

/* ================= STATUS SPINNER ================= */
const spin = $('.spin');
const frames = ['|', '/', '—', '\\'];
let sf = 0;
setInterval(() => { spin.textContent = frames[sf++ % 4]; }, 180);
