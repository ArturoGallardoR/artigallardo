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
    setTermTitle();
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
    buildIcons(); Menu.build(); Phone.renderHome(); Clock.tick();
    Easy.render();
    Phone.rerender();
    Setup.relang(); Shell.relang();
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
    else Setup.show(s.id);
  }
  function openProject(slug) {
    if (mode === 'easy' || isMobile()) { pendingProject = slug; go('projects'); }
    else Setup.show('projects', { item: slug, detail: true });
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

  /* --------- terminal title: "ArtiOS Terminal" or "ArtiOS Terminal - setup" while the program runs --------- */
  const setTermTitle = () => {
    const t = ui('cmdTitle') + ($('#setup').hidden ? '' : ` - ${ui('setupRunning')}`);
    $('#termTitle').textContent = t;
    $('#winTerm').setAttribute('aria-label', t);
  };

  /* --------- command prompt (cmd.exe style); hosts the Setup Utility as a full-screen program --------- */
  const Shell = (() => {
    const box = $('#shell'), log = $('#log'), input = $('#cmd'), mirror = $('#mirror'), field = $('#field'), ps1 = $('#ps1');
    const st = { cwd: '', history: [], hIdx: 0, draft: '', busy: false, skip: false, booted: false, last: null };
    const sh = (k, vars = {}) => String(L(C.shell[k])).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
    const run = (cmd, label) => `<button class="run" data-cmd="${esc(cmd)}">${label ?? esc(cmd)}</button>`;
    const links = (...cmds) => `<p class="links">${cmds.map((c) => run(c)).join('')}</p>`;
    const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const bullets = (list) => `<ul class="tl">${list.map((x) => `<li>${x}</li>`).join('')}</ul>`;

    /* files; sizes in DIR are the real byte length of each rendered document */
    const ROOT = [
      { name: 'Projects', dir: true },
      { name: 'about.txt', cmd: 'about' },
      { name: 'contact.txt', cmd: 'contact' },
      { name: 'education.txt', cmd: 'education' },
      { name: 'experience.txt', cmd: 'experience' },
      { name: 'readme.txt', cmd: 'help' },
      { name: 'setup.exe', cmd: 'setup', exe: true },
      { name: 'skills.txt', cmd: 'skills' },
      { name: 'whoami.exe', cmd: 'whoami', exe: true },
    ];
    const DIRS = { '': ROOT, Projects: C.projects.map((p) => ({ name: `${p.slug}.txt`, cmd: `open ${p.slug}` })) };
    const DIR_ALIASES = { projects: 'Projects', proyectos: 'Projects', proyecto: 'Projects' };
    const promptText = () => `C:\\Users\\Arti${st.cwd ? '\\' + st.cwd : ''}>`;
    const normDir = (a) => {
      const d = a.replace(/^(c:)?\\?(users\\)?(arti\\?)?/i, '').replace(/[\\/]$/, '').toLowerCase();
      return d === '' ? '' : (DIR_ALIASES[d] ?? null);
    };
    function findFile(arg) {
      const parts = arg.replace(/\//g, '\\').split('\\');
      const name = parts.pop().toLowerCase();
      const dir = parts.length ? normDir(parts.join('\\')) : st.cwd;
      return dir === null ? undefined : (DIRS[dir] || []).find((f) => f.name.toLowerCase() === name || f.name.toLowerCase().replace(/\.\w+$/, '') === name);
    }
    const textBytes = (html) => { const d = h('div'); d.append(frag(html)); return new TextEncoder().encode(d.textContent).length; };
    const byteSize = (cmd) => {
      if (cmd === 'setup') return Setup.bytes();
      const [n, ...a] = cmd.split(' ');
      return textBytes(COMMANDS[n](a));
    };
    /* `setup projects`, `setup proyectos`, `setup 3` all open the matching menu */
    const tabFor = (arg) => {
      if (!arg) return 'overview';
      const a = fold(arg);
      const s = SECTIONS.find((x) => x.id === a || fold(L(x.label)) === a || fold(x.label.en) === a || fold(x.label.es) === a);
      return s ? s.id : 'overview';
    };

    const COMMANDS = {
      help: () => `
        <p class="y b">${ui('help')}</p>
        ${kv([...SECTIONS.map((s) => [run(s.id === 'overview' ? 'whoami' : s.id), L(s.desc)]), ...C.shell.helpRows.map(([c, d]) => [esc(c), L(d)])])}
        <p class="dim">${sh('helpIntro')}</p>`,

      whoami: () => {
        const p = C.profile;
        return `
          <p><span class="y b">${p.name}</span> <span class="dim">·</span> ${p.role}</p>
          ${kv([[ui('focus'), L(p.focus)], [ui('languages'), L(p.languages)], [ui('motto'), L(p.tagline)]])}
          <p>${L(p.summary)}</p>
          ${bullets(C.highlights.map(L))}
          ${links('projects', 'experience', 'contact')}`;
      },

      experience: () => C.experience.map((e) => `
        <div class="job"><p><span class="y b">${T(e.role)}</span> <span class="dim">·</span> ${T(e.org)} <span class="dim">· ${T(e.period)}</span></p>
          ${bullets(e.points.map(L))}</div>`).join('') + links('projects', 'skills'),

      projects: () => `
        <div class="rows">${C.projects.map((p) => `<button class="prow" data-cmd="open ${p.slug}"><span>${L(p.title)}</span><span class="y">${L(p.result)}</span></button>`).join('')}</div>
        <p class="dim">${sh('projectsHint')}</p>`,

      open: ([arg]) => {
        const a = (arg || '').toLowerCase().replace(/\.txt$/, '');
        const p = C.projects.find((x) => x.slug === a);
        if (!p) return `<p>${arg ? sh('fileNotFound') : sh('syntax', { x: 'open signatures' })}</p>${links('projects')}`;
        return `
          <p class="y b">${L(p.title)}</p>
          <p class="g">${L(p.result)}</p>
          ${kv([[ui('problem'), L(p.problem)], [ui('built'), L(p.built)], [ui('myRole'), T(p.role)], [ui('tradeoff'), T(p.tradeoff)], [ui('tools'), p.stack]])}
          ${links('projects', ...C.projects.filter((x) => x !== p).slice(0, 2).map((x) => `open ${x.slug}`))}`;
      },

      skills: () => kv(C.skills.map((g) => [L(g.name), g.items.map(L).join(' <span class="dim">·</span> ')])) + links('projects'),

      education: () => kv([
        ...C.education.map((e) => [e.period, `${L(e.title)}<br><span class="dim">${T(e.org)}</span>`]),
        ...C.languages.map((l) => [L(l.name), L(l.level)]),
      ]),

      about: () => `
        <p class="y b">${L(C.about.title)}</p><p>${T(C.about.text)}</p>
        ${kv([[ui('atWork'), L(C.about.work).join(' · ')], [ui('offWork'), L(C.about.life).join(' · ')]])}`,

      contact: () => `<p class="y b">${L(C.contact.title)}</p>${kv(C.contact.items.map((c) => [L(c.label), T(c.value)]))}`,

      ver: () => `<p>${sh('ver')}</p><p class="dim">${sh('credits')}</p>`,

      dir: ([arg]) => {
        const target = arg ? normDir(arg) : st.cwd;
        const list = target === null ? null : DIRS[target];
        if (!list) return `<p>${sh('pathNotFound')}</p>`;
        const now = new Date();
        const stamp = `${now.toLocaleDateString(locale(), { month: '2-digit', day: '2-digit', year: 'numeric' })}  ${now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
        const files = list.filter((f) => !f.dir);
        const sizes = new Map(files.map((f) => [f, byteSize(f.cmd)]));
        const total = [...sizes.values()].reduce((x, y) => x + y, 0);
        const fmt = (n) => n.toLocaleString(locale());
        const row = (f) => `<button class="lsrow" data-cmd="${f.dir ? `cd ${f.name.toLowerCase()}` : f.cmd}">${esc(`${stamp}    ${f.dir ? '<DIR>         ' : fmt(sizes.get(f)).padStart(14)} ${f.name}`)}</button>`;
        const parent = target ? `<button class="lsrow" data-cmd="cd ..">${esc(`${stamp}    <DIR>          ..`)}</button>` : '';
        const dirCount = list.filter((f) => f.dir).length + (target ? 1 : 0);
        return `<div class="ls">${sh('volume')}\n${sh('dirOf')} C:\\Users\\Arti${target ? '\\' + target : ''}\n\n</div>${parent}${list.map(row).join('')}<div class="ls">${String(files.length).padStart(16)} ${sh('files')} ${fmt(total).padStart(14)} bytes\n${String(dirCount).padStart(16)} ${sh('dirs')}</div>`;
      },

      cd: ([arg]) => {
        if (!arg) return `<p>${esc(promptText().slice(0, -1))}</p>`;
        if (['..', '\\', '~', '/'].includes(arg)) { st.cwd = ''; return ''; }
        const d = normDir(arg);
        if (d !== null && DIRS[d]) { st.cwd = d; return ''; }
        return `<p>${sh('pathNotFound')}</p>`;
      },

      type: ([arg]) => {
        if (!arg) return `<p>${sh('syntax', { x: 'type experience.txt' })}</p>`;
        const f = findFile(arg);
        if (!f) return `<p>${sh('fileNotFound')}</p>`;
        if (f.dir) return `<p>${sh('pathNotFound')}</p>`;
        if (f.exe) return `<p>${sh('isExe', { x: f.name, y: f.cmd })}</p>${links(f.cmd)}`;
        const [n, ...a] = f.cmd.split(' ');
        return COMMANDS[n](a);
      },

      sudo: (args) => (args.join(' ').toLowerCase() === 'hire arti'
        ? `<p class="g">${sh('sudoOk')}</p>${links('contact')}`
        : `<p>${sh('sudoNo')}</p>`),
    };
    const ALIASES = {
      ayuda: 'help', '?': 'help', man: 'help', readme: 'help', experiencia: 'experience', exp: 'experience', cv: 'experience', resume: 'whoami',
      proyectos: 'projects', ls: 'dir', abrir: 'open', educacion: 'education', 'educación': 'education', acerca: 'about', sobremi: 'about',
      contacto: 'contact', clear: 'cls', cat: 'type', quiensoy: 'whoami', salir: 'exit', idioma: 'lang', gui: 'easy', sencilla: 'easy',
      menu: 'setup', 'setup.exe': 'setup', 'whoami.exe': 'whoami', bios: 'setup',
    };
    /* commands with side effects run only when typed/clicked, never while DIR measures file sizes */
    const ACTIONS = {
      setup: ([arg]) => { Setup.launch(tabFor(arg)); return ''; },
      lang: ([code]) => {
        const c = (code || '').toLowerCase();
        if (!LANGS.includes(c)) return `<p>${sh('langUsage')}</p>`;
        queueMicrotask(() => setLang(c));
        return '';
      },
      easy: () => { queueMicrotask(() => go('overview')); return ''; },
    };
    const ALL = [...Object.keys(COMMANDS), ...Object.keys(ACTIONS), 'cls', 'exit'];

    function renderMirror() {
      const v = input.value, pos = input.selectionStart ?? v.length;
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
    function print(cmdText, html) {
      const entry = h('section', 'entry');
      entry.append(h('div', 'cmdline', promptText() + cmdText));
      if (html) { const out = h('div', 'out'); out.append(frag(html)); entry.append(out); }
      log.append(entry);
      return entry;
    }
    function note(html) { const p = h('div', 'note'); p.append(frag(html)); log.append(p); box.scrollTop = box.scrollHeight; }
    function scrollToEntry(entry) {
      const top = entry.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 6;
      box.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    }

    function execute(raw) {
      const text = raw.trim();
      if (text) st.history.push(text);
      st.hIdx = st.history.length;
      if (!text) { print('', ''); return; }
      const [head, ...args] = text.split(/\s+/);
      const name = ALIASES[head.toLowerCase()] || head.toLowerCase();
      if (name === 'cls') { log.replaceChildren(); return; }
      if (name === 'exit') { print(text, ''); if (isMobile()) Phone.back(); else WM.close('term'); return; }

      let html;
      if (ACTIONS[name]) html = ACTIONS[name](args);
      else if (COMMANDS[name]) html = COMMANDS[name](args);
      else {
        const file = findFile(head);
        if (file && !file.dir) { const [n, ...a] = file.cmd.split(' '); html = (ACTIONS[n] || COMMANDS[n])(a); }
        else {
          const guess = closest(name);
          html = `<p>${sh('badCmd', { x: esc(head) })}</p>${guess ? `<p>${sh('didYouMean', { x: run(guess) })}</p>` : links('help')}`;
        }
      }
      const entry = print(text, html);
      ps1.textContent = promptText();
      if (COMMANDS[name] && name !== 'cd') st.last = text;
      scrollToEntry(entry);
    }

    async function typeAndRun(cmd) {
      if (st.busy) return;
      st.busy = true; st.skip = false;
      input.value = '';
      for (const ch of cmd) {
        input.value += ch; input.setSelectionRange(input.value.length, input.value.length); renderMirror();
        if (!reduce && !st.skip) await sleep(40 + Math.random() * 40);
      }
      if (!reduce && !st.skip) await sleep(160);
      execute(cmd);
      input.value = ''; renderMirror();
      st.busy = false;
      if (!isMobile() && $('#setup').hidden) input.focus({ preventScroll: true });
    }

    function complete() {
      const v = input.value, low = v.toLowerCase(), sp = low.indexOf(' ');
      let pool;
      if (sp > 0) {
        const verb = ALIASES[low.slice(0, sp)] || low.slice(0, sp);
        const ARGS = {
          open: () => C.projects.map((p) => p.slug),
          cd: () => ['..', 'projects'],
          type: () => (DIRS[st.cwd] || []).filter((f) => !f.dir).map((f) => f.name),
          setup: () => SECTIONS.map((s) => s.id),
          lang: () => LANGS,
        };
        pool = (ARGS[verb] ? ARGS[verb]() : []).map((n) => v.slice(0, sp + 1) + n);
      } else pool = ALL;
      const hits = pool.filter((c) => c.toLowerCase().startsWith(low));
      if (hits.length === 1) input.value = hits[0];
      else if (hits.length > 1) {
        const prefix = hits.reduce((a, b) => { let i = 0; while (i < a.length && a[i].toLowerCase() === b[i]?.toLowerCase()) i++; return a.slice(0, i); });
        if (prefix.length > v.length) input.value = prefix;
        else print(v, `<p class="links">${hits.map((x) => run(x, esc(x.split(' ').pop()))).join('')}</p>`);
      }
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
    }

    function printBanner() {
      note(`<p>${sh('ver')}</p><p>${sh('copyright', { year: new Date().getFullYear() })}</p>`);
      renderMirror();
    }
    /* banner only: used when something else (icons, Start menu) is about to launch Setup itself */
    function prime() { if (st.booted) return; st.booted = true; printBanner(); }
    /* first open: banner, then the prompt types `setup` so the menus open like a program */
    async function boot() {
      if (st.booted) return;
      prime();
      if (!reduce) await sleep(420);
      await typeAndRun('setup');
    }
    /* run a command from a link inside the console */
    function runCmd(cmd) { typeAndRun(cmd); }
    function onSetupClosed() {
      note(`<p class="dim">${sh('closed', { help: run('help'), setup: run('setup') })}</p>`);
      if (!isMobile()) input.focus({ preventScroll: true });
    }
    function relang() {
      renderMirror();
      if (!st.booted) return;
      log.replaceChildren();
      printBanner();
      if (st.last && $('#setup').hidden) execute(st.last);
    }
    function reset() { log.replaceChildren(); st.cwd = ''; st.booted = false; st.last = null; ps1.textContent = promptText(); }

    input.addEventListener('keydown', (e) => {
      if (st.busy) { if (e.key === 'Escape') st.skip = true; e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; execute(v); renderMirror(); }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (st.hIdx === st.history.length) st.draft = input.value; if (st.hIdx > 0) input.value = st.history[--st.hIdx]; renderMirror(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (st.hIdx < st.history.length) { st.hIdx++; input.value = st.history[st.hIdx] ?? st.draft; } renderMirror(); }
      else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; renderMirror(); }
      else if (e.key === 'F1') { e.preventDefault(); typeAndRun('help'); }
      else if (e.key === 'F10') { e.preventDefault(); setLang(lang === 'en' ? 'es' : 'en'); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); execute('cls'); }
      requestAnimationFrame(renderMirror);
    });
    ['input', 'select', 'click', 'keyup'].forEach((ev) => input.addEventListener(ev, renderMirror));
    input.addEventListener('focus', () => field.classList.add('focused'));
    input.addEventListener('blur', () => field.classList.remove('focused'));
    box.addEventListener('click', (e) => { if (!e.target.closest('button') && !String(getSelection()).length) input.focus({ preventScroll: true }); });

    renderMirror();
    return { boot, prime, run: runCmd, onSetupClosed, relang, reset, isBooted: () => st.booted };
  })();

  /* --------- Setup Utility: BIOS-style program (tabs, item list, item-specific help, key legend) --------- */
  const Setup = (() => {
    const root = $('#setup'), tabsEl = $('#suTabs'), left = $('#suLeft');
    const st = { tab: 'overview', idx: 0, detail: null, helpScreen: false };

    const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const bullets = (list) => `<ul class="su-ul">${list.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    const tabs = () => [...SECTIONS.map((s) => ({ id: s.id, label: s.id === 'overview' ? ui('tabMain') : L(s.label) })), { id: 'exit', label: ui('tabExit') }];

    /* each tab is a list of items: label, plain-language help, and either a detail screen or an action */
    function items(tab) {
      const p = C.profile;
      switch (tab) {
        case 'overview': return [
          { key: 'profile', label: ui('profile'), help: L(p.plain), detail: () => kv([[ui('fullName'), p.fullName], [ui('role'), p.role], [ui('focus'), L(p.focus)], [ui('languages'), L(p.languages)]]) },
          { key: 'motto', label: ui('motto'), help: L(p.summary), detail: () => `<p class="y">${L(p.tagline)}</p><p>${L(p.summary)}</p>` },
          { key: 'highlights', label: ui('highlights'), help: L(sec('overview').plain), detail: () => bullets(C.highlights.map(L)) },
        ];
        case 'experience': return C.experience.map((e, i) => ({
          key: `job${i}`, label: `${T(e.role)} · ${T(e.org)}`, help: stripTags(L(e.points[0])),
          detail: () => kv([[ui('role'), T(e.role)], ['', T(e.org)], ['', T(e.period)]]) + bullets(e.points.map(L)),
        }));
        case 'projects': return C.projects.map((x) => ({
          key: x.slug, label: L(x.title), help: L(x.plain),
          detail: () => `<p class="g">${L(x.result)}</p>${kv([[ui('problem'), L(x.problem)], [ui('built'), L(x.built)], [ui('myRole'), T(x.role)], [ui('tradeoff'), T(x.tradeoff)], [ui('tools'), x.stack]])}`,
        }));
        case 'skills': return C.skills.map((g, i) => ({ key: `skill${i}`, label: L(g.name), help: L(g.desc), detail: () => `<p>${L(g.desc)}</p>${bullets(g.items.map(L))}` }));
        case 'education': return [
          ...C.education.map((e, i) => ({ key: `edu${i}`, label: L(e.title), help: `${e.period} · ${stripTags(T(e.org))}`, detail: () => kv([[e.period, L(e.title)], ['', T(e.org)]]) })),
          { key: 'langs', label: ui('languages'), help: L(p.languages), detail: () => kv(C.languages.map((l) => [L(l.name), L(l.level)])) },
        ];
        case 'about': return [
          { key: 'story', label: L(C.about.title), help: L(sec('about').plain), detail: () => `<p>${T(C.about.text)}</p>` },
          { key: 'work', label: ui('atWork'), help: L(C.about.work).join(' · '), detail: () => bullets(L(C.about.work)) },
          { key: 'life', label: ui('offWork'), help: L(C.about.life).join(' · '), detail: () => bullets(L(C.about.life)) },
        ];
        case 'contact': return C.contact.items.map((c, i) => ({ key: `contact${i}`, label: L(c.label), help: stripTags(T(c.value)), detail: () => kv([[L(c.label), T(c.value)]]) }));
        case 'exit': return [
          { key: 'prompt', label: ui('exitPrompt'), help: ui('exitPromptHelp'), action: () => close() },
          { key: 'easy', label: ui('openEasy'), help: ui('exitEasyHelp'), action: () => go('overview') },
          { key: 'lang', label: `${ui('language')}: ${ui('switchLang')}`, help: ui('exitLangHelp'), action: () => setLang(lang === 'en' ? 'es' : 'en') },
        ];
        default: return [];
      }
    }
    const current = () => items(st.tab);

    /* keep the active tab / selected item in view by scrolling only their own container
       (scrollIntoView would also scroll the phone shell and the desktop) */
    function keepInView(container, el, axis) {
      if (!el) return;
      const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (axis === 'x') { if (r.left < c.left) container.scrollLeft -= c.left - r.left; else if (r.right > c.right) container.scrollLeft += r.right - c.right; }
      else if (r.top < c.top) container.scrollTop -= c.top - r.top; else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom;
    }
    function renderTabs() {
      tabsEl.replaceChildren(frag(tabs().map((t) => `<button class="su-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === st.tab}" tabindex="-1">${t.label}</button>`).join('')));
      keepInView(tabsEl, $('.su-tab[aria-selected="true"]', tabsEl), 'x');
    }
    function renderHelp() {
      const it = current()[st.idx];
      $('#suHelp').textContent = st.helpScreen ? ui('setupHelpTitle') : (it ? it.help : '');
      let hint;
      if (st.detail || st.helpScreen) hint = ui(isMobile() ? 'tapBack' : 'hintBack');
      else if (isMobile()) hint = ui('tapOpen');
      else hint = `${ui(it && it.action ? 'hintRun' : 'hintOpen')}\n${ui('hintExit')}`;
      $('#suHint').textContent = hint;
    }
    function renderLeft() {
      const list = current();
      if (st.helpScreen) {
        left.replaceChildren(frag(`<button class="su-back" data-su="back">${ui('suBack')}</button><div class="su-detail"><p class="su-dh">${ui('setupHelpTitle')}</p>${kv(L(C.ui.setupHelp))}</div>`));
      } else if (st.detail) {
        const it = list.find((x) => x.key === st.detail);
        left.replaceChildren(frag(`<button class="su-back" data-su="back">${ui('suBack')}</button><div class="su-detail"><p class="su-dh">${it.label}</p>${it.detail()}</div>`));
      } else {
        left.replaceChildren(frag(`<ul class="su-list" role="listbox" aria-label="${esc(tabs().find((t) => t.id === st.tab).label)}">${list.map((it, i) => `<li><button class="su-item" role="option" data-i="${i}" aria-selected="${i === st.idx}" tabindex="${i === st.idx ? 0 : -1}">${it.label}</button></li>`).join('')}</ul>`));
      }
      left.scrollTop = 0;
    }
    function renderKeys() {
      $('#suKeys').replaceChildren(frag(L(C.ui.keys).map(([k, d]) => `<button class="su-key" data-key="${k}"><b>${k}</b> ${d}</button>`).join('')));
    }
    function render() { renderTabs(); renderLeft(); renderHelp(); renderKeys(); }
    function focusSelection() { ($('.su-item[aria-selected="true"]', left) || $('.su-back', left) || root).focus({ preventScroll: true }); }

    function select(i, { focus = true } = {}) {
      const list = current();
      if (st.detail || st.helpScreen || !list.length) return;
      st.idx = (i + list.length) % list.length;
      $$('.su-item', left).forEach((b, j) => { b.setAttribute('aria-selected', String(j === st.idx)); b.tabIndex = j === st.idx ? 0 : -1; });
      keepInView(left, $('.su-item[aria-selected="true"]', left), 'y');
      renderHelp();
      if (focus) focusSelection();
    }
    function setTab(id) { st.tab = id; st.idx = 0; st.detail = null; st.helpScreen = false; render(); focusSelection(); }
    function moveTab(dir) { const t = tabs(), i = t.findIndex((x) => x.id === st.tab); setTab(t[(i + dir + t.length) % t.length].id); }
    function openItem() {
      const it = current()[st.idx]; if (!it) return;
      if (it.action) { it.action(); return; }
      st.detail = it.key; renderLeft(); renderHelp(); focusSelection();
    }
    /* Esc: detail -> list -> exit to the command prompt */
    function back() {
      if (!st.detail && !st.helpScreen) { close(); return; }
      st.detail = null; st.helpScreen = false; renderLeft(); renderHelp(); focusSelection();
    }
    function showHelp() { st.helpScreen = true; st.detail = null; renderLeft(); renderHelp(); focusSelection(); }

    const ACTIONS = {
      '↑↓': () => select(st.idx + 1), '←→': () => moveTab(1), Enter: openItem, Esc: back, F1: showHelp,
      F10: () => setLang(lang === 'en' ? 'es' : 'en'),
    };
    $('#suKeys').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) ACTIONS[b.dataset.key](); });
    tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    left.addEventListener('pointerover', (e) => { const b = e.target.closest('.su-item'); if (b && e.pointerType === 'mouse') select(Number(b.dataset.i), { focus: false }); });
    left.addEventListener('click', (e) => {
      if (e.target.closest('[data-su="back"]')) { back(); return; }
      const b = e.target.closest('.su-item'); if (!b) return;
      select(Number(b.dataset.i), { focus: false }); openItem();
    });

    const active = () => !root.hidden && (isMobile() ? !$('#mterm').hidden : WM.isActive('term'));
    document.addEventListener('keydown', (e) => {
      if (!active() || e.target.closest?.('input, textarea')) return;
      const k = e.key;
      const map = {
        ArrowDown: () => (st.detail || st.helpScreen ? left.scrollBy(0, 48) : select(st.idx + 1)),
        ArrowUp: () => (st.detail || st.helpScreen ? left.scrollBy(0, -48) : select(st.idx - 1)),
        ArrowRight: () => moveTab(1), ArrowLeft: () => moveTab(-1),
        Home: () => select(0), End: () => select(current().length - 1),
        Enter: () => { if (!st.detail && !st.helpScreen) openItem(); },
        Escape: back, F1: showHelp, F10: ACTIONS.F10,
      };
      if (!map[k]) return;
      if (k === 'Enter' && e.target.closest?.('button') && !e.target.closest('.su-item')) return; /* let other buttons click */
      e.preventDefault(); map[k]();
    });

    /* run the program inside the terminal */
    function launch(tab = 'overview', { item, detail = false } = {}) {
      st.tab = tab; st.helpScreen = false;
      const list = items(tab);
      const i = item ? Math.max(0, list.findIndex((x) => x.key === item)) : 0;
      st.idx = i; st.detail = detail ? list[i]?.key ?? null : null;
      root.hidden = false; setTermTitle();
      render(); if (!isMobile()) focusSelection();
    }
    function close() { if (root.hidden) return; root.hidden = true; setTermTitle(); Shell.onSetupClosed(); }
    /* open from outside the terminal (desktop icons, Start menu, phone) */
    async function show(tab, opts) {
      Shell.prime();
      if (isMobile()) { if (location.hash !== '#terminal') navigate('terminal'); }
      else { setMode('terminal'); await WM.open('term'); }
      launch(tab, opts);
    }
    function bytes() {
      const all = tabs().flatMap((t) => items(t.id)).map((it) => `${it.label} ${it.help} ${it.detail ? it.detail() : ''}`).join(' ');
      const d = h('div'); d.append(frag(all));
      return new TextEncoder().encode(d.textContent).length;
    }
    function relang() { if (st.idx >= current().length) st.idx = 0; render(); setTermTitle(); }
    function reset() { st.tab = 'overview'; st.idx = 0; st.detail = null; st.helpScreen = false; root.hidden = true; setTermTitle(); }

    return { launch, show, relang, reset, bytes, help: () => show('overview').then(showHelp) };
  })();
  WM.onFirstOpen('term', () => Shell.boot());

  /* --------- mobile phone shell --------- */
  const Phone = (() => {
    const page = $('#mpage'), termPage = $('#mterm');
    let currentId = '';
    /* which page sits at each history step, so Back can name where it goes (iOS style) */
    const visited = {};
    let pendingHome = false;
    const titleOf = (id) => (id === '' ? ui('home') : id === 'terminal' ? ui('terminal') : sec(id) ? L(sec(id).label) : ui('back'));
    function updateNav() {
      const prev = navN > 0 ? (navN - 1 in visited ? titleOf(visited[navN - 1]) : ui('back')) : ui('home');
      $$('[data-mback]').forEach((b) => { b.textContent = prev; b.setAttribute('aria-label', `${ui('back')}: ${prev}`); });
      $$('[data-mhome]').forEach((b) => { b.setAttribute('aria-label', ui('home')); b.title = ui('home'); });
    }

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
      /* the Home button rewinds history to its first entry; if that entry was a deep link, land on the springboard */
      if (pendingHome) {
        pendingHome = false;
        if (id) { history.replaceState({ n: 0 }, '', location.pathname + location.search); id = ''; }
      }
      visited[navN] = id;
      updateNav();
      const fromHome = currentId === '';
      $('#phone').classList.toggle('in-page', id === 'terminal' || !!sec(id));
      if (id === 'terminal') {
        currentId = id; hideEl(page); showEl(termPage, fromHome);
        Shell.boot();
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
    /* straight back to the springboard from any depth */
    function home() {
      if (navN > 0) { pendingHome = true; history.go(-navN); }
      else { history.replaceState({ n: 0 }, '', location.pathname + location.search); show(''); }
    }
    function rerender() {
      updateNav();
      if (!isMobile() || !sec(currentId)) return;
      $('#mpageTitle').textContent = L(sec(currentId).label);
      $('#mpageBody').replaceChildren(frag(renderDoc(currentId)));
      markDuplicateTitle();
    }
    return { renderHome, show, back, home, rerender };
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
        `<li><button class="sml" data-setup-help>${ui('help')}</button></li>`,
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
      Setup.reset(); Shell.reset();
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
    if (t.closest('[data-mhome]')) { Phone.home(); return; }
    const p = t.closest('[data-project]'); if (p && !t.closest('#smList')) { openProject(p.dataset.project); return; }
    const g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    if (t.closest('[data-setup-help]')) { Menu.close(); Setup.help(); return; }
    const c = t.closest('[data-cmd]'); if (c) Shell.run(c.dataset.cmd);
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
  buildIcons(); Menu.build(); Phone.renderHome();
  Lock.maybeShow();
  document.fonts.ready.then(applyLayout);
})();
