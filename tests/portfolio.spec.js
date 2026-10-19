// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const SITE = pathToFileURL(path.resolve(__dirname, '../site/index.html')).href;
/** @param {import('@playwright/test').Page} page @param {string} [query] @param {string} [hash] */
const open = (page, query = '', hash = '') => page.goto(`${SITE}${query}${hash}`);

test.describe('language', () => {
  test('defaults to English, switches to Spanish and remembers it after reload', async ({ page }) => {
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#start')).toHaveText('Start');

    await page.locator('.traylang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#start')).toHaveText('Inicio');
    expect(new URL(page.url()).searchParams.get('lang')).toBe('es');

    await page.goto(SITE); // no query: preference must come from storage
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#winTerm .ttl')).toHaveText('Símbolo del sistema - ARTI');
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
});

test.describe('terminal', () => {
  test('boots with whoami, suggests the right command for a typo, and DOS navigation works', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .banner')).toBeVisible();
    const input = page.locator('#cmd');
    await input.focus();

    await page.keyboard.type('skils');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .entry').last()).toContainText('Did you mean SKILLS?');

    await page.keyboard.type('cd projects');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ps1')).toHaveText('C:\\ARTI\\PROJECTS>');
    await page.keyboard.type('type signatur.txt');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .entry').last().locator('legend')).toContainText('SIGNATUR.TXT');
  });

  test('renders typed text as text, never as HTML', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .banner')).toBeVisible();
    await page.locator('#cmd').focus();
    await page.keyboard.type('<img src=x onerror=window.__pwned=1>');
    await page.keyboard.press('Enter');
    await expect(page.locator('#log .entry').last()).toContainText('<img src=x');
    expect(await page.locator('#log img').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('lang command switches the whole interface', async ({ page }) => {
    await open(page);
    await expect(page.locator('#log .banner')).toBeVisible();
    await page.locator('#cmd').focus();
    await page.keyboard.type('lang es');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('[data-task="term"]')).toHaveText('Símbolo del sistema');
  });
});

test.describe('mobile @mobile', () => {
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
    await expect(page.locator('#mterm .banner')).toBeVisible();
    await page.locator('.chip', { hasText: 'skills' }).tap();
    await expect(page.locator('#log .entry').last().locator('legend')).toContainText('SKILLS.TXT');
  });

  test('language toggle in the status bar switches to Spanish', async ({ page }) => {
    await open(page);
    await page.locator('[data-set-lang="es"]').tap();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#homeCard .btn.green')).toHaveText('Ver currículum');
    await expect(page.locator('.app', { hasText: 'Experiencia' })).toBeVisible();
  });
});
