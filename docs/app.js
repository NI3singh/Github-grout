const SITE_LINKS = Object.freeze({
  repo: "https://github.com/NI3singh/GitGrout",
  releases: "https://github.com/NI3singh/GitGrout/releases",
  removalContact: "https://github.com/NI3singh/GitGrout/issues/new?title=Image%20Removal%20Request",
  creatorGithub: "https://github.com/NI3singh",
  portfolio: "https://portfolio-nitinsingh.vercel.app/",
  x: "https://x.com/",
  linkedin: "https://www.linkedin.com/",
  instagram: "https://www.instagram.com/"
});

(() => {
  "use strict";

  const root = document.documentElement;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const themeStorageKey = "github-grout-site-theme";

  function populateLinks() {
    document.querySelectorAll("[data-link]").forEach((link) => {
      const destination = SITE_LINKS[link.dataset.link];
      if (destination) link.href = destination;
    });
  }

  function storedTheme() {
    try {
      const value = localStorage.getItem(themeStorageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#05070a" : "#e2e8f0";

    const nextTheme = theme === "dark" ? "day" : "night";
    const themeToggle = document.getElementById("theme-toggle");
    themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    themeToggle.setAttribute("aria-pressed", String(theme === "light"));
    document.getElementById("theme-label").textContent = nextTheme === "day" ? "Day" : "Night";

    if (persist) {
      try {
        localStorage.setItem(themeStorageKey, theme);
      } catch {
        // The selected theme still applies when storage is unavailable.
      }
    }
  }

  function initializeTheme() {
    applyTheme(storedTheme() || (systemThemeQuery.matches ? "dark" : "light"));

    document.getElementById("theme-toggle").addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });

    systemThemeQuery.addEventListener("change", (event) => {
      if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
    });
  }

  function initializeSpotlight() {
    let frame = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;

    window.addEventListener("pointermove", (event) => {
      if (motionQuery.matches) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame) return;

      frame = requestAnimationFrame(() => {
        root.style.setProperty("--mx", `${pointerX}px`);
        root.style.setProperty("--my", `${pointerY}px`);
        frame = 0;
      });
    }, { passive: true });
  }

  function initializePortrait() {
    const portrait = document.getElementById("grout-king");
    const fallback = document.getElementById("portrait-fallback");

    function showFallback() {
      portrait.hidden = true;
      fallback.hidden = false;
    }

    portrait.addEventListener("error", showFallback, { once: true });
    if (portrait.complete && portrait.naturalWidth === 0) showFallback();
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildChamkilaTile() {
    const logicalSize = 48;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const physicalSize = Math.round(logicalSize * dpr);
    const canvas = document.createElement("canvas");
    canvas.width = physicalSize;
    canvas.height = physicalSize;

    const context = canvas.getContext("2d");
    if (!context) return;

    const random = seededRandom(0x47a07);
    const targetGrains = Math.floor(physicalSize * physicalSize * 0.32);
    let grainCount = 0;

    while (grainCount < targetGrains) {
      const x = Math.floor(random() * physicalSize);
      const y = Math.floor(random() * physicalSize);
      const tone = random();
      context.fillStyle = tone < 0.25
        ? "rgba(50, 60, 75, 0.38)"
        : tone < 0.70
          ? "rgba(205, 214, 226, 0.78)"
          : "rgba(255, 255, 255, 0.96)";

      let width = 1;
      let height = 1;
      if (random() > 0.94) {
        if (random() > 0.5 && x + 1 < physicalSize) width = 2;
        else if (y + 1 < physicalSize) height = 2;
      }

      context.fillRect(x, y, width, height);
      grainCount += width * height;
    }

    root.style.setProperty("--chamkila-image", `url("${canvas.toDataURL("image/png")}")`);
  }

  function initializePlayground() {
    const graph = document.getElementById("demo-graph");
    const random = seededRandom(0x9a17c3);
    const fragment = document.createDocumentFragment();

    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 18; column += 1) {
        const cell = document.createElement("span");
        const wave = (Math.sin(column * 0.83 + row * 1.37) + 1) / 2;
        const intensity = random() * 0.68 + wave * 0.32;
        const level = intensity < 0.19 ? 0 : intensity < 0.39 ? 1 : intensity < 0.59 ? 2 : intensity < 0.79 ? 3 : 4;
        cell.className = "graph-cell";
        cell.dataset.level = String(level);
        cell.setAttribute("aria-hidden", "true");
        fragment.appendChild(cell);
      }
    }
    graph.appendChild(fragment);

    const presetButtons = document.querySelectorAll("[data-preset]");
    presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const preset = button.dataset.preset;
        graph.dataset.preset = preset;
        presetButtons.forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        });
      });
    });

    const shapeToggle = document.getElementById("shape-toggle");
    const shapeLabel = document.getElementById("shape-label");
    shapeToggle.setAttribute("aria-label", "Switch to circle tiles");
    shapeToggle.addEventListener("click", () => {
      const circular = graph.classList.toggle("is-circular");
      shapeToggle.setAttribute("aria-pressed", String(circular));
      shapeToggle.setAttribute("aria-label", circular ? "Switch to sharp tiles" : "Switch to circle tiles");
      shapeLabel.textContent = circular ? "Sharp tiles" : "Circle tiles";
    });

    buildChamkilaTile();
    document.getElementById("chamkila-toggle").addEventListener("change", (event) => {
      graph.classList.toggle("has-chamkila", event.currentTarget.checked);
    });
  }

  function initializeIntro() {
    const overlay = document.getElementById("intro-overlay");
    const question = document.getElementById("intro-question");
    const reveal = document.getElementById("intro-reveal");
    const mainPage = document.getElementById("main-page");
    const lightField = document.getElementById("light-field");
    const timers = new Set();
    let stage = "question";

    function later(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    }

    function clearTimers() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    }

    function showMainPage() {
      mainPage.classList.add("is-visible");
      mainPage.inert = false;
      mainPage.removeAttribute("aria-hidden");
    }

    function hideMainPage() {
      mainPage.classList.remove("is-visible");
      mainPage.inert = true;
      mainPage.setAttribute("aria-hidden", "true");
    }

    function finishIntro() {
      if (stage === "exiting" || stage === "finished") return;
      const restoreFocus = overlay.contains(document.activeElement);
      clearTimers();
      stage = "exiting";
      overlay.classList.add("is-exiting");
      showMainPage();

      later(() => {
        overlay.hidden = true;
        overlay.setAttribute("aria-hidden", "true");
        stage = "finished";
        if (restoreFocus) document.querySelector(".button-primary").focus({ preventScroll: true });
      }, motionQuery.matches ? 0 : 550);
    }

    function showReveal() {
      if (stage !== "question") return;
      stage = "leaving-question";
      question.classList.add("is-leaving");

      later(() => {
        question.hidden = true;
        reveal.hidden = false;
        reveal.classList.add("is-active");
        lightField.classList.add("light-surge");
        stage = "reveal";
        later(finishIntro, 2400);
      }, motionQuery.matches ? 0 : 260);
    }

    function replayIntro() {
      clearTimers();
      stage = "question";
      overlay.hidden = false;
      overlay.removeAttribute("aria-hidden");
      overlay.classList.remove("is-exiting");
      question.hidden = false;
      question.classList.remove("is-leaving");
      reveal.classList.remove("is-active");
      reveal.hidden = true;
      lightField.classList.remove("light-surge");
      hideMainPage();
      document.getElementById("intro-yes").focus({ preventScroll: true });
    }

    hideMainPage();
    document.getElementById("intro-yes").addEventListener("click", showReveal);
    document.getElementById("intro-skip").addEventListener("click", finishIntro);
    reveal.addEventListener("click", finishIntro);
    reveal.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        finishIntro();
      }
    });
    document.querySelectorAll("[data-replay-intro]").forEach((button) => {
      button.addEventListener("click", replayIntro);
    });
  }

  populateLinks();
  initializeTheme();
  initializeSpotlight();
  initializePortrait();
  initializePlayground();
  initializeIntro();
})();
