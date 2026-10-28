// Splyce expo demo site: reveal-on-scroll, scroll-scrubbed session and flow diagrams, keyboard nav.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sections = [...document.querySelectorAll('main > section')];
const root = document.documentElement;

/* ---------- theme ---------- */

const themeBtn = document.getElementById('theme-btn');
const syncThemeLabel = () =>
  themeBtn.setAttribute('aria-label', `Switch to ${root.dataset.theme === 'dark' ? 'light' : 'dark'} theme`);
syncThemeLabel();
themeBtn.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('splyce-demo-theme', root.dataset.theme);
  } catch {
    // Storage can be blocked (private mode); the toggle still works for this visit.
  }
  syncThemeLabel();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let saved = null;
  try {
    saved = localStorage.getItem('splyce-demo-theme');
  } catch {
    // Storage blocked: follow the system theme.
  }
  if (!saved) {
    root.dataset.theme = e.matches ? 'dark' : 'light';
    syncThemeLabel();
  }
});

/* ---------- reveal + dots ---------- */

const dotsNav = document.getElementById('dots');
const dots = sections.map((s) => {
  const a = document.createElement('a');
  a.href = `#${s.id}`;
  a.setAttribute('aria-label', s.dataset.title);
  a.innerHTML = `<span aria-hidden="true">${s.dataset.title}</span>`;
  dotsNav.append(a);
  return a;
});

const revealer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealer.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 },
);
sections.forEach((s) => revealer.observe(s));

/* ---------- section progress ---------- */

function progressOf(sec) {
  const r = sec.getBoundingClientRect();
  const span = r.height - innerHeight;
  return span > 0 ? clamp(-r.top / span) : r.top <= 0 ? 1 : 0;
}

/* ---------- scripted session (section 2) ---------- */

const sim = document.getElementById('sim');
const typed = document.getElementById('typed');
const composer = sim.querySelector('.composer');
const sendBtn = document.getElementById('send');
const allowBtn = document.getElementById('allow-btn');
const items = [...sim.querySelectorAll('#transcript > *')];
const MSG1 = 'Read README.md and tell me the secret word';
const MSG2 = 'Run the shell command: echo splyce';
const typeSlice = (text, p, a, b) => text.slice(0, Math.round(clamp((p - a) / (b - a)) * text.length));

function renderSession(p) {
  let text = '';
  if (p < 0.15) text = typeSlice(MSG1, p, 0.03, 0.11);
  else if (p >= 0.38 && p < 0.55) text = typeSlice(MSG2, p, 0.38, 0.49);
  typed.textContent = text;
  composer.classList.toggle('typing', text.length > 0);
  sendBtn.classList.toggle('pressing', (p > 0.12 && p < 0.15) || (p > 0.51 && p < 0.55));
  allowBtn.classList.toggle('pressing', p > 0.67 && p < 0.71);
  sim.dataset.mode = p >= 0.15 ? 'convo' : 'landing';
  for (const el of items) {
    el.classList.toggle('show', p >= Number(el.dataset.at));
    if (el.dataset.done) el.classList.toggle('done', p >= Number(el.dataset.done));
  }
}

/* ---------- flow diagrams (sections 3–7) ---------- */

const MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
  <path pathLength="1" d="M2 6h3.2c4.2 0 5 6 8.3 6H22"/><path pathLength="1" d="M2 18h3.2c4.2 0 5-6 8.3-6" opacity=".55"/>
  <path pathLength="1" d="M2 12h5.5c3.1 0 3.4-6 6.5-6H22" opacity=".3"/></svg>`;

const flows = [...document.querySelectorAll('.flow-sec')].map((sec) => {
  const stage = sec.querySelector('[data-stage]');
  const steps = [...sec.querySelectorAll('.steps li')];
  const flow = { sec, stage, steps, diagram: null, placeholder: null };

  const showPlaceholder = () => {
    stage.replaceChildren();
    const card = document.createElement('div');
    card.className = 'ph-card';
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = `${MARK}<strong></strong><span></span>`;
    stage.append(card);
    flow.placeholder = card;
  };
  showPlaceholder();

  import(`./flows/${sec.dataset.flow}.js`)
    .then(async (mod) => {
      const mount = mod.mount ?? mod.default?.mount ?? mod.default;
      if (typeof mount !== 'function') throw new Error(`flows/${sec.dataset.flow}.js exports no mount()`);
      const host = document.createElement('div');
      stage.replaceChildren(host);
      const api = await mount(host);
      if (!api || typeof api.setProgress !== 'function') throw new Error(`flows/${sec.dataset.flow}.js mount() returned no setProgress`);
      flow.diagram = api;
      flow.placeholder = null;
      sec.classList.add('has-diagram');
      update();
    })
    .catch((err) => {
      // A missing or broken diagram module degrades to the step placeholder; the page keeps working.
      console.warn(`Splyce demo: diagram "${sec.dataset.flow}" unavailable, showing placeholder.`, err.message);
      if (!flow.placeholder) showPlaceholder();
      update();
    });
  return flow;
});

function renderFlow(flow, p) {
  const n = flow.steps.length;
  const count = Math.min(n, 1 + Math.floor(p * n));
  flow.steps.forEach((li, i) => {
    li.classList.toggle('on', i < count);
    li.classList.toggle('cur', i === count - 1);
  });
  if (flow.diagram) {
    flow.diagram.setProgress(p);
  } else if (flow.placeholder) {
    flow.placeholder.style.setProperty('--p', p.toFixed(3));
    const label = flow.steps[count - 1]?.textContent ?? '';
    const strong = flow.placeholder.querySelector('strong');
    if (strong.textContent !== label) {
      strong.textContent = label;
      flow.placeholder.querySelector('span').textContent = `Step ${count} of ${n}`;
    }
  }
}

/* ---------- scroll loop ---------- */

const bar = document.getElementById('progress-bar');
const appSec = document.getElementById('app');
let queued = false;

function update() {
  queued = false;
  const max = root.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max) : 0})`;

  const mid = innerHeight / 2;
  sections.forEach((s, i) => {
    const r = s.getBoundingClientRect();
    dots[i].setAttribute('aria-current', String(r.top <= mid && r.bottom > mid));
  });

  renderSession(progressOf(appSec));
  for (const f of flows) {
    const r = f.sec.getBoundingClientRect();
    if (r.bottom > -innerHeight && r.top < innerHeight * 2) renderFlow(f, progressOf(f.sec));
  }
}
const schedule = () => {
  if (!queued) {
    queued = true;
    requestAnimationFrame(update);
  }
};
addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule);
update();

/* ---------- keyboard: step through sections and scripted beats ---------- */

function stops() {
  const out = [];
  for (const s of sections) {
    const top = s.offsetTop;
    out.push(top);
    // Tall sections get one stop per viewport so every beat is reachable from the keyboard.
    for (let y = top + innerHeight; y < top + s.offsetHeight - innerHeight / 2; y += innerHeight) out.push(y);
  }
  return out;
}

addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, button, [contenteditable="true"]') && e.key === ' ') return;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const fwd = ['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
  const back = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
  const list = stops();
  let target = null;
  if (fwd) target = list.find((y) => y > scrollY + 4);
  else if (back) target = [...list].reverse().find((y) => y < scrollY - 4);
  else if (e.key === 'Home') target = 0;
  else if (e.key === 'End') target = list.at(-1);
  else return;
  e.preventDefault();
  if (target !== undefined && target !== null) scrollTo({ top: target, behavior: reduced.matches ? 'auto' : 'smooth' });
});

/* ---------- provider card micro-interaction ---------- */

document.getElementById('save-btn').addEventListener('click', () => {
  const key = document.querySelector('.key input');
  key.value = '';
  document.getElementById('saved').textContent = 'Illustration only: nothing is saved by this page.';
});
