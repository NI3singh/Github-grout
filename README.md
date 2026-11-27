# GitHub Grout

GitHub Grout is a zero-dependency Manifest V3 extension that restyles only the spaces between GitHub contribution squares. It stores settings locally, makes no network requests, and never changes contribution counts, levels, square fills, tooltips, or interactions.

## Load unpacked

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project directory (the directory containing `manifest.json`).
4. Open or reload a GitHub profile and find the circular swatch beside the contribution graph's **Less / More** legend.
5. Use the swatch for the in-page editor, or click the GitHub Grout toolbar icon for the full fallback editor and the **Show in-page button** control.

If a profile is already open during installation, reload it so the document-start stylesheet and scripts are injected.

## Features

- Nine curated swatches and six grout styles: solid, metallic, glitter, holographic, neon, and terrazzo.
- Adjustable tile radius, shimmer, Chamkila micro-crystal sparkle, and optional independent light/dark profiles.
- Pure CSS and embedded SVG textures with reduced-motion support.
- Immediate synchronization between open GitHub tabs, the in-page editor, and the toolbar popup through `chrome.storage.local`.
- Native appearance restoration when the master toggle is disabled.

## State and privacy

All preferences live under the single `ghGroutSettings` key in `chrome.storage.local`. Loaded values are merged with defaults, numeric values are clamped, and colors are validated before use. The extension has only the `storage` permission and contains no backend, analytics, external assets, or network client.

## Selector maintenance

The rendering engine places a textured underlay behind `table.ContributionCalendar-grid`. An SVG mask built from live cell rectangles paints only right, bottom, and two-by-two junction bridges between neighboring squares. Rounded punch-outs match the active tile radius, and absent cells create no bridge, preserving outer edges and partial first/last weeks. GitHub's native table spacing remains untouched.

The in-page trigger first looks for the **Less / More** legend or a contribution footer near the table. If GitHub changes those classes, it falls back to the calendar wrapper and mounts a right-aligned trigger. Injection runs on DOM ready, Turbo navigation, and observed graph changes, while `#gh-grout-host` prevents duplicates.

If GitHub redesigns the graph, update the selectors in `src/grout.css` and the anchor lookup in `src/content.js`. The toolbar editor remains usable independently of the in-page anchor.

## Static checks

```sh
python3 -m json.tool manifest.json
for file in src/*.js; do node --check "$file"; done
file icons/icon16.png icons/icon48.png icons/icon128.png
```
