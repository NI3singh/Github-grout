# GitHub Grout — Chrome Extension Specification

## 1. Objective

GitHub Grout is a zero-dependency, local-only Manifest V3 extension that customizes only the spaces between squares in GitHub profile contribution graphs. It preserves native square fills, contribution levels, counts, tooltips, interactions, table spacing, and surrounding layout.

## 2. Files

```text
github-grout/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── presets.js
│   ├── grout.css
│   ├── content.js
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── README.md
```

The extension uses no bundler. `src/presets.js` exposes `globalThis.GHGroutConfig`; content scripts do not use ES module syntax. The popup uses only external scripts and event listeners bound by `src/popup.js`.

## 3. Manifest

- Manifest V3 with only the `storage` permission.
- Content script matches `https://github.com/*` and runs at `document_start`.
- Injection order is `src/presets.js`, then `src/content.js`, with `src/grout.css`.
- The toolbar action opens `src/popup.html`.
- All three icon paths reference real PNG files of their stated dimensions.

## 4. Storage

All settings use the single `ghGroutSettings` key in `chrome.storage.local`:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "showInPageButton": true,
  "separateThemeProfiles": false,
  "lastDetectedTheme": "light",
  "profiles": {
    "light": { "style": "solid", "color": "#ff69b4", "presetId": "custom", "radius": 2, "shimmer": false, "chamkila": false },
    "dark": { "style": "solid", "color": "#ff69b4", "presetId": "custom", "radius": 2, "shimmer": false, "chamkila": false }
  }
}
```

Loaded values are merged with defaults, and a legacy shared profile migrates into both theme profiles. Radius is clamped to `0`–`50`, colors must match `/^#[0-9a-fA-F]{6}$/`, and unknown styles or presets fall back safely. Both editors synchronize through storage change events. Theme resolution follows GitHub's color-mode attributes and the operating-system preference when GitHub uses automatic mode; the detected theme is stored for the toolbar popup.

## 5. SVG-Masked Underlay

- The table's direct wrapper becomes positioned only while the extension is active; its original inline position is restored during cleanup.
- The table, table body, and rows sit above the underlay with transparent backgrounds.
- Contribution cells receive only the configured `border-radius`. Their fills, borders, shadows, outlines, opacity, and filters remain native.
- A zero-size inline SVG contains a unique user-space mask. A sibling absolutely positioned canvas covers the wrapper's full scroll dimensions and uses that mask.
- Live cell rectangles are converted to wrapper scroll-origin coordinates. Row indices come from the table body, and column indices come from the minimum positive horizontal pitch.
- White mask geometry contains only right bridges, bottom bridges, and complete two-by-two junction bridges between existing cells.
- Black punch-outs cover every cell rectangle. Their horizontal and vertical radii exactly match the configured square rounding, including circular tiles.
- Missing cells create no bridges, keeping outer edges and partial first/last weeks clean.
- Solid, metallic, glitter, holographic, luminous neon, and terrazzo textures paint only the canvas. Optional shimmer honors reduced-motion preferences.
- Optional Chamkila adds five masked planes of deterministic, DPR-scaled silver grain: dense metallic powder, three staggered specular twinkles, and cursor-lit glints. Pointer listeners and animation frames are removed during rebuilds or when the effect is disabled.
- Resize observation, Turbo navigation, graph mutations, and setting changes schedule one animation-frame rebuild. Cleanup removes both underlay elements and disconnects observers.

## 6. Editors

The in-page Shadow DOM editor mounts one circular trigger beside the contribution legend, with a wrapper fallback. Its viewport-clamped popover provides presets, styles, color, tile shape, shimmer, theme-profile controls, master enablement, and reset.

The toolbar popup mirrors those controls and also provides the in-page-button visibility setting. Both editors remain synchronized without tab messaging.

## 7. Verification

- Parse `manifest.json` as JSON and syntax-check every JavaScript file.
- Validate all icon signatures, dimensions, and chunks.
- Confirm strict popup CSP and absence of network resources.
- Confirm native table spacing and contribution-cell visuals are untouched except for rounding.
- Confirm only the three allowed bridge rules produce visible mask geometry.
- Confirm disabled mode removes all injected rendering state and restores wrapper positioning.
- Confirm popup, in-page editor, theme profiles, year changes, and Turbo navigation remain synchronized.
