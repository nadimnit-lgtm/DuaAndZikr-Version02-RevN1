/* DOM smoke test for Azkar TV Display.
 *
 * Loads the real index.html + app.js in jsdom with the bundled JSON, boots the
 * app for both phone and TV, then exercises navigation across every view, all
 * settings controls, theme switching and copy — failing on any uncaught
 * runtime error. Catches the class of bug that `node --check` cannot (missing
 * DOM ids, unsupported APIs, exceptions inside handlers).
 *
 *   npm install jsdom@24 && node tools/dom_smoke.mjs
 */
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, "..", "app", "src", "main", "assets");
const html = fs.readFileSync(path.join(ASSETS, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(ASSETS, "app.js"), "utf8");
const content = fs.readFileSync(path.join(ASSETS, "content/content.json"), "utf8");
const sections = fs.readFileSync(path.join(ASSETS, "content/sections.json"), "utf8");

const errors = [];

function boot(tv) {
  const url = "https://appassets.androidplatform.net/assets/index.html" + (tv ? "?tv=1" : "");
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (u) => {
    u = String(u);
    if (u.includes("content.json")) return Promise.resolve({ json: () => Promise.resolve(JSON.parse(content)) });
    if (u.includes("sections.json")) return Promise.resolve({ json: () => Promise.resolve(JSON.parse(sections)) });
    return Promise.resolve({ json: () => Promise.resolve({ data: { timings: { Fajr:"04:30",Dhuhr:"11:55",Asr:"15:20",Maghrib:"18:35",Isha:"20:05" } } }) });
  };
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.navigator.clipboard = { writeText: () => Promise.resolve() };
  window.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  window.addEventListener("error", (e) => errors.push((tv ? "[TV] " : "[Phone] ") + (e.error?.stack || e.message)));
  window.addEventListener("unhandledrejection", (e) => errors.push((tv ? "[TV] " : "[Phone] ") + "rejection: " + (e.reason?.stack || e.reason)));
  return dom;
}

async function run(tv) {
  const tag = tv ? "[TV] " : "[Phone] ";
  const { window } = boot(tv);
  const doc = window.document;
  try { window.eval(appjs); } catch (e) { errors.push(tag + "boot threw: " + (e.stack || e)); return; }
  await new Promise((r) => setTimeout(r, 350));
  if (!window.__azkar) { errors.push(tag + "boot failed (no __azkar)"); return; }

  const key = (k) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  for (let i = 0; i < 200; i++) key("ArrowRight");
  for (let i = 0; i < 90; i++) key("ArrowLeft");
  key("ArrowUp"); key("ArrowDown"); key("Enter"); key("Enter");

  doc.getElementById("nextBtn").click();
  doc.getElementById("prevBtn").click();
  doc.getElementById("copyBtn").click();
  doc.getElementById("contrastBtn").click();
  doc.getElementById("contrastBtn").click();

  doc.getElementById("viewPick").click();
  const views = [...doc.querySelectorAll(".sec-item")];
  if (views.length < 4) errors.push(tag + "view list too short: " + views.length);
  for (const v of views) {
    try { v.click(); for (let i = 0; i < 6; i++) key("ArrowRight"); }
    catch (e) { errors.push(tag + "view " + v.getAttribute("data-view") + " threw: " + (e.stack || e)); }
    doc.getElementById("viewPick").click();
  }
  doc.getElementById("scrim").click();

  doc.getElementById("openSettings").click();
  [...doc.querySelectorAll("input[type=checkbox][data-key]")].forEach((c) => { c.checked = !c.checked; c.dispatchEvent(new window.Event("change")); });
  [...doc.querySelectorAll(".seg button")].forEach((b) => b.click());
  [...doc.querySelectorAll(".stepper button")].forEach((b) => b.click());
  [...doc.querySelectorAll(".theme-card")].forEach((c) => c.click());
  doc.getElementById("applyBtn").click();
  await new Promise((r) => setTimeout(r, 30));

  if (!window.localStorage.getItem("azkartv.v02.settings")) errors.push(tag + "settings not persisted");
  const counter = doc.getElementById("counterText").textContent;
  if (!/\d+ \/ \d+/.test(counter)) errors.push(tag + "counter not rendered");
  console.log(tag + "ok — counter " + counter + ", views " + views.length);
}

await run(false);
await run(true);

if (errors.length) {
  console.log("\n::error::DOM smoke test found " + errors.length + " runtime error(s):");
  errors.forEach((e) => console.log("  ✗ " + e));
  process.exitCode = 1;
} else {
  console.log("\nDOM smoke test passed: no runtime errors (phone + TV, all views, all settings).");
}
