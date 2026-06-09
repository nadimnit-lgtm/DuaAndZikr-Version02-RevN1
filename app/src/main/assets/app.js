/* ==========================================================================
   Azkar TV Display — Version 02
   Reading engine: categories (Azkar / Dua / Kalima), mixed flow, navigation,
   dynamic Arabic fit, settings, prayer ribbon. TV (D-pad) + touch + tablet.
   Offline-first. All assets served from the bundled appassets origin.
   ========================================================================== */
(function () {
  "use strict";

  var LS = "azkartv.v02.settings";
  var LS_POS = "azkartv.v02.pos";
  var LS_LOC = "azkartv.v02.loc";
  var CATS = ["Azkar", "Dua", "Kalima"];

  // Repeat may be null, undefined, a number, or a numeric string.
  function parseRepeat(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return (isFinite(v) && v > 0) ? Math.floor(v) : 0;
    var n = parseInt(String(v).trim(), 10);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  // Round-robin interleave Azkar -> Dua -> Kalima -> repeat. Exhausted lists
  // are skipped so the cycle keeps producing items until everything is used.
  function buildMixed(buckets) {
    var out = [], i = 0, remaining = CATS.reduce(function (n, c) { return n + buckets[c].length; }, 0);
    while (out.length < remaining) {
      for (var c = 0; c < CATS.length; c++) {
        var list = buckets[CATS[c]];
        if (i < list.length) out.push(list[i]);
      }
      i++;
      if (i > 5000) break; // hard safety
    }
    return out;
  }

  // Section browsing uses explicit content order when available. This keeps
  // Salah sections in prayer-flow order even after future content edits.
  function byDisplayOrder(a, b) {
    var ao = (typeof a.order === "number") ? a.order : ((typeof a.priority === "number") ? a.priority : 999999);
    var bo = (typeof b.order === "number") ? b.order : ((typeof b.priority === "number") ? b.priority : 999999);
    return ao - bo;
  }

  var THEMES = [
    { id: "dark-ambient",  name: "Dark Ambient",  a: "#0e1413", b: "#c9a85a" },
    { id: "gold-navy",     name: "Gold & Navy",   a: "#0a1428", b: "#e6c168" },
    { id: "haram-light",   name: "Haram Light",   a: "#f4efe6", b: "#b08828" },
    { id: "green-classic", name: "Green Classic", a: "#0c1b14", b: "#57b489" },
    { id: "high-contrast", name: "High Contrast", a: "#000000", b: "#ffe14d" }
  ];

  var CITY_LABEL = { auto: "Auto", riyadh: "Riyadh", jeddah: "Jeddah", makkah: "Makkah", madinah: "Madinah", dammam: "Dammam" };
  var APPROX = {
    riyadh:  { Fajr:"04:30", Dhuhr:"11:55", Asr:"15:20", Maghrib:"18:35", Isha:"20:05" },
    jeddah:  { Fajr:"04:45", Dhuhr:"12:10", Asr:"15:35", Maghrib:"18:50", Isha:"20:20" },
    makkah:  { Fajr:"04:42", Dhuhr:"12:08", Asr:"15:33", Maghrib:"18:48", Isha:"20:18" },
    madinah: { Fajr:"04:38", Dhuhr:"12:05", Asr:"15:28", Maghrib:"18:45", Isha:"20:15" },
    dammam:  { Fajr:"04:18", Dhuhr:"11:45", Asr:"15:10", Maghrib:"18:25", Isha:"19:55" }
  };

  var DEFAULTS = {
    theme: "dark-ambient",
    arabicScript: "naskh",            // Naskh (Scheherazade) only
    arScale: 1.0, tlScale: 1.0, trScale: 1.0,
    easyView: false,
    showTranslit: true, showTranslation: true, showSource: true,
    showRibbon: true, tajweed: false,
    showCopy: true,
    flowMode: "mixed",                // mixed (default) | category
    autoRotate: false, interval: 25,
    city: "auto",
    lang: "en"                        // en | ur
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var IS_TV = /[?&]tv=1\b/.test(location.search) ||
              /\bGoogle TV\b|\bAndroid TV\b|\bLeanback\b/i.test(navigator.userAgent || "");

  /* ---- i18n: English / Urdu UI -------------------------------------------- */
  var I18N = {
    en: {
      nowReading:"Now reading", mixedFlow:"Mixed Flow", whatToRead:"What to read",
      browseSection:"Browse by section", settings:"Settings", saveApply:"Save & Apply",
      approx:"approx", scroll:"scroll \u2304", prev:"Previous", next:"Next",
      grpDisplay:"Display", grpContent:"Content", grpNavigation:"Navigation", grpPrayer:"Prayer", grpAbout:"About",
      language:"Language", simpleMode:"Simple mode (large text & buttons)",
      simpleModeDesc:"Bigger Arabic, buttons and spacing \u2014 easiest to read and operate.",
      location:"Location", locationDesc:"Automatic uses your device location anywhere in the world, or pick a city.",
      vQuran:"Qur\u2019an", vHadith:"Hadith \u2014 source cited", vCompilation:"Traditional \u2014 unverified", searchDuas:"Search du\u2019as by name\u2026"
    },
    ur: {
      nowReading:"\u0627\u0628 \u067E\u0691\u06BE \u0631\u06C1\u06D2 \u06C1\u06CC\u06BA", mixedFlow:"\u0645\u0644\u0627 \u062C\u0644\u0627",
      whatToRead:"\u06A9\u06CC\u0627 \u067E\u0691\u06BE\u06CC\u06BA", browseSection:"\u0632\u0645\u0631\u06C1 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA",
      settings:"\u062A\u0631\u062A\u06CC\u0628\u0627\u062A", saveApply:"\u0645\u062D\u0641\u0648\u0638 \u06A9\u0631\u06CC\u06BA",
      approx:"\u062A\u062E\u0645\u06CC\u0646\u0627\u064B", scroll:"\u0633\u06A9\u0631\u0648\u0644 \u2304",
      prev:"\u067E\u0686\u06BE\u0644\u0627", next:"\u0627\u06AF\u0644\u0627",
      grpDisplay:"\u0688\u0633\u067E\u0644\u06D2", grpContent:"\u0645\u0648\u0627\u062F", grpNavigation:"\u0646\u06CC\u0648\u06CC\u06AF\u06CC\u0634\u0646",
      grpPrayer:"\u0646\u0645\u0627\u0632", grpAbout:"\u0628\u0627\u0631\u06D2 \u0645\u06CC\u06BA",
      language:"\u0632\u0628\u0627\u0646", simpleMode:"\u0622\u0633\u0627\u0646 \u0645\u0648\u0688 (\u0628\u0691\u0627 \u0645\u062A\u0646 \u0648 \u0628\u0679\u0646)",
      simpleModeDesc:"\u0628\u0691\u0627 \u0639\u0631\u0628\u06CC\u060C \u0628\u0679\u0646 \u0627\u0648\u0631 \u062C\u06AF\u06C1 \u2014 \u067E\u0691\u06BE\u0646\u0627 \u0627\u0648\u0631 \u0686\u0644\u0627\u0646\u0627 \u0622\u0633\u0627\u0646\u06D4",
      location:"\u0645\u0642\u0627\u0645", locationDesc:"\u062E\u0648\u062F\u06A9\u0627\u0631 \u0622\u067E \u06A9\u06D2 \u0622\u0644\u06C1 \u06A9\u06CC \u0644\u0648\u06A9\u06CC\u0634\u0646 \u0633\u06D2 \u062F\u0646\u06CC\u0627 \u0628\u06BE\u0631 \u0645\u06CC\u06BA \u0646\u0645\u0627\u0632 \u06A9\u06D2 \u0627\u0648\u0642\u0627\u062A\u060C \u06CC\u0627 \u0634\u06C1\u0631 \u0645\u0646\u062A\u062E\u0628 \u06A9\u0631\u06CC\u06BA\u06D4",
      vQuran:"\u0642\u0631\u0622\u0646", vHadith:"\u062D\u062F\u06CC\u062B \u2014 \u062D\u0648\u0627\u0644\u06C1 \u062F\u0631\u062C", vCompilation:"\u0631\u0648\u0627\u06CC\u062A\u06CC \u2014 \u063A\u06CC\u0631 \u0645\u0635\u062F\u0642\u06C1", searchDuas:"\u0646\u0627\u0645 \u0633\u06D2 \u062F\u0639\u0627 \u062A\u0644\u0627\u0634 \u06A9\u0631\u06CC\u06BA\u2026"
    }
  };
  function t(k) {
    var L = I18N[state.settings.lang] || I18N.en;
    return (k in L) ? L[k] : (k in I18N.en ? I18N.en[k] : k);
  }
  function applyLang() {
    var ur = state.settings.lang === "ur";
    document.documentElement.setAttribute("lang", ur ? "ur" : "en");
    document.body.setAttribute("data-lang", state.settings.lang);
    document.body.dir = ur ? "rtl" : "ltr";
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    $$("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
  }

  var state = {
    content: null, sections: null,
    canonicalItems: [],          // one unique dua/zikr record only
    sectionItems: [],            // virtual display records created from sectionRefs
    allItems: [],
    buckets: { Azkar: [], Dua: [], Kalima: [] },
    playlist: [], index: 0,
    view: { mode: "mixed", category: "Azkar", section: null }, // mode: mixed|category|section
    settings: load(), draft: null, autoTimer: null,
    pendingScrollTop: 0, scrollTimer: null
  };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || "{}");
      var s = {}; for (var k in DEFAULTS) s[k] = (k in raw) ? raw[k] : DEFAULTS[k];
      s.arabicScript = "naskh";   // Indo-Pak/Nastaliq retired for Arabic; Naskh only
      s.city = "auto";            // location is always live now
      return s;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state.settings)); } catch (e) {} }
  function savePos() {
    try {
      var sc = $("#readerScroll");
      var cur = state.playlist[state.index] || null;
      localStorage.setItem(LS_POS, JSON.stringify({
        view: state.view,
        index: state.index,
        itemId: cur ? (cur.display_id || cur.id) : null,
        scrollTop: sc ? sc.scrollTop : 0
      }));
    } catch (e) {}
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    if (IS_TV) document.body.classList.add("tv");
    Promise.all([
      fetch("content/content.json").then(function (r) { return r.json(); }),
      fetch("content/sections.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      state.content = res[0];
      state.sections = res[1];
      indexContent();
      applyBodyFlags();
      applyTheme(state.settings.theme);
      applyLang();
      buildViewList();
      buildSettings();
      bindGlobal();
      restorePosition();
      rebuildPlaylist(true);
      setupPrayer();
      setTimeout(function () { var s = $("#splash"); s.classList.add("gone"); setTimeout(function () { s.remove(); }, 500); }, 1700);
    }).catch(function (err) {
      var s = $("#splash"); if (s) s.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:24px;text-align:center">Unable to load content.<br>' + (err && err.message || "") + '</div>';
    });
  }

  function getSectionRefs(it) {
    if (Array.isArray(it.sectionRefs) && it.sectionRefs.length) return it.sectionRefs;
    return [{
      section: it.section,
      category: it.category,
      type: it.type,
      main_category: it.main_category,
      title: it.title,
      source: it.source,
      repeat: it.repeat,
      order: it.order,
      priority: it.priority
    }];
  }

  function displayRecord(it, ref) {
    var out = Object.assign({}, it);
    out.canonical_id = it.id;
    out.display_id = it.id + "@" + (ref.section || it.section);
    out.section = ref.section || it.section;
    out.category = ref.category || it.category;
    out.type = ref.type || it.type;
    out.main_category = ref.main_category || it.main_category;
    out.title = ref.title || it.title;
    out.source = ref.source || it.source;
    out.repeat = ("repeat" in ref) ? ref.repeat : it.repeat;
    out.order = (typeof ref.order === "number") ? ref.order : it.order;
    out.priority = (typeof ref.priority === "number") ? ref.priority : it.priority;
    return out;
  }

  function indexContent() {
    var secOrder = {};
    (state.sections.sections || []).forEach(function (s, i) { secOrder[s.key] = i; });

    state.canonicalItems = (state.content.items || []).slice().sort(function (a, b) {
      var ar = getSectionRefs(a)[0] || {}, br = getSectionRefs(b)[0] || {};
      var as = (typeof secOrder[ar.section || a.section] === "number") ? secOrder[ar.section || a.section] : 999999;
      var bs = (typeof secOrder[br.section || b.section] === "number") ? secOrder[br.section || b.section] : 999999;
      if (as !== bs) return as - bs;
      return byDisplayOrder(displayRecord(a, ar), displayRecord(b, br));
    });

    state.sectionItems = [];
    state.canonicalItems.forEach(function (it) {
      getSectionRefs(it).forEach(function (ref) { state.sectionItems.push(displayRecord(it, ref)); });
    });
    state.sectionItems.sort(function (a, b) {
      var as = (typeof secOrder[a.section] === "number") ? secOrder[a.section] : 999999;
      var bs = (typeof secOrder[b.section] === "number") ? secOrder[b.section] : 999999;
      if (as !== bs) return as - bs;
      return byDisplayOrder(a, b);
    });

    state.allItems = state.canonicalItems;
    state.buckets = { Azkar: [], Dua: [], Kalima: [] };
    state.canonicalItems.forEach(function (it) {
      var c = it.main_category;
      if (CATS.indexOf(c) < 0) c = (it.type === "Kalima") ? "Kalima" : (it.type === "Dua" ? "Dua" : "Azkar");
      state.buckets[c].push(it);
    });
  }

  /* ---- body flags (theme-independent classes) ---------------------------- */
  function applyBodyFlags() {
    document.body.classList.toggle("easy", !!state.settings.easyView);
    document.body.classList.toggle("no-copy", !state.settings.showCopy || IS_TV);
  }

  function applyTheme(id) { document.body.setAttribute("data-theme", id); }

  /* ---- playlist (mixed / category / section) ----------------------------- */
  function rebuildPlaylist(keepIndex) {
    var v = state.view, pl;
    if (v.mode === "mixed") pl = buildMixed(state.buckets);
    else if (v.mode === "category") pl = (state.buckets[v.category] || []).slice();
    else pl = state.sectionItems.filter(function (it) { return it.section === v.section; }).sort(byDisplayOrder);
    if (!pl.length) pl = buildMixed(state.buckets);
    state.playlist = pl;
    if (!keepIndex || state.index >= pl.length || state.index < 0) state.index = 0;
    updateViewLabel();
    markViewList();
    render();
    savePos();
  }

  function viewLabel() {
    var v = state.view;
    if (v.mode === "mixed") return t("mixedFlow");
    if (v.mode === "category") return v.category;
    var meta = (state.sections.sections || []).filter(function (s) { return s.key === v.section; })[0];
    return meta ? meta.label : v.section;
  }
  function updateViewLabel() {
    $("#curView").textContent = viewLabel();
    $("#viewEyebrow").textContent = state.view.mode === "mixed" ? "Now reading" : (state.view.mode === "category" ? "Category" : "Section");
  }

  /* ---- view picker list -------------------------------------------------- */
  function buildViewList() {
    var wrap = $("#secList"); wrap.innerHTML = "";

    // Mixed flow (primary, default)
    var mix = document.createElement("button");
    mix.className = "sec-item primary"; mix.setAttribute("data-view", "mixed");
    mix.innerHTML = '<span class="sec-name">Mixed Flow<div class="sec-sub">Azkar → Dua → Kalima, cycling</div></span><span class="sec-count">' + state.canonicalItems.length + '</span>';
    mix.addEventListener("click", function () { setView({ mode: "mixed" }); closeSheets(); });
    wrap.appendChild(mix);

    // Categories
    var ch = document.createElement("div"); ch.className = "sec-head"; ch.textContent = "Single category"; wrap.appendChild(ch);
    CATS.forEach(function (c) {
      var n = state.buckets[c].length; if (!n) return;
      var b = document.createElement("button");
      b.className = "sec-item"; b.setAttribute("data-view", "category:" + c);
      b.innerHTML = '<span class="sec-name">' + esc(c) + '</span><span class="sec-count">' + n + '</span>';
      b.addEventListener("click", function () { setView({ mode: "category", category: c }); closeSheets(); });
      wrap.appendChild(b);
    });

    // Sections (fine-grained browse)
    var sh = document.createElement("div"); sh.className = "sec-head"; sh.textContent = "Browse by section"; wrap.appendChild(sh);
    (state.sections.sections || []).forEach(function (s) {
      if (!s.count) return;
      var b = document.createElement("button");
      b.className = "sec-item"; b.setAttribute("data-view", "section:" + s.key);
      b.innerHTML = '<span class="sec-name">' + esc(s.label) + '</span><span class="sec-count">' + s.count + '</span>';
      b.addEventListener("click", function () { setView({ mode: "section", section: s.key }); closeSheets(); });
      wrap.appendChild(b);
    });
  }
  function markViewList() {
    var v = state.view;
    var token = v.mode === "mixed" ? "mixed" : v.mode === "category" ? ("category:" + v.category) : ("section:" + v.section);
    $$(".sec-item").forEach(function (el) { el.classList.toggle("active", el.getAttribute("data-view") === token); });
  }
  function setView(v) {
    state.view = { mode: v.mode, category: v.category || state.view.category, section: v.section || state.view.section };
    state.settings.flowMode = (v.mode === "mixed") ? "mixed" : state.settings.flowMode;
    rebuildPlaylist(false);
  }

  /* ---- rendering --------------------------------------------------------- */
  function autoSize(mode, scale) {
    var base = { short: 46, normal: 36, long: 30, very_long: 25 }[mode] || 34;
    var w = window.innerWidth, h = window.innerHeight, minDim = Math.min(w, h);
    if (IS_TV) base += 14;
    else if (minDim >= 820) base += 8;
    else if (minDim >= 680) base += 4;
    if (h < 460) base = Math.round(base * 0.72);
    else if (h < 560) base = Math.round(base * 0.85);
    if (state.settings.easyView) base = Math.round(base * 1.15);
    // Nastaliq renders visually smaller per em — nudge up a touch.
    if (state.settings.arabicScript === "indopak") base = Math.round(base * 1.08);
    return Math.round(base * scale);
  }

  function render() {
    var it = state.playlist[state.index];
    if (!it) return;
    var s = state.settings, reader = $("#reader");
    reader.setAttribute("data-size", it.size_mode);

    var ar = autoSize(it.size_mode, s.arScale);
    reader.style.setProperty("--ar-size", ar + "px");
    // Nastaliq needs a much taller line box than Naskh.
    reader.style.setProperty("--ar-lh", s.arabicScript === "indopak" ? "2.45" : "1.95");
    reader.style.setProperty("--tl-size", Math.round((it.size_mode === "short" ? 18 : 16) * s.tlScale) + "px");
    reader.style.setProperty("--tr-size", Math.round((it.size_mode === "short" ? 19 : 17) * s.trScale) + "px");

    var arEl = $("#mArabic");
    arEl.setAttribute("data-script", s.arabicScript);
    // Tajweed only when verified markup exists AND toggle on; otherwise plain.
    if (s.tajweed && it.tajweed_html) arEl.innerHTML = it.tajweed_html;
    else arEl.textContent = it.arabic;

    $("#mCategory").textContent = it.category;
    $("#mType").textContent = it.type;
    var ur = state.settings.lang === "ur";
    var titleTxt = (ur && it.title_ur) ? it.title_ur : (it.title || "");
    $("#mTitle").textContent = titleTxt;
    $("#mTitle").classList.toggle("hidden", !titleTxt);
    $("#mFlowTag").textContent = (state.view.mode === "mixed") ? (it.main_category || "") : "";

    // Transliteration stays Latin/LTR; translation follows the chosen language.
    setLine("#mTranslit", it.transliteration, s.showTranslit);
    var trEl = $("#mTranslit"); if (trEl) trEl.setAttribute("dir", "ltr");
    var transTxt = (ur && it.translation_ur) ? it.translation_ur : it.translation;
    setLine("#mTranslation", transTxt, s.showTranslation);
    var tnEl = $("#mTranslation");
    if (tnEl) {
      var showUr = ur && !!it.translation_ur;
      tnEl.setAttribute("dir", showUr ? "rtl" : "ltr");
      tnEl.classList.toggle("ur-text", showUr);
    }
    $("#mSource").textContent = it.source || "";
    $("#mSource").setAttribute("dir", "ltr");
    $("#mSource").parentElement.classList.toggle("hidden", !s.showSource || !it.source);

    var rep = $("#mRepeat"), r = parseRepeat(it.repeat);
    if (r && r > 1) { rep.textContent = "\u00d7" + r; rep.classList.remove("hidden"); }
    else rep.classList.add("hidden");

    var v = $("#mVerify");
    v.className = "verify " + it.verification;
    $("#mVerifyText").textContent = ({ quran: t("vQuran"), hadith: t("vHadith"), compilation: t("vCompilation") })[it.verification] || t("vHadith");
    var pct = state.playlist.length > 1 ? (state.index / (state.playlist.length - 1)) * 100 : 100;
    $("#progressFill").style.width = pct + "%";
    $("#counterText").textContent = (state.index + 1) + " / " + state.playlist.length;

    requestAnimationFrame(function () { fitArabic(arEl, ar); });
    savePos();
  }

  // Dynamic fit: shrink Arabic until it never overflows the card width
  // (prevents clipping and one-word-per-line). Long content still scrolls
  // vertically inside the card; it never spills outside the boundary.
  function fitArabic(arEl, startPx) {
    var size = startPx, min = Math.max(16, Math.round(startPx * 0.5)), guard = 0;
    while (arEl.scrollWidth > arEl.clientWidth + 1 && size > min && guard < 40) {
      size -= 1; arEl.style.fontSize = size + "px"; guard++;
    }
    var sc = $("#readerScroll"), reader = $("#reader");
    reader.classList.toggle("can-scroll", sc.scrollHeight - sc.clientHeight > 24);
    sc.scrollTop = Math.max(0, state.pendingScrollTop || 0);
    state.pendingScrollTop = 0;
  }

  function setLine(sel, text, show) {
    var el = $(sel);
    if (show && text) { el.textContent = text; el.classList.remove("hidden"); }
    else el.classList.add("hidden");
  }

  function go(delta) {
    if (!state.playlist.length) return;
    var ni = (state.index + delta + state.playlist.length) % state.playlist.length;
    if (ni === state.index) return;
    var sc = $("#readerScroll");
    var outClass = delta > 0 ? "swap-out-left" : "swap-out-right";
    var inClass = delta > 0 ? "swap-in-left" : "swap-in-right";
    sc.classList.add(outClass);
    setTimeout(function () {
      savePos();
      state.index = ni; state.pendingScrollTop = 0; render();
      sc.classList.remove(outClass); sc.classList.add(inClass);
      setTimeout(function () { sc.classList.remove(inClass); }, 280);
    }, 170);
  }

  /* ---- auto rotation ----------------------------------------------------- */
  function setAuto(on) {
    state.settings.autoRotate = on;
    $("#autoFlag").classList.toggle("on", on);
    clearInterval(state.autoTimer);
    if (on) state.autoTimer = setInterval(function () { go(1); }, Math.max(5, state.settings.interval) * 1000);
  }
  function pokeAuto() { if (state.settings.autoRotate) setAuto(true); }

  // Scroll the reader by dy. Uses smooth scrollTo where supported and falls
  // back to a plain scrollTop assignment on older WebView builds (where the
  // options-dictionary form of scrollBy/scrollTo is unavailable and throws).
  function scrollReader(dy) {
    var sc = $("#readerScroll");
    var target = Math.max(0, sc.scrollTop + dy);
    try {
      if (typeof sc.scrollTo === "function") { sc.scrollTo({ top: target, behavior: "smooth" }); return; }
    } catch (e) { /* fall through */ }
    sc.scrollTop = target;
  }

  /* ---- copy (Stage 07, optional, hidden on TV) --------------------------- */
  function copyCurrent() {
    var it = state.playlist[state.index]; if (!it) return;
    var parts = [];
    if (it.title) parts.push(it.title);
    parts.push(it.arabic);
    if (it.transliteration) parts.push(it.transliteration);
    if (it.translation) parts.push(it.translation);
    if (it.source) parts.push("— " + it.source);
    var text = parts.join("\n");
    var done = function () { toast("Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else legacyCopy(text, done);
  }
  function legacyCopy(text, cb) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta); cb();
    } catch (e) { toast("Copy not available"); }
  }

  /* ---- gestures + keys (touch + D-pad) ----------------------------------- */
  function bindGlobal() {
    $("#prevBtn").addEventListener("click", function () { go(-1); pokeAuto(); });
    $("#nextBtn").addEventListener("click", function () { go(1); pokeAuto(); });
    $("#copyBtn").addEventListener("click", copyCurrent);
    $("#contrastBtn").addEventListener("click", function () {
      if (state.settings.theme !== "high-contrast") {
        state.prevTheme = state.settings.theme;          // remember to restore later
        state.settings.theme = "high-contrast";
      } else {
        state.settings.theme = state.prevTheme || "dark-ambient";
      }
      applyTheme(state.settings.theme); save();
      toast(state.settings.theme === "high-contrast" ? "High contrast on" : "High contrast off");
    });

    document.addEventListener("keydown", onKey);

    // horizontal swipe on the reader; vertical reserved for scrolling
    var sx = 0, sy = 0, t0 = 0, longTimer = null, moved = false;
    var reader = $("#reader");
    reader.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; t0 = Date.now(); moved = false;
      longTimer = setTimeout(function () {
        if (!moved) { setAuto(!state.settings.autoRotate); toast(state.settings.autoRotate ? "Auto-rotation on" : "Auto-rotation paused"); save(); }
      }, 620);
    }, { passive: true });
    reader.addEventListener("touchmove", function (e) {
      var t = e.touches[0];
      if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) { moved = true; clearTimeout(longTimer); }
    }, { passive: true });
    reader.addEventListener("touchend", function (e) {
      clearTimeout(longTimer);
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - t0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) {
        if (dx < 0) go(1); else go(-1); pokeAuto();
      }
    }, { passive: true });

    $("#viewPick").addEventListener("click", function () {
      var sb = $("#secSearch"); if (sb) { sb.value = ""; renderSearch(""); }
      openSheet("#sectionSheet");
    });
    var secSearch = $("#secSearch");
    if (secSearch) secSearch.addEventListener("input", function () { renderSearch(this.value); });

    $("#openSettings").addEventListener("click", openSettings);
    $("#scrim").addEventListener("click", closeSheets);
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeSheets); });
    $("#applyBtn").addEventListener("click", applySettings);

    window.addEventListener("resize", function () { render(); });
    window.addEventListener("orientationchange", function () { setTimeout(render, 120); });
    var scroller = $("#readerScroll");
    if (scroller) scroller.addEventListener("scroll", function () {
      clearTimeout(state.scrollTimer);
      state.scrollTimer = setTimeout(savePos, 120);
    }, { passive: true });

    if (IS_TV) $("#reader").focus();
  }

  function onKey(e) {
    // When a sheet is open, let native focus handle D-pad; only Back/Escape closes.
    if (anySheetOpen()) { if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") { closeSheets(); e.preventDefault(); } return; }
    var sc = $("#readerScroll");
    switch (e.key) {
      case "ArrowLeft":  go(-1); pokeAuto(); e.preventDefault(); break;
      case "ArrowRight": go(1);  pokeAuto(); e.preventDefault(); break;
      case "ArrowUp":    scrollReader(-Math.round(sc.clientHeight * 0.5)); e.preventDefault(); break;
      case "ArrowDown":  scrollReader( Math.round(sc.clientHeight * 0.5)); e.preventDefault(); break;
      case "Enter": case " ": case "Spacebar":
        setAuto(!state.settings.autoRotate);
        toast(state.settings.autoRotate ? "Auto-rotation on" : "Auto-rotation paused"); save(); e.preventDefault(); break;
      default: break;
    }
  }

  /* ---- sheets ------------------------------------------------------------ */
  function openSheet(sel) {
    $("#scrim").classList.add("open"); $(sel).classList.add("open");
    if (IS_TV) { var f = $(sel + " .sec-item.active") || $(sel + " .sec-item") || $(sel + " button"); if (f) f.focus(); }
  }
  function anySheetOpen() { return $(".sheet.open") != null; }
  function closeSheets() {
    $("#scrim").classList.remove("open");
    $$(".sheet").forEach(function (s) { s.classList.remove("open"); });
    if (IS_TV) $("#reader").focus();
  }
  function openSettings() { state.draft = Object.assign({}, state.settings); syncSettingsUI(); openSheet("#settingsSheet"); }

  /* ---- search any du'a by name and jump straight to it ------------------- */
  function goToItem(id) {
    var i, it = null;
    for (i = 0; i < state.sectionItems.length; i++) {
      if (state.sectionItems[i].id === id || state.sectionItems[i].canonical_id === id || state.sectionItems[i].display_id === id) { it = state.sectionItems[i]; break; }
    }
    if (!it) return;
    state.view = { mode: "section", section: it.section, category: state.view.category };
    state.playlist = state.sectionItems.filter(function (x) { return x.section === it.section; }).sort(byDisplayOrder);
    state.index = 0;
    for (i = 0; i < state.playlist.length; i++) { if (state.playlist[i].display_id === it.display_id) { state.index = i; break; } }
    state.pendingScrollTop = 0;
    updateViewLabel(); markViewList(); render(); savePos();
    closeSheets();
  }

  function renderSearch(q) {
    q = (q || "").trim().toLowerCase();
    var res = $("#secResults"), list = $("#secList");
    if (!res || !list) return;
    if (!q) { res.hidden = true; res.innerHTML = ""; list.hidden = false; return; }
    list.hidden = true; res.hidden = false; res.innerHTML = "";
    var matches = [], i;
    for (i = 0; i < state.canonicalItems.length; i++) {
      var it = state.canonicalItems[i];
      var hay = ((it.title || "") + " " + (it.title_ur || "") + " " + (it.category || "") +
                 " " + (it.transliteration || "")).toLowerCase();
      if (hay.indexOf(q) >= 0) matches.push(it);
      if (matches.length >= 50) break;
    }
    if (!matches.length) {
      res.innerHTML = '<div class="sec-empty">No matching du\u2019as</div>'; return;
    }
    matches.forEach(function (it) {
      var b = document.createElement("button");
      b.className = "sec-item";
      b.innerHTML = '<span class="sec-name">' + esc(it.title) +
        '<div class="sec-sub">' + esc(it.category) + '</div></span>';
      b.addEventListener("click", function () { goToItem(it.id); });
      res.appendChild(b);
    });
  }


  /* ---- settings UI: Display / Content / Navigation / Prayer / About ------ */
  function buildSettings() {
    var body = $("#settingsBody"); body.innerHTML = "";

    // DISPLAY
    var disp = group(t("grpDisplay"));
    disp.appendChild(segRow(t("language"), "App language for the interface and translation. / \u0627\u06CC\u067E \u06A9\u06CC \u0632\u0628\u0627\u0646", "lang",
      [["English", "en"], ["\u0627\u0631\u062F\u0648", "ur"]]));
    var tg = document.createElement("div"); tg.className = "theme-grid";
    THEMES.forEach(function (t) {
      var c = document.createElement("button");
      c.className = "theme-card"; c.setAttribute("data-theme-id", t.id);
      c.innerHTML = '<div class="swatch"><div class="a" style="background:' + t.a + '"></div><div class="b" style="background:' + t.b + '"></div></div><div class="tname">' + esc(t.name) + '</div>';
      c.addEventListener("click", function () { state.draft.theme = t.id; applyTheme(t.id); markThemes(); });
      tg.appendChild(c);
    });
    disp.appendChild(rowCustom("Theme", "Calm palettes. High Contrast aids low vision. Live preview on tap.", tg, true));
    disp.appendChild(toggleRow(t("simpleMode"), t("simpleModeDesc"), "easyView"));
    disp.appendChild(stepperRow("Arabic font", "Hero Arabic text size.", "arScale"));
    disp.appendChild(stepperRow("Translation font", "English translation size.", "trScale"));
    disp.appendChild(stepperRow("Transliteration font", "Latin transliteration size.", "tlScale"));
    body.appendChild(disp);

    // CONTENT
    var cont = group(t("grpContent"));
    cont.appendChild(toggleRow("Show transliteration", "Latin reading aid below Arabic.", "showTranslit"));
    cont.appendChild(toggleRow("Show English translation", "Meaning below the Arabic text.", "showTranslation"));
    cont.appendChild(toggleRow("Show source reference", "Surah, ayah or hadith reference.", "showSource"));
    cont.appendChild(toggleRow("Tajweed colouring", "Applies only to verified Quranic markup. None is bundled in this version, so it stays off.", "tajweed"));
    body.appendChild(cont);

    // NAVIGATION
    var nav = group(t("grpNavigation"));
    nav.appendChild(segRow("Default flow", "Mixed cycles Azkar → Dua → Kalima. Single category stays in one group.", "flowMode",
      [["Mixed flow", "mixed"], ["By category", "category"]]));
    nav.appendChild(segRow("Auto-rotation", "Advance items automatically. Long-press the card, or press OK on TV, to pause.", "autoRotate",
      [["On", true], ["Off", false]]));
    nav.appendChild(segRow("Rotation interval", "Seconds per item when auto-rotation is on.", "interval",
      [["15s", 15], ["25s", 25], ["40s", 40], ["60s", 60]]));
    nav.appendChild(toggleRow("Copy button", "Show a copy control on each card. Hidden on TV.", "showCopy"));
    body.appendChild(nav);

    // PRAYER
    var pr = group(t("grpPrayer"));
    pr.appendChild(toggleRow("Compact prayer ribbon", "Slim next-prayer strip under the top bar.", "showRibbon"));
    var locNote = document.createElement("div");
    locNote.className = "loc-note";
    locNote.textContent = "Automatic \u2014 based on your live GPS / network location.";
    pr.appendChild(rowCustom(t("location"), "Prayer times follow wherever you are; no need to pick a city.", locNote, false));
    body.appendChild(pr);

    // ABOUT
    var ab = group(t("grpAbout"));
    var about = document.createElement("div"); about.className = "about";
    var cv = (state.content && state.content.content_version) || "—";
    var lu = (state.content && state.content.last_updated) || "—";
    var ti = (state.content && state.content.total_items) || state.canonicalItems.length;
    var di = (state.content && state.content.total_display_items) || state.sectionItems.length;
    about.innerHTML =
      '<strong>Dua & Zikr — Version 02.</strong> A calm, offline Islamic reading app for phones, tablets and Android TV. ' +
      'Content shows one remembrance at a time with Arabic as the focus, optional transliteration and translation, and a source reference. ' +
      '<br><br>Content is organised into three categories — Azkar, Dua and Kalima — and can be read as a mixed flow or one category at a time. ' +
      'Every entry carries a source and a verification flag. Sources have not yet been confirmed by a qualified scholar, so treat the content as provisional until reviewed. ' +
      'Tajweed colouring is only enabled where verified markup is available; none is bundled in this version. ' +
      '<br><br>Prayer times use an online calculation when connected and a clearly marked approximate fallback when offline. ' +
      '<div class="kv"><span>Content version</span><span>' + esc(cv) + '</span>' +
      '<span>Last updated</span><span>' + esc(lu) + '</span>' +
      '<span>Canonical items</span><span>' + esc(String(ti)) + '</span>' +
      '<span>Section references</span><span>' + esc(String(di)) + '</span></div>' +
      '<br>Arabic uses Scheherazade New; Urdu uses Noto Nastaliq Urdu (both SIL OFL). ' +
      '<span class="badge">Content review status: pending scholarly review</span>';
    ab.appendChild(about);
    body.appendChild(ab);
  }

  function group(title) {
    var g = document.createElement("div"); g.className = "set-group";
    var h = document.createElement("div"); h.className = "grp-title"; h.textContent = title;
    g.appendChild(h); return g;
  }
  function rowCustom(name, desc, control, stacked) {
    var r = document.createElement("div"); r.className = "set-row";
    if (stacked) { r.style.flexDirection = "column"; r.style.alignItems = "stretch"; }
    var lab = document.createElement("div"); lab.className = "label";
    lab.innerHTML = '<div class="name">' + esc(name) + '</div>' + (desc ? '<div class="desc">' + esc(desc) + '</div>' : "");
    r.appendChild(lab);
    if (stacked) control.style.marginTop = "12px";
    r.appendChild(control); return r;
  }
  function toggleRow(name, desc, key) {
    var sw = document.createElement("label"); sw.className = "switch";
    var inp = document.createElement("input"); inp.type = "checkbox"; inp.setAttribute("data-key", key);
    var tr = document.createElement("span"); tr.className = "track";
    inp.addEventListener("change", function () {
      state.draft[key] = inp.checked;
      if (key === "easyView") { document.body.classList.toggle("easy", inp.checked); previewFonts(); }
    });
    sw.appendChild(inp); sw.appendChild(tr);
    return rowCustom(name, desc, sw, false);
  }
  function segRow(name, desc, key, opts) {
    var seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("data-seg", key);
    opts.forEach(function (o) {
      var b = document.createElement("button"); b.textContent = o[0]; b.setAttribute("data-val", JSON.stringify(o[1]));
      b.addEventListener("click", function () {
        state.draft[key] = o[1];
        $$("button", seg).forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        if (key === "arabicScript") previewFonts();
      });
      seg.appendChild(b);
    });
    return rowCustom(name, desc, seg, false);
  }
  function stepperRow(name, desc, key) {
    var st = document.createElement("div"); st.className = "stepper";
    var minus = document.createElement("button"); minus.textContent = "−"; minus.setAttribute("aria-label", name + " smaller");
    var val = document.createElement("span"); val.className = "val"; val.setAttribute("data-val", key);
    var plus = document.createElement("button"); plus.textContent = "+"; plus.setAttribute("aria-label", name + " larger");
    function clamp(v) { return Math.min(2.0, Math.max(0.7, Math.round(v * 100) / 100)); }
    minus.addEventListener("click", function () { state.draft[key] = clamp(state.draft[key] - 0.1); val.textContent = pct(state.draft[key]); previewFonts(); });
    plus.addEventListener("click", function () { state.draft[key] = clamp(state.draft[key] + 0.1); val.textContent = pct(state.draft[key]); previewFonts(); });
    st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    return rowCustom(name, desc, st, false);
  }
  function pct(v) { return Math.round(v * 100) + "%"; }
  function previewFonts() { var saved = state.settings; state.settings = state.draft; render(); state.settings = saved; }

  function syncSettingsUI() {
    markThemes();
    $$("input[type=checkbox][data-key]").forEach(function (i) { i.checked = !!state.draft[i.getAttribute("data-key")]; });
    $$(".seg[data-seg]").forEach(function (seg) {
      var key = seg.getAttribute("data-seg");
      $$("button", seg).forEach(function (b) { b.classList.toggle("active", JSON.stringify(state.draft[key]) === b.getAttribute("data-val")); });
    });
    $$(".val[data-val]").forEach(function (v) { v.textContent = pct(state.draft[v.getAttribute("data-val")]); });
  }
  function markThemes() { $$(".theme-card").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-theme-id") === state.draft.theme); }); }

  function applySettings() {
    var prevFlow = state.settings.flowMode;
    state.settings = Object.assign({}, state.draft);
    save();
    applyBodyFlags();
    applyTheme(state.settings.theme);
    applyLang();
    updateViewLabel();
    $("#prayerRibbon").classList.toggle("hide", !state.settings.showRibbon);
    setAuto(state.settings.autoRotate);
    setupPrayer();
    // If default flow preference changed and we are in mixed/category, honour it.
    if (state.settings.flowMode !== prevFlow && state.view.mode !== "section") {
      state.view.mode = state.settings.flowMode === "mixed" ? "mixed" : "category";
    }
    rebuildPlaylist(true);
    closeSheets();
    toast("Settings saved");
  }

  /* ---- prayer ribbon (global, location-aware) ---------------------------- */
  // Calculation method per country (Aladhan IDs). Falls back to MWL (3).
  function methodForCountry(cc) {
    var M = { SA:4, AE:16, KW:9, QA:10, BH:8, OM:8, EG:5, TR:13, PK:1, IN:1, BD:1,
              ID:20, MY:17, SG:11, RU:14, FR:12, US:2, CA:2, GB:3, IR:7 };
    return M[(cc || "").toUpperCase()] || 3;
  }
  function loadLoc() { try { return JSON.parse(localStorage.getItem(LS_LOC) || "null"); } catch (e) { return null; } }
  function saveLoc(l) { try { localStorage.setItem(LS_LOC, JSON.stringify(l)); } catch (e) {} }

  // Resolve a {lat,lng,city,country} globally: GPS first, then network/IP.
  function resolveLocation(cb) {
    var cached = loadLoc();
    var done = false;
    function finish(loc) { if (done) return; done = true; if (loc) saveLoc(loc); cb(loc || cached || null); }

    // 1) GPS / fused location (phones, tablets; TVs usually have none).
    if (navigator.geolocation) {
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            finish({ lat: pos.coords.latitude, lng: pos.coords.longitude,
                     city: (cached && cached.city) || "", country: (cached && cached.country) || "", src: "gps" });
          },
          function () { ipLookup(finish, cached); },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
        );
      } catch (e) { ipLookup(finish, cached); }
    } else {
      ipLookup(finish, cached);
    }
    // Safety timeout so the ribbon never hangs.
    setTimeout(function () { if (!done) finish(cached); }, 9000);
  }

  // 2) Network / IP geolocation fallback (works on TV with no GPS).
  function ipLookup(finish, cached) {
    if (!navigator.onLine) { finish(cached); return; }
    fetch("https://ipapi.co/json/").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.latitude && j.longitude) {
        finish({ lat: j.latitude, lng: j.longitude,
                 city: j.city || j.region || "", country: j.country_code || j.country || "", src: "ip" });
      } else { finish(cached); }
    }).catch(function () {
      // Secondary provider.
      fetch("https://ipwho.is/").then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.success && j.latitude) {
          finish({ lat: j.latitude, lng: j.longitude, city: j.city || "",
                   country: (j.country_code || ""), src: "ip" });
        } else { finish(cached); }
      }).catch(function () { finish(cached); });
    });
  }

  function setupPrayer() {
    var s = state.settings;
    $("#prayerRibbon").classList.toggle("hide", !s.showRibbon);
    if (!s.showRibbon) return;

    // Manual city presets keep the original Saudi behaviour.
    if (s.city && s.city !== "auto") {
      $("#prayerCity").textContent = CITY_LABEL[s.city] || "Riyadh";
      if (navigator.onLine) {
        var u = "https://api.aladhan.com/v1/timingsByCity?city=" +
                encodeURIComponent(CITY_LABEL[s.city] || "Riyadh") + "&country=Saudi%20Arabia&method=4";
        fetch(u).then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.data && j.data.timings) showPrayer(trim5(j.data.timings), false);
          else showPrayer(APPROX[s.city], true);
        }).catch(function () { showPrayer(APPROX[s.city], true); });
      } else showPrayer(APPROX[s.city], true);
      return;
    }

    // Automatic: detect anywhere on earth via GPS, then network/IP.
    $("#prayerCity").textContent = "Locating\u2026";
    resolveLocation(function (loc) {
      if (!loc) { $("#prayerCity").textContent = "Riyadh"; showPrayer(APPROX.riyadh, true); return; }
      $("#prayerCity").textContent = loc.city || "My location";
      if (!navigator.onLine) { showPrayer(APPROX.riyadh, true); return; }
      var url = "https://api.aladhan.com/v1/timings?latitude=" + encodeURIComponent(loc.lat) +
                "&longitude=" + encodeURIComponent(loc.lng) + "&method=" + methodForCountry(loc.country);
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.data && j.data.timings) showPrayer(trim5(j.data.timings), false);
        else showPrayer(APPROX.riyadh, true);
      }).catch(function () { showPrayer(APPROX.riyadh, true); });
    });
  }
  function trim5(t) { return { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha }; }
  function showPrayer(timings, approx) {
    if (!timings) return;
    var order = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), next = null;
    for (var i = 0; i < order.length; i++) {
      var p = timings[order[i]]; if (!p) continue;
      var hm = p.split(":"), m = parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);
      if (m >= nowMin) { next = { name: order[i], time: p }; break; }
    }
    if (!next) next = { name: "Fajr", time: timings.Fajr };
    $("#prayerNext").textContent = next.name;
    $("#prayerTime").textContent = next.time;
    $("#prayerApprox").style.display = approx ? "inline-block" : "none";
  }

  /* ---- restore position -------------------------------------------------- */
  function restorePosition() {
    try {
      var p = JSON.parse(localStorage.getItem(LS_POS) || "null");
      if (p && p.view && p.view.mode) {
        state.view = p.view;
        state.index = p.index || 0;
        state.pendingScrollTop = Math.max(0, p.scrollTop || 0);
      } else {
        state.view.mode = state.settings.flowMode === "category" ? "category" : "mixed";
      }
    } catch (e) { state.view.mode = "mixed"; state.pendingScrollTop = 0; }
    $("#prayerRibbon").classList.toggle("hide", !state.settings.showRibbon);
    setAuto(state.settings.autoRotate);
  }

  /* ---- utils ------------------------------------------------------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // Native back button hook (closes an open sheet before exiting)
  window.onTvBack = function () { if (anySheetOpen()) { closeSheets(); return true; } return false; };

  // Exposed for lightweight logic tests (see tools/test_logic.py rationale).
  window.__azkar = { parseRepeat: parseRepeat, buildMixed: buildMixed, CATS: CATS, getSectionRefs: getSectionRefs };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
