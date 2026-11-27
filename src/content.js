(function initializeGitHubGrout() {
  "use strict";

  const config = globalThis.GHGroutConfig;
  if (!config || typeof chrome === "undefined" || !chrome.storage) return;

  const CHAMKILA_PROPERTIES = ["base", "spark-a", "spark-b", "spark-c", "glint"]
    .map((name) => `--gh-chamkila-${name}`);
  const ROOT_PROPERTIES = [
    "--gh-grout-color",
    "--gh-grout-image",
    "--gh-grout-size",
    "--gh-tile-radius"
  ];
  const ROOT_ATTRIBUTES = [
    "data-gh-grout-enabled",
    "data-gh-grout-style",
    "data-gh-grout-preset",
    "data-gh-grout-shimmer",
    "data-gh-grout-chamkila"
  ];
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  let settings = config.cloneDefaults();
  let resolvedTheme = "light";
  const writer = config.createSettingsWriter(applyStoredSettings);
  let hydrated = false;

  function resolveTheme() {
    const root = document.documentElement;
    const mode = root ? root.getAttribute("data-color-mode") : null;
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return colorScheme.matches ? "dark" : "light";
  }

  function getActiveProfileKey() {
    return resolvedTheme;
  }

  function getActiveProfile() {
    return settings.profiles[getActiveProfileKey()];
  }

  function clearRootState() {
    const root = document.documentElement;
    if (!root) return;
    ROOT_ATTRIBUTES.forEach((attribute) => root.removeAttribute(attribute));
    ROOT_PROPERTIES.forEach((property) => root.style.removeProperty(property));
    removeChamkilaTiles();
  }

  function applyRootState() {
    const root = document.documentElement;
    if (!root) return;
    if (!settings.enabled) {
      clearRootState();
      return;
    }
    const profile = getActiveProfile();
    root.setAttribute("data-gh-grout-enabled", "true");
    root.setAttribute("data-gh-grout-style", profile.style);
    root.setAttribute("data-gh-grout-preset", profile.presetId);
    root.setAttribute("data-gh-grout-shimmer", String(profile.shimmer));
    root.setAttribute("data-gh-grout-chamkila", String(profile.chamkila));
    const texture = config.getTexture(profile);
    root.style.setProperty("--gh-grout-color", texture.color);
    root.style.setProperty("--gh-grout-image", texture.image);
    root.style.setProperty("--gh-grout-size", texture.size);
    if (profile.chamkila) ensureChamkilaTiles();
    else removeChamkilaTiles();
    root.style.setProperty("--gh-tile-radius", profile.radius === 50 ? "50%" : `${profile.radius}px`);
  }

  function refreshState() {
    resolvedTheme = resolveTheme();
    if (!hydrated) return;
    applyRootState();
    if (!settings.enabled || !getActiveProfile().chamkila) detachChamkilaLights();
    if (!settings.enabled) cleanupUnderlays();
    else if (!renderedGraphs.size || getGeometryKey() !== renderedGeometryKey) scheduleUnderlayRebuild();
    if (typeof syncInPageUI === "function") syncInPageUI();
  }

  function saveSettings(nextSettings) {
    const detectedSettings = config.sanitizeSettings(nextSettings);
    detectedSettings.lastDetectedTheme = resolvedTheme;
    settings = config.sanitizeSettings(detectedSettings);
    refreshState();
    const snapshot = config.sanitizeSettings(settings);
    writer.write(snapshot);
  }

  function updateSettings(mutator) {
    const nextSettings = config.sanitizeSettings(settings);
    mutator(nextSettings);
    saveSettings(nextSettings);
  }

  function updateProfile(patch, presetId) {
    const profileKey = getActiveProfileKey();
    updateSettings((nextSettings) => {
      const updatedProfile = {
        ...nextSettings.profiles[profileKey],
        ...patch,
        presetId: presetId || config.nextPresetId(nextSettings.profiles[profileKey].presetId, patch)
      };
      if (nextSettings.separateThemeProfiles) {
        nextSettings.profiles[profileKey] = updatedProfile;
      } else {
        nextSettings.profiles.light = { ...updatedProfile };
        nextSettings.profiles.dark = { ...updatedProfile };
      }
    });
  }

  function setSeparateThemeProfiles(enabled) {
    const profileKey = getActiveProfileKey();
    updateSettings((nextSettings) => {
      if (!enabled && nextSettings.separateThemeProfiles) {
        const activeProfile = nextSettings.profiles[profileKey];
        nextSettings.profiles.light = { ...activeProfile };
        nextSettings.profiles.dark = { ...activeProfile };
      }
      nextSettings.separateThemeProfiles = enabled;
    });
  }

  function getGeometryKey() {
    const profile = getActiveProfile();
    return `${profile.radius}|${profile.chamkila}`;
  }

  function applyStoredSettings(storedSettings) {
    settings = config.sanitizeSettings(storedSettings);
    hydrated = true;
    refreshState();
    scheduleMount();
  }

  chrome.storage.local.get(config.STORAGE_KEY, (stored) => {
    void chrome.runtime.lastError;
    const storedSettings = stored && stored[config.STORAGE_KEY];
    const requiresMigration = Boolean(storedSettings && storedSettings.profiles && storedSettings.profiles.default);
    settings = config.sanitizeSettings(storedSettings);
    resolvedTheme = resolveTheme();
    hydrated = true;
    if (requiresMigration || !storedSettings || storedSettings.lastDetectedTheme !== resolvedTheme) {
      saveSettings(settings);
    }
    else refreshState();
    if (typeof scheduleMount === "function") scheduleMount();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[config.STORAGE_KEY] || writer.isBusy()) return;
    applyStoredSettings(changes[config.STORAGE_KEY].newValue);
  });

  function handleThemeChange() {
    const nextTheme = resolveTheme();
    if (nextTheme === resolvedTheme) return;
    resolvedTheme = nextTheme;
    if (hydrated) updateSettings((nextSettings) => { nextSettings.lastDetectedTheme = nextTheme; });
  }

  function observeTheme() {
    if (document.documentElement) {
      new MutationObserver(handleThemeChange).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-mode", "data-light-theme", "data-dark-theme"]
      });
    }
    if (typeof colorScheme.addEventListener === "function") {
      colorScheme.addEventListener("change", handleThemeChange);
    } else {
      colorScheme.addListener(handleThemeChange);
    }
  }

  observeTheme();

  let host = null;
  let shadow = null;
  let trigger = null;
  let panel = null;
  let mountFrame = 0;
  let underlayFrame = 0;
  let maskSequence = 0;
  const renderedGraphs = new Map();
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  let chamkilaTileDpr = 0;
  let renderedGeometryKey = "";

  function createChamkilaRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createChamkilaCanvas(size, dpr) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = false;
    return { canvas, context, occupied: new Uint8Array(canvas.width * canvas.height) };
  }

  function paintChamkilaGrain(tile, random, x, y, width, height, color) {
    let painted = 0;
    for (let offsetY = 0; offsetY < height; offsetY += 1) {
      for (let offsetX = 0; offsetX < width; offsetX += 1) {
        const pixelX = x + offsetX;
        const pixelY = y + offsetY;
        if (pixelX < 0 || pixelY < 0 || pixelX >= tile.canvas.width || pixelY >= tile.canvas.height) continue;
        const index = pixelY * tile.canvas.width + pixelX;
        if (tile.occupied[index]) continue;
        tile.occupied[index] = 1;
        tile.context.fillStyle = color;
        tile.context.fillRect(pixelX, pixelY, 1, 1);
        painted += 1;
      }
    }
    return painted;
  }

  function fillChamkilaGrain(tile, random, coverage, colorSource, crosses = 0, squareFlakes = false) {
    const target = Math.floor(tile.canvas.width * tile.canvas.height * coverage);
    let painted = 0;
    for (let index = 0; index < crosses; index += 1) {
      const x = 1 + Math.floor(random() * (tile.canvas.width - 2));
      const y = 1 + Math.floor(random() * (tile.canvas.height - 2));
      paintChamkilaGrain(tile, random, x, y, 1, 1, "#ffffff");
      paintChamkilaGrain(tile, random, x - 1, y, 1, 1, "rgba(255,255,255,0.55)");
      paintChamkilaGrain(tile, random, x + 1, y, 1, 1, "rgba(255,255,255,0.55)");
      paintChamkilaGrain(tile, random, x, y - 1, 1, 1, "rgba(255,255,255,0.55)");
      paintChamkilaGrain(tile, random, x, y + 1, 1, 1, "rgba(255,255,255,0.55)");
    }
    while (painted < target) {
      const flake = random();
      const width = squareFlakes ? (flake > 0.75 ? 2 : 1) : (flake > 0.78 ? 2 : 1);
      const height = squareFlakes ? width : (flake > 0.42 && flake <= 0.78 ? 2 : 1);
      const x = Math.floor(random() * tile.canvas.width);
      const y = Math.floor(random() * tile.canvas.height);
      painted += paintChamkilaGrain(tile, random, x, y, width, height, colorSource(random));
    }
  }

  function buildChamkilaTiles() {
    const root = document.documentElement;
    if (!root) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const base = createChamkilaCanvas(48, dpr);
    const baseRandom = createChamkilaRandom(0x51a7c3);
    fillChamkilaGrain(base, baseRandom, 0.32, (random) => {
      const tone = random();
      if (tone < 0.25) return "rgba(50,60,75,0.38)";
      if (tone < 0.7) return "rgba(205,214,226,0.78)";
      return "rgba(255,255,255,0.96)";
    });

    const properties = [["--gh-chamkila-base", base.canvas]];
    [0x9a17d1, 0x2bc583, 0xe41f67].forEach((seed, index) => {
      const tile = createChamkilaCanvas(64, dpr);
      const random = createChamkilaRandom(seed);
      fillChamkilaGrain(tile, random, 0.07, () => "#ffffff", 4 + Math.floor(random() * 3), true);
      properties.push([`--gh-chamkila-spark-${String.fromCharCode(97 + index)}`, tile.canvas]);
    });
    const glint = createChamkilaCanvas(64, dpr);
    fillChamkilaGrain(glint, createChamkilaRandom(0x73b9d5), 0.15, () => "#ffffff", 0, true);
    properties.push(["--gh-chamkila-glint", glint.canvas]);
    properties.forEach(([property, canvas]) => {
      root.style.setProperty(property, `url("${canvas.toDataURL("image/png")}")`);
    });
    chamkilaTileDpr = dpr;
  }

  function ensureChamkilaTiles() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr !== chamkilaTileDpr) buildChamkilaTiles();
  }

  function removeChamkilaTiles() {
    if (!chamkilaTileDpr) return;
    CHAMKILA_PROPERTIES.forEach((property) => document.documentElement.style.removeProperty(property));
    chamkilaTileDpr = 0;
  }

  function refreshChamkilaTiles() {
    if (chamkilaTileDpr) ensureChamkilaTiles();
  }

  function watchChamkilaDpr() {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener("change", () => {
      refreshChamkilaTiles();
      watchChamkilaDpr();
    }, { once: true });
  }

  watchChamkilaDpr();

  function restoreWrapper(record) {
    if (record.positionChanged) record.wrapper.style.position = record.inlinePosition;
  }

  function detachChamkilaLights() {
    renderedGraphs.forEach((record) => record.detachChamkilaLight());
  }

  function cleanupUnderlays() {
    renderedGraphs.forEach((record) => {
      record.detachChamkilaLight();
      record.resizeObserver.disconnect();
      record.canvas.remove();
      record.svg.remove();
      restoreWrapper(record);
    });
    renderedGraphs.clear();
    document.querySelectorAll(".gh-grout-canvas, .gh-grout-mask-svg").forEach((element) => element.remove());
  }

  function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    return element;
  }

  function appendRect(group, x, y, width, height, radiusX = 0, radiusY = 0) {
    if (![x, y, width, height, radiusX, radiusY].every(Number.isFinite)) return;
    if (width <= 0 || height <= 0) return;
    group.appendChild(createSvgElement("rect", {
      x,
      y,
      width,
      height,
      rx: radiusX,
      ry: radiusY
    }));
  }

  function attachChamkilaLight(wrapper, canvas) {
    let pointerFrame = 0;
    let pendingPoint = null;

    function flushPointer() {
      pointerFrame = 0;
      if (!pendingPoint) return;
      const canvasRect = canvas.getBoundingClientRect();
      canvas.style.setProperty("--gh-light-x", `${pendingPoint.clientX - canvasRect.left}px`);
      canvas.style.setProperty("--gh-light-y", `${pendingPoint.clientY - canvasRect.top}px`);
      canvas.style.setProperty("--gh-light-active", "1");
      pendingPoint = null;
    }

    function handlePointerMove(event) {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!pointerFrame) pointerFrame = requestAnimationFrame(flushPointer);
    }

    function handlePointerLeave() {
      pendingPoint = null;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      canvas.style.setProperty("--gh-light-active", "0");
    }

    wrapper.addEventListener("pointermove", handlePointerMove, { passive: true });
    wrapper.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    return () => {
      pendingPoint = null;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      wrapper.removeEventListener("pointermove", handlePointerMove);
      wrapper.removeEventListener("pointerleave", handlePointerLeave);
    };
  }

  function buildGraphUnderlay(table) {
    const wrapper = table.parentElement;
    const tbody = table.tBodies[0];
    if (!wrapper || !tbody) return;
    const rows = Array.from(tbody.rows);
    const rowIndices = new Map(rows.map((row, index) => [row, index]));
    const wrapperRect = wrapper.getBoundingClientRect();
    const cells = Array.from(table.querySelectorAll("td.ContributionCalendar-day")).map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        row: rowIndices.get(cell.parentElement),
        x: rect.left - wrapperRect.left + wrapper.scrollLeft,
        y: rect.top - wrapperRect.top + wrapper.scrollTop,
        w: rect.width,
        h: rect.height
      };
    }).filter((cell) => Number.isInteger(cell.row) && cell.w > 0 && cell.h > 0);
    if (!cells.length) return;

    const minX = Math.min(...cells.map((cell) => cell.x));
    const sortedX = Array.from(new Set(cells.map((cell) => cell.x))).sort((first, second) => first - second);
    let pitchX = Infinity;
    for (let index = 1; index < sortedX.length; index += 1) {
      const delta = sortedX[index] - sortedX[index - 1];
      if (delta > 0 && delta < pitchX) pitchX = delta;
    }
    if (!Number.isFinite(pitchX) || pitchX <= 0) pitchX = 1;
    const cellMap = new Map();
    cells.forEach((cell) => {
      cell.col = Math.round((cell.x - minX) / pitchX);
      cellMap.set(`${cell.row},${cell.col}`, cell);
    });

    const width = wrapper.scrollWidth;
    const height = wrapper.scrollHeight;
    const maskId = `gh-grout-mask-${++maskSequence}`;
    const svg = createSvgElement("svg", { class: "gh-grout-mask-svg", "aria-hidden": "true" });
    const defs = createSvgElement("defs", {});
    const mask = createSvgElement("mask", {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      maskContentUnits: "userSpaceOnUse",
      x: 0,
      y: 0,
      width,
      height
    });
    mask.setAttribute("mask-type", "luminance");
    const bridges = createSvgElement("g", { fill: "#ffffff" });
    const holes = createSvgElement("g", { fill: "#000000" });
    const profile = getActiveProfile();
    const radius = profile.radius;

    cellMap.forEach((cell) => {
      const right = cellMap.get(`${cell.row},${cell.col + 1}`);
      const bottom = cellMap.get(`${cell.row + 1},${cell.col}`);
      const bottomRight = cellMap.get(`${cell.row + 1},${cell.col + 1}`);
      if (right) {
        appendRect(
          bridges,
          cell.x + cell.w / 2,
          Math.min(cell.y, right.y),
          (right.x + right.w / 2) - (cell.x + cell.w / 2),
          Math.max(cell.h, right.h)
        );
      }
      if (bottom) {
        appendRect(
          bridges,
          Math.min(cell.x, bottom.x),
          cell.y + cell.h / 2,
          Math.max(cell.w, bottom.w),
          (bottom.y + bottom.h / 2) - (cell.y + cell.h / 2)
        );
      }
      if (right && bottom && bottomRight) {
        appendRect(
          bridges,
          cell.x + cell.w / 2,
          cell.y + cell.h / 2,
          (bottomRight.x + bottomRight.w / 2) - (cell.x + cell.w / 2),
          (bottomRight.y + bottomRight.h / 2) - (cell.y + cell.h / 2)
        );
      }
    });

    cellMap.forEach((cell) => {
      const radiusX = radius === 50 ? cell.w / 2 : Math.min(radius, cell.w / 2);
      const radiusY = radius === 50 ? cell.h / 2 : Math.min(radius, cell.h / 2);
      appendRect(holes, cell.x, cell.y, cell.w, cell.h, radiusX, radiusY);
    });

    mask.append(bridges, holes);
    defs.appendChild(mask);
    svg.appendChild(defs);
    const canvas = document.createElement("div");
    canvas.className = "gh-grout-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.maskImage = `url(#${maskId})`;
    canvas.style.webkitMaskImage = `url(#${maskId})`;
    ["base", "spark-a", "spark-b", "spark-c", "glint"].forEach((plane) => {
      const layer = document.createElement("div");
      layer.className = `gh-grout-chamkila gh-grout-chamkila-${plane}`;
      canvas.appendChild(layer);
    });

    const inlinePosition = wrapper.style.position;
    const positionChanged = window.getComputedStyle(wrapper).position === "static";
    if (positionChanged) wrapper.style.position = "relative";
    wrapper.prepend(canvas);
    wrapper.prepend(svg);
    const detachChamkilaLight = profile.chamkila
      ? attachChamkilaLight(wrapper, canvas)
      : () => {};
    let observerReady = false;
    const resizeObserver = new ResizeObserver(() => {
      if (!observerReady) {
        observerReady = true;
        return;
      }
      scheduleUnderlayRebuild();
    });
    resizeObserver.observe(table);
    renderedGraphs.set(table, {
      wrapper,
      canvas,
      svg,
      resizeObserver,
      detachChamkilaLight,
      inlinePosition,
      positionChanged
    });
  }

  function rebuildUnderlays() {
    underlayFrame = 0;
    cleanupUnderlays();
    if (!settings.enabled) return;
    renderedGeometryKey = getGeometryKey();
    document.querySelectorAll("table.ContributionCalendar-grid").forEach(buildGraphUnderlay);
  }

  function scheduleUnderlayRebuild() {
    if (underlayFrame) cancelAnimationFrame(underlayFrame);
    underlayFrame = requestAnimationFrame(rebuildUnderlays);
  }

  const SHADOW_STYLES = `
    :host { display: inline-flex; vertical-align: middle; margin-inline-start: 8px; }
    :host([data-fallback="true"]) { display: flex; width: 100%; justify-content: flex-end; margin: 8px 0 0; }
    * { box-sizing: border-box; }
    .wrap { --fg: #1f2328; --muted: #59636e; --canvas: #ffffff; --subtle: #f6f8fa; --border: #d1d9e0; --accent: #0969da; color: var(--fg); font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wrap[data-theme="dark"] { --fg: #f0f6fc; --muted: #9198a1; --canvas: #0d1117; --subtle: #151b23; --border: #3d444d; --accent: #4493f8; }
    button, input { font: inherit; }
    button { color: inherit; }
    .trigger { position: relative; width: 20px; height: 20px; padding: 0; border: 1px solid var(--border); border-radius: 50%; cursor: pointer; background-color: #ff69b4; box-shadow: 0 1px 2px rgba(0,0,0,.16); }
    .trigger:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .trigger.disabled { filter: grayscale(.65); opacity: .6; }
    .trigger.disabled::after { content: ""; position: absolute; left: 8px; top: -2px; width: 2px; height: 22px; background: var(--fg); transform: rotate(-45deg); border-radius: 1px; }
    .panel { position: fixed; z-index: 2147483646; width: 280px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 12px; color: var(--fg); background: var(--canvas); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.24); }
    .panel[hidden] { display: none; }
    .header { display: flex; align-items: center; margin-bottom: 12px; }
    .header strong { flex: 1; font-size: 14px; }
    .icon-button { width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-size: 16px; }
    .icon-button:hover { background: var(--subtle); }
    .switch-row { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }
    .switch-row.header-toggle { margin: -4px 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .switch-row input { accent-color: var(--accent); }
    .section { margin-top: 12px; }
    .section-title { display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    .presets { display: grid; grid-template-columns: repeat(3, 1fr); }
    .preset { min-width: 0; margin: 0 6px 6px 0; padding: 5px 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--canvas); cursor: pointer; font-size: 10px; }
    .preset.active, .segment.active, .shape.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .preset-swatch { display: block; width: 100%; height: 16px; margin-bottom: 4px; border: 1px solid rgba(127,127,127,.35); border-radius: 4px; }
    .preset-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .segments { display: grid; grid-template-columns: repeat(3, 1fr); }
    .segment, .shape { margin: 0 4px 4px 0; padding: 5px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--subtle); cursor: pointer; font-size: 11px; }
    .color-row { display: flex; }
    .color-row .hex { margin-left: 6px; }
    input[type="color"] { width: 34px; height: 30px; padding: 2px; border: 1px solid var(--border); border-radius: 6px; background: var(--canvas); }
    .hex { width: 100%; min-width: 0; padding: 5px 7px; color: var(--fg); border: 1px solid var(--border); border-radius: 6px; background: var(--canvas); font-family: ui-monospace, monospace; text-transform: uppercase; }
    .hex[aria-invalid="true"] { border-color: #cf222e; }
    .note { margin-top: 4px; color: var(--muted); font-size: 10px; }
    .shapes { display: grid; grid-template-columns: repeat(4, 1fr); }
    .shape { padding: 5px 2px; font-size: 10px; }
    .toggles { padding-top: 8px; border-top: 1px solid var(--border); }
  `;

  function createShadowHost() {
    const element = document.createElement("span");
    element.id = "gh-grout-host";
    const root = element.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${SHADOW_STYLES}</style>
      <span class="wrap" data-theme="light">
        <button class="trigger" type="button" aria-label="Customize GitHub Grout" aria-expanded="false" title="GitHub Grout"></button>
        <section class="panel" aria-label="GitHub Grout settings" hidden>
          <div class="header"><strong>GitHub Grout</strong><button class="icon-button reset" type="button" aria-label="Reset to defaults" title="Reset to defaults">↺</button><button class="icon-button close" type="button" aria-label="Close" title="Close">×</button></div>
          <label class="switch-row header-toggle"><span>Enable Grout</span><input class="enabled" type="checkbox"></label>
          <div class="section"><div class="section-title">Presets</div><div class="presets"></div></div>
          <div class="section"><div class="section-title">Style</div><div class="segments"></div></div>
          <div class="section"><div class="section-title"><span>Color</span></div><div class="color-row"><input class="color" type="color" aria-label="Grout color"><input class="hex" type="text" aria-label="Hex color" maxlength="7" spellcheck="false"></div><div class="note holo-note" hidden>Holographic uses its own color blend.</div></div>
          <div class="section"><div class="section-title">Tile Shape</div><div class="shapes"><button class="shape" type="button" data-radius="0">Sharp</button><button class="shape" type="button" data-radius="2">Default</button><button class="shape" type="button" data-radius="4">Rounded</button><button class="shape" type="button" data-radius="50">Circle</button></div></div>
          <div class="section toggles"><label class="switch-row"><span>Shimmer (Metallic, Glitter, Holo)</span><input class="shimmer" type="checkbox"></label><label class="switch-row"><span>Chamkila Sparkle</span><input class="chamkila" type="checkbox"></label><label class="switch-row"><span>Separate Light/Dark Themes</span><input class="separate" type="checkbox"></label><div class="note theme-helper" hidden></div></div>
        </section>
      </span>`;
    const presets = root.querySelector(".presets");
    config.PRESETS.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset";
      button.dataset.preset = preset.id;
      button.title = preset.name;
      button.innerHTML = `<span class="preset-swatch"></span><span class="preset-name">${preset.name}</span>`;
      button.querySelector(".preset-swatch").style.cssText = config.buildGroutPreviewCSS(preset);
      presets.appendChild(button);
    });
    const segments = root.querySelector(".segments");
    config.STYLES.forEach((style) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segment";
      button.dataset.style = style.id;
      button.textContent = style.label;
      segments.appendChild(button);
    });
    bindShadowEvents(root);
    return element;
  }

  function findAnchor(table) {
    const scope = table.closest(".js-yearly-contributions, .js-contribution-graph") || table.parentElement;
    if (!scope) return null;
    const legends = Array.from(scope.querySelectorAll("div, span"))
      .filter((element) => /Less/.test(element.textContent) && /More/.test(element.textContent))
      .sort((first, second) => first.textContent.length - second.textContent.length);
    if (legends[0]) return { element: legends[0], fallback: false };
    const footer = scope.querySelector(".contrib-footer, .ContributionCalendar-footer, footer");
    if (footer) return { element: footer, fallback: false };
    const wrapper = table.parentElement;
    if (wrapper && wrapper.nextElementSibling) return { element: wrapper.nextElementSibling, fallback: false };
    return { element: scope, fallback: true };
  }

  function mountInPageUI() {
    mountFrame = 0;
    const table = document.querySelector("table.ContributionCalendar-grid");
    if (!settings.showInPageButton || !table) {
      closePanel();
      if (host) host.remove();
      host = null;
      shadow = null;
      trigger = null;
      panel = null;
      return;
    }
    const anchor = findAnchor(table);
    if (!anchor) return;
    host = host && host.isConnected ? host : document.getElementById("gh-grout-host");
    if (host && !host.shadowRoot) {
      host.remove();
      host = null;
    }
    if (!host) host = createShadowHost();
    host.dataset.fallback = String(anchor.fallback);
    if (host.parentElement !== anchor.element) anchor.element.appendChild(host);
    shadow = host.shadowRoot;
    trigger = shadow.querySelector(".trigger");
    panel = shadow.querySelector(".panel");
    syncInPageUI();
    if (!panel.hidden) requestAnimationFrame(positionPanel);
  }

  function scheduleMount() {
    if (mountFrame) return;
    mountFrame = requestAnimationFrame(mountInPageUI);
  }

  function positionPanel() {
    if (!panel || panel.hidden || !trigger) return;
    const buttonRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 8;
    let left = buttonRect.right - panelRect.width;
    if (left < margin) left = buttonRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));
    let top = buttonRect.bottom + margin;
    if (top + panelRect.height > window.innerHeight - margin) {
      top = buttonRect.top - panelRect.height - margin;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - panelRect.height - margin));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function openPanel() {
    if (!panel || !trigger) return;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(positionPanel);
  }

  function closePanel() {
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function syncInPageUI() {
    if (!host || !shadow) return;
    const profile = getActiveProfile();
    const wrap = shadow.querySelector(".wrap");
    wrap.dataset.theme = resolvedTheme;
    const texture = config.getTexture(profile);
    trigger.style.backgroundColor = texture.color;
    trigger.style.backgroundImage = profile.chamkila
      ? `var(--gh-chamkila-base)${texture.image === "none" ? "" : `, ${texture.image}`}`
      : texture.image;
    trigger.style.backgroundSize = profile.chamkila
      ? `48px 48px${texture.image === "none" ? "" : `, ${texture.size}`}`
      : texture.size;
    trigger.classList.toggle("disabled", !settings.enabled);
    shadow.querySelector(".enabled").checked = settings.enabled;
    shadow.querySelector(".separate").checked = settings.separateThemeProfiles;
    shadow.querySelector(".shimmer").checked = profile.shimmer;
    shadow.querySelector(".chamkila").checked = profile.chamkila;
    shadow.querySelector(".shimmer").disabled = !config.SHIMMER_STYLES.includes(profile.style);
    shadow.querySelector(".color").value = profile.color;
    shadow.querySelector(".color").disabled = profile.style === "holographic";
    const hex = shadow.querySelector(".hex");
    hex.disabled = profile.style === "holographic";
    if (shadow.activeElement !== hex) hex.value = profile.color;
    hex.setAttribute("aria-invalid", "false");
    shadow.querySelector(".holo-note").hidden = profile.style !== "holographic";
    const themeHelper = shadow.querySelector(".theme-helper");
    themeHelper.hidden = !settings.separateThemeProfiles;
    themeHelper.textContent = `Applies to GitHub ${resolvedTheme === "dark" ? "Dark" : "Light"} mode only`;
    shadow.querySelectorAll("[data-preset]").forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === profile.presetId);
      button.setAttribute("aria-pressed", String(button.dataset.preset === profile.presetId));
    });
    shadow.querySelectorAll("[data-style]").forEach((button) => {
      button.classList.toggle("active", button.dataset.style === profile.style);
      button.setAttribute("aria-pressed", String(button.dataset.style === profile.style));
    });
    shadow.querySelectorAll("[data-radius]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.radius) === profile.radius);
      button.setAttribute("aria-pressed", String(Number(button.dataset.radius) === profile.radius));
    });
  }

  function bindShadowEvents(root) {
    root.querySelector(".trigger").addEventListener("click", () => {
      if (panel && !panel.hidden) closePanel();
      else openPanel();
    });
    root.querySelector(".close").addEventListener("click", closePanel);
    root.querySelector(".reset").addEventListener("click", () => saveSettings(config.cloneDefaults()));
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.preset) {
        const preset = config.PRESETS.find((item) => item.id === button.dataset.preset);
        updateProfile({ style: preset.style, color: preset.color }, preset.id);
      } else if (button.dataset.style) {
        updateProfile({ style: button.dataset.style });
      } else if (button.dataset.radius) {
        updateProfile({ radius: Number(button.dataset.radius) });
      }
    });
    root.querySelector(".enabled").addEventListener("change", (event) => {
      updateSettings((nextSettings) => { nextSettings.enabled = event.target.checked; });
    });
    root.querySelector(".separate").addEventListener("change", (event) => {
      setSeparateThemeProfiles(event.target.checked);
    });
    root.querySelector(".shimmer").addEventListener("change", (event) => updateProfile({ shimmer: event.target.checked }));
    root.querySelector(".chamkila").addEventListener("change", (event) => updateProfile({ chamkila: event.target.checked }));
    root.querySelector(".color").addEventListener("input", (event) => updateProfile({ color: event.target.value }));
    const hex = root.querySelector(".hex");
    function commitHex() {
      const value = config.normalizeHex(hex.value);
      const valid = config.HEX_PATTERN.test(value);
      hex.setAttribute("aria-invalid", String(!valid));
      if (valid) updateProfile({ color: value });
      else hex.setCustomValidity("Enter a six-digit hex color, such as #ff69b4.");
      if (valid) hex.setCustomValidity("");
    }
    hex.addEventListener("change", commitHex);
    hex.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        commitHex();
        if (!hex.validationMessage) hex.blur();
      }
    });
    hex.addEventListener("input", () => hex.setCustomValidity(""));
  }

  document.addEventListener("pointerdown", (event) => {
    if (host && panel && !panel.hidden && !event.composedPath().includes(host)) closePanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && host && panel && !panel.hidden) {
      closePanel();
      trigger.focus();
    }
  });

  function initializeMountObservers() {
    scheduleMount();
    scheduleUnderlayRebuild();
    let scheduled = false;
    // Observe <html>, not <body>: Turbo navigation can replace the body element.
    new MutationObserver((records) => {
      const graphChanged = records.some((record) => {
        return [...record.addedNodes, ...record.removedNodes].some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          if (node.matches(".gh-grout-canvas, .gh-grout-mask-svg, #gh-grout-host")) return false;
          return node.matches("table.ContributionCalendar-grid, td.ContributionCalendar-day") ||
            Boolean(node.querySelector("table.ContributionCalendar-grid"));
        });
      });
      if (graphChanged) scheduleUnderlayRebuild();
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scheduleMount();
      });
        }).observe(document.documentElement, { childList: true, subtree: true });
  }

  ["turbo:load", "turbo:render"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      closePanel();
      scheduleMount();
      scheduleUnderlayRebuild();
    });
  });
  window.addEventListener("resize", positionPanel);
  window.addEventListener("resize", refreshChamkilaTiles);
  window.addEventListener("scroll", positionPanel, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMountObservers, { once: true });
  } else {
    initializeMountObservers();
  }
})();
