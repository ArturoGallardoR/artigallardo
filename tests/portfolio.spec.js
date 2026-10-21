// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const SITE = pathToFileURL(path.resolve(__dirname, '../site/index.html')).href;
/** @param {import('@playwright/test').Page} page @param {string} [query] @param {string} [hash] */
const open = (page, query = '', hash = '') => page.goto(`${SITE}${query}${hash}`);
/** @param {import('@playwright/test').Page} page */
const activeTab = (page) => page.locator('.su-tab[aria-selected="true"]');
/** @param {import('@playwright/test').Page} page */
const selected = (page) => page.locator('.su-item[aria-selected="true"]');
/** @param {import('@playwright/test').Page} page */
const detail = (page) => page.locator('.su-detail');

test.describe('language', () => {
  test('defaults to English, switches to Spanish and remembers it after reload', async ({ page }) => {
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#start')).toHaveAttribute('aria-label', 'Start');

    await page.locator('.traylang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#start')).toHaveAttribute('aria-label', 'Inicio');
    expect(new URL(page.url()).searchParams.get('lang')).toBe('es');

    await page.goto(SITE); // no query: preference must come from storage
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(activeTab(page)).toHaveText('Principal');
  });

  test('a shared ?view=easy&lang=es link opens the Easy view in Spanish', async ({ page }) => {
    await open(page, '?view=easy&lang=es');
    await expect(page.locator('#winEasy')).toBeVisible();
    await expect(page.locator('#winTerm')).toBeHidden();
    await expect(page.locator('.navitem[aria-current="page"]')).toHaveText('Resumen');
    await expect(page.locator('#easyPane h2').first()).toHaveText('Logros destacados');
  });
});

test.describe('non-technical visitor (desktop)', () => {
  test('is offered the Easy view and can read sections without typing commands', async ({ page }) => {
    await open(page);
    const balloon = page.locator('#balloon');
    await expect(balloon).toBeVisible();
    await balloon.getByRole('button', { name: 'Open Easy view' }).click();

    await expect(page.locator('#winEasy')).toBeVisible();
    await expect(balloon).toBeHidden();

    await page.locator('.navitem', { hasText: 'Projects' }).click();
    await expect(page.locator('#easyPane h1')).toHaveText('Projects');
    await expect(page.locator('#easyPane .result-pill').first()).toBeVisible();

    await page.locator('.navitem', { hasText: 'Experience' }).click();
    await expect(page.locator('#easyPane h1')).toHaveText('Experience');

    await page.goBack();
    await expect(page.locator('#easyPane h1')).toHaveText('Projects');
    await expect(page.locator('#crumbs')).toContainText('Projects');
  });

  test('remembers the Easy view as the starting view and does not nag again', async ({ page }) => {
    await open(page);
    await page.locator('#balloon').getByRole('button', { name: 'Open Easy view' }).click();
    await page.goto(SITE);
    await expect(page.locator('#winEasy')).toBeVisible();
    await expect(page.locator('#balloon')).toBeHidden();
  });

  test('desktop icons open sections in the Easy view once that is the chosen mode', async ({ page }) => {
    await open(page, '?view=easy');
    await page.locator('.icon', { hasText: 'Skills' }).dblclick();
    await expect(page.locator('#easyPane h1')).toHaveText('Skills');
  });

  test('Easy view search finds a project by a tool name and jumps to it', async ({ page }) => {
    await open(page, '?view=easy');
    await page.locator('#easySearch').fill('ninjaone');
    const hit = page.locator('#easyPane .hit', { hasText: 'Device management' });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page.locator('#easyPane h1')).toHaveText('Projects');
    await expect(page.locator('#p-endpoints details')).toHaveAttribute('open', '');
  });

  test('Contact links the CV PDF in the visitor\'s language, and that file is published', async ({ page }) => {
    const fs = require('fs');
    const cvHref = async (/** @type {string} */ lang) => {
      await open(page, `?view=easy&lang=${lang}`, '#contact');
      const href = await page.locator('#easyPane .contact-list a[href$=".pdf"]').getAttribute('href');
      if (!href) throw new Error(`no CV link in ${lang}`);
      expect(fs.existsSync(path.resolve(__dirname, '../site', href)), `${href} exists under site/`).toBe(true);
      return href;
    };
    expect(await cvHref('en')).toMatch(/_EN\.pdf$/);
    expect(await cvHref('es')).toMatch(/_ES\.pdf$/);
  });

  test('a project shows who used it and what changed, and links its public presentation safely', async ({ page }) => {
    await open(page, '?view=easy', '#projects');
    const mcp = page.locator('#p-odoomcp');
    await mcp.locator('summary').click();
    await expect(mcp).toContainText('Who used it');
    await expect(mcp).toContainText('about 70 people');
    const link = mcp.getByRole('link', { name: 'odoo.121corp.xyz' });
    await expect(link).toHaveAttribute('href', 'https://odoo.121corp.xyz/');
    await expect(link).toHaveAttribute('rel', 'noopener');

    const tickets = page.locator('#p-tickets');
    await tickets.locator('summary').click();
    await expect(tickets).toContainText('What changed');
    await expect(tickets.getByRole('link')).toHaveCount(0);
  });

  test('Easy view search treats typed text as text, never as HTML', async ({ page }) => {
    await open(page, '?view=easy');
    await page.locator('#easySearch').fill('<img src=x onerror=window.__pwned=1>');
    await expect(page.locator('#easyPane')).toContainText('<img src=x');
    expect(await page.locator('#easyPane img').count()).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
  });

  test('Start menu search opens a project (in the Setup Utility for terminal-mode visitors)', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.locator('#start').click();
    await page.locator('#smSearch').fill('mcp');
    await expect(page.locator('#smList .smi').first()).toContainText('Odoo MCP server');
    await page.locator('#smSearch').press('Enter');
    await expect(page.locator('#startmenu')).toBeHidden();
    await expect(activeTab(page)).toHaveText('Projects');
    await expect(detail(page)).toContainText('Odoo MCP server');
  });
});

