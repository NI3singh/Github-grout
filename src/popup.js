(function initializeGroutPopup() {
  "use strict";

  const config = globalThis.GHGroutConfig;
  if (!config) return;
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  let settings = config.cloneDefaults();
  let resolvedTheme = colorScheme.matches ? "dark" : "light";
  const writer = config.createSettingsWriter(applyStoredSettings);

  function getActiveProfileKey() {
    return resolvedTheme;
  }

  function getActiveProfile() {
    return settings.profiles[getActiveProfileKey()];
  }

  const PREVIEW_COLORS = {
    light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    dark: ["#151b23", "#033a16", "#196c2e", "#2ea043", "#56d364"]
  };
  const preview = document.getElementById("preview");
  // Fixed level pattern so the preview stays stable between renders.
  for (let index = 0; index < 5 * 18; index += 1) {
    const cell = document.createElement("i");
    cell.dataset.level = String((index * 7 + Math.floor(index / 5) * 3) % 11 % 5);
    preview.appendChild(cell);
  }

  function renderPreview(profile) {
    const texture = config.getTexture(profile);
    preview.style.backgroundColor = settings.enabled ? texture.color : "transparent";
    preview.style.backgroundImage = settings.enabled ? texture.image : "none";
    preview.style.backgroundSize = texture.size;
    const radius = settings.enabled ? profile.radius : 2;
    preview.style.setProperty("--tile-radius", radius === 50 ? "50%" : `${radius}px`);
    Array.from(preview.children).forEach((cell) => {
      cell.style.backgroundColor = PREVIEW_COLORS[resolvedTheme][cell.dataset.level];
    });
  }

  function render() {
    const profile = getActiveProfile();
    document.getElementById("enabled").checked = settings.enabled;
    document.getElementById("show-in-page").checked = settings.showInPageButton;
    document.getElementById("separate").checked = settings.separateThemeProfiles;
    document.getElementById("shimmer").checked = profile.shimmer;
    document.getElementById("chamkila").checked = profile.chamkila;
    document.getElementById("shimmer").disabled = !config.SHIMMER_STYLES.includes(profile.style);
    renderPreview(profile);
    document.getElementById("color").value = profile.color;
    document.getElementById("color").disabled = profile.style === "holographic";
    const hex = document.getElementById("hex");
    hex.disabled = profile.style === "holographic";
    if (document.activeElement !== hex) hex.value = profile.color;
    hex.setAttribute("aria-invalid", "false");
    document.getElementById("holo-note").hidden = profile.style !== "holographic";
    const themeHelper = document.getElementById("theme-helper");
    themeHelper.hidden = !settings.separateThemeProfiles;
    themeHelper.textContent = `Applies to GitHub ${resolvedTheme === "dark" ? "Dark" : "Light"} mode only`;
    document.querySelectorAll("[data-preset]").forEach((button) => {
      const active = button.dataset.preset === profile.presetId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-style]").forEach((button) => {
      const active = button.dataset.style === profile.style;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-radius]").forEach((button) => {
      const active = Number(button.dataset.radius) === profile.radius;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function saveSettings(nextSettings) {
    settings = config.sanitizeSettings(nextSettings);
    render();
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

  config.PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.preset = preset.id;
    button.title = preset.name;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="preset-swatch"></span><span class="preset-name">${preset.name}</span>`;
    button.querySelector(".preset-swatch").style.cssText = config.buildGroutPreviewCSS(preset);
    document.getElementById("presets").appendChild(button);
  });

  config.STYLES.forEach((style) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment";
    button.dataset.style = style.id;
    button.textContent = style.label;
    button.setAttribute("aria-pressed", "false");
    document.getElementById("styles").appendChild(button);
  });

  document.getElementById("enabled").addEventListener("change", (event) => {
    updateSettings((nextSettings) => { nextSettings.enabled = event.target.checked; });
  });
  document.getElementById("show-in-page").addEventListener("change", (event) => {
    updateSettings((nextSettings) => { nextSettings.showInPageButton = event.target.checked; });
  });
  document.getElementById("separate").addEventListener("change", (event) => {
    setSeparateThemeProfiles(event.target.checked);
  });
  document.getElementById("reset").addEventListener("click", () => {
    saveSettings({ ...config.cloneDefaults(), lastDetectedTheme: resolvedTheme });
  });
  document.getElementById("shimmer").addEventListener("change", (event) => updateProfile({ shimmer: event.target.checked }));
  document.getElementById("chamkila").addEventListener("change", (event) => updateProfile({ chamkila: event.target.checked }));
  document.getElementById("color").addEventListener("input", (event) => updateProfile({ color: event.target.value }));

  document.addEventListener("click", (event) => {
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

  const hex = document.getElementById("hex");
  function commitHex() {
    const value = config.normalizeHex(hex.value);
    const valid = config.HEX_PATTERN.test(value);
    hex.setAttribute("aria-invalid", String(!valid));
    hex.setCustomValidity(valid ? "" : "Enter a six-digit hex color, such as #ff69b4.");
    if (valid) updateProfile({ color: value });
  }
  hex.addEventListener("change", commitHex);
  hex.addEventListener("input", () => hex.setCustomValidity(""));
  hex.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitHex();
      if (!hex.validationMessage) hex.blur();
    }
  });

  function applyStoredSettings(storedSettings) {
    settings = config.sanitizeSettings(storedSettings);
    resolvedTheme = settings.lastDetectedTheme;
    render();
  }

  chrome.storage.local.get(config.STORAGE_KEY, (stored) => {
    void chrome.runtime.lastError;
    const storedSettings = stored && stored[config.STORAGE_KEY];
    const requiresMigration = Boolean(storedSettings && storedSettings.profiles && storedSettings.profiles.default);
    settings = config.sanitizeSettings(storedSettings);
    resolvedTheme = settings.lastDetectedTheme;
    if (requiresMigration) saveSettings(settings);
    else render();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[config.STORAGE_KEY] || writer.isBusy()) return;
    applyStoredSettings(changes[config.STORAGE_KEY].newValue);
  });
  render();
})();
