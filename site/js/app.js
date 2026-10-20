/* ArtiOS 7 — app logic.
 * Desktop (Windows 7 Aero): text-mode terminal window, Explorer-style Easy view, superbar, Start menu, clock gadget.
 * Mobile (early iPhone OS): lock screen, springboard, full-screen pages, terminal app.
 * Routing: #<section> / #terminal, with history.pushState so browser Back works everywhere.
 * Preferences: ?lang=en|es and ?view=easy|terminal (shareable), persisted in localStorage.
 */
(() => {
  'use strict';
  const C = window.CONTENT;

  /* --------- helpers --------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mq = matchMedia('(max-width: 819px)');
  const isMobile = () => mq.matches;
  /* Only author-controlled templates go through frag(); user-typed text is always esc()'d or set via textContent. */
  const frag = (html) => document.createRange().createContextualFragment(html);
  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  /* Inline icons (class "i", 18-26px) use the "-s" orb whose object fills the sphere;
     larger icons (any other class) use the full orb with caustic and highlight. */
  const svg = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#${cls === 'i' ? `${id}-s` : id}"/></svg>`;
  const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');
  const store = {
    get: (k) => { try { return localStorage.getItem('ag.' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('ag.' + k, v); } catch { /* private mode: preference just isn't remembered */ } },
  };
  const session = {
    get: (k) => { try { return sessionStorage.getItem('ag.' + k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem('ag.' + k, v); } catch { /* private mode: lock screen shows again next load */ } },
  };
  const anim = (el, frames, opts) => (reduce ? Promise.resolve() : el.animate(frames, { easing: 'cubic-bezier(.2,.8,.2,1)', ...opts }).finished);

  /* --------- preferences --------- */
  const params = new URLSearchParams(location.search);
  const LANGS = ['en', 'es'];
  let lang = LANGS.includes(params.get('lang')) ? params.get('lang') : (LANGS.includes(store.get('lang')) ? store.get('lang') : 'en');
  let mode = ['easy', 'terminal'].includes(params.get('view')) ? params.get('view') : (store.get('mode') === 'easy' ? 'easy' : 'terminal');
  const setMode = (m) => { mode = m; store.set('mode', m); };
  const locale = () => (lang === 'es' ? 'es-MX' : 'en-US');

  /* --------- i18n --------- */
  const isBi = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'en' in v && 'es' in v;
  const L = (v) => (isBi(v) ? v[lang] : v);
  const ui = (k) => L(C.ui[k]) ?? k;
  const dos = (k, vars = {}) => String(L(C.dos[k])).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
  const T = (v) => (v && v.tbd ? `<span class="todo">[${esc(ui('tbd'))}: ${esc(L(v.tbd))}]</span>` : L(v));
  const SECTIONS = C.sections;
  const sec = (id) => SECTIONS.find((s) => s.id === id);

  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = `${C.profile.name} — ${C.profile.role}`;
    $$('[data-i18n]').forEach((el) => { el.textContent = ui(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', ui(el.dataset.i18nAria)); el.title = ui(el.dataset.i18nAria); });
    $$('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
    $$('[data-lang-toggle]').forEach((b) => { b.title = ui('switchLangHint'); });
    $('#taskbar').setAttribute('aria-label', ui('taskbar'));
    $('#icons').setAttribute('aria-label', ui('desktop'));
    $('#smList').setAttribute('aria-label', ui('startMenu'));
    $('#chipsBar').setAttribute('aria-label', ui('quickCommands'));
    $('#winTerm').setAttribute('aria-label', ui('cmdTitle'));
    $('#winEasy').setAttribute('aria-label', ui('easyTitle'));
    $('#navpane').setAttribute('aria-label', ui('sections'));
    $('#smSearch').placeholder = ui('searchStart');
    $('#easySearch').placeholder = ui('searchEasy');
    $('#gadget').setAttribute('aria-label', ui('clockGadget'));
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    store.set('lang', lang);
    const qs = new URLSearchParams(location.search);
    qs.set('lang', lang);
    history.replaceState(history.state, '', `${location.pathname}?${qs}${location.hash}`);
    applyStatic();
    buildIcons(); Menu.build(); buildChips(); Phone.renderHome(); Clock.tick();
    Easy.render();
    Phone.rerender();
    Terminal.relang();
  }

  /* --------- search index (Start menu + Easy view) --------- */
  function searchIndex() {
    return [
      ...SECTIONS.map((s) => ({ kind: 'section', target: s.id, icon: s.icon, label: L(s.label), sub: L(s.desc), text: [L(s.label), L(s.desc), L(s.plain)].join(' ') })),
      ...C.projects.map((p) => ({ kind: 'project', target: p.slug, icon: 'ic-folder', label: L(p.title), sub: L(p.result), text: [L(p.title), L(p.result), L(p.plain), L(p.problem), L(p.built), p.stack].join(' ') })),
      ...C.experience.map((e) => ({ kind: 'section', target: 'experience', icon: 'ic-case', label: stripTags(T(e.role)), sub: stripTags(T(e.org)), text: [stripTags(T(e.role)), stripTags(T(e.org)), ...e.points.map((x) => stripTags(L(x)))].join(' ') })),
      ...C.skills.map((g) => ({ kind: 'section', target: 'skills', icon: 'ic-chip', label: L(g.name), sub: L(g.desc), text: [L(g.name), L(g.desc), ...g.items.map(L)].join(' ') })),
    ];
  }
  function search(q) {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return searchIndex().filter((it) => { const t = fold(it.text); return terms.every((w) => t.includes(w)); });
  }

  /* --------- readable document (Easy view + mobile pages) --------- */
  const DOC = {
    overview() {
      const p = C.profile;
      return `
        <header class="doc-hero"><div class="avatar" aria-hidden="true">AG</div><div><h1>${p.name}</h1><p class="role">${p.role}</p></div></header>
        <p class="lead">${L(p.tagline)}</p>
        <p>${L(p.summary)}</p>
        <div class="callout"><strong>${ui('inPlainWords')}</strong><p>${L(p.plain)}</p></div>
        <h2>${ui('highlights')}</h2>
        <ul class="hl">${C.highlights.map((x) => `<li>${L(x)}</li>`).join('')}</ul>
        <h2>${ui('quickFacts')}</h2>
        <dl class="facts">
          <dt>${ui('fullName')}</dt><dd>${p.fullName}</dd>
          <dt>${ui('role')}</dt><dd>${p.role}</dd>
          <dt>${ui('languages')}</dt><dd>${L(p.languages)}</dd>
          <dt>${ui('focus')}</dt><dd>${L(p.focus)}</dd>
        </dl>
        <div class="actions">
          <button class="btn" data-go="projects">${svg('ic-folder')}${L(sec('projects').label)}</button>
          <button class="btn ghost" data-go="contact">${svg('ic-mail')}${ui('contactMe')}</button>
        </div>`;
    },
    experience() {
      return `<h1>${L(sec('experience').label)}</h1>
        <ol class="timeline">${C.experience.map((e) => `
          <li><div class="when">${T(e.period)}</div>
            <h3>${T(e.role)} <span class="org">· ${T(e.org)}</span></h3>
            <ul>${e.points.map((p) => `<li>${L(p)}</li>`).join('')}</ul></li>`).join('')}
        </ol>`;
    },
    projects() {
      return `<h1>${L(sec('projects').label)}</h1><p class="muted">${ui('projectsIntro')}</p>
        ${C.projects.map((p) => `
          <article class="proj" id="p-${p.slug}">
            <h3>${L(p.title)}</h3>
            <div class="result-pill">${L(p.result)}</div>
            <p>${L(p.plain)}</p>
            <details class="tech"><summary>${ui('techDetails')}</summary>
              <dl>
                <dt>${ui('problem')}</dt><dd>${L(p.problem)}</dd>
                <dt>${ui('built')}</dt><dd>${L(p.built)}</dd>
                <dt>${ui('myRole')}</dt><dd>${T(p.role)}</dd>
                <dt>${ui('tradeoff')}</dt><dd>${T(p.tradeoff)}</dd>
                <dt>${ui('tools')}</dt><dd>${p.stack}</dd>
              </dl>
            </details>
          </article>`).join('')}`;
    },
    skills() {
      return `<h1>${L(sec('skills').label)}</h1><p class="muted">${ui('skillsIntro')}</p>
        ${C.skills.map((g) => `<section class="skill"><h3>${L(g.name)}</h3><p>${L(g.desc)}</p>
          <ul class="chips">${g.items.map((i) => `<li>${L(i)}</li>`).join('')}</ul></section>`).join('')}`;
    },
    education() {
      return `<h1>${L(sec('education').label)}</h1>
        <ol class="timeline">${C.education.map((e) => `<li><div class="when">${e.period}</div><h3>${L(e.title)}</h3><div class="muted">${T(e.org)}</div></li>`).join('')}</ol>
        <h2>${ui('languages')}</h2>
        <dl class="facts">${C.languages.map((l) => `<dt>${L(l.name)}</dt><dd>${L(l.level)}</dd>`).join('')}</dl>`;
    },
    about() {
      const a = C.about;
      return `<h1>${L(a.title)}</h1><p>${T(a.text)}</p>
        <div class="duo">
          <div><strong>${ui('atWork')}</strong><ul>${L(a.work).map((x) => `<li>${x}</li>`).join('')}</ul></div>
          <div><strong>${ui('offWork')}</strong><ul>${L(a.life).map((x) => `<li>${x}</li>`).join('')}</ul></div>
        </div>`;
    },
    contact() {
      return `<h1>${L(C.contact.title)}</h1>
        <ul class="contact-list">${C.contact.items.map((c) => `<li><span>${L(c.label)}</span><span>${T(c.value)}</span></li>`).join('')}</ul>`;
    },
  };
  function renderDoc(id) {
    const i = SECTIONS.findIndex((s) => s.id === id);
    const nx = SECTIONS[i + 1];
    const footer = nx ? `<div class="next-sec"><button class="btn ghost" data-go="${nx.id}">${ui('nextSection')}: ${L(nx.label)} ›</button></div>` : '';
    return `<article class="doc">${DOC[id]()}${footer}</article>`;
  }
  function renderResults(q) {
    const hits = search(q);
    const items = hits.map((it) => `<li><button class="hit" ${it.kind === 'project' ? `data-project="${it.target}"` : `data-go="${it.target}"`}>${svg(it.icon)}<span><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></span></button></li>`);
    return `<article class="doc"><h1>${ui('searchResults')}</h1><p class="muted">“${esc(q)}”</p>${hits.length ? `<ul class="hits">${items.join('')}</ul>` : `<p>${ui('noResults')}</p>`}</article>`;
  }

  /* --------- routing --------- */
  let navN = history.state?.n ?? 0;
  let navMax = navN;
  if (!history.state) history.replaceState({ n: 0 }, '', location.href);
  let pendingProject = null;

  function navigate(id) {
    navN += 1; navMax = navN;
    history.pushState({ n: navN }, '', '#' + id);
    route();
  }
  addEventListener('popstate', () => { navN = history.state?.n ?? 0; route(); });

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (isMobile()) { Phone.show(id); return; }
    if (id === 'terminal') { WM.open('term'); return; }
    if (sec(id)) { Easy.show(id); WM.open('easy'); }
  }

  /* go to a section/terminal from any button with data-go */
  function go(target) {
    Balloon.hide(true);
    Menu.close();
    if (!isMobile()) setMode(target === 'terminal' ? 'terminal' : 'easy');
    if (location.hash === '#' + target) route(); else navigate(target);
  }
  /* desktop icons / Start menu: open a section in the user's current mode */
  function openSection(s) {
    if (mode === 'easy' || isMobile()) go(s.id);
    else Terminal.run(s.cmd);
  }
  function openProject(slug) {
    if (mode === 'easy' || isMobile()) { pendingProject = slug; go('projects'); }
    else Terminal.run(`open ${slug}`);
  }
  function revealPendingProject(root) {
    if (!pendingProject) return;
    const el = $(`#p-${pendingProject}`, root);
    pendingProject = null;
    if (!el) return;
    $('details', el)?.setAttribute('open', '');
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }

  /* --------- window manager (Windows 7) --------- */
  const WM = (() => {
    const wins = {};
    let z = 10;
    let active = null;
    const onFirstOpen = {};

    function place(w) {
      const W = innerWidth, H = innerHeight - 40;
      const big = w.id === 'easy';
      const ww = Math.min(big ? 1080 : 1060, W - (big ? 150 : 140));
      const hh = Math.min(big ? 760 : 700, H - (big ? 28 : 36));
      Object.assign(w.el.style, {
        width: ww + 'px', height: hh + 'px',
        left: Math.max(big ? 110 : 118, (W - ww) / 2 + (big ? 20 : 40)) + 'px',
        top: Math.max(big ? 10 : 14, (H - hh) / 2 - (big ? 0 : 6)) + 'px',
      });
    }
    function sync() {
      Object.values(wins).forEach((w) => {
        w.task.classList.toggle('open', w.open);
        w.task.setAttribute('aria-pressed', String(w.open && !w.min && active === w.id));
        w.el.classList.toggle('inactive', active !== w.id);
      });
    }
    function focus(id) { active = id; wins[id].el.style.zIndex = String(++z); sync(); }
    function focusTopmost() {
      const other = Object.values(wins).filter((x) => x.open && !x.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
      active = other ? other.id : null; if (other) focus(other.id); else sync();
    }
    const OPEN = [{ opacity: 0, transform: 'scale(.94) translateY(10px)' }, { opacity: 1, transform: 'none' }];
    function toTask(w) {
      const a = w.el.getBoundingClientRect(), b = w.task.getBoundingClientRect();
      return `translate(${Math.round(b.left + b.width / 2 - (a.left + a.width / 2))}px, ${Math.round(b.top + b.height / 2 - (a.top + a.height / 2))}px) scale(.1)`;
    }
    async function minimize(id) {
      const w = wins[id]; if (w.min || !w.open) return;
      w.min = true;
      await anim(w.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toTask(w) }], { duration: 260, easing: 'cubic-bezier(.5,0,.75,0)' });
      w.el.hidden = true; focusTopmost();
    }
    async function restore(id) {
      const w = wins[id]; if (!w.min) { focus(id); return; }
      w.el.hidden = false; w.min = false; focus(id);
      await anim(w.el, [{ opacity: 0, transform: toTask(w) }, { opacity: 1, transform: 'none' }], { duration: 280 });
    }
    async function close(id) {
      const w = wins[id]; if (!w.open) return;
      w.open = false;
      await anim(w.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 160 });
      w.el.hidden = true; w.min = false; focusTopmost();
    }
    async function open(id) {
      const w = wins[id];
      if (!w.open) {
        w.open = true; w.min = false;
        if (!w.placed) { place(w); w.placed = true; }
        w.el.hidden = false; focus(id);
        if (!w.booted) { w.booted = true; onFirstOpen[id]?.(); }
        await anim(w.el, OPEN, { duration: 220 });
      } else if (w.min) await restore(id);
      else focus(id);
    }
    function toggleMax(id) {
      const w = wins[id]; w.max = !w.max; w.el.classList.toggle('max', w.max);
      $('[data-act="max"]', w.el).setAttribute('aria-label', ui(w.max ? 'restore' : 'maximize'));
    }
    function drag(bar, w) {
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button') || w.max) return;
        const sx = e.clientX, sy = e.clientY, ox = w.el.offsetLeft, oy = w.el.offsetTop;
        bar.setPointerCapture(e.pointerId); w.el.classList.add('dragging');
        const move = (ev) => {
          w.el.style.left = Math.min(innerWidth - 120, Math.max(120 - w.el.offsetWidth, ox + ev.clientX - sx)) + 'px';
          w.el.style.top = Math.min(innerHeight - 40 - 30, Math.max(0, oy + ev.clientY - sy)) + 'px';
        };
        const up = () => { bar.removeEventListener('pointermove', move); w.el.classList.remove('dragging'); };
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', up, { once: true });
        bar.addEventListener('pointercancel', up, { once: true });
      });
    }

    $$('.win').forEach((el) => {
      const id = el.dataset.win;
      const w = wins[id] = { id, el, task: $(`[data-task="${id}"]`), open: false, min: false, max: false, placed: false, booted: false };
      el.addEventListener('pointerdown', () => { if (active !== id) focus(id); });
      $$('[data-act]', el).forEach((b) => b.addEventListener('click', () => ({ min: minimize, max: toggleMax, close })[b.dataset.act](id)));
      /* pinned superbar button: launch, restore, focus or minimize */
      w.task.addEventListener('click', () => {
        if (!w.open) go(id === 'term' ? 'terminal' : 'overview');
        else if (w.min) restore(id);
        else if (active !== id) focus(id);
        else minimize(id);
      });
      const bar = $('.titlebar', el);
      bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMax(id); });
      drag(bar, w);
    });
    addEventListener('resize', () => Object.values(wins).forEach((w) => { if (!w.max && w.placed) place(w); }));

    /* Aero Peek: hover the far-right sliver to see through every window; click to show/restore the desktop */
    const peek = $('#peek');
    let peekTimer = 0;
    let shownDesktop = [];
    peek.addEventListener('pointerenter', () => { peekTimer = setTimeout(() => document.body.classList.add('peek'), reduce ? 0 : 350); });
    peek.addEventListener('pointerleave', () => { clearTimeout(peekTimer); document.body.classList.remove('peek'); });
    peek.addEventListener('click', () => {
      document.body.classList.remove('peek');
      const visible = Object.values(wins).filter((w) => w.open && !w.min);
      if (visible.length) { shownDesktop = visible.map((w) => w.id); visible.forEach((w) => minimize(w.id)); }
      else { shownDesktop.forEach((id) => restore(id)); shownDesktop = []; }
    });

    return {
      open, close, minimize,
      isOpen: (id) => wins[id].open && !wins[id].min,
      isActive: (id) => active === id && wins[id].open && !wins[id].min,
      anyOpen: () => Object.values(wins).some((w) => w.open),
      closeAll: () => Object.keys(wins).forEach((id) => close(id)),
      onFirstOpen: (id, fn) => { onFirstOpen[id] = fn; },
    };
  })();

  /* --------- Easy view (Windows 7 Explorer) --------- */
  const Easy = (() => {
    let current = 'overview';
    let query = '';
    const pane = $('#easyPane');
    const input = $('#easySearch');
    function buildNav() {
      $('#navpane').replaceChildren(frag(`<h2>${ui('sections')}</h2><ul>${SECTIONS.map((s) => `
        <li><button class="navitem" data-go="${s.id}"${s.id === current && !query ? ' aria-current="page"' : ''}>${svg(s.icon)}<span>${L(s.label)}</span></button></li>`).join('')}</ul>`));
    }
    function render() {
      buildNav();
      pane.replaceChildren(frag(query ? renderResults(query) : renderDoc(current)));
      $('#crumbs').replaceChildren(frag(`${svg('ic-profile')}<span>${C.profile.name}</span><span class="sepc">›</span><span>${query ? ui('searchResults') : L(sec(current).label)}</span>`));
      $('#details').replaceChildren(frag(`<div class="avatar" aria-hidden="true">AG</div><div><b>${C.profile.name}</b><span>${C.profile.role}</span></div><dl><dt>${ui('languages')}</dt><dd>${L(C.profile.languages)}</dd><dt>${ui('focus')}</dt><dd>${L(C.profile.focus)}</dd></dl>`));
      $('#easyBack').disabled = navN <= 0;
      $('#easyFwd').disabled = navN >= navMax;
    }
    function show(id) {
      current = id; query = ''; input.value = '';
      render();
      pane.scrollTop = 0;
      pane.focus({ preventScroll: true });
      revealPendingProject(pane);
    }
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { query = input.value.trim(); render(); pane.scrollTop = 0; }, 120); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; query = ''; render(); } });
    $('#easyBack').addEventListener('click', () => history.back());
    $('#easyFwd').addEventListener('click', () => history.forward());
    return { show, render };
  })();

  /* --------- terminal: text-mode UI in a PowerShell window --------- */
  const Terminal = (() => {
    const scroller = $('#screen'), log = $('#log'), input = $('#cmd'), mirror = $('#mirror'), field = $('#field'), ps1 = $('#ps1');
    const state = { cwd: '', history: [], hIdx: 0, draft: '', busy: false, skip: false, booted: false, lastSection: null };

    const run = (cmd, label, cls = 'run') => `<button class="${cls}" data-cmd="${esc(cmd)}">${label}</button>`;
    const next = (...items) => `<div class="next">${items.map(([c, l]) => run(c, l || c)).join('')}</div>`;

    /* dot-matrix "AG" monogram inside an elliptical ring (SVG, so it does not depend on the font) */
    function monogram() {
      const A = ['01110', '10001', '10001', '11111', '10001', '10001', '10001'];
      const G = ['01110', '10001', '10000', '10111', '10001', '10001', '01110'];
      const W = 25, H = 15, cx = (W - 1) / 2, cy = (H - 1) / 2, dots = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = Math.hypot((x - cx) / (W / 2), (y - cy) / (H / 2));
          const ly = y - 4, ax = x - 6, gx = x - 14;
          const letter = ly >= 0 && ly < 7 && ((ax >= 0 && ax < 5 && A[ly][ax] === '1') || (gx >= 0 && gx < 5 && G[ly][gx] === '1'));
          if (letter || (d > 0.86 && d < 1.0)) dots.push(`<rect x="${x * 6 + 1}" y="${y * 8 + 2}" width="4.2" height="4.2"/>`);
        }
      }
      return `<svg class="monogram" viewBox="0 0 ${W * 6} ${H * 8}" role="img" aria-label="${C.profile.name}">${dots.join('')}</svg>`;
    }

    /* files: PowerShell-style names; Length in DIR is the real byte size of each rendered document */
    const ROOT = [
      { name: 'Projects', dir: true },
      { name: 'about.txt', cmd: 'about' },
      { name: 'contact.txt', cmd: 'contact' },
      { name: 'education.txt', cmd: 'education' },
      { name: 'experience.txt', cmd: 'experience' },
      { name: 'readme.txt', cmd: 'help' },
      { name: 'skills.txt', cmd: 'skills' },
      { name: 'whoami.exe', cmd: 'whoami' },
    ];
    const DIRS = { '': ROOT, Projects: C.projects.map((p) => ({ name: `${p.slug}.txt`, cmd: `open ${p.slug}` })) };
    const DIR_ALIASES = { projects: 'Projects', proyectos: 'Projects', proyecto: 'Projects' };
    const promptText = () => `PS C:\\Users\\Arti${state.cwd ? '\\' + state.cwd : ''}>`;
    const normDir = (a) => {
      const d = a.replace(/^(c:)?\\?(users\\)?(arti\\?)?/i, '').replace(/[\\/]$/, '').toLowerCase();
      return d === '' ? '' : (DIR_ALIASES[d] ?? null);
    };
    function findFile(arg) {
      const parts = arg.replace(/\//g, '\\').split('\\');
      const name = parts.pop().toLowerCase();
      const dir = parts.length ? normDir(parts.join('\\')) : state.cwd;
      return dir === null ? undefined : (DIRS[dir] || []).find((f) => f.name.toLowerCase() === name || f.name.toLowerCase().replace(/\.\w+$/, '') === name);
    }
    const byteSize = (cmd) => { const d = h('div'); const [n, ...a] = cmd.split(' '); d.append(frag(COMMANDS[n](a))); return new TextEncoder().encode(d.textContent).length; };
    const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    const COMMANDS = {
      help: () => `
        <p class="h">${ui('help')}</p>
        ${kv([...SECTIONS.map((s) => [run(s.cmd, s.cmd, 'run bare'), L(s.desc)]), ...C.dos.helpRows.map(([c, d]) => [esc(c), L(d)])])}
        <p class="dim">${dos('helpIntro')}</p>`,

      whoami: () => {
        const p = C.profile;
        return `
          <div class="who">${monogram()}
            <div class="meta">
              <p><span class="y b">${p.name}</span> <span class="dim">·</span> ${p.role.replace(' / ', ' <span class="dim">·</span> ')}</p>
              ${kv([[ui('focus'), L(p.focus)], [ui('languages'), L(p.languages)], [ui('motto'), L(p.tagline)]])}
            </div>
          </div>
          <p>${L(p.summary)}</p>
          <ul class="tl">${C.highlights.map((x) => `<li>${L(x)}</li>`).join('')}</ul>
          ${next(['projects', L(sec('projects').label)], ['experience', L(sec('experience').label)], ['contact', L(sec('contact').label)])}`;
      },

      experience: () => C.experience.map((e) => `
        <div class="job"><p><span class="y b">${T(e.role)}</span> <span class="dim">·</span> ${T(e.org)} <span class="dim">· ${T(e.period)}</span></p>
          <ul class="tl">${e.points.map((p) => `<li>${L(p)}</li>`).join('')}</ul></div>`).join('')
        + next(['projects', L(sec('projects').label)], ['skills', L(sec('skills').label)]),

      projects: () => `
        <div class="rows">${C.projects.map((p) => `<button class="prow" data-cmd="open ${p.slug}" data-help="${esc(L(p.plain))}"><span>${L(p.title)}</span><span class="r">${L(p.result)}</span></button>`).join('')}</div>
        <p class="dim">${dos('projectsHint')}</p>`,

      open: ([arg]) => {
        const a = (arg || '').toLowerCase().replace(/\.txt$/, '');
        const p = C.projects.find((x) => x.slug === a);
        if (!p) return `<p class="err">${arg ? dos('fileNotFound', { x: esc(arg) }) : dos('missingParam', { x: 'open signatures' })}</p>${next(['projects', L(sec('projects').label)])}`;
        queueMicrotask(() => setHelp(L(p.plain)));
        return `
          <p><span class="y b">${L(p.title)}</span></p>
          <p class="g">${L(p.result)}</p>
          ${kv([[ui('problem'), L(p.problem)], [ui('built'), L(p.built)], [ui('myRole'), T(p.role)], [ui('tradeoff'), T(p.tradeoff)], [ui('tools'), p.stack]])}
          ${next(['projects', dos('back')], ...C.projects.filter((x) => x !== p).slice(0, 2).map((x) => [`open ${x.slug}`, L(x.title)]))}`;
      },

      skills: () => `
        ${kv(C.skills.map((g) => [L(g.name), g.items.map(L).join(' <span class="dim">·</span> ')]))}
        <p class="dim">${dos('skillsHint')} ${run('projects', L(sec('projects').label))}</p>`,

      education: () => kv([
        ...C.education.map((e) => [e.period, `${L(e.title)}<br><span class="dim">${T(e.org)}</span>`]),
        ...C.languages.map((l) => [L(l.name), L(l.level)]),
      ]),

      about: () => `
        <p class="y b">${L(C.about.title)}</p><p>${T(C.about.text)}</p>
        ${kv([[ui('atWork'), L(C.about.work).join(' · ')], [ui('offWork'), L(C.about.life).join(' · ')]])}`,

      contact: () => `<p class="y b">${L(C.contact.title)}</p>${kv(C.contact.items.map((c) => [L(c.label), T(c.value)]))}`,

      ver: () => `<p class="w">${dos('ver')}</p><p class="dim">${dos('credits')}</p>`,

      dir: ([arg]) => {
        const target = arg ? normDir(arg) : state.cwd;
        const list = target === null ? null : DIRS[target];
        if (!list) return `<p class="err">${dos('fileNotFound', { x: esc(arg) })}</p>`;
        const now = new Date();
        const stamp = `${now.toLocaleDateString(locale(), { month: '2-digit', day: '2-digit', year: 'numeric' })} ${now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
        const row = (mode, len, name, cmd) => `<button class="lsrow" data-cmd="${cmd}">${esc(`${mode.padEnd(10)}${stamp.padStart(22)}  ${String(len).padStart(8)} ${name}`)}</button>`;
        const rows = list.map((f) => (f.dir ? row('d----', '', f.name, `cd ${f.name.toLowerCase()}`) : row('-a---', byteSize(f.cmd), f.name, f.cmd)));
        const parent = target ? row('d----', '', '..', 'cd ..') : '';
        return `<div class="ls">    ${dos('directory')} C:\\Users\\Arti${target ? '\\' + target : ''}\n\n${'Mode'.padEnd(10)}${'LastWriteTime'.padStart(22)}  ${'Length'.padStart(8)} Name\n${'----'.padEnd(10)}${'-------------'.padStart(22)}  ${'------'.padStart(8)} ----</div>${parent}${rows.join('')}`;
      },

      cd: ([arg]) => {
        if (!arg) return `<p>${esc(promptText().slice(3, -1))}</p>`;
        if (['..', '\\', '~', '/'].includes(arg)) { state.cwd = ''; return ''; }
        const d = normDir(arg);
        if (d !== null && DIRS[d]) { state.cwd = d; return ''; }
        return `<p class="err">${dos('fileNotFound', { x: esc(arg) })}</p>`;
      },

      type: ([arg]) => {
        if (!arg) return `<p class="err">${dos('missingParam', { x: 'type experience.txt' })}</p>`;
        const f = findFile(arg);
        if (!f) return `<p class="err">${dos('fileNotFound', { x: esc(arg) })}</p>`;
        if (f.dir) return `<p class="err">${dos('isDir', { x: f.name, y: f.name.toLowerCase() })}</p>`;
        if (f.name.endsWith('.exe')) return `<p class="err">${dos('isExe', { x: f.name, y: f.cmd })}</p>${next([f.cmd])}`;
        const [n, ...a] = f.cmd.split(' ');
        return COMMANDS[n](a);
      },

      lang: ([code]) => {
        const c = (code || '').toLowerCase();
        if (!LANGS.includes(c)) return `<p class="err">${dos('langUsage')}</p>`;
        queueMicrotask(() => setLang(c));
        return '';
      },

      easy: () => { queueMicrotask(() => go('overview')); return ''; },

      sudo: (args) => (args.join(' ').toLowerCase() === 'hire arti'
        ? `<p class="g">${dos('sudoOk')}</p>${next(['contact', dos('continueContact')])}`
        : `<p class="err">${dos('sudoNo')}</p>`),
    };
    const ALIASES = {
      ayuda: 'help', '?': 'help', man: 'help', readme: 'help', experiencia: 'experience', exp: 'experience', cv: 'experience', resume: 'whoami',
      proyectos: 'projects', ls: 'dir', gci: 'dir', abrir: 'open', educacion: 'education', 'educación': 'education', acerca: 'about', sobremi: 'about',
      contacto: 'contact', clear: 'cls', cat: 'type', gc: 'type', quiensoy: 'whoami', salir: 'exit', idioma: 'lang', gui: 'easy', sencilla: 'easy',
    };
    const ALL = [...Object.keys(COMMANDS), 'cls', 'exit'];

    /* --- chrome: sections panel, help, keys legend --- */
    function setHelp(text) { $('#tuiHelp').textContent = text; }
    function buildSide() {
      $('#tuiSections').replaceChildren(frag(SECTIONS.map((s) => `<li><button class="tui-sec" data-cmd="${s.cmd}" data-nav="${s.cmd}" data-help="${esc(L(s.plain))}">${L(s.label)}</button></li>`).join('')));
      setActive(state.lastSection);
      const s = SECTIONS.find((x) => x.cmd === state.lastSection) || SECTIONS[0];
      setHelp(L(s.plain));
    }
    const KEY_ACTIONS = {
      Enter: () => { const v = input.value; input.value = ''; execute(v); renderMirror(); },
      Tab: () => complete(),
      'Shift+Tab': () => focusSections(),
      '↑↓': () => focusSections(),
      F1: () => typeAndRun('help'),
      F10: () => setLang(lang === 'en' ? 'es' : 'en'),
      Esc: () => { input.value = ''; renderMirror(); input.focus({ preventScroll: true }); },
    };
    function buildKeys() {
      $('#tuiKeys').replaceChildren(frag(L(C.ui.keys).map(([k, d]) => `<button class="tui-key" data-key="${k}"><b>${k}</b> ${d}</button>`).join('<span class="dot">·</span>')));
    }
    $('#tuiKeys').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) KEY_ACTIONS[b.dataset.key]?.(); });
    function focusSections() { ($('.tui-sec[aria-current="true"]') || $('.tui-sec'))?.focus(); }
    $('#tuiSections').addEventListener('keydown', (e) => {
      const all = $$('.tui-sec'), i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus(); }
      if (e.key === 'Escape' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); input.focus({ preventScroll: true }); }
    });
    /* plain-language help follows the pointer/focus over sections and project rows */
    const helpFrom = (e) => { const t = e.target.closest?.('[data-help]'); if (t && $('#termCore').contains(t)) setHelp(t.dataset.help); };
    $('#termCore').addEventListener('pointerover', helpFrom);
    $('#termCore').addEventListener('focusin', helpFrom);

    function renderMirror() {
      const v = input.value, pos = input.selectionStart ?? v.length;
      if (!v) { mirror.replaceChildren(h('span', 'caret', '\u00a0'), h('span', 'ph', ui('placeholder'))); return; }
      mirror.replaceChildren(document.createTextNode(v.slice(0, pos)), h('span', 'caret', v[pos] || '\u00a0'), document.createTextNode(v.slice(pos + 1)));
    }
    function closest(word) {
      const d = (a, b) => {
        const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) m[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return m[a.length][b.length];
      };
      const best = ALL.map((c) => [c, d(word, c)]).sort((a, b) => a[1] - b[1])[0];
      return best && best[1] <= 2 ? best[0] : null;
    }
    function print(cmdText, html, { reveal = true } = {}) {
      const entry = h('section', 'entry');
      entry.append(h('div', 'echo', cmdText));
      if (html) { const out = h('div', reveal && !reduce ? 'out reveal' : 'out'); out.append(frag(html)); entry.append(out); }
      log.append(entry);
      return entry;
    }
    function scrollToEntry(entry) {
      const top = entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 4;
      scroller.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    }
    function setActive(cmd) { $$('[data-nav]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.nav === cmd))); }

    function execute(raw) {
      const text = raw.trim();
      if (text) state.history.push(text);
      state.hIdx = state.history.length;
      if (!text) return;
      const [head, ...args] = text.split(/\s+/);
      const name = ALIASES[head.toLowerCase()] || head.toLowerCase();
      if (name === 'cls') { log.replaceChildren(); return; }
      if (name === 'exit') { if (isMobile()) Phone.back(); else WM.close('term'); return; }

      let html;
      if (COMMANDS[name]) html = COMMANDS[name](args);
      else {
        const file = findFile(head);
        if (file && !file.dir && !file.name.endsWith('.exe')) { const [n, ...a] = file.cmd.split(' '); html = COMMANDS[n](a); }
        else {
          const guess = closest(name);
          html = `<p class="err">${dos('badCmd', { x: esc(head) })}</p>${guess ? next([guess, dos('didYouMean', { x: guess })]) : next(['help', dos('seeHelp')])}`;
        }
      }
      const entry = print(text, html);
      ps1.textContent = promptText();
      const s = SECTIONS.find((x) => x.cmd === name);
      if (s) { state.lastSection = s.cmd; setHelp(L(s.plain)); }
      setActive(s ? s.cmd : name === 'open' ? 'projects' : state.lastSection);
      scrollToEntry(entry);
    }

    async function typeAndRun(cmd) {
      if (state.busy) return;
      state.busy = true; state.skip = false;
      input.value = '';
      for (const ch of cmd) {
        input.value += ch; input.setSelectionRange(input.value.length, input.value.length); renderMirror();
        if (!reduce && !state.skip) await sleep(24 + Math.random() * 30);
      }
      if (!reduce && !state.skip) await sleep(120);
      execute(cmd);
      input.value = ''; renderMirror();
      state.busy = false;
      if (!isMobile()) input.focus({ preventScroll: true });
    }

    function complete() {
      const v = input.value, low = v.toLowerCase(), sp = low.indexOf(' ');
      let pool;
      if (sp > 0) {
        const verb = ALIASES[low.slice(0, sp)] || low.slice(0, sp);
        const ARGS = {
          open: () => C.projects.map((p) => p.slug),
          cd: () => ['..', 'projects'],
          type: () => (DIRS[state.cwd] || []).filter((f) => !f.dir).map((f) => f.name),
          lang: () => LANGS,
        };
        pool = (ARGS[verb] ? ARGS[verb]() : []).map((n) => v.slice(0, sp + 1) + n);
      } else pool = ALL;
      const hits = pool.filter((c) => c.toLowerCase().startsWith(low));
      if (hits.length === 1) input.value = hits[0];
      else if (hits.length > 1) {
        const prefix = hits.reduce((a, b) => { let i = 0; while (i < a.length && a[i].toLowerCase() === b[i]?.toLowerCase()) i++; return a.slice(0, i); });
        if (prefix.length > v.length) input.value = prefix;
        else print(v, `<div class="next">${hits.map((x) => run(x, esc(x.split(' ').pop()), 'run bare')).join('')}</div>`, { reveal: false });
      }
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
    }

    function printBoot() {
      const b = h('div', 'boot');
      const hint = dos(isMobile() ? 'bootHintMobile' : 'bootHint', { help: run('help', 'help', 'run bare') });
      b.append(frag(`<p class="w">${dos('ver')}</p><p class="dim">(C) ${C.profile.name} ${new Date().getFullYear()}. ${hint}</p>`));
      log.append(b);
      renderMirror();
    }
    async function boot() {
      if (state.booted) return;
      state.booted = true;
      printBoot();
      if (!isMobile()) input.focus({ preventScroll: true });
      if (!reduce) await sleep(450);
      await typeAndRun('whoami');
    }
    /* public: run a command from anywhere (icons, Start menu, chips, links) */
    async function runCmd(cmd) {
      if (isMobile()) { if (location.hash !== '#terminal') navigate('terminal'); }
      else { setMode('terminal'); await WM.open('term'); }
      if (!state.booted) { state.booted = true; printBoot(); }
      typeAndRun(cmd);
    }
    function relang() {
      buildSide(); buildKeys(); renderMirror();
      if (!state.booted) return;
      log.replaceChildren();
      printBoot();
      if (state.lastSection) execute(state.lastSection);
    }
    function reset() { log.replaceChildren(); state.cwd = ''; state.booted = false; state.lastSection = null; ps1.textContent = promptText(); buildSide(); }

    input.addEventListener('keydown', (e) => {
      if (state.busy) { if (e.key === 'Escape') state.skip = true; e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); KEY_ACTIONS.Enter(); }
      else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); focusSections(); }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.hIdx === state.history.length) state.draft = input.value; if (state.hIdx > 0) input.value = state.history[--state.hIdx]; renderMirror(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (state.hIdx < state.history.length) { state.hIdx++; input.value = state.history[state.hIdx] ?? state.draft; } renderMirror(); }
      else if (e.key === 'Escape') { e.preventDefault(); KEY_ACTIONS.Esc(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); execute('cls'); }
      requestAnimationFrame(renderMirror);
    });
    ['input', 'select', 'click', 'keyup'].forEach((ev) => input.addEventListener(ev, renderMirror));
    input.addEventListener('focus', () => { field.classList.add('focused'); renderMirror(); });
    input.addEventListener('blur', () => field.classList.remove('focused'));
    scroller.addEventListener('click', (e) => { if (!e.target.closest('button') && !String(getSelection()).length) input.focus({ preventScroll: true }); });
    /* F1 / F10 while the terminal is the active surface */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') state.skip = true;
      const termActive = isMobile() ? !$('#mterm').hidden : WM.isActive('term');
      if (!termActive || !['F1', 'F10'].includes(e.key)) return;
      e.preventDefault(); KEY_ACTIONS[e.key]();
    });

    buildSide(); buildKeys(); renderMirror();
    return { boot, run: runCmd, relang, reset };
  })();
  WM.onFirstOpen('term', () => Terminal.boot());

  /* --------- mobile phone shell --------- */
  const Phone = (() => {
    const page = $('#mpage'), termPage = $('#mterm');
    let currentId = '';

    function renderHome() {
      const p = C.profile;
      $('#homeCard').replaceChildren(frag(`
        <div class="who"><div class="avatar" aria-hidden="true">AG</div><div><h1>${p.name}</h1><p class="role">${p.role}</p></div></div>
        <p class="tagline">${L(p.tagline)}</p>
        <p class="plain">${L(p.plain)}</p>
        <div class="actions"><button class="btn green" data-go="overview">${ui('viewResume')}</button><button class="btn ghost" data-go="contact">${ui('contactMe')}</button></div>`));
      /* springboard grid + iOS-style dock with the four most useful destinations */
      const DOCKED = ['overview', 'projects', 'contact', 'terminal'];
      const apps = [...SECTIONS.map((s) => ({ id: s.id, icon: s.icon, label: L(s.label) })), { id: 'terminal', icon: 'ic-term', label: ui('terminal') }];
      const appBtn = (a) => `<li><button class="app" data-go="${a.id}"><span class="tile">${svg(a.icon, '')}</span><span>${a.label}</span></button></li>`;
      $('#appgrid').replaceChildren(frag(apps.filter((a) => !DOCKED.includes(a.id)).map(appBtn).join('')));
      $('#dockList').replaceChildren(frag(DOCKED.map((id) => apps.find((a) => a.id === id)).map(appBtn).join('')));
    }
    function hideEl(el) {
      if (el.hidden) return;
      if (reduce) { el.hidden = true; return; }
      el.classList.remove('enter'); el.classList.add('leave');
      el.addEventListener('animationend', () => { el.hidden = true; el.classList.remove('leave'); }, { once: true });
    }
    function showEl(el, animate) {
      el.classList.remove('leave');
      el.hidden = false;
      if (animate && !reduce) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    }
    /* the nav bar already shows the section name; hide the page heading when it just repeats it */
    function markDuplicateTitle() {
      const h1 = $('#mpageBody .doc > h1');
      if (h1 && h1.textContent.trim() === $('#mpageTitle').textContent.trim()) h1.classList.add('dup');
    }
    function show(id) {
      const fromHome = currentId === '';
      $('#phone').classList.toggle('in-page', id === 'terminal' || !!sec(id));
      if (id === 'terminal') {
        currentId = id; hideEl(page); showEl(termPage, fromHome);
        Terminal.boot();
        return;
      }
      if (sec(id)) {
        currentId = id;
        $('#mpageTitle').textContent = L(sec(id).label);
        $('#mpageBody').replaceChildren(frag(renderDoc(id)));
        markDuplicateTitle();
        $('#mpageBody').scrollTop = 0;
        hideEl(termPage); showEl(page, fromHome);
        revealPendingProject($('#mpageBody'));
        return;
      }
      currentId = '';
      hideEl(page); hideEl(termPage);
    }
    function back() {
      if (navN > 0) history.back();
      else { history.replaceState({ n: 0 }, '', location.pathname + location.search); show(''); }
    }
    function rerender() {
      if (!isMobile() || !sec(currentId)) return;
      $('#mpageTitle').textContent = L(sec(currentId).label);
      $('#mpageBody').replaceChildren(frag(renderDoc(currentId)));
      markDuplicateTitle();
    }
    return { renderHome, show, back, rerender };
  })();

  /* --------- mobile lock screen: slide to unlock (once per session, skipped for deep links) --------- */
  const Lock = (() => {
    const lock = $('#lock'), knob = $('#knob'), slider = $('#slider');
    async function unlock() {
      session.set('unlocked', '1');
      await Promise.all([
        anim($('.lock-top', lock), [{ transform: 'none' }, { transform: 'translateY(-110%)' }], { duration: 320, fill: 'forwards' }),
        anim($('.lock-bottom', lock), [{ transform: 'none' }, { transform: 'translateY(110%)' }], { duration: 320, fill: 'forwards' }),
      ]);
      lock.hidden = true;
    }
    function maybeShow() {
      if (!isMobile() || location.hash || session.get('unlocked')) return;
      lock.hidden = false;
      knob.focus({ preventScroll: true });
    }
    knob.addEventListener('pointerdown', (e) => {
      const max = slider.clientWidth - knob.offsetWidth - 8;
      const sx = e.clientX;
      let x = 0, moved = false;
      knob.setPointerCapture(e.pointerId);
      const move = (ev) => { x = Math.min(max, Math.max(0, ev.clientX - sx)); moved = moved || x > 4; knob.style.transform = `translateX(${x}px)`; $('.slider-label', slider).style.opacity = String(1 - x / max); };
      const up = () => {
        knob.removeEventListener('pointermove', move);
        if (x >= max * 0.85) { knob.style.transform = `translateX(${max}px)`; unlock(); return; }
        anim(knob, [{ transform: `translateX(${x}px)` }, { transform: 'none' }], { duration: moved ? 260 : 420 });
        knob.style.transform = '';
        $('.slider-label', slider).style.opacity = '';
      };
      knob.addEventListener('pointermove', move);
      knob.addEventListener('pointerup', up, { once: true });
      knob.addEventListener('pointercancel', up, { once: true });
    });
    /* keyboard / assistive tech: activating the knob unlocks without dragging */
    knob.addEventListener('click', (e) => { if (e.detail === 0) unlock(); });
    return { maybeShow };
  })();

  /* --------- desktop icons --------- */
  function buildIcons() {
    const items = [
      { label: ui('easyView'), icon: 'ic-profile', act: () => go('overview') },
      { label: ui('terminal'), icon: 'ic-term', act: () => go('terminal') },
      ...SECTIONS.slice(1).map((s) => ({ label: L(s.label), icon: s.icon, act: () => openSection(s) })),
    ];
    $('#icons').replaceChildren(...items.map((it) => {
      const li = h('li'), b = h('button', 'icon');
      b.setAttribute('aria-pressed', 'false');
      b.append(frag(svg(it.icon, '')), h('span', null, it.label));
      b._act = it.act;
      li.append(b); return li;
    }));
  }
  (() => {
    const icons = $('#icons');
    let lastPointer = 'mouse';
    const select = (b) => $$('.icon', icons).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    icons.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    icons.addEventListener('click', (e) => {
      const b = e.target.closest('.icon'); if (!b) return;
      select(b);
      if (e.detail === 0 || lastPointer === 'touch') b._act(); /* keyboard Enter or touch tap opens; mouse needs double-click */
    });
    icons.addEventListener('dblclick', (e) => { const b = e.target.closest('.icon'); if (b) b._act(); });
    $('#desktop').addEventListener('pointerdown', (e) => { if (!e.target.closest('.icon') && !e.target.closest('.win')) select(null); });
  })();

  function buildChips() {
    $('#chipsBar').replaceChildren(frag(
      SECTIONS.map((s) => `<button class="chip" data-cmd="${s.cmd}">${s.cmd}</button>`).join('')
      + `<button class="chip" data-cmd="help">help</button><button class="chip" data-cmd="cls">cls</button><button class="chip cta" data-go="overview">${ui('easyView')}</button>`));
  }

  /* --------- Start menu (Windows 7): sections, links, search, shut down --------- */
  const Menu = (() => {
    const menu = $('#startmenu'), start = $('#start'), list = $('#smList'), input = $('#smSearch');
    let results = [];
    const item = (icon, label, sub, attrs) => `<li role="none"><button class="smi" role="menuitem" ${attrs}>${svg(icon, 'big')}<span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button></li>`;
    function renderList() {
      const q = input.value.trim();
      if (!q) { list.replaceChildren(frag(SECTIONS.map((s) => item(s.icon, L(s.label), L(s.desc), `data-section="${s.id}"`)).join(''))); return; }
      results = search(q).slice(0, 8);
      list.replaceChildren(frag(results.length
        ? results.map((r) => item(r.icon, r.label, r.sub, r.kind === 'project' ? `data-project="${r.target}"` : `data-section="${r.target}"`)).join('')
        : `<li class="sm-empty">${esc(ui('noResults'))}</li>`));
    }
    function build() {
      renderList();
      $('#smLinks').replaceChildren(frag([
        `<li><button class="sml" data-go="overview"><b>${C.profile.name}</b></button></li>`,
        `<li><button class="sml" data-go="overview">${ui('easyView')}</button></li>`,
        `<li><button class="sml" data-go="terminal">${ui('terminal')}</button></li>`,
        `<li><button class="sml" data-lang-toggle>${ui('language')}: ${ui('switchLang')}</button></li>`,
        `<li><button class="sml" data-cmd="help">${ui('help')}</button></li>`,
      ].join('')));
    }
    const close = () => { if (menu.hidden) return; menu.hidden = true; start.setAttribute('aria-expanded', 'false'); input.value = ''; renderList(); };
    const open = () => { menu.hidden = false; start.setAttribute('aria-expanded', 'true'); input.focus({ preventScroll: true }); };
    start.addEventListener('click', () => (menu.hidden ? open() : close()));
    input.addEventListener('input', renderList);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('.smi', list)?.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); $('.smi', list)?.focus(); }
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.smi'); if (!b) return;
      close();
      if (b.dataset.project) openProject(b.dataset.project);
      else openSection(sec(b.dataset.section));
    });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#startmenu, #start')) close(); });
    document.addEventListener('keydown', (e) => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { close(); start.focus(); }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement !== input) {
        e.preventDefault();
        const all = $$('.smi, .sml', menu), i = all.indexOf(document.activeElement);
        all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
      }
    });
    $('#shutBtn').addEventListener('click', () => { close(); Shutdown.show(); });
    return { build, close };
  })();

  /* --------- notification balloon: offers Easy view to non-technical visitors --------- */
  const Balloon = (() => {
    const el = $('#balloon');
    let timer = 0;
    function maybeShow() {
      if (store.get('balloon') === 'dismissed' || isMobile()) return;
      timer = setTimeout(() => { if (!isMobile() && WM.isOpen('term')) el.hidden = false; }, reduce ? 0 : 1400);
    }
    function hide(remember) { clearTimeout(timer); el.hidden = true; if (remember) store.set('balloon', 'dismissed'); }
    $('#balloonX').addEventListener('click', () => hide(true));
    return { maybeShow, hide };
  })();

  /* --------- Windows 7 shut down screen --------- */
  const Shutdown = (() => {
    const s = $('#shutdown');
    const wake = () => {
      if (s.hidden) return;
      s.hidden = true;
      s.classList.remove('done');
      Terminal.reset();
      if (mode === 'easy') go('overview'); else go('terminal');
    };
    s.addEventListener('click', wake);
    document.addEventListener('keydown', (e) => { if (!s.hidden && s.classList.contains('done')) { e.preventDefault(); wake(); } }, true);
    return {
      show() {
        WM.closeAll(); Balloon.hide(false);
        s.hidden = false; s.focus();
        setTimeout(() => s.classList.add('done'), reduce ? 0 : 1600);
      },
    };
  })();

  /* --------- clocks: tray (time + date), lock screen, Vista-style analog gadget --------- */
  const Clock = (() => {
    const face = $('#clockface');
    const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="${i % 3 ? 12 : 10}" x2="50" y2="${i % 3 ? 16 : 18}" stroke="#2b3644" stroke-width="${i % 3 ? 1.4 : 2.6}" stroke-linecap="round" transform="rotate(${i * 30} 50 50)"/>`).join('');
    /* parse in the <svg> context so the children get the SVG namespace (a plain fragment would make them HTML) */
    const inSvg = (markup) => { const r = document.createRange(); r.selectNodeContents(face); return r.createContextualFragment(markup); };
    face.replaceChildren(inSvg(`
      <defs>
        <radialGradient id="gzFace" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".75" stop-color="#e9eff5"/><stop offset="1" stop-color="#c9d5e2"/></radialGradient>
        <linearGradient id="gzRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fc"/><stop offset=".5" stop-color="#8ea3ba"/><stop offset="1" stop-color="#3f5168"/></linearGradient>
        <linearGradient id="gzGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#gzRim)"/>
      <circle cx="50" cy="50" r="43" fill="url(#gzFace)" stroke="#5b6f87" stroke-width=".8"/>
      ${ticks}
      <line id="hHour" x1="50" y1="54" x2="50" y2="28" stroke="#1d2633" stroke-width="3.4" stroke-linecap="round"/>
      <line id="hMin" x1="50" y1="56" x2="50" y2="18" stroke="#1d2633" stroke-width="2.3" stroke-linecap="round"/>
      <line id="hSec" x1="50" y1="60" x2="50" y2="15" stroke="#d0261e" stroke-width="1" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="2.6" fill="#d0261e" stroke="#7a110c" stroke-width=".6"/>
      <ellipse cx="50" cy="30" rx="34" ry="20" fill="url(#gzGloss)" opacity=".55"/>`));
    const hand = (id, deg) => $(`#${id}`, face).setAttribute('transform', `rotate(${deg.toFixed(2)} 50 50)`);
    function tick() {
      const now = new Date();
      const time = now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
      $$('.clock').forEach((c) => { c.textContent = time; c.dateTime = now.toISOString(); });
      $('.tray .date').textContent = now.toLocaleDateString(locale(), { day: 'numeric', month: 'numeric', year: 'numeric' });
      $('#lockTime').textContent = now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: false });
      $('#lockDate').textContent = now.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
      const s = now.getSeconds(), m = now.getMinutes() + s / 60, hr = (now.getHours() % 12) + m / 60;
      hand('hHour', hr * 30); hand('hMin', m * 6); hand('hSec', s * 6);
      $('#gadget').title = `${ui('clockGadget')} · ${time}`;
    }
    (function loop() { tick(); setTimeout(loop, 1000 - new Date().getMilliseconds()); })();
    return { tick };
  })();

  /* --------- global clicks --------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-lang-toggle]')) { setLang(lang === 'en' ? 'es' : 'en'); return; }
    const langS = t.closest('[data-set-lang]'); if (langS) { setLang(langS.dataset.setLang); return; }
    if (t.closest('[data-mback]')) { Phone.back(); return; }
    const p = t.closest('[data-project]'); if (p && !t.closest('#smList')) { openProject(p.dataset.project); return; }
    const g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const c = t.closest('[data-cmd]'); if (c) { Menu.close(); Terminal.run(c.dataset.cmd); }
  });

  /* --------- layout: desktop <-> mobile --------- */
  function applyLayout() {
    const mobile = isMobile();
    document.body.classList.toggle('is-mobile', mobile);
    const core = $('#termCore');
    if (mobile && core.parentElement !== $('#mtermBody')) $('#mtermBody').append(core);
    if (!mobile && core.parentElement !== $('#winTerm')) $('#winTerm').append(core);
    const id = decodeURIComponent(location.hash.slice(1));
    if (mobile) { Phone.show(id); return; }
    if (id === 'terminal' || sec(id)) route();
    else if (!WM.anyOpen()) {
      if (mode === 'easy') { Easy.show('overview'); WM.open('easy'); }
      else { WM.open('term'); Balloon.maybeShow(); }
    }
  }
  mq.addEventListener('change', applyLayout);

  /* --------- ambient: bubbles, wallpaper parallax, pointer-following glass highlight + taskbar hot-track --------- */
  (() => {
    const fx = $('#fx');
    function spawnBubbles() {
      const count = isMobile() ? 5 : 10;
      fx.replaceChildren(...Array.from({ length: count }, (_, i) => {
        const b = h('span', 'bubble');
        b.style.setProperty('--x', `${Math.round((i + Math.random()) * (100 / count))}%`);
        b.style.setProperty('--s', `${26 + Math.round(Math.random() * 64)}px`);
        b.style.setProperty('--d', `${26 + Math.round(Math.random() * 22)}s`);
        b.style.setProperty('--delay', `${-Math.round(Math.random() * 40)}s`);
        b.style.setProperty('--sway', `${Math.round((Math.random() - 0.5) * 120)}px`);
        return b;
      }));
    }
    let frame = 0;
    let last = null;
    function onMove(e) {
      last = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const root = document.documentElement.style;
        root.setProperty('--px', ((last.clientX / innerWidth) * 2 - 1).toFixed(3));
        root.setProperty('--py', ((last.clientY / innerHeight) * 2 - 1).toFixed(3));
        const glass = last.target.closest?.('.win, .task');
        if (glass) {
          const r = glass.getBoundingClientRect();
          glass.style.setProperty('--gx', `${Math.round(last.clientX - r.left)}px`);
          glass.style.setProperty('--gy', `${Math.round(last.clientY - r.top)}px`);
        }
      });
    }
    if (!reduce) {
      spawnBubbles();
      addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') onMove(e); }, { passive: true });
      mq.addEventListener('change', spawnBubbles);
    }
  })();

  /* --------- start --------- */
  applyStatic();
  buildIcons(); Menu.build(); buildChips(); Phone.renderHome();
  Lock.maybeShow();
  document.fonts.ready.then(applyLayout);
})();
