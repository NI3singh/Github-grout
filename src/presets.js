(function initializeGHGroutConfig(global) {
  "use strict";

  const STORAGE_KEY = "ghGroutSettings";
  const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
  const SHIMMER_STYLES = ["metallic", "glitter", "holographic"];
  const STYLES = [
    { id: "solid", label: "Solid" },
    { id: "metallic", label: "Metallic" },
    { id: "glitter", label: "Glitter" },
    { id: "holographic", label: "Holo" },
    { id: "neon", label: "Neon" },
    { id: "terrazzo", label: "Terrazzo" }
  ];
  const PRESETS = [
    { id: "classic-white", name: "Classic White", style: "solid", color: "#ffffff" },
    { id: "obsidian", name: "Obsidian", style: "solid", color: "#09090b" },
    { id: "bubblegum-pink", name: "Bubblegum Pink", style: "solid", color: "#ff69b4" },
    { id: "gold-leaf", name: "Gold Leaf", style: "metallic", color: "#d4af37" },
    { id: "rose-gold", name: "Rose Gold", style: "metallic", color: "#e0a399" },
    { id: "pink-glitter", name: "Pink Glitter", style: "glitter", color: "#ec4899" },
    { id: "holographic", name: "Holographic", style: "holographic", color: "#7afcff" },
    { id: "cyberpunk-neon", name: "Cyberpunk Neon", style: "neon", color: "#00f5d4" },
    { id: "terrazzo-cream", name: "Terrazzo Cream", style: "terrazzo", color: "#f5efe6" }
  ];
  const DEFAULT_PROFILE = {
    style: "solid",
    color: "#ff69b4",
    presetId: "custom",
    radius: 2,
    shimmer: false,
    chamkila: false
  };
  const DEFAULT_SETTINGS = {
    schemaVersion: 1,
    enabled: true,
    showInPageButton: true,
    separateThemeProfiles: false,
    lastDetectedTheme: "light",
    profiles: {
      light: { ...DEFAULT_PROFILE },
      dark: { ...DEFAULT_PROFILE }
    }
  };

  function clampNumber(value, minimum, maximum, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
  }

  function sanitizeProfile(candidate) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const styleIds = STYLES.map((style) => style.id);
    const presetIds = PRESETS.map((preset) => preset.id);
    return {
      style: styleIds.includes(source.style) ? source.style : DEFAULT_PROFILE.style,
      color: typeof source.color === "string" && HEX_PATTERN.test(source.color)
        ? source.color.toLowerCase()
        : DEFAULT_PROFILE.color,
      presetId: source.presetId === "custom" || presetIds.includes(source.presetId)
        ? source.presetId
        : DEFAULT_PROFILE.presetId,
      radius: clampNumber(source.radius, 0, 50, DEFAULT_PROFILE.radius),
      shimmer: typeof source.shimmer === "boolean" ? source.shimmer : DEFAULT_PROFILE.shimmer,
      chamkila: typeof source.chamkila === "boolean" ? source.chamkila : DEFAULT_PROFILE.chamkila
    };
  }

  function sanitizeSettings(candidate) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const profiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
    const separateThemeProfiles = typeof source.separateThemeProfiles === "boolean"
      ? source.separateThemeProfiles
      : DEFAULT_SETTINGS.separateThemeProfiles;
    const legacyProfile = profiles.default ? sanitizeProfile(profiles.default) : null;
    let lightProfile = sanitizeProfile(profiles.light || legacyProfile);
    let darkProfile = sanitizeProfile(profiles.dark || legacyProfile);
    if (!separateThemeProfiles && legacyProfile) {
      lightProfile = sanitizeProfile(legacyProfile);
      darkProfile = sanitizeProfile(legacyProfile);
    }
    return {
      schemaVersion: 1,
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
      showInPageButton: typeof source.showInPageButton === "boolean"
        ? source.showInPageButton
        : DEFAULT_SETTINGS.showInPageButton,
      separateThemeProfiles,
      lastDetectedTheme: source.lastDetectedTheme === "dark" ? "dark" : "light",
      profiles: {
        light: lightProfile,
        dark: darkProfile
      }
    };
  }

  function cloneDefaults() {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }

  function svgPattern(markup) {
    return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
  }

  function getTexture(profile) {
    const color = profile.color;
    if (profile.style === "metallic") {
      return {
        color,
        image: "linear-gradient(135deg, rgba(0,0,0,.32) 0%, rgba(255,255,255,.62) 24%, rgba(255,255,255,.08) 42%, rgba(0,0,0,.28) 64%, rgba(255,255,255,.48) 82%, rgba(0,0,0,.2) 100%)",
        size: "200% 200%"
      };
    }
    if (profile.style === "glitter") {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g fill="#fff"><circle cx="2" cy="2" r=".8" opacity=".9"/><circle cx="9" cy="4" r=".55" opacity=".65"/><circle cx="5" cy="9" r=".7" opacity=".8"/></g><g fill="#171717"><circle cx="7" cy="1" r=".45" opacity=".45"/><circle cx="2" cy="7" r=".5" opacity=".35"/><circle cx="10" cy="10" r=".65" opacity=".4"/></g></svg>';
      return { color, image: svgPattern(svg), size: "12px 12px" };
    }
    if (profile.style === "holographic") {
      return {
        color: "#7afcff",
        image: "linear-gradient(135deg, #ff7eb3, #7afcff, #feff9c, #c77dff, #ff7eb3)",
        size: "200% 200%"
      };
    }
    if (profile.style === "terrazzo") {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M1 2l3-1 1 3-3 1z" fill="#e11d48" opacity=".7"/><path d="M10 1l4 2-2 3-3-2z" fill="#0d9488" opacity=".65"/><path d="M5 9l4-2 2 4-4 2z" fill="#f59e0b" opacity=".7"/><path d="M1 13l3-2 1 4-3 1z" fill="#6366f1" opacity=".6"/><path d="M13 11l3 2-2 3-2-3z" fill="#44403c" opacity=".55"/></svg>';
      return { color, image: svgPattern(svg), size: "16px 16px" };
    }
    if (profile.style === "neon") {
      return {
        color,
        image: "linear-gradient(135deg, rgba(255,255,255,.82) 0%, rgba(255,255,255,.08) 32%, rgba(255,255,255,.28) 68%, rgba(255,255,255,.9) 100%)",
        size: "auto"
      };
    }
    return { color, image: "none", size: "auto" };
  }

  function buildGroutPreviewCSS(profile) {
    const safeProfile = sanitizeProfile(profile);
    const texture = getTexture(safeProfile);
    return `background-color: ${texture.color}; background-image: ${texture.image}; background-size: ${texture.size};`;
  }

  function normalizeHex(value) {
    const trimmed = String(value).trim();
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }

  // A shape or effect change keeps the preset highlighted; a new style or color does not.
  function nextPresetId(currentPresetId, patch) {
    return "style" in patch || "color" in patch ? "custom" : currentPresetId;
  }

  // Serializes writes. While any are pending, storage change events may be stale
  // echoes of earlier writes, so callers skip them and re-read once the queue drains.
  function createSettingsWriter(onDrained) {
    let queue = Promise.resolve();
    let pending = 0;
    return {
      isBusy: () => pending > 0,
      write(snapshot) {
        pending += 1;
        queue = queue.then(() => new Promise((resolve) => {
          chrome.storage.local.set({ [STORAGE_KEY]: snapshot }, () => {
            void chrome.runtime.lastError;
            pending -= 1;
            resolve();
            if (pending > 0) return;
            chrome.storage.local.get(STORAGE_KEY, (stored) => {
              void chrome.runtime.lastError;
              if (pending === 0 && stored && stored[STORAGE_KEY]) onDrained(stored[STORAGE_KEY]);
            });
          });
        }));
      }
    };
  }

  global.GHGroutConfig = Object.freeze({
    STORAGE_KEY,
    HEX_PATTERN,
    STYLES,
    SHIMMER_STYLES,
    PRESETS,
    normalizeHex,
    nextPresetId,
    createSettingsWriter,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    sanitizeProfile,
    cloneDefaults,
    getTexture,
    buildGroutPreviewCSS
  });
})(globalThis);
