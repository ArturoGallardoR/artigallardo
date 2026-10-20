// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const SITE = pathToFileURL(path.resolve(__dirname, '../site/index.html')).href;
/** @param {import('@playwright/test').Page} page @param {string} [query] @param {string} [hash] */
const open = (page, query = '', hash = '') => page.goto(`${SITE}${query}${hash}`);
/** @param {import('@playwright/test').Page} page */
const lastEntry = (page) => page.locator('#log .entry').last();

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
    await expect(page.locator('.tui-status')).toContainText('Idioma: ES');
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

  test('Start menu search opens a project (in the terminal for terminal-mode visitors)', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .monogram')).toBeVisible();
    await page.locator('#start').click();
    await page.locator('#smSearch').fill('mcp');
    await expect(page.locator('#smList .smi').first()).toContainText('Odoo MCP server');
    await page.locator('#smSearch').press('Enter');
    await expect(page.locator('#startmenu')).toBeHidden();
    await expect(lastEntry(page)).toContainText('Odoo MCP server');
  });
});

test.describe('terminal', () => {
  test('boots with whoami, suggests the right command for a typo, and file navigation works', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .monogram')).toBeVisible();
    await page.locator('#cmd').focus();

    await page.keyboard.type('skils');
    await page.keyboard.press('Enter');
    await expect(lastEntry(page)).toContainText('Did you mean skills?');

    await page.keyboard.type('cd projects');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ps1')).toHaveText('PS C:\\Users\\Arti\\Projects>');
    await page.keyboard.type('type signatures.txt');
    await page.keyboard.press('Enter');
    await expect(lastEntry(page)).toContainText('Corporate email signature generator');
  });

  test('sections panel runs a section and explains it in plain words', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .monogram')).toBeVisible();
    await page.locator('.tui-sec', { hasText: 'Skills' }).click();
    await expect(lastEntry(page).locator('.echo')).toHaveText('skills');
    await expect(page.locator('.tui-sec[aria-current="true"]')).toHaveText('Skills');
    await expect(page.locator('#tuiHelp')).toContainText('grouped by what they are for');
  });

  test('renders typed text as text, never as HTML', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .monogram')).toBeVisible();
    await page.locator('#cmd').focus();
    await page.keyboard.type('<img src=x onerror=window.__pwned=1>');
    await page.keyboard.press('Enter');
    await expect(lastEntry(page)).toContainText('<img src=x');
    expect(await page.locator('#log img').count()).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
  });

  test('lang command and F10 switch the whole interface', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .monogram')).toBeVisible();
    await page.locator('#cmd').focus();
    await page.keyboard.type('lang es');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.tui-status')).toContainText('Idioma: ES');

    await page.locator('#cmd').focus();
    await page.keyboard.press('F10');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
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

  test('a deep link opens that section directly and the in-app Back button goes home', async ({ page }) => {
    await open(page, '', '#projects');
    await expect(page.locator('#mpageTitle')).toHaveText('Projects');
    await page.locator('#mpage [data-mback]').tap();
    await expect(page.locator('#mpage')).toBeHidden();
  });

  test('terminal app runs commands from tappable chips', async ({ page }) => {
    await open(page);
    await page.locator('.app', { hasText: 'Terminal' }).tap();
    await expect(page.locator('#mterm')).toBeVisible();
    await expect(page.locator('#mterm .monogram')).toBeVisible();
    await page.locator('.chip', { hasText: 'skills' }).tap();
    await expect(lastEntry(page)).toContainText('Automation');
  });

  test('terminal app fits the phone width (no panel overflows the screen)', async ({ page }) => {
    await open(page, '', '#terminal');
    await expect(page.locator('#mterm .monogram')).toBeVisible();
    const vw = await page.evaluate(() => innerWidth);
    for (const sel of ['#mterm .tui-main', '#mterm .tui-input', '#mterm .tui-status']) {
      const box = await page.locator(sel).boundingBox();
      expect(box && box.x + box.width, sel).toBeLessThanOrEqual(vw);
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