test.describe('icon sprite', () => {
  test('every icon, gradient, clip path and mask the page references exists in the sprite', async ({ page }) => {
    await open(page, '?view=easy');
    await expect(page.locator('#winEasy')).toBeVisible();
    await page.locator('#start').click(); // Start menu renders its icons on demand
    const missing = await page.evaluate(() => {
      const refs = new Set();
      document.querySelectorAll('use').forEach((u) => refs.add((u.getAttribute('href') || '').slice(1)));
      document.querySelectorAll('[fill^="url(#"], [stroke^="url(#"], [clip-path^="url(#"], [mask^="url(#"]').forEach((el) => {
        ['fill', 'stroke', 'clip-path', 'mask'].forEach((a) => { const m = /^url\(#([^)]+)\)/.exec(el.getAttribute(a) || ''); if (m) refs.add(m[1]); });
      });
      return [...refs].filter((id) => !document.getElementById(id));
    });
    expect(missing).toEqual([]);
  });
});

test.describe('wallpaper', () => {
  test('loads a file at least as wide as the screen in device pixels and stays still when the mouse moves', async ({ page }) => {
    await page.setViewportSize({ width: 2200, height: 1000 }); // wider than the 1920 file: must not be upscaled
    await open(page, '?view=easy');
    const img = page.locator('.wall img');
    await expect(img).toHaveJSProperty('complete', true);
    const fileWidth = await img.evaluate((el) => new Promise((done) => {
      const probe = new Image(); // naturalWidth of the <img> is density-corrected, so measure the chosen file itself
      probe.onload = () => done(probe.naturalWidth);
      probe.src = /** @type {HTMLImageElement} */ (el).currentSrc;
    }));
    expect(fileWidth).toBeGreaterThanOrEqual(2200);
    const box = () => img.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const before = await box();
    await page.mouse.move(20, 20);
    await page.mouse.move(2180, 980, { steps: 5 });
    await page.waitForTimeout(800); // longer than any transition that could move it
    expect(await box()).toEqual(before);
  });
});

test.describe('terminal: command prompt running the Setup Utility', () => {
  test('opens as a command prompt that types setup and launches the menus', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .cmdline').first()).toHaveText('C:\\Users\\Arti>setup');
    await expect(page.locator('#setup')).toBeVisible();
    await expect(page.locator('#termTitle')).toHaveText('ArtiOS Terminal - setup');
    await expect(activeTab(page)).toHaveText('Main');
    await expect(selected(page)).toHaveText('Profile');
  });

  test('keyboard: arrows move between menus and items, Enter opens details, Esc goes back', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toHaveText('Profile');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(activeTab(page)).toHaveText('Projects');
    await page.keyboard.press('ArrowDown'); // third project in content.js order
    await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toHaveText('Corporate email signature generator');
    await expect(page.locator('#suHelp')).toContainText('on-brand email signature');

    await page.keyboard.press('Enter');
    await expect(detail(page)).toContainText('Up to 1 week');
    await expect(detail(page)).toContainText('Google Sheets');
    await page.keyboard.press('Escape');
    await expect(selected(page)).toHaveText('Corporate email signature generator');
  });

  test('mouse: pointing moves the red bar and a click opens the item', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.locator('.su-tab', { hasText: 'Skills' }).click();
    const item = page.locator('.su-item', { hasText: 'Applied AI' });
    await item.hover();
    await expect(item).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#suHelp')).toContainText('real business data');
    await item.click();
    await expect(detail(page)).toContainText('Claude Code');
    await page.locator('.su-back').click();
    await expect(page.locator('.su-list')).toBeVisible();
  });

  test('Esc on a menu exits to the prompt, where commands work and setup comes back', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#setup')).toBeHidden();
    await expect(page.locator('#termTitle')).toHaveText('ArtiOS Terminal');
    await expect(page.locator('#cmd')).toBeFocused();

    const last = page.locator('#log .entry').last();
    await page.keyboard.type('skils');
    await page.keyboard.press('Enter');
    await expect(last).toContainText('Did you mean skills?');

    await page.keyboard.type('cd projects');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ps1')).toHaveText('C:\\Users\\Arti\\Projects>');
    await page.keyboard.type('type signatures.txt');
    await page.keyboard.press('Enter');
    await expect(last).toContainText('Corporate email signature generator');

    await page.keyboard.type('setup skills');
    await page.keyboard.press('Enter');
    await expect(page.locator('#setup')).toBeVisible();
    await expect(activeTab(page)).toHaveText('Skills');
  });

  test('dir lists files without launching setup.exe', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.type('dir');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .entry').last()).toContainText('setup.exe');
    await expect(page.locator('#setup')).toBeHidden();
  });

  test('typed text is rendered as text, never as HTML', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.type('<img src=x onerror=window.__pwned=1>');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .entry').last()).toContainText('<img src=x');
    expect(await page.locator('#log img').count()).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
  });

  test('F10 and F1 work while Setup runs, and the Exit menu leads to the prompt or the Easy view', async ({ page }) => {
    await open(page);
    await expect(selected(page)).toBeVisible();
    await page.keyboard.press('F10');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(activeTab(page)).toHaveText('Principal');
    await page.keyboard.press('F1');
    await expect(detail(page)).toContainText('Teclado y mouse');
    await page.keyboard.press('Escape');

    await page.locator('.su-tab', { hasText: 'Salir' }).click();
    await page.locator('.su-item', { hasText: 'Salir a la línea de comandos' }).click();
    await expect(page.locator('#setup')).toBeHidden();
    await page.locator('#log .run', { hasText: 'setup' }).last().click();
    await expect(page.locator('#setup')).toBeVisible();

    await page.locator('.su-tab', { hasText: 'Salir' }).click();
    await page.locator('.su-item', { hasText: 'Abrir vista sencilla' }).click();
    await expect(page.locator('#winEasy')).toBeVisible();
  });
});

