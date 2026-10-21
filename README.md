# artigallardo

Portfolio of **Arti Gallardo** (IT & Automation Engineer / AI Systems): a Windows 7 Aero desktop (Frutiger Aero) with a text-mode terminal, an Explorer-style Easy view and an early-iPhone mobile shell.

**Live:** https://arturogallardor.github.io/artigallardo/

## Three ways to explore

| View | For | How to open |
|---|---|---|
| **Terminal** (desktop) | Technical visitors | Default. A cmd.exe-style prompt (`C:\Users\Arti>`, #0000AA, Inconsolata) that types `setup` and runs the BIOS-style *Setup Utility* full-screen: menu tabs, red selection bar, "Item Specific Help" in plain words. Esc or *Exit → Exit to command prompt* returns to the shell: `help`, `whoami`, `projects`, `open <project>`, `dir`, `cd`, `type`, `setup [section]`, `lang en/es`, `easy`, `cls`, `exit`. F1 help, F10 language; every command is also clickable. |
| **Easy view** (desktop) | Recruiters and non-technical visitors | Windows 7 Explorer window: notification balloon, desktop icon, superbar button, Start menu, or the link `?view=easy`. Plain-language résumé with search box and details pane. |
| **Phone** (< 820px) | Mobile visitors | Automatic. Early-iPhone shell: slide to unlock (once per session, skipped for deep links), springboard, glass dock, full-screen pages; browser Back works. Terminal is one of the apps. |

Language: English by default, Spanish with the **EN/ES** controls or `?lang=es`. Both choices are remembered.

Shareable links: `…/artigallardo/?view=easy&lang=es`, `…/artigallardo/#projects`.

## Structure

| Path | What |
|---|---|
| `site/js/content.js` | **All content, both languages.** Edit this file to update the CV data. |
| `site/js/app.js` | Window manager (Aero Peek, animations), superbar, Start menu search, terminal (command prompt + Setup Utility), Easy view, clock gadget, phone shell and lock screen, routing, i18n. |
| `site/css/aero.css` | Styles for desktop and mobile. |
| `site/index.html` | Markup shell and SVG icon sprite. |
| `site/assets/` | Wallpaper (WebP), self-hosted fonts and the downloadable CV PDFs (`cv/`, EN and ES). |
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
- **Inconsolata** — SIL Open Font License 1.1, subset to the glyphs this site uses (`site/assets/fonts/Inconsolata-OFL.txt`).
- Custom SVG skeuomorphic Frutiger Aero icons (glossy, free-standing objects; one sprite per icon at every size).
- AI-generated wallpaper, upscaled 4x with Real-ESRGAN (`RealESRGAN_x4plus`) and recombined with the original's low frequencies so colours and soft light rays stay true: `wallpaper-1920`/`-2560`/`-3840` for desktop (picked by `srcset` from the real device-pixel width) and a dedicated `wallpaper-mobile` portrait crop (1728x3072). The wallpaper is static; only the bubbles move.
