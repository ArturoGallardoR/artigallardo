/* ArtiOS 98 — app logic.
 * Views: desktop Command Prompt (terminal), desktop Easy view (Explorer-style résumé), mobile phone shell.
 * Routing: #<section> / #terminal, with history.pushState so browser Back works everywhere.
 * Preferences: ?lang=en|es and ?view=easy|terminal (shareable), persisted in localStorage.
 */
(() => {
  'use strict';
  const C = window.CONTENT;

  /* ═════════ helpers ═════════ */
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
  const svg = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const store = {
    get: (k) => { try { return localStorage.getItem('ag.' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('ag.' + k, v); } catch { /* private mode: preference just isn't remembered */ } },
  };

  /* ═════════ preferences ═════════ */
  const params = new URLSearchParams(location.search);
  const LANGS = ['en', 'es'];
  let lang = LANGS.includes(params.get('lang')) ? params.get('lang') : (LANGS.includes(store.get('lang')) ? store.get('lang') : 'en');
  let mode = ['easy', 'terminal'].includes(params.get('view')) ? params.get('view') : (store.get('mode') === 'easy' ? 'easy' : 'terminal');
  const setMode = (m) => { mode = m; store.set('mode', m); };

  /* ═════════ i18n ═════════ */
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
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', ui(el.dataset.i18nAria)));
    $$('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
    $$('[data-lang-toggle]').forEach((b) => { b.title = ui('switchLangHint'); b.setAttribute('aria-label', ui('switchLangHint')); });
    $('#taskbar').setAttribute('aria-label', ui('taskbar'));
    $('#icons').setAttribute('aria-label', ui('desktop'));
    $('#menuList').setAttribute('aria-label', ui('startMenu'));
    $('#termToolbar').setAttribute('aria-label', ui('quickCommands'));
    $('#chipsBar').setAttribute('aria-label', ui('quickCommands'));
    $('#winTerm').setAttribute('aria-label', ui('cmdTask'));
    $('#winEasy').setAttribute('aria-label', ui('easyTask'));
    $('#navpane').setAttribute('aria-label', ui('sections'));
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    store.set('lang', lang);
    const qs = new URLSearchParams(location.search);
    qs.set('lang', lang);
    history.replaceState(history.state, '', `${location.pathname}?${qs}${location.hash}`);
    applyStatic();
    buildIcons(); buildToolbar(); buildMenu(); buildChips(); Phone.renderHome();
    Easy.render();
    Phone.rerender();
    Terminal.relang();
  }

  /* ═════════ readable document (Easy view + mobile pages) ═════════ */
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

  /* ═════════ routing ═════════ */
  let navN = history.state?.n ?? 0;
  let navMax = navN;
  if (!history.state) history.replaceState({ n: 0 }, '', location.href);

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
    if (isMobile()) { navigate(target); return; }
    setMode(target === 'terminal' ? 'terminal' : 'easy');
    navigate(target);
  }

  /* desktop icons / start menu: open a section in the user's current mode */
  function openSection(s) {
    if (mode === 'easy' || isMobile()) go(s.id);
    else Terminal.run(s.cmd);
  }

  /* ═════════ window manager (desktop) ═════════ */
  const WM = (() => {
    const wins = {};
    let z = 10;
    let active = null;
    const onFirstOpen = {};

    function place(w) {
      const W = innerWidth, H = innerHeight - 44;
      const big = w.id === 'easy';
      const ww = Math.min(big ? 1080 : 1000, W - (big ? 150 : 140));
      const hh = Math.min(big ? 760 : 700, H - (big ? 28 : 40));
      Object.assign(w.el.style, {
        width: ww + 'px', height: hh + 'px',
        left: Math.max(big ? 110 : 118, (W - ww) / 2 + (big ? 30 : 50)) + 'px',
        top: Math.max(big ? 10 : 16, (H - hh) / 2 - (big ? 0 : 6)) + 'px',
      });
    }
    function sync() {
      Object.values(wins).forEach((w) => {
        w.task.hidden = !w.open;
        w.task.setAttribute('aria-pressed', String(w.open && !w.min && active === w.id));
        w.el.classList.toggle('inactive', active !== w.id);
      });
    }
    function focus(id) { active = id; wins[id].el.style.zIndex = String(++z); sync(); }
    function zoom(fromEl, toEl) {
      if (reduce) return Promise.resolve();
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      const r = h('div', 'zoomrect'); document.body.append(r);
      const k = (x) => ({ left: x.left + 'px', top: x.top + 'px', width: x.width + 'px', height: x.height + 'px' });
      return r.animate([k(a), k(b)], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => r.remove());
    }
    async function minimize(id) {
      const w = wins[id]; if (w.min || !w.open) return;
      await zoom(w.el, w.task); w.el.hidden = true; w.min = true;
      const other = Object.values(wins).find((x) => x.open && !x.min);
      active = other ? other.id : null; if (other) focus(other.id); else sync();
    }
    async function restore(id) {
      const w = wins[id]; if (!w.min) { focus(id); return; }
      w.el.hidden = false; w.el.style.visibility = 'hidden';
      await zoom(w.task, w.el); w.el.style.visibility = ''; w.min = false; focus(id);
    }
    function close(id) {
      const w = wins[id]; w.el.hidden = true; w.open = false; w.min = false;
      const other = Object.values(wins).find((x) => x.open && !x.min);
      active = other ? other.id : null; if (other) focus(other.id); else sync();
    }
    async function open(id) {
      const w = wins[id];
      if (!w.open) {
        w.open = true; w.min = false;
        if (!w.placed) { place(w); w.placed = true; }
        w.el.hidden = false; focus(id);
        if (!w.booted) { w.booted = true; onFirstOpen[id]?.(); }
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
          w.el.style.top = Math.min(innerHeight - 44 - 30, Math.max(0, oy + ev.clientY - sy)) + 'px';
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
      w.task.addEventListener('click', () => { if (w.min) restore(id); else if (active !== id) focus(id); else minimize(id); });
      const bar = $('.titlebar', el);
      bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMax(id); });
      drag(bar, w);
    });
    addEventListener('resize', () => Object.values(wins).forEach((w) => { if (!w.max && w.placed) place(w); }));

    return {
      open, close, minimize,
      isOpen: (id) => wins[id].open && !wins[id].min,
      anyOpen: () => Object.values(wins).some((w) => w.open),
      onFirstOpen: (id, fn) => { onFirstOpen[id] = fn; },
    };
  })();

  /* ═════════ Easy view (desktop) ═════════ */
  const Easy = (() => {
    let current = 'overview';
    const pane = $('#easyPane');
    function buildNav() {
      $('#navpane').replaceChildren(frag(`<h2>${ui('sections')}</h2><ul>${SECTIONS.map((s) => `
        <li><button class="navitem" data-go="${s.id}"${s.id === current ? ' aria-current="page"' : ''}>${svg(s.icon)}<span>${L(s.label)}</span></button></li>`).join('')}</ul>`));
    }
    function render() {
      buildNav();
      pane.replaceChildren(frag(renderDoc(current)));
      $('#crumbs').replaceChildren(frag(`${svg('ic-profile')}<span>${C.profile.name}</span><span class="sepc">›</span><span>${L(sec(current).label)}</span>`));
      $('#easyBack').disabled = navN <= 0;
      $('#easyFwd').disabled = navN >= navMax;
    }
    function show(id) {
      current = id;
      render();
      pane.scrollTop = 0;
      pane.focus({ preventScroll: true });
    }
    $('#easyBack').addEventListener('click', () => history.back());
    $('#easyFwd').addEventListener('click', () => history.forward());
    return { show, render };
  })();

  /* ═════════ terminal ═════════ */
  const Terminal = (() => {
    const screen = $('#screen'), log = $('#log'), input = $('#cmd'), mirror = $('#mirror'), field = $('#field'), ps1 = $('#ps1');
    const state = { cwd: '', history: [], hIdx: 0, draft: '', busy: false, skip: false, booted: false, lastSection: null };

    const btn = (cmd, label, cls = 'run') => `<button class="${cls}" data-cmd="${esc(cmd)}">${label}</button>`;
    const goBtn = (target, label) => `<button class="run" data-go="${target}">${label}</button>`;
    const next = (...items) => `<div class="next">${items.map(([c, l]) => btn(c, l || c)).join('')}</div>`;

    /* ANSI-Shadow banner glyphs */
    const GLYPHS = {
      A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
      R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
      T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
      I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
      G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
      L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
      D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
      O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
    };
    const banner = (...words) => words.map((w) => [0, 1, 2, 3, 4, 5].map((r) => [...w].map((ch) => GLYPHS[ch][r]).join('')).join('\n')).join('\n')
      .replace(/[╗╔╝╚═║]+/g, (m) => `<span class="s">${m}</span>`);

    /* file system, 8.3 names; sizes in DIR are the real byte length of each rendered document */
    const ROOT = [
      { name: 'WHOAMI', ext: 'EXE', cmd: 'whoami' },
      { name: 'EXPERIEN', ext: 'TXT', cmd: 'experience' },
      { name: 'PROJECTS', dir: true },
      { name: 'SKILLS', ext: 'TXT', cmd: 'skills' },
      { name: 'EDUCATIO', ext: 'TXT', cmd: 'education' },
      { name: 'ABOUT', ext: 'TXT', cmd: 'about' },
      { name: 'CONTACT', ext: 'TXT', cmd: 'contact' },
      { name: 'README', ext: 'TXT', cmd: 'help' },
    ];
    const DIRS = { '': ROOT, PROJECTS: C.projects.map((p) => ({ name: p.file, ext: 'TXT', cmd: `open ${p.slug}` })) };
    const DIR_ALIASES = { PROYECTO: 'PROJECTS', PROYECTOS: 'PROJECTS' };
    const promptText = () => `C:\\ARTI${state.cwd ? '\\' + state.cwd : ''}>`;
    const normDir = (a) => { const d = a.toUpperCase().replace(/^\\?ARTI\\?/, '').replace(/\\$/, ''); return DIR_ALIASES[d] || d; };
    function findFile(arg) {
      const up = arg.toUpperCase().replace(/^\\?ARTI\\?/, '');
      const [dirPart, filePart] = up.includes('\\') ? [normDir(up.split('\\')[0]), up.split('\\')[1]] : [state.cwd, up];
      const [n, e] = filePart.split('.');
      return (DIRS[dirPart] || []).find((f) => f.name === n && (!e || f.ext === e));
    }
    const fmtNum = (n) => n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US');
    const byteSize = (cmd) => { const d = h('div'); const [n, ...a] = cmd.split(' '); d.append(frag(COMMANDS[n](a))); return new TextEncoder().encode(d.textContent).length; };

    const COMMANDS = {
      help: () => `
        <fieldset class="box hl"><legend> README.TXT </legend>
          <dl class="kv">
            ${SECTIONS.map((s) => `<dt>${btn(s.cmd, s.cmd, 'run bare')}</dt><dd>${L(s.desc)}</dd>`).join('')}
            ${C.dos.helpRows.map(([c, d]) => `<dt>${esc(c)}</dt><dd>${L(d)}</dd>`).join('')}
          </dl>
        </fieldset>
        <p class="dim">${dos('helpIntro')}</p>`,

      whoami: () => {
        const p = C.profile;
        return `
          <pre class="banner" role="img" aria-label="${p.name}">${banner('ARTI', 'GALLARDO')}</pre>
          <div><p class="y">${L(p.tag)}</p><p class="w">${L(p.tagline)}</p><p>${L(p.summary)}</p></div>
          <fieldset class="box"><legend> ${dos('card')} </legend>
            <dl class="kv">
              <dt>${ui('fullName')}</dt><dd>${p.fullName}</dd>
              <dt>${ui('role')}</dt><dd>${p.role}</dd>
              <dt>${ui('languages')}</dt><dd>${L(p.languages)}</dd>
            </dl>
          </fieldset>
          ${next(['projects', L(sec('projects').label)], ['experience', L(sec('experience').label)], ['contact', L(sec('contact').label)])}
          <p class="g">${dos('notTech')} ${goBtn('overview', ui('easyView'))}</p>`;
      },

      experience: () => `
        <fieldset class="box"><legend> EXPERIEN.TXT </legend>
          ${C.experience.map((e) => `<div class="job"><p class="job-h">${T(e.period)}  ${T(e.role)} <span class="dim">·</span> ${T(e.org)}</p>
            <ul class="dos">${e.points.map((p) => `<li>${L(p)}</li>`).join('')}</ul></div>`).join('')}
        </fieldset>
        ${next(['projects', L(sec('projects').label)], ['skills', L(sec('skills').label)])}`,

      projects: () => `
        <div>
          <p>${dos('dirOf')} C:\\ARTI\\PROJECTS</p><div class="blank"></div>
          ${C.projects.map((p) => `<button class="dir-row" data-cmd="open ${p.slug}" aria-label="${esc(L(p.title))}">
            <span class="f">${p.file.padEnd(8)} TXT</span><span>${L(p.title)}</span><span class="r">${L(p.result)}</span></button>`).join('')}
          <div class="blank"></div><p class="dim">${dos('projectsRem')}</p>
        </div>`,

      open: ([arg]) => {
        const a = (arg || '').toLowerCase().replace(/\.txt$/, '');
        const p = C.projects.find((x) => x.slug === a || x.file.toLowerCase() === a);
        if (!p) return `<p class="err">${arg ? `${dos('fileNotFound')}: ${esc(arg.toUpperCase())}` : dos('missingParam', { x: 'open signatures' })}</p>${next(['projects', L(sec('projects').label)])}`;
        return `
          <fieldset class="box hl"><legend> ${p.file}.TXT </legend>
            <p class="w">${L(p.title)}</p><p class="y">${L(p.result)}</p><div class="blank"></div>
            <dl class="kv">
              <dt>${ui('problem')}</dt><dd>${L(p.problem)}</dd>
              <dt>${ui('built')}</dt><dd>${L(p.built)}</dd>
              <dt>${ui('myRole')}</dt><dd>${T(p.role)}</dd>
              <dt>${ui('tradeoff')}</dt><dd>${T(p.tradeoff)}</dd>
              <dt>${ui('tools')}</dt><dd>${p.stack}</dd>
            </dl>
          </fieldset>
          ${next(['projects', dos('back')], ...C.projects.filter((x) => x !== p).slice(0, 2).map((x) => [`open ${x.slug}`, x.file + '.TXT']))}`;
      },

      skills: () => `
        <fieldset class="box"><legend> SKILLS.TXT </legend>
          <dl class="kv">${C.skills.map((g) => `<dt>${L(g.name)}</dt><dd>${g.items.map(L).join(' · ')}</dd>`).join('')}</dl>
        </fieldset>
        <p class="dim">${dos('skillsRem')} ${btn('projects', 'PROJECTS')}</p>`,

      education: () => `
        <fieldset class="box"><legend> EDUCATIO.TXT </legend>
          <dl class="kv">
            ${C.education.map((e) => `<dt>${e.period}</dt><dd>${L(e.title)}<br><span class="dim">${T(e.org)}</span></dd>`).join('')}
            ${C.languages.map((l) => `<dt>${L(l.name)}</dt><dd>${L(l.level)}</dd>`).join('')}
          </dl>
        </fieldset>`,

      about: () => `
        <fieldset class="box"><legend> ABOUT.TXT </legend>
          <p class="w">${L(C.about.title)}</p><p>${T(C.about.text)}</p><div class="blank"></div>
          <dl class="kv"><dt>${ui('atWork')}</dt><dd>${L(C.about.work).join(' · ')}</dd><dt>${ui('offWork')}</dt><dd>${L(C.about.life).join(' · ')}</dd></dl>
        </fieldset>`,

      contact: () => `
        <fieldset class="box hl"><legend> CONTACT.TXT </legend>
          <p class="w">${L(C.contact.title)}</p><div class="blank"></div>
          <dl class="kv">${C.contact.items.map((c) => `<dt>${L(c.label)}</dt><dd>${T(c.value)}</dd>`).join('')}</dl>
        </fieldset>`,

      ver: () => `<p class="w">${dos('ver')}</p><p class="dim">${dos('credits')}</p>`,

      dir: ([arg]) => {
        const target = arg ? normDir(arg) : state.cwd;
        const list = DIRS[target];
        if (!list) return `<p class="err">${dos('dirNotFound')}: ${esc(arg)}</p>`;
        const now = new Date();
        const date = now.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const time = now.toLocaleTimeString(lang === 'es' ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const files = list.filter((f) => !f.dir);
        const sizes = new Map(files.map((f) => [f, byteSize(f.cmd)]));
        const total = [...sizes.values()].reduce((a, b) => a + b, 0);
        const rows = list.map((f) => {
          const size = f.dir ? '<DIR>'.padEnd(10) : fmtNum(sizes.get(f)).padStart(10);
          return `<button class="dir-row listing" data-cmd="${f.dir ? `cd ${f.name.toLowerCase()}` : f.cmd}">${esc(`${f.name.padEnd(8)} ${(f.ext || '').padEnd(3)}  ${size}  ${date}  ${time}`)}</button>`;
        });
        const parent = target ? `<button class="dir-row listing" data-cmd="cd ..">${esc('..'.padEnd(14) + '<DIR>')}</button>` : '';
        const dirCount = list.filter((f) => f.dir).length + (target ? 1 : 0);
        return `<div class="listing">${dos('volume')}\n${dos('dirOf')} C:\\ARTI${target ? '\\' + target : ''}\n\n</div>${parent}${rows.join('')}<div class="listing">${String(files.length).padStart(9)} ${dos('files')}  ${fmtNum(total).padStart(10)} bytes\n${String(dirCount).padStart(9)} ${dos('dirs')}</div>`;
      },

      cd: ([arg]) => {
        if (!arg) return `<p>${esc(promptText().slice(0, -1))}</p>`;
        const a = arg.toUpperCase();
        if (a === '..' || a === '\\' || a === '\\ARTI') { state.cwd = ''; return ''; }
        const d = normDir(a);
        if (d && DIRS[d]) { state.cwd = d; return ''; }
        return `<p class="err">${dos('invalidDir')}</p>`;
      },

      type: ([arg]) => {
        if (!arg) return `<p class="err">${dos('missingParam', { x: 'type experien.txt' })}</p>`;
        const f = findFile(arg);
        if (!f) return `<p class="err">${dos('fileNotFound')}: ${esc(arg.toUpperCase())}</p>`;
        if (f.dir) return `<p class="err">${dos('isDir', { x: f.name, y: f.name.toLowerCase() })}</p>`;
        if (f.ext === 'EXE') return `<p class="err">${dos('isExe', { x: `${f.name}.EXE`, y: f.name.toLowerCase() })}</p>${next([f.cmd])}`;
        const [n, ...a] = f.cmd.split(' ');
        return COMMANDS[n](a);
      },

      color: ([code]) => {
        if (!code) { screen.style.removeProperty('--dos-bg'); screen.style.removeProperty('--dos-fg'); return ''; }
        const m = /^([0-9a-f])([0-9a-f])$/i.exec(code);
        if (!m) return `<p class="err">${dos('colorUsage')}</p>`;
        if (m[1].toUpperCase() === m[2].toUpperCase()) return `<p class="err">${dos('colorSame')}</p>`;
        screen.style.setProperty('--dos-bg', `var(--c${m[1].toUpperCase()})`);
        screen.style.setProperty('--dos-fg', `var(--c${m[2].toUpperCase()})`);
        return '';
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
      proyectos: 'projects', ls: 'dir', abrir: 'open', educacion: 'education', 'educación': 'education', acerca: 'about', sobremi: 'about',
      contacto: 'contact', clear: 'cls', cat: 'type', quiensoy: 'whoami', salir: 'exit', idioma: 'lang', gui: 'easy', sencilla: 'easy',
    };
    const ALL = [...Object.keys(COMMANDS), 'cls', 'exit'];

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
    function print(promptStr, cmdText, html, { reveal = true } = {}) {
      const entry = h('section', 'entry');
      entry.append(h('div', 'cmdline', promptStr + cmdText));
      if (html) { const out = h('div', reveal && !reduce ? 'out reveal' : 'out'); out.append(frag(html)); entry.append(out); }
      log.append(entry);
      return entry;
    }
    function scrollToEntry(entry) {
      const top = entry.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop - 6;
      screen.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    }
    function setActive(name) { $$('[data-nav]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.nav === name))); }

    function execute(raw) {
      const text = raw.trim();
      const before = promptText();
      if (text) state.history.push(text);
      state.hIdx = state.history.length;
      if (!text) { print(before, '', ''); ps1.textContent = promptText(); return; }
      const [head, ...args] = text.split(/\s+/);
      const name = ALIASES[head.toLowerCase()] || head.toLowerCase();
      if (name === 'cls') { log.replaceChildren(); setActive(null); return; }
      if (name === 'exit') { print(before, text, ''); if (isMobile()) Phone.back(); else WM.close('term'); return; }

      let html;
      if (COMMANDS[name]) html = COMMANDS[name](args);
      else {
        const file = findFile(head);
        if (file && !file.dir) { const [n, ...a] = file.cmd.split(' '); html = COMMANDS[n](a); }
        else {
          const guess = closest(name);
          html = `<p class="err">${dos('badCmd')}</p>${guess ? next([guess, dos('didYouMean', { x: guess.toUpperCase() })]) : next(['help', dos('seeHelp')])}`;
        }
      }
      const entry = print(before, text, html);
      ps1.textContent = promptText();
      const s = SECTIONS.find((x) => x.cmd === name);
      if (s) state.lastSection = s.cmd;
      setActive(s ? s.cmd : name === 'open' ? 'projects' : null);
      scrollToEntry(entry);
    }

    async function typeAndRun(cmd) {
      if (state.busy) return;
      state.busy = true; state.skip = false;
      input.value = '';
      for (const ch of cmd) {
        input.value += ch; input.setSelectionRange(input.value.length, input.value.length); renderMirror();
        if (!reduce && !state.skip) await sleep(26 + Math.random() * 34);
      }
      if (!reduce && !state.skip) await sleep(140);
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
          type: () => (DIRS[state.cwd] || []).filter((f) => !f.dir).map((f) => `${f.name}.${f.ext}`.toLowerCase()),
          lang: () => LANGS,
        };
        const names = ARGS[verb] ? ARGS[verb]() : [];
        pool = names.map((n) => v.slice(0, sp + 1) + n);
      } else pool = ALL;
      const hits = pool.filter((c) => c.toLowerCase().startsWith(low));
      if (hits.length === 1) input.value = hits[0];
      else if (hits.length > 1) {
        const prefix = hits.reduce((a, b) => { let i = 0; while (i < a.length && a[i].toLowerCase() === b[i]?.toLowerCase()) i++; return a.slice(0, i); });
        if (prefix.length > v.length) input.value = prefix;
        else print(promptText(), v, `<div class="next">${hits.map((x) => btn(x, esc(x.split(' ').pop()), 'run bare')).join('')}</div>`, { reveal: false });
      }
      input.setSelectionRange(input.value.length, input.value.length);
      renderMirror();
    }

    function printBoot() {
      const b = h('div', 'boot');
      const hint = dos(isMobile() ? 'bootHintMobile' : 'bootHint', { help: btn('help', 'HELP') });
      b.append(frag(`<p class="w">${dos('ver')}</p><p>(C) ${C.profile.name} ${new Date().getFullYear()}.</p><div class="blank"></div><p>${hint}</p><p class="g">${dos('notTech')} ${goBtn('overview', ui('easyView'))}</p>`));
      log.append(b);
      renderMirror();
    }

    async function boot() {
      if (state.booted) return;
      state.booted = true;
      printBoot();
      if (!isMobile()) input.focus({ preventScroll: true });
      if (!reduce) await sleep(600);
      await typeAndRun('whoami');
    }

    /* public: run a command from anywhere (icons, start menu, chips) */
    async function run(cmd) {
      if (isMobile()) { if (location.hash !== '#terminal') navigate('terminal'); }
      else await WM.open('term');
      if (!state.booted) { state.booted = true; printBoot(); }
      typeAndRun(cmd);
    }

    function relang() {
      if (!state.booted) return;
      log.replaceChildren();
      printBoot();
      if (state.lastSection) execute(state.lastSection);
    }
    function reset() { log.replaceChildren(); state.cwd = ''; state.booted = false; state.lastSection = null; ps1.textContent = promptText(); }

    input.addEventListener('keydown', (e) => {
      if (state.busy) { if (e.key === 'Escape') state.skip = true; e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; execute(v); renderMirror(); }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (state.hIdx === state.history.length) state.draft = input.value; if (state.hIdx > 0) input.value = state.history[--state.hIdx]; renderMirror(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (state.hIdx < state.history.length) { state.hIdx++; input.value = state.history[state.hIdx] ?? state.draft; } renderMirror(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); execute('cls'); }
      requestAnimationFrame(renderMirror);
    });
    ['input', 'select', 'click', 'keyup'].forEach((ev) => input.addEventListener(ev, renderMirror));
    input.addEventListener('focus', () => field.classList.add('focused'));
    input.addEventListener('blur', () => field.classList.remove('focused'));
    screen.addEventListener('click', (e) => { if (!e.target.closest('button') && !String(getSelection()).length) input.focus({ preventScroll: true }); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') state.skip = true; });

    return { boot, run, relang, reset, setActive, isBooted: () => state.booted };
  })();
  WM.onFirstOpen('term', () => Terminal.boot());

  /* ═════════ mobile phone shell ═════════ */
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
      const appBtn = (a) => `<li><button class="app" data-app="${a.id}" data-go="${a.id}"><span class="tile">${svg(a.icon, '')}</span><span>${a.label}</span></button></li>`;
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
        return;
      }
      currentId = '';
      hideEl(page); hideEl(termPage);
    }
    function back() {
      if (navN > 0) history.back();
      else { history.replaceState({ n: 0 }, '', location.pathname + location.search); show(''); }
    }
    /* the nav bar already shows the section name; hide the page heading when it just repeats it */
    function markDuplicateTitle() {
      const h1 = $('#mpageBody .doc > h1');
      if (h1 && h1.textContent.trim() === $('#mpageTitle').textContent.trim()) h1.classList.add('dup');
    }
    function rerender() {
      if (!isMobile() || !sec(currentId)) return;
      $('#mpageTitle').textContent = L(sec(currentId).label);
      $('#mpageBody').replaceChildren(frag(renderDoc(currentId)));
      markDuplicateTitle();
    }
    return { renderHome, show, back, rerender };
  })();

  /* ═════════ desktop chrome: icons, toolbar, start menu, chips ═════════ */
  function buildIcons() {
    const items = [
      { key: 'easy', label: ui('easyView'), icon: 'ic-profile', act: () => go('overview') },
      { key: 'term', label: ui('terminal'), icon: 'ic-term', act: () => go('terminal') },
      ...SECTIONS.slice(1).map((s) => ({ key: s.id, label: L(s.label), icon: s.icon, act: () => openSection(s) })),
    ];
    const icons = $('#icons');
    icons.replaceChildren(...items.map((it) => {
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

  function buildToolbar() {
    const tb = $('#termToolbar');
    const val = $('#fontSize')?.value || '16';
    const cmds = SECTIONS.map((s) => `<button class="tool" data-cmd="${s.cmd}" data-nav="${s.cmd}" title="${s.cmd}">${svg(s.icon)}<span>${L(s.label)}</span></button>`).join('');
    tb.replaceChildren(frag(`
      <label class="fontsel">${ui('font')}
        <select id="fontSize" aria-label="${esc(ui('fontSize'))}">${[14, 16, 20, 24, 32].map((n) => `<option value="${n}"${String(n) === val ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <button class="tool cta" data-go="overview">${svg('ic-profile')}<span>${ui('easyView')}</span></button>
      <button class="tool" data-lang-toggle title="${esc(ui('switchLangHint'))}">${svg('ic-globe')}<span>${ui('langCode')}</span></button>
      <span class="sep" aria-hidden="true"></span>${cmds}
      <span class="sep" aria-hidden="true"></span>
      <button class="tool" data-cmd="cls" title="${esc(ui('clear'))}" aria-label="${esc(ui('clear'))}">${svg('ic-clear')}</button>
      <button class="tool" data-cmd="help" title="${esc(ui('help'))}" aria-label="${esc(ui('help'))}">${svg('ic-help')}</button>`));
    $('#fontSize').addEventListener('change', (e) => { $('#screen').style.setProperty('--term-size', e.target.value + 'px'); $('#cmd').focus({ preventScroll: true }); });
  }

  function buildChips() {
    $('#chipsBar').replaceChildren(frag(
      SECTIONS.map((s) => `<button class="chip" data-cmd="${s.cmd}">${s.cmd}</button>`).join('')
      + `<button class="chip" data-cmd="help">help</button><button class="chip" data-cmd="cls">cls</button><button class="chip cta" data-go="overview">${ui('easyView')}</button>`));
  }

  const Menu = (() => {
    const menu = $('#startmenu'), start = $('#start');
    const close = () => { menu.hidden = true; start.setAttribute('aria-expanded', 'false'); };
    const open = () => { menu.hidden = false; start.setAttribute('aria-expanded', 'true'); $('.mi', menu)?.focus(); };
    start.addEventListener('click', () => (menu.hidden ? open() : close()));
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#startmenu, #start')) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { close(); start.focus(); }
      if (!menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const all = $$('.mi', menu), i = all.indexOf(document.activeElement);
        all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
      }
    });
    return { close };
  })();
  function buildMenu() {
    const list = $('#menuList');
    const item = (icon, label, desc, act) => {
      const li = h('li'); li.setAttribute('role', 'none');
      const b = h('button', 'mi'); b.setAttribute('role', 'menuitem');
      b.append(frag(svg(icon)));
      const t = h('span', null, label); if (desc) t.append(h('small', null, desc));
      b.append(t);
      b.addEventListener('click', () => { Menu.close(); act(); });
      li.append(b); return li;
    };
    const rule = () => { const li = h('li', 'rule'); li.setAttribute('role', 'separator'); return li; };
    list.replaceChildren(
      ...SECTIONS.map((s) => item(s.icon, L(s.label), L(s.desc), () => openSection(s))),
      rule(),
      item('ic-profile', ui('easyView'), null, () => go('overview')),
      item('ic-term', ui('terminal'), null, () => go('terminal')),
      item('ic-globe', ui('language'), ui('switchLang'), () => setLang(lang === 'en' ? 'es' : 'en')),
      rule(),
      item('ic-help', ui('help'), null, () => Terminal.run('help')),
      item('ic-power', ui('shutDown'), null, () => Shutdown.show()),
    );
  }

  /* ═════════ balloon tip: offers Easy view to non-technical visitors ═════════ */
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

  /* ═════════ shutdown easter egg ═════════ */
  const Shutdown = (() => {
    const s = $('#shutdown');
    const wake = () => {
      if (s.hidden) return;
      s.hidden = true;
      Terminal.reset();
      WM.open('term').then(() => Terminal.boot());
    };
    s.addEventListener('click', wake);
    document.addEventListener('keydown', (e) => { if (!s.hidden) { e.preventDefault(); wake(); } }, true);
    return { show: () => { WM.close('term'); WM.close('easy'); Balloon.hide(false); s.hidden = false; s.focus(); } };
  })();

  /* ═════════ global clicks ═════════ */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const langT = t.closest('[data-lang-toggle]'); if (langT) { setLang(lang === 'en' ? 'es' : 'en'); return; }
    const langS = t.closest('[data-set-lang]'); if (langS) { setLang(langS.dataset.setLang); return; }
    if (t.closest('[data-mback]')) { Phone.back(); return; }
    const g = t.closest('[data-go]'); if (g) { Menu.close(); go(g.dataset.go); return; }
    const c = t.closest('[data-cmd]'); if (c) { Menu.close(); Terminal.run(c.dataset.cmd); }
  });

  /* ═════════ clock ═════════ */
  (function tick() {
    const now = new Date();
    $$('.clock').forEach((c) => { c.textContent = now.toLocaleTimeString(lang === 'es' ? 'es-MX' : 'en-US', { hour: 'numeric', minute: '2-digit' }); c.dateTime = now.toISOString(); });
    setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  })();

  /* ═════════ layout: desktop ⇄ mobile ═════════ */
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

  /* --------- ambient: bubbles, wallpaper parallax, pointer-following glass highlight --------- */
  (() => {
    const fx = $('#fx');
    function spawnBubbles() {
      const count = isMobile() ? 5 : 10;
      fx.replaceChildren(...Array.from({ length: count }, (_, i) => {
        const b = h('span', 'bubble');
        const size = 26 + Math.round(Math.random() * 64);
        b.style.setProperty('--x', `${Math.round((i + Math.random()) * (100 / count))}%`);
        b.style.setProperty('--s', `${size}px`);
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

  /* ═════════ start ═════════ */
  applyStatic();
  buildIcons(); buildToolbar(); buildMenu(); buildChips(); Phone.renderHome();
  document.fonts.ready.then(applyLayout);
})();