test.describe('mobile @mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('ag.unlocked', '1'));
  });

  test('shows a phone home screen instead of desktop windows', async ({ page }) => {
    await open(page);
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#winTerm')).toBeHidden();
    await expect(page.locator('#taskbar')).toBeHidden();
    await expect(page.locator('#homeCard h1')).toHaveText('Arti Gallardo');
  });

  test('opens a section page and the browser Back button returns home', async ({ page }) => {
    await open(page);
    await page.locator('.app', { hasText: 'Experience' }).tap();
    await expect(page.locator('#mpage')).toBeVisible();
    await expect(page.locator('#mpageTitle')).toHaveText('Experience');

    await page.goBack();
    await expect(page.locator('#mpage')).toBeHidden();
    await expect(page.locator('#home')).toBeVisible();
  });

  test('Back names the previous page and the Home button jumps straight to the springboard', async ({ page }) => {
    await open(page);
    await page.locator('.app', { hasText: 'Overview' }).tap();
    await expect(page.locator('#mpage .backbtn')).toHaveText('Home');
    await page.locator('#mpage .next-sec .btn').tap();
    await expect(page.locator('#mpageTitle')).toHaveText('Experience');
    await expect(page.locator('#mpage .backbtn')).toHaveText('Overview');
    await page.locator('#mpage .next-sec .btn').tap();
    await expect(page.locator('#mpageTitle')).toHaveText('Projects');

    await page.locator('#mpage .homebtn').tap();
    await expect(page.locator('#mpage')).toBeHidden();
    await expect(page.locator('#home')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('Home works from a deep link and from the terminal app', async ({ page }) => {
    await open(page, '', '#skills');
    await page.locator('#mpage .homebtn').tap();
    await expect(page.locator('#mpage')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');

    await page.locator('.app', { hasText: 'Terminal' }).tap();
    await expect(page.locator('#mterm')).toBeVisible();
    await page.locator('#mterm .homebtn').tap();
    await expect(page.locator('#mterm')).toBeHidden();
    await expect(page.locator('#home')).toBeVisible();
  });

  test('a deep link opens that section directly and the in-app Back button goes home', async ({ page }) => {
    await open(page, '', '#projects');
    await expect(page.locator('#mpageTitle')).toHaveText('Projects');
    await page.locator('#mpage [data-mback]').tap();
    await expect(page.locator('#mpage')).toBeHidden();
  });

  test('terminal app launches the Setup Utility and opens items by tapping', async ({ page }) => {
    await open(page);
    await page.locator('.app', { hasText: 'Terminal' }).tap();
    await expect(page.locator('#mterm')).toBeVisible();
    await expect(page.locator('#mterm .su-tab').first()).toBeVisible();
    await page.locator('#mterm .su-tab', { hasText: 'Projects' }).tap();
    await page.locator('#mterm .su-item', { hasText: 'Device management' }).tap();
    await expect(page.locator('#mterm .su-detail')).toContainText('NinjaOne');
  });

  test('terminal app fits the phone width (no panel overflows the screen)', async ({ page }) => {
    await open(page, '', '#terminal');
    await expect(page.locator('#mterm .su-item').first()).toBeVisible();
    /* measure only after the iOS push transition, which slides the page in from the right */
    await page.waitForFunction(() => document.querySelector('#mterm')?.getAnimations().every((a) => a.playState !== 'running'));
    const vw = await page.evaluate(() => innerWidth);
    for (const sel of ['#mterm .su-tabs', '#mterm .su-left', '#mterm .su-help']) {
      const box = await page.locator(sel).boundingBox();
      /* 1px tolerance for sub-pixel layout; real overflows (like the 25px one this guards against) still fail */
      expect(box && box.x + box.width, sel).toBeLessThanOrEqual(vw + 1);
    }
  });

  test('language toggle in the status bar switches to Spanish', async ({ page }) => {
    await open(page);
    await page.locator('[data-set-lang="es"]').tap();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#homeCard .btn.green')).toHaveText('Ver currículum');
    await expect(page.locator('.app', { hasText: 'Experiencia' })).toBeVisible();
  });
});

test.describe('mobile lock screen @mobile', () => {
  test('slide to unlock reveals the home screen and is not shown again this session', async ({ page }) => {
    await open(page);
    const lock = page.locator('#lock');
    await expect(lock).toBeVisible();

    const knob = await page.locator('#knob').boundingBox();
    const slider = await page.locator('#slider').boundingBox();
    if (!knob || !slider) throw new Error('lock slider not rendered');
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(slider.x + slider.width - 10, knob.y + knob.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(lock).toBeHidden();

    await page.reload();
    await expect(page.locator('#lock')).toBeHidden();
  });

  test('a short drag springs back instead of unlocking', async ({ page }) => {
    await open(page);
    const knob = await page.locator('#knob').boundingBox();
    if (!knob) throw new Error('lock slider not rendered');
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(knob.x + knob.width / 2 + 40, knob.y + knob.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#lock')).toBeVisible();
  });

  test('deep links skip the lock screen', async ({ page }) => {
    await open(page, '', '#contact');
    await expect(page.locator('#lock')).toBeHidden();
    await expect(page.locator('#mpageTitle')).toHaveText('Contact');
  });
});
