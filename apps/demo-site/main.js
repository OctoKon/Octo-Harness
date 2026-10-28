// Splyce expo demo: one scroll = one page. Each wheel notch, swipe or key press moves exactly one page;
// on arrival the page plays its own animation timeline. The user decides when to move on.
// Classic script so file:// works as well as HTTP.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const root = document.documentElement;
  const pages = [...document.querySelectorAll('.deck > .page')];
  const NAV_LOCK_MS = 700; // ignore input while a page transition runs
  const GESTURE_GAP_MS = 160; // wheel events closer than this belong to one gesture (trackpad momentum)
  const SWIPE_PX = 40;

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

  /* ---------- headings: each page animates its title differently (see styles.css) ---------- */

  const LETTER_PAGES = new Set(['hero', 'turn', 'provider']);

  // Wrap every word (or letter) of the display headings so each can animate on its own.
  function splitWords(node, letters) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const pieces = letters ? [...part] : [part];
          const word = document.createElement('span');
          word.className = 'wd';
          for (const piece of pieces) {
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = piece;
            w.append(inner);
            word.append(w);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        splitWords(child, letters);
      }
    }
  }
  for (const h of document.querySelectorAll('.page .display, .page .h2')) {
    h.classList.remove('reveal');
    h.querySelectorAll('.reveal').forEach((n) => n.classList.remove('reveal'));
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    splitWords(h, LETTER_PAGES.has(h.closest('.page').id));
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

  /* ---------- per-page signature effects layered over the diagrams ---------- */

  const svgIcon = (d) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const SHIELD = svgIcon('<path d="M12 3l7 3v5.5c0 4.2-3 7.6-7 9.5-4-1.9-7-5.3-7-9.5V6z" /><path d="m9 12 2 2 4-4" />');
  const SEARCH = svgIcon('<circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />');
  const BRANCH = svgIcon('<circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M18 9c0 4-4 4-6 5.5" />');

  function fx(page, html) {
    const el = document.createElement('div');
    el.className = 'fx';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    page.querySelector('[data-stage]').append(el);
    return el;
  }
  const seg = (q, a, b) => clamp((q - a) / (b - a));

  const effects = {
    architecture(page) {
      // Number the diagram's cards so they can slide in from alternating sides.
      page.querySelectorAll('.flow-node-inner').forEach((n, i) => n.style.setProperty('--i', String(i)));
      return () => {};
    },
    turn(page) {
      const rail = fx(page, '<div class="fx-rail"><span></span></div>');
      return (q) => rail.style.setProperty('--k', q.toFixed(4));
    },
    safety(page) {
      const SECRET = 'demo-not-a-real-key';
      const el = fx(
        page,
        `<div class="fx-card fx-redact"><div class="fx-h">${SHIELD}Tool output, before display</div>
         <code>api_key=<b class="sec"></b></code><code class="path">read ../outside/notes.txt</code>
         <div class="fx-deny">Path rejected · outside the workspace</div></div>`,
      );
      const sec = el.querySelector('.sec');
      return (q) => {
        const masked = Math.round(seg(q, 0.15, 0.45) * SECRET.length);
        const text = '■'.repeat(masked) + SECRET.slice(masked);
        if (sec.textContent !== text) sec.textContent = text;
        page.classList.toggle('fx-path', q > 0.5);
        page.classList.toggle('fx-denied', q > 0.68);
      };
    },
    memory(page) {
      const QUERY = 'where is approval handled?';
      const el = fx(page, `<div class="fx-card fx-search"><div class="fx-h">${SEARCH}Search</div><code class="q"></code></div>`);
      const q$ = el.querySelector('.q');
      const hits = [...page.querySelectorAll('.flow-node-inner')].filter((n) =>
        /memory|index|search|evidence|store/i.test(n.textContent),
      );
      return (q) => {
        const text = QUERY.slice(0, Math.round(seg(q, 0.2, 0.5) * QUERY.length));
        if (q$.textContent !== text) q$.textContent = text;
        const on = q > 0.55;
        hits.forEach((n) => n.classList.toggle('fx-hit', on));
      };
    },
    subagents(page) {
      const el = fx(
        page,
        `<div class="fx-card fx-fork"><div class="fx-h">${BRANCH}Worktrees</div>
         <div class="fork"><span class="b main">main</span><span class="b w1">helper-1</span><span class="b w2">helper-2</span></div>
         <code class="d1">+ add parser test</code><code class="d2">+ update docs</code><code class="d3">- drop stale flag</code>
         <div class="fx-merge">Reviewed patch → your workspace</div></div>`,
      );
      return (q) => {
        el.style.setProperty('--k', (seg(q, 0.1, 0.3) - seg(q, 0.8, 0.95)).toFixed(4));
        el.style.setProperty('--d1', seg(q, 0.35, 0.45).toFixed(3));
        el.style.setProperty('--d2', seg(q, 0.48, 0.58).toFixed(3));
        el.style.setProperty('--d3', seg(q, 0.61, 0.71).toFixed(3));
        el.style.setProperty('--m', seg(q, 0.85, 0.97).toFixed(3));
      };
    },
    provider(page) {
      return (q) => page.classList.toggle('fx-locked', q > 0.72);
    },
  };

  /* ---------- pages: T = animation ms, R = share of the timeline used by text reveals ---------- */

  const config = {
    hero: { T: 2400, R: 0.9 },
    app: { T: 18000, R: 0.08 },
    architecture: { T: 6500, R: 0.2 },
    turn: { T: 7500, R: 0.18 },
    safety: { T: 7000, R: 0.18 },
    memory: { T: 6500, R: 0.2 },
    subagents: { T: 6500, R: 0.2 },
    provider: { T: 7000, R: 0.2 },
    team: { T: 3200, R: 0.6 },
  };
  const deck = pages.map((page) => {
    const { T, R } = config[page.id] ?? { T: 3000, R: 0.5 };
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
    const extra = effects[page.id]?.(page) ?? (() => {});
    return { page, T, R, render, extra, reveals: rest, last: -1 };
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
    const q = clamp((p - d.R) / (0.97 - d.R));
    d.page.style.setProperty('--q', q.toFixed(4));
    d.render(q);
    d.extra(q);
    // Small screens: content taller than the page pans along with its animation.
    const overflow = d.page.scrollHeight - d.page.clientHeight;
    d.page.scrollTop = overflow > 2 ? overflow * q : 0;
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
  let startedAt = 0; // when the current page's timeline started (replays on every arrival)
  let lockUntil = 0;
  let lastWheel = 0;

  function go(next) {
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
    startedAt = performance.now();
    cur.last = -1;
    renderPage(cur, reduced.matches ? 1 : 0);
    lockUntil = startedAt + NAV_LOCK_MS;

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

  // One gesture = one page. A trackpad flick is a stream of wheel events; only its first event counts,
  // and anything during the transition lock is dropped.
  function step(dir) {
    const now = performance.now();
    if (!dir || now < lockUntil) return;
    go(idx + dir);
  }

  addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // pinch / browser zoom
      e.preventDefault();
      const now = performance.now();
      const fresh = now - lastWheel > GESTURE_GAP_MS;
      lastWheel = now;
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (fresh && Math.abs(dy) >= 1) step(Math.sign(dy));
    },
    { passive: false },
  );

  let touchY = null;
  addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
  addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  addEventListener(
    'touchend',
    (e) => {
      if (touchY === null) return;
      const dy = touchY - e.changedTouches[0].clientY;
      touchY = null;
      if (Math.abs(dy) >= SWIPE_PX) step(Math.sign(dy));
    },
    { passive: true },
  );

  function toggleFullscreen() {
    const req = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.();
    req?.catch?.((err) => console.warn('Splyce demo: fullscreen unavailable.', err.message));
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
    if (e.repeat && k !== 'Home' && k !== 'End') {
      e.preventDefault(); // a held key must not race through pages
      return;
    }
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) step(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) step(-1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(pages.length - 1);
    else handled = false;
    if (handled) e.preventDefault();
  });

  $('p-prev').addEventListener('click', () => go(idx - 1));
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

  /* ---------- frame loop: play the current page's timeline ---------- */

  function frame(now) {
    const d = deck[idx];
    const p = reduced.matches ? 1 : clamp((now - startedAt) / d.T);
    renderPage(d, p);
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    bar.style.transform = `scaleX(${((idx + p) / pages.length).toFixed(4)})`;
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
  requestAnimationFrame(frame);
})();
