(() => {
  const SCHEME = ["data-md-color-scheme", "data-md-color-primary", "data-md-color-accent"];
  new MutationObserver(() => {
    for (const a of SCHEME) document.documentElement.setAttribute(a, document.body.getAttribute(a));
  }).observe(document.body, { attributes: true, attributeFilter: SCHEME });

  const article = document.querySelector("article.md-typeset");
  if (!article) return;

  for (const strong of article.querySelectorAll("p > strong:first-child")) {
    const text = strong.nextSibling;
    if (text && text.nodeType === Node.TEXT_NODE && /^\s*:/.test(text.data)) {
      text.data = text.data.replace(/^\s*:\s*/, " ");
      strong.textContent = strong.textContent.trim().replace(/:?$/, ":");
    }
    if (strong.parentElement.matches(".bio > div > p:first-child")) {
      strong.textContent = strong.textContent.replace(/:$/, "");
    }
  }

  for (const repeat of article.querySelectorAll("p > .twemoji:first-child + strong")) {
    const label = repeat.parentElement.previousElementSibling;
    if (label && label.textContent.trim() === repeat.textContent.trim()) repeat.remove();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const heading of article.querySelectorAll(".timeline li > h3")) {
    const link = heading.querySelector("a:not(.headerlink)");
    const text = (link ? link.textContent : heading.firstChild?.textContent) || "";
    const parts = text.match(/^\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2})\w*,?\s*(\d{4})?,?\s*([A-Za-z]*)/);
    if (parts) {
      const [, month, day, year, weekday] = parts;
      const monthIndex = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(month[0].toUpperCase() + month.slice(1).toLowerCase()) / 3;
      const when = new Date(year ? +year : today.getFullYear(), monthIndex, +day);
      if (monthIndex >= 0 && when < today) heading.closest("li").classList.add("vb-past");
      const date = document.createElement("span");
      date.className = "vb-date";
      date.innerHTML =
        `<span class="vb-date__day">${day}</span>` +
        `<span class="vb-date__month">${month}${year ? ` ${year}` : ""}</span>` +
        (weekday ? `<span class="vb-date__weekday">${weekday}</span>` : "");
      if (link) link.replaceChildren(date); else heading.firstChild.replaceWith(date);
    }
    if (!link) continue;
    const more = document.createElement("a");
    more.href = link.href;
    more.textContent = "Learn more";
    const line = document.createElement("p");
    line.className = "vb-more";
    line.append(more);
    heading.closest("li").append(line);
  }

  for (const menu of article.querySelectorAll(".vb-calendar")) {
    const close = () => { menu.open = false; };
    document.addEventListener("click", ({ target }) => { if (!menu.contains(target) || target.closest("a")) close(); });
    menu.addEventListener("keydown", ({ key }) => {
      if (key === "Escape" && menu.open) { close(); menu.querySelector("summary").focus(); }
    });
    for (const link of menu.querySelectorAll("a[href^='http']")) { link.target = "_blank"; link.rel = "noopener"; }
  }

  const schemed = [...article.querySelectorAll("img[data-dark]")];
  if (schemed.length) {
    for (const img of schemed) img.dataset.light = img.getAttribute("src");
    const swap = () => {
      const dark = document.body.getAttribute("data-md-color-scheme") === "slate";
      for (const img of schemed) img.setAttribute("src", dark ? img.dataset.dark : img.dataset.light);
    };
    swap();
    new MutationObserver(swap).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
  }

  const LOGO_AREA = 9000;
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const sizeLogo = (img) => {
    const ratio = img.naturalWidth / img.naturalHeight;
    if (!ratio) return;
    let weight = 1;
    try {
      probe.canvas.width = 64;
      probe.canvas.height = Math.max(1, Math.round(64 / ratio));
      probe.drawImage(img, 0, 0, probe.canvas.width, probe.canvas.height);
      const { data } = probe.getImageData(0, 0, probe.canvas.width, probe.canvas.height);
      let inked = 0;
      for (let i = 3; i < data.length; i += 4) inked += data[i] > 127;
      const fill = inked / (data.length / 4);
      weight = Math.min(1.15, Math.max(0.85, (0.25 / fill) ** 0.25));
    } catch {}
    const tallest = parseFloat(getComputedStyle(img).maxHeight) || Infinity;
    img.style.width = `${Math.round(Math.min(Math.sqrt(LOGO_AREA * ratio) * weight, tallest * ratio))}px`;
  };
  for (const img of article.querySelectorAll(".image-gallery img")) {
    if (img.complete && img.naturalWidth) sizeLogo(img);
    else img.addEventListener("load", () => sizeLogo(img), { once: true });
  }

  const FOLDS = ["bio", "abstract", "talk summary"];
  const isFoldLabel = (el) =>
    el.tagName === "P" &&
    el.children.length === 1 &&
    el.firstElementChild.tagName === "STRONG" &&
    el.textContent.trim() === el.firstElementChild.textContent.trim() &&
    FOLDS.includes(el.textContent.trim().replace(/:$/, "").toLowerCase());
  const isDivider = (el) => el.tagName === "HR" || el.classList.contains("bio");

  const event = article.querySelector(".vb-event");
  let start = event && [...event.children].find(isFoldLabel);
  for (let n = 0; start; n++) {
    const fold = document.createElement("div");
    fold.className = "vb-fold";
    fold.id = `vb-fold-${n}`;
    const body = document.createElement("div");
    body.className = "vb-fold__body";
    fold.append(body);
    start.before(fold);
    for (let el = fold.nextElementSibling; el && !isDivider(el); el = fold.nextElementSibling) body.append(el);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vb-fold__button";
    button.setAttribute("aria-controls", fold.id);
    button.setAttribute("aria-expanded", "false");
    button.textContent = "Read more";
    button.addEventListener("click", () => {
      const open = fold.classList.toggle("vb-fold--open");
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Read less" : "Read more";
      if (open) return;
      const anchor = button.getBoundingClientRect().top;
      const started = performance.now();
      const hold = (now) => {
        scrollBy({ top: button.getBoundingClientRect().top - anchor, behavior: "instant" });
        if (now - started < 450) requestAnimationFrame(hold);
      };
      requestAnimationFrame(hold);
    });
    const toggle = document.createElement("p");
    toggle.className = "vb-fold__toggle";
    toggle.append(button);
    fold.after(toggle);

    const rest = [...event.children];
    start = rest.slice(rest.indexOf(toggle) + 1).find(isFoldLabel);
  }

  const sidebar = document.querySelector(".md-sidebar--primary");
  if (sidebar) {
    sidebar.addEventListener("change", ({ target }) => {
      if (!target.matches(".md-nav__toggle") || !target.checked) return;
      const item = target.closest(".md-nav__item");
      for (const other of item.parentElement.querySelectorAll(":scope > .md-nav__item > .md-nav__toggle")) {
        if (other !== target) other.checked = false;
      }
      let scroller = item.parentElement;
      while (scroller !== sidebar && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
      const nav = item.querySelector(":scope > .md-nav");
      const list = nav.querySelector(":scope > .md-nav__list");
      const listStyle = getComputedStyle(list);
      const grown = list.scrollHeight + parseFloat(listStyle.marginTop) + parseFloat(listStyle.marginBottom);
      const frame = scroller.getBoundingClientRect();
      const from = item.getBoundingClientRect().top;
      const row = nav.getBoundingClientRect().top - from;
      const to = Math.max(frame.top + 8, Math.min(from, frame.bottom - 8 - row - grown));
      const started = performance.now();
      const follow = (now) => {
        const progress = Math.min(1, nav.getBoundingClientRect().height / grown);
        scroller.scrollTop += item.getBoundingClientRect().top - (from + (to - from) * progress);
        if (now - started < 400) requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    });
  }

  const search = document.querySelector(".md-search__input");
  if (search) {
    const idle = search.placeholder;
    search.addEventListener("focus", () => { search.placeholder = "Type to start searching"; });
    search.addEventListener("blur", () => { search.placeholder = idle; });
  }

  for (const img of article.querySelectorAll("img:not([src$='.svg'])")) {
    const hide = () => { img.hidden = true; };
    if (img.complete && !img.naturalWidth) hide(); else img.addEventListener("error", hide);
  }

  const hero = document.querySelector(".vb-hero");
  if (!hero || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "vb-hero__canvas";
  canvas.setAttribute("aria-hidden", "true");
  hero.prepend(canvas);
  const ctx = canvas.getContext("2d");
  const BASES = "ACGT";
  const CELL = 22;
  const LINE = 22;
  const ALPHA = 0.16;
  const HEAD = 101;
  const REACH = 24;
  const WANDER = 12;
  const MUTATIONS = 120;
  const FADE = 0.14;
  const COOL = 0.72;
  const pick = () => BASES[(Math.random() * 4) | 0];
  const cell = () => ({ base: pick(), prev: "", fade: 1, heat: 0, lock: 0, delay: 0, flip: 0, x: 0, y: 0 });
  let rows = [];
  let width = 0;
  let height = 0;

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = hero.clientWidth;
    height = hero.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "400 16px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    const cols = Math.ceil(width / CELL) + 2;
    rows = Array.from({ length: Math.ceil(height / LINE) + 1 }, (_, i) =>
      rows[i] && rows[i].cells.length >= cols
        ? rows[i]
        : {
            cells: Array.from({ length: cols }, cell),
            offset: Math.random() * CELL,
            speed: (3 + Math.random() * 3.6) * (i % 2 ? 1 : -1),
            debt: 0,
            phase: Math.random() * 2 * Math.PI,
            pace: 0.4 + Math.random() * 0.8,
          });
  };

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(" ")})`;
  let scheme, shades, glow;
  const colours = () => {
    const style = getComputedStyle(hero);
    const ink = rgb(style.getPropertyValue("--vb-green").trim());
    const lime = rgb(style.getPropertyValue("--vb-lime").trim());
    glow = parseFloat(style.getPropertyValue("--vb-glow")) || 0;
    shades = Array.from({ length: 33 }, (_, k) => mix(ink, lime, k / 32));
  };
  let head = -160;
  let last = 0;
  let visible = true;
  let running = true;

  const frame = (time) => {
    if (!visible) { running = false; return; }
    requestAnimationFrame(frame);
    if (time - last < 15) return;
    const dt = Math.min((time - last) / 1000, 0.05);
    const now = time / 1000;
    last = time;
    if (scheme !== document.body.dataset.mdColorScheme) {
      scheme = document.body.dataset.mdColorScheme;
      colours();
    }
    const cool = Math.exp(-dt / COOL);
    head = head > width + 160 + WANDER ? -160 : head + HEAD * dt;

    ctx.clearRect(0, 0, width, height);
    ctx.shadowColor = shades[32];
    ctx.shadowBlur = 0;
    ctx.globalAlpha = ALPHA;
    ctx.fillStyle = shades[0];
    const lit = [];
    rows.forEach((row, r) => {
      const { cells, phase, pace } = row;
      row.offset += row.speed * dt;
      if (row.offset > CELL) { row.offset -= CELL; cells.unshift(cells.pop()); }
      if (row.offset < -CELL) { row.offset += CELL; cells.push(cells.shift()); }
      for (row.debt += MUTATIONS * dt; row.debt >= 1; row.debt--) {
        const c = cells[(Math.random() * cells.length) | 0];
        if (c.lock < now) { c.prev = c.base; c.base = pick(); c.fade = 0; }
      }
      const y = r * LINE + LINE / 2;
      const wander = 0.6 * Math.sin(now * pace + phase) + 0.4 * Math.sin(now * pace * 2.3 + phase * 1.7);
      const front = head + WANDER * wander;
      cells.forEach((c, i) => {
        const x = i * CELL - CELL + row.offset;
        c.heat *= cool;
        if (Math.abs(x - front) < REACH) {
          c.heat = 1;
          if (c.lock < now) c.delay = 0.05 + Math.random() * 0.3;
          c.lock = now + c.delay;
        }
        if (c.lock > now && now - c.flip > 0.05) { c.base = pick(); c.flip = now; c.fade = 1; }
        if (c.fade < 1) c.fade = Math.min(1, c.fade + dt / FADE);
        if (c.heat < 0.02 && c.fade === 1) ctx.fillText(c.base, x, y);
        else { c.x = x; c.y = y; lit.push(c); }
      });
    });

    for (const c of lit) {
      const alpha = ALPHA + (1 - ALPHA) * c.heat;
      const shown = 1 - (1 - c.fade) ** 2;
      ctx.fillStyle = shades[Math.round(c.heat * 32)];
      ctx.shadowBlur = c.heat > 0.5 ? glow * c.heat : 0;
      if (shown < 1) { ctx.globalAlpha = alpha * (1 - shown); ctx.fillText(c.prev, c.x, c.y); }
      ctx.globalAlpha = alpha * shown;
      ctx.fillText(c.base, c.x, c.y);
    }
  };

  resize();
  frame(performance.now());
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !running) { running = true; requestAnimationFrame(frame); }
  }).observe(hero);
})();
