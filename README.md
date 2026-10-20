# artigallardo

Portfolio of **Arti Gallardo** (IT & Automation Engineer / AI Systems): a DOS terminal inside a Windows 98 desktop with a Frutiger Aero skin.

**Live:** https://arturogallardor.github.io/artigallardo/

## Three ways to explore

| View | For | How to open |
|---|---|---|
| **Terminal** (desktop) | Technical visitors | Default. Commands: `help`, `whoami`, `experience`, `projects`, `open <project>`, `skills`, `education`, `about`, `contact`, `dir`, `cd`, `type`, `color XY`, `lang en/es`, `easy`. |
| **Easy view** (desktop) | Recruiters and non-technical visitors | Balloon tip, *Easy view* desktop icon or toolbar button, Start menu, or the link `?view=easy`. Plain-language résumé, no commands. |
| **Phone** (< 820px) | Mobile visitors | Automatic. Home screen with apps per section; browser Back works. Terminal is one of the apps. |

Language: English by default, Spanish with the **EN/ES** controls or `?lang=es`. Both choices are remembered.

Shareable links: `…/artigallardo/?view=easy&lang=es`, `…/artigallardo/#projects`.

## Structure

| Path | What |
|---|---|
| `site/js/content.js` | **All content, both languages.** Edit this file to update the CV data. |
| `site/js/app.js` | Window manager, terminal, Easy view, phone shell, routing, i18n. |
| `site/css/aero.css` | Styles for desktop and mobile. |
| `site/index.html` | Markup shell and SVG icon sprite. |
| `site/assets/` | Wallpaper (WebP) and self-hosted fonts. |
| `tests/portfolio.spec.js` | Playwright tests (desktop + mobile). |
| `.github/workflows/pages.yml` | Runs the tests, then deploys `site/` to GitHub Pages on every push to `main`. |

## Develop

Open `site/index.html` directly in a browser (no build step).

```bash
npm ci
npx playwright install chromium
npm test
```

## Credits

- **Selawik** — Microsoft, SIL Open Font License 1.1 (`site/assets/fonts/Selawik-LICENSE.txt`).
- **WebPlus IBM VGA 8x16** — The Ultimate Oldschool PC Font Pack, VileR / int10h.org, CC BY-SA 4.0 (`site/assets/fonts/OldschoolPC-LICENSE.txt`).
- Custom SVG glass-orb icons (full size + small `-s` variants for toolbars and menus).
- AI-generated wallpaper, upscaled with EDSR super-resolution (OpenCV `dnn_superres`): `wallpaper-1920`/`-2752` for desktop (1x/2x) and a dedicated `wallpaper-mobile` portrait crop.
