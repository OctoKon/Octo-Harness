// Splyce expo demo: manual, scroll-driven paged storytelling.
// Each page is pinned; wheel/trackpad/touch/keys scrub its progress (reversible), and scrolling past
// either end transitions to the neighbouring page. Classic script so file:// works as well as HTTP.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const root = document.documentElement;
  const pages = [...document.querySelectorAll('.deck > .page')];
  const NAV_THRESHOLD = 90; // px of extra scroll past a page end before moving on
  const NAV_LOCK_MS = 650; // ignore input right after a page change
  const INERTIA_GAP_MS = 140; // wheel events closer than this are one (inertial) gesture
  const NAV_LOCK_MAX_MS = 1600;
  const KEY_STEP = 0.2;

  /* ---------- theme ---------- */

  const themeBtn = document.getElementById('theme-btn');
  const syncThemeLabel = () =>
    themeBtn.setAttribute('aria-label', `Switch to ${root.dataset.theme === 'dark' ? 'light' : 'dark'} theme`);
  const savedTheme = () => {
    try {
      return localStorage.getItem('splyce-demo-theme');
    } catch {
      return null; // Storage blocked (file:// or private mode): follow the system.
    }
  };
  syncThemeLabel();
  themeBtn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('splyce-demo-theme', root.dataset.theme);
    } catch {
      // Storage blocked: the toggle still applies for this visit.
    }
    syncThemeLabel();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!savedTheme()) {
      root.dataset.theme = e.matches ? 'dark' : 'light';
      syncThemeLabel();
    }
  });

  /* ---------- word-masked headings ---------- */

  // Wrap every word of the display headings so each can rise out of its own mask.
  function splitWords(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          inner.textContent = part;
          w.append(inner);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        splitWords(child);
      }
    }
  }
  for (const h of document.querySelectorAll('.page .display, .page .h2')) {
    h.classList.remove('reveal');
    h.querySelectorAll('.reveal').forEach((n) => n.classList.remove('reveal'));
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    splitWords(h);
    h.querySelectorAll('.w').forEach((w) => w.setAttribute('aria-hidden', 'true'));
  }

  /* ---------- scripted app session ---------- */

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
    if (p < 0.15) text = typeSlice(MSG1, p, 0.02, 0.11);
    else if (p >= 0.38 && p < 0.55) text = typeSlice(MSG2, p, 0.38, 0.49);
    if (typed.textContent !== text) typed.textContent = text;
    composer.classList.toggle('typing', text.length > 0);
    sendBtn.classList.toggle('pressing', (p > 0.12 && p < 0.15) || (p > 0.51 && p < 0.55));
    allowBtn.classList.toggle('pressing', p > 0.66 && p < 0.71);
    const mode = p >= 0.15 ? 'convo' : 'landing';
    if (sim.dataset.mode !== mode) sim.dataset.mode = mode;
    for (const el of items) {
      el.classList.toggle('show', p >= Number(el.dataset.at));
      if (el.dataset.done) el.classList.toggle('done', p >= Number(el.dataset.done));
    }
  }

  /* ---------- provider card: fields fill in, then Save ---------- */

  const fields = [...document.querySelectorAll('#provider input[data-full]')];
  const saveBtn = document.getElementById('save-btn');
  const saved = document.getElementById('saved');
  const SAVED_TEXT = 'In the app: the key goes to Credential Manager and this field clears.';

  function renderProvider(p) {
    fields.forEach((input, i) => {
      const a = 0.04 + i * 0.17;
      let value = typeSlice(input.dataset.full, p, a, a + 0.14);
      if (input.type === 'password' && p >= 0.86) value = '';
      if (input.value !== value) input.value = value;
    });
    saveBtn.classList.toggle('pressing', p > 0.8 && p < 0.86);
    const msg = p >= 0.86 ? SAVED_TEXT : '';
    if (saved.textContent !== msg) saved.textContent = msg;
  }
  saveBtn.addEventListener('click', () => {
    fields.at(-1).value = '';
    saved.textContent = SAVED_TEXT;
  });

  /* ---------- diagrams (classic scripts registered on window.SplyceFlows) ---------- */

  const MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
  <path pathLength="1" d="M2 6h3.2c4.2 0 5 6 8.3 6H22"/><path pathLength="1" d="M2 18h3.2c4.2 0 5-6 8.3-6" opacity=".55"/>
  <path pathLength="1" d="M2 12h5.5c3.1 0 3.4-6 6.5-6H22" opacity=".3"/></svg>`;

  function setupFlow(sec) {
    const stage = sec.querySelector('[data-stage]');
    const steps = [...sec.querySelectorAll('.steps li')];
    let diagram = null;
    let placeholder = null;
    const entry = window.SplyceFlows?.[sec.dataset.flow];
    try {
      if (typeof entry?.mount !== 'function') throw new Error('script not loaded');
      const host = document.createElement('div');
      stage.replaceChildren(host);
      diagram = entry.mount(host);
      if (typeof diagram?.setProgress !== 'function') throw new Error('mount() returned no setProgress');
      sec.classList.add('has-diagram');
    } catch (err) {
      // Missing or broken diagram: show a step placeholder so the page keeps working.
      console.warn(`Splyce demo: diagram "${sec.dataset.flow}" unavailable (${err.message}); showing placeholder.`);
      diagram = null;
      placeholder = document.createElement('div');
      placeholder.className = 'ph-card';
      placeholder.innerHTML = `${MARK}<strong></strong><span></span>`;
      stage.replaceChildren(placeholder);
    }
    return (p) => {
      const n = steps.length;
      const count = Math.min(n, 1 + Math.floor(p * n));
      steps.forEach((li, i) => {
        li.classList.toggle('on', i < count);
        li.classList.toggle('cur', i === count - 1);
      });
      if (diagram) diagram.setProgress(p);
      else {
        placeholder.style.setProperty('--p', p.toFixed(3));
        const label = steps[count - 1]?.textContent ?? '';
        const strong = placeholder.querySelector('strong');
        if (strong.textContent !== label) {
          strong.textContent = label;
          placeholder.querySelector('span').textContent = `Step ${count} of ${n}`;
        }
      }
    };
  }

  /* ---------- pages: L = scroll px to scrub the page, R = share of progress used by text reveals ---------- */

  const config = {
    hero: { L: 900, R: 0.4 },
    app: { L: 4200, R: 0.12 },
    architecture: { L: 2200, R: 0.2 },
    turn: { L: 2800, R: 0.18 },
    safety: { L: 2600, R: 0.18 },
    memory: { L: 2400, R: 0.2 },
    subagents: { L: 2400, R: 0.2 },
    provider: { L: 1800, R: 0.25 },
    team: { L: 1000, R: 0.6 },
  };
  const deck = pages.map((page) => {
    const { L, R } = config[page.id] ?? { L: 1200, R: 0.4 };
    let render = () => {};
    if (page.id === 'app') render = renderSession;
    else if (page.id === 'provider') render = renderProvider;
    else if (page.dataset.flow) render = setupFlow(page);
    // Reveal order: DOM order, except the visual (diagram, app window, form) follows right after the headline.
    const all = [...page.querySelectorAll('.reveal, .w')];
    const visual = all.filter((n) => n.matches('.stage, .win, .setup'));
    const rest = all.filter((n) => !visual.includes(n));
    const lastWord = rest.findLastIndex((n) => n.classList.contains('w'));
    rest.splice(lastWord + 1, 0, ...visual);
    return { page, L, R, render, reveals: rest, entry: page.id === 'hero' ? R : R * 0.6, last: -1 };
  });

  function renderPage(d, p) {
    if (Math.abs(p - d.last) < 0.0004) return;
    d.last = p;
    // Text and blocks reveal in DOM order across the first R of progress.
    const n = d.reveals.length;
    const span = d.R * 0.45;
    d.reveals.forEach((el, i) => {
      const start = n > 1 ? (i / (n - 1)) * (d.R - span) : 0;
      el.style.setProperty('--r', clamp((p - start) / span).toFixed(3));
    });
    // The rest drives the page's own story, finishing a little before the end so it can be read.
    const q = clamp((p - d.R) / (0.94 - d.R));
    d.page.style.setProperty('--q', q.toFixed(4));
    d.render(q);
    // Small screens: content taller than the page pans with progress instead of scrolling natively.
    const overflow = d.page.scrollHeight - d.page.clientHeight;
    d.page.scrollTop = overflow > 2 ? overflow * clamp((p - d.entry) / (0.94 - d.entry)) : 0;
  }

  /* ---------- navigation chrome ---------- */

  const $ = (id) => document.getElementById(id);
  const fill = $('p-fill');
  const bar = $('progress-bar');
  const pIndex = $('p-index');
  $('p-total').textContent = String(pages.length).padStart(2, '0');

  const dots = pages.map((p, i) => {
    const a = document.createElement('a');
    a.href = `#${p.id}`;
    a.setAttribute('aria-label', `Go to ${p.dataset.title}`);
    a.innerHTML = `<span aria-hidden="true">${p.dataset.title}</span>`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      go(i);
    });
    $('dots').append(a);
    return a;
  });

  /* ---------- state ---------- */

  let idx = -1;
  let target = 0; // progress the input asks for
  let shown = 0; // smoothed progress actually rendered
  let overflowPx = 0;
  let lockUntil = 0;
  let lockStart = 0;
  let lastWheel = 0;

  function go(next, { atEnd = false } = {}) {
    next = clamp(next, 0, pages.length - 1);
    if (next === idx) return;
    const forward = idx === -1 || next > idx;
    const prev = deck[idx];
    const cur = deck[next];
    if (prev) {
      prev.page.classList.remove('active');
      prev.page.classList.toggle('up', forward);
      prev.page.inert = true;
      prev.page.setAttribute('aria-hidden', 'true');
    }
    const page = cur.page;
    page.classList.add('snap');
    page.classList.toggle('up', !forward);
    void page.offsetHeight; // commit the start position before animating in
    page.classList.remove('snap', 'up');
    page.classList.add('active');
    page.inert = false;
    page.removeAttribute('aria-hidden');

    idx = next;
    target = atEnd ? 1 : cur.entry;
    shown = atEnd ? 1 : 0; // forward entries animate their opening reveal up to `entry`
    cur.last = -1;
    renderPage(cur, shown);
    overflowPx = 0;
    lockStart = performance.now();
    lockUntil = lockStart + NAV_LOCK_MS;

    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === idx)));
    pIndex.textContent = String(idx + 1).padStart(2, '0');
    pIndex.classList.remove('tick');
    void pIndex.offsetWidth;
    pIndex.classList.add('tick');
    $('p-title').textContent = page.dataset.title;
    try {
      history.replaceState(null, '', `#${page.id}`);
    } catch {
      // Some file:// contexts reject replaceState; the hash is cosmetic.
    }
  }

  // Scroll input in pixels: scrub the page, then spill over into the next/previous page.
  function scrub(deltaPx) {
    const now = performance.now();
    if (now < lockUntil) return;
    const d = deck[idx];
    const dir = Math.sign(deltaPx);
    if (!dir) return;
    const before = target;
    target = clamp(target + deltaPx / d.L);
    const used = (target - before) * d.L;
    const atEdge = (dir > 0 && target >= 1) || (dir < 0 && target <= 0);
    if (!atEdge) {
      overflowPx = 0;
      return;
    }
    overflowPx += Math.abs(deltaPx - used);
    if (overflowPx < NAV_THRESHOLD) return;
    if (dir > 0 && idx < pages.length - 1) go(idx + 1);
    else if (dir < 0 && idx > 0) go(idx - 1, { atEnd: true });
    overflowPx = 0;
  }

  addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // pinch / browser zoom
      e.preventDefault();
      const now = performance.now();
      // An inertial trackpad stream that triggered a page change keeps the lock until it dies down.
      if (now < lockUntil + INERTIA_GAP_MS && now - lastWheel < INERTIA_GAP_MS && now - lockStart < NAV_LOCK_MAX_MS) {
        lockUntil = Math.max(lockUntil, now + 1);
      }
      lastWheel = now;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      scrub(e.deltaMode === 1 ? dy * 32 : e.deltaMode === 2 ? dy * innerHeight : dy);
    },
    { passive: false },
  );

  let touchY = null;
  addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
  addEventListener(
    'touchmove',
    (e) => {
      if (touchY === null) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      scrub((touchY - y) * 2.4);
      touchY = y;
    },
    { passive: false },
  );
  addEventListener('touchend', () => (touchY = null), { passive: true });

  function toggleFullscreen() {
    const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
    req?.catch?.((err) => console.warn('Splyce demo: fullscreen unavailable.', err.message));
  }

  function stepKey(dir) {
    const d = deck[idx];
    if ((dir > 0 && target >= 1) || (dir < 0 && target <= 0)) {
      if (dir > 0 && idx < pages.length - 1) go(idx + 1);
      else if (dir < 0 && idx > 0) go(idx - 1, { atEnd: true });
      return;
    }
    target = clamp(target + dir * KEY_STEP);
    if (dir > 0 && target < d.entry) target = d.entry;
  }

  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input:not([readonly]), textarea, select, [contenteditable="true"]')) return;
    const k = e.key;
    if (k === 'f' || k === 'F') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    let handled = true;
    if (k === 'ArrowDown' || k === 'ArrowRight') stepKey(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') stepKey(-1);
    else if (k === 'PageDown' || (k === ' ' && !e.shiftKey)) go(idx + 1);
    else if (k === 'PageUp' || (k === ' ' && e.shiftKey)) go(idx - 1, { atEnd: true });
    else if (k === 'Home') go(0);
    else if (k === 'End') go(pages.length - 1, { atEnd: true });
    else handled = false;
    if (handled) e.preventDefault();
  });

  $('p-prev').addEventListener('click', () => go(idx - 1, { atEnd: true }));
  $('p-next').addEventListener('click', () => go(idx + 1));
  $('p-full').addEventListener('click', toggleFullscreen);

  // In-page links (#app, #hero) move the deck instead of scrolling.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || a.closest('#dots')) return;
    const href = a.getAttribute('href');
    const i = pages.findIndex((p) => `#${p.id}` === href);
    if (i < 0) return;
    e.preventDefault();
    go(i);
  });

  /* ---------- frame loop: ease rendered progress toward the input ---------- */

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 64);
    last = now;
    const d = deck[idx];
    shown = reduced.matches ? target : shown + (target - shown) * (1 - Math.exp(-dt / 110));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    renderPage(d, shown);
    fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    bar.style.transform = `scaleX(${((idx + shown) / pages.length).toFixed(4)})`;
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */

  // Hash links and focus can scroll even an overflow:hidden container; the deck must never move.
  const deckEl = $('deck');
  deckEl.addEventListener('scroll', () => {
    if (deckEl.scrollTop || deckEl.scrollLeft) deckEl.scrollTo(0, 0);
  });
  pages.forEach((p) => {
    p.inert = true;
    p.setAttribute('aria-hidden', 'true');
  });
  const start = pages.findIndex((p) => `#${p.id}` === location.hash);
  go(start < 0 ? 0 : start);
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
