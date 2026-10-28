// Splyce expo demo: page-based autoplay presentation with manual (wheel/touch/keyboard) control.
// Classic script so the page works from file:// as well as over HTTP.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const root = document.documentElement;
  const pages = [...document.querySelectorAll('.deck > .page')];
  const IDLE_RESUME_MS = 20000;
  const WHEEL_PX_PER_TIMELINE = 1400;
  const NAV_THRESHOLD = 120;
  const NAV_COOLDOWN_MS = 750;

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
    if (p < 0.15) text = typeSlice(MSG1, p, 0.03, 0.11);
    else if (p >= 0.38 && p < 0.55) text = typeSlice(MSG2, p, 0.38, 0.49);
    if (typed.textContent !== text) typed.textContent = text;
    composer.classList.toggle('typing', text.length > 0);
    sendBtn.classList.toggle('pressing', (p > 0.12 && p < 0.15) || (p > 0.51 && p < 0.55));
    allowBtn.classList.toggle('pressing', p > 0.66 && p < 0.71);
    sim.dataset.mode = p >= 0.15 ? 'convo' : 'landing';
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
      const a = 0.05 + i * 0.16;
      let value = typeSlice(input.dataset.full, p, a, a + 0.13);
      if (input.type === 'password' && p >= 0.84) value = '';
      if (input.value !== value) input.value = value;
    });
    saveBtn.classList.toggle('pressing', p > 0.78 && p < 0.84);
    const msg = p >= 0.84 ? SAVED_TEXT : '';
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
    const flow = { steps, diagram: null, placeholder: null };
    const entry = window.SplyceFlows?.[sec.dataset.flow];
    try {
      if (typeof entry?.mount !== 'function') throw new Error('script not loaded');
      const host = document.createElement('div');
      stage.replaceChildren(host);
      const api = entry.mount(host);
      if (typeof api?.setProgress !== 'function') throw new Error('mount() returned no setProgress');
      flow.diagram = api;
      sec.classList.add('has-diagram');
    } catch (err) {
      // Missing or broken diagram: show a step placeholder so the presentation keeps working.
      console.warn(`Splyce demo: diagram "${sec.dataset.flow}" unavailable (${err.message}); showing placeholder.`);
      const card = document.createElement('div');
      card.className = 'ph-card';
      card.innerHTML = `${MARK}<strong></strong><span></span>`;
      stage.replaceChildren(card);
      flow.placeholder = card;
    }
    return (p) => {
      const n = steps.length;
      const count = Math.min(n, 1 + Math.floor(p * n));
      steps.forEach((li, i) => {
        li.classList.toggle('on', i < count);
        li.classList.toggle('cur', i === count - 1);
      });
      if (flow.diagram) flow.diagram.setProgress(easeInOut(p));
      else {
        flow.placeholder.style.setProperty('--p', p.toFixed(3));
        const label = steps[count - 1]?.textContent ?? '';
        const strong = flow.placeholder.querySelector('strong');
        if (strong.textContent !== label) {
          strong.textContent = label;
          flow.placeholder.querySelector('span').textContent = `Step ${count} of ${n}`;
        }
      }
    };
  }

  /* ---------- page timelines: D = animation ms, H = hold ms (about 2 minutes total) ---------- */

  const timing = {
    hero: [3200, 3000],
    app: [30000, 3500],
    architecture: [9000, 3000],
    turn: [12000, 3000],
    safety: [11000, 3000],
    memory: [10000, 3000],
    subagents: [10000, 3000],
    provider: [8000, 3500],
    team: [3000, 5000],
  };
  const deck = pages.map((page) => {
    const [D, H] = timing[page.id] ?? [3000, 3000];
    let render = () => {};
    if (page.id === 'app') render = renderSession;
    else if (page.id === 'provider') render = renderProvider;
    else if (page.dataset.flow) render = setupFlow(page);
    return { page, D, H, render, scrub: render.length > 0 && page.id !== 'hero' };
  });

  /* ---------- player state ---------- */

  const el = (id) => document.getElementById(id);
  const playBtn = el('p-play');
  const fill = el('p-fill');
  const bar = el('progress-bar');
  const pIndex = el('p-index');
  const dotsNav = el('dots');
  el('p-total').textContent = String(pages.length);

  const dots = pages.map((p, i) => {
    const a = document.createElement('a');
    a.href = `#${p.id}`;
    a.setAttribute('aria-label', `Go to ${p.dataset.title}`);
    a.innerHTML = `<span aria-hidden="true">${p.dataset.title}</span>`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      pause();
      go(i);
    });
    dotsNav.append(a);
    return a;
  });

  let idx = -1;
  let t = 0;
  let playing = true;
  let scrubbed = false;
  let lastInput = 0;
  let lastNav = 0;
  let wheelOverflow = 0;
  let last = performance.now();

  function setPlaying(on) {
    playing = on;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause autoplay' : 'Play autoplay');
    el('p-mode').textContent = on ? 'Auto' : 'Manual';
    if (on) scrubbed = false;
  }
  function pause() {
    lastInput = performance.now();
    if (playing) setPlaying(false);
  }

  function go(next, { atEnd = false, dir } = {}) {
    const n = pages.length;
    next = ((next % n) + n) % n;
    if (next === idx) return;
    const forward = dir ?? (idx === -1 || next > idx || (idx === n - 1 && next === 0) ? 1 : -1);
    const prev = deck[idx];
    const cur = deck[next];
    if (prev) {
      const out = prev.page;
      out.classList.remove('active');
      out.classList.toggle('up', forward > 0);
      out.inert = true;
      out.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        if (!out.classList.contains('active')) out.classList.remove('in');
      }, 800);
    }
    const page = cur.page;
    page.classList.add('snap');
    page.classList.toggle('up', forward < 0);
    page.classList.remove('in');
    void page.offsetHeight; // commit the start position before animating in
    page.classList.remove('snap', 'up');
    page.classList.add('active');
    page.inert = false;
    page.removeAttribute('aria-hidden');
    page.scrollTop = 0;
    requestAnimationFrame(() => page.classList.add('in'));

    idx = next;
    t = atEnd ? cur.D : 0;
    scrubbed = atEnd;
    wheelOverflow = 0;
    lastNav = performance.now();
    cur.render(clamp(t / cur.D));
    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === idx)));
    pIndex.textContent = String(idx + 1);
    pIndex.classList.remove('tick');
    void pIndex.offsetWidth;
    pIndex.classList.add('tick');
    el('p-title').textContent = page.dataset.title;
    try {
      history.replaceState(null, '', `#${page.id}`);
    } catch {
      // Some file:// contexts reject replaceState; the hash is cosmetic.
    }
  }

  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    const cur = deck[idx];
    if (!document.hidden) {
      if (playing) {
        t += dt;
        if (t >= cur.D + cur.H) go(idx + 1, { dir: 1 });
      } else if (!scrubbed && t < cur.D) {
        t = Math.min(cur.D, t + dt);
      } else if (now - lastInput > IDLE_RESUME_MS) {
        setPlaying(true);
      }
    }
    const c = deck[idx];
    c.render(clamp(t / c.D));
    const local = playing ? clamp(t / (c.D + c.H)) : clamp(t / c.D);
    fill.style.transform = `scaleX(${local.toFixed(4)})`;
    bar.style.transform = `scaleX(${((idx + local) / pages.length).toFixed(4)})`;
    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */

  const canScrollInside = (dir) => {
    const page = deck[idx].page;
    if (page.scrollHeight <= page.clientHeight + 2) return false;
    return dir > 0 ? page.scrollTop + page.clientHeight < page.scrollHeight - 2 : page.scrollTop > 2;
  };
  const step = (dir) => {
    if (performance.now() - lastNav < NAV_COOLDOWN_MS) return;
    go(idx + dir, { atEnd: dir < 0 && deck[idx - 1 < 0 ? pages.length - 1 : idx - 1].scrub, dir });
  };

  // Manual mode: wheel scrubs the page timeline, then moves to the next/previous page at its ends.
  function nudge(delta) {
    pause();
    const cur = deck[idx];
    const dir = Math.sign(delta);
    if (!dir || canScrollInside(dir)) return;
    if (cur.scrub) {
      const before = t;
      t = clamp(t + (delta / WHEEL_PX_PER_TIMELINE) * cur.D, 0, cur.D);
      scrubbed = true;
      const overflow = delta - ((t - before) / cur.D) * WHEEL_PX_PER_TIMELINE;
      if ((dir > 0 && t >= cur.D) || (dir < 0 && t <= 0)) wheelOverflow += Math.abs(overflow);
      else wheelOverflow = 0;
    } else {
      wheelOverflow += Math.abs(delta);
    }
    if (wheelOverflow > NAV_THRESHOLD) {
      wheelOverflow = 0;
      step(dir);
    }
  }

  addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // browser zoom
      const dir = Math.sign(e.deltaY);
      if (canScrollInside(dir)) {
        pause();
        return;
      }
      e.preventDefault();
      nudge(e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY);
    },
    { passive: false },
  );

  let touchY = null;
  addEventListener('touchstart', (e) => {
    touchY = e.touches[0].clientY;
    pause();
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) < 50 || canScrollInside(Math.sign(dy))) return;
    lastNav = 0;
    step(Math.sign(dy));
  }, { passive: true });

  function toggleFullscreen() {
    const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
    req?.catch?.((err) => console.warn('Splyce demo: fullscreen unavailable.', err.message));
  }

  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input:not([readonly]), textarea, select, [contenteditable="true"]')) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault();
      if (playing) pause();
      else setPlaying(true);
      return;
    }
    if (k === 'f' || k === 'F') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    const fwd = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(k);
    const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k);
    if (!fwd && !back && k !== 'Home' && k !== 'End') return;
    e.preventDefault();
    pause();
    lastNav = 0;
    if (k === 'Home') go(0, { dir: -1 });
    else if (k === 'End') go(pages.length - 1, { dir: 1 });
    else go(idx + (fwd ? 1 : -1), { dir: fwd ? 1 : -1 });
  });

  playBtn.addEventListener('click', () => (playing ? pause() : setPlaying(true)));
  el('p-prev').addEventListener('click', () => {
    pause();
    go(idx - 1, { dir: -1 });
  });
  el('p-next').addEventListener('click', () => {
    pause();
    go(idx + 1, { dir: 1 });
  });
  el('p-full').addEventListener('click', toggleFullscreen);

  // In-page links (#app, #hero) move the deck instead of scrolling.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || a.closest('#dots') || a.classList.contains('skip')) return;
    const i = pages.findIndex((p) => `#${p.id}` === a.getAttribute('href'));
    if (i < 0) return;
    e.preventDefault();
    pause();
    go(i);
  });
  document.querySelector('.skip').addEventListener('click', (e) => {
    e.preventDefault();
    pause();
    go(pages.findIndex((p) => p.id === 'app'));
  });

  // Booth mode: dim the player and hide the cursor while autoplay runs untouched.
  let idleTimer = 0;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => playing && document.body.classList.add('idle'), 2500);
  };
  addEventListener('pointermove', wake, { passive: true });
  wake();

  /* ---------- start ---------- */

  // Hash links and focus can scroll even an overflow:hidden container; the deck must never move.
  const deckEl = document.getElementById('deck');
  deckEl.addEventListener('scroll', () => {
    if (deckEl.scrollTop || deckEl.scrollLeft) deckEl.scrollTo(0, 0);
  });

  pages.forEach((p) => {
    p.inert = true;
    p.setAttribute('aria-hidden', 'true');
  });
  const start = pages.findIndex((p) => `#${p.id}` === location.hash);
  go(start < 0 ? 0 : start, { dir: 1 });
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
