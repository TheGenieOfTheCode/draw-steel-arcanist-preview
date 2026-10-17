import { MODULE_ID } from "./constants.mjs";
import { L, isArcanist, kindsOf, itemsOfKind, limitOf, isPrepared, applyPreparation } from "./prepared.mjs";

const _states = new WeakMap();

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const preparing = (sheet) => _states.has(sheet);

export const kindLabel = (kind) => (kind === "signature" ? L("KindSignature") : kind === "triggered" ? L("KindTriggered")
  : kind === "grimoire" ? L("KindGrimoire") : L("KindHeroic", { cost: kind.slice(1) }));

const actionLabel = (item) => {
  const label = ds.CONFIG.abilities?.types?.[item.system?.type]?.label;
  return label ? game.i18n.localize(label) : "";
};

const keyAt = (target) => target?.closest?.("li.arcanist-prep-row")?.dataset.arcanistKey ?? null;

function entriesOf(sheet, kind) {
  return itemsOfKind(sheet.document, kind).map((item) => ({ key: item.id, item, uuid: item.uuid, name: item.name, img: item.img }));
}

const baseOf = (entry) => (entry.item ? isPrepared(entry.item) : false);
const draftOf = (sheet, entry) => !!_states.get(sheet)?.draft.get(entry.key);
const countOf = (sheet, kind) => entriesOf(sheet, kind).filter((e) => draftOf(sheet, e)).length;

const neededOf = (sheet, kind) => Math.min(limitOf(sheet.document, kind), entriesOf(sheet, kind).length);

function diffOf(sheet, kind) {
  const entries = entriesOf(sheet, kind);
  return { on: entries.filter((e) => draftOf(sheet, e) && !baseOf(e)), off: entries.filter((e) => !draftOf(sheet, e) && baseOf(e)) };
}

const changedKinds = (sheet) => kindsOf(sheet.document).filter((k) => { const d = diffOf(sheet, k); return d.on.length + d.off.length > 0; });

const illegalKinds = (sheet) => ({
  over: kindsOf(sheet.document).filter((k) => countOf(sheet, k) > limitOf(sheet.document, k)),
  under: kindsOf(sheet.document).filter((k) => countOf(sheet, k) < neededOf(sheet, k)),
});

const kindList = (kinds) => kinds.map(kindLabel).join(", ");

function illegalMessage({ over, under }) {
  const parts = [];
  if (over.length) parts.push(L("OverKinds", { kinds: kindList(over) }));
  if (under.length) parts.push(L("UnderKinds", { kinds: kindList(under) }));
  const fix = L(over.length && under.length ? "FixBoth" : over.length ? "FixOver" : "FixUnder");
  parts.push(L(game.user.isGM ? "FinishGM" : "FinishPlayer", { fix }));
  return parts.join(" ");
}

function syncHeader(sheet) {
  const header = sheet.window?.header;
  if (!header) return;
  const mode = header.querySelector('[data-action="toggleMode"]');
  let btn = header.querySelector(".arcanist-prepare-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-control icon fa-solid fa-book-sparkles arcanist-prepare-toggle";
    btn.addEventListener("click", (event) => onToggle(sheet, event));
    if (mode) mode.after(btn);
    else header.querySelector('[data-action="close"]')?.before(btn);
  }
  const on = preparing(sheet);
  btn.classList.toggle("fa-book-open", on);
  btn.classList.toggle("fa-book-sparkles", !on);
  btn.disabled = !on && !!sheet.isPlayMode;
  const tip = L(on ? "ToggleOff" : sheet.isPlayMode ? "ToggleNeedsEdit" : "ToggleOn");
  btn.dataset.tooltip = tip;
  btn.setAttribute("aria-label", tip);
  if (mode) mode.disabled = on;
}

function onToggle(sheet, event) {
  if (preparing(sheet)) return finish(sheet, event);
  return start(sheet);
}

async function start(sheet) {
  const actor = sheet.document;
  if (sheet.isPlayMode || preparing(sheet)) return;
  const kinds = kindsOf(actor);
  const draft = new Map();
  for (const kind of kinds) for (const item of itemsOfKind(actor, kind)) draft.set(item.id, isPrepared(item));
  _states.set(sheet, { draft });
  sheet.changeTab?.("abilities", "primary");
  await sheet.render();
}

function stop(sheet) {
  _states.delete(sheet);
}

async function finish(sheet, event) {
  const actor = sheet.document;
  const state = _states.get(sheet);
  const shift = game.user.isGM && event?.shiftKey;
  const illegal = illegalKinds(sheet);
  const isIllegal = illegal.over.length > 0 || illegal.under.length > 0;
  if (isIllegal && !shift) return void ui.notifications.warn(illegalMessage(illegal));
  const changed = changedKinds(sheet);
  const changes = changed.flatMap((k) => entriesOf(sheet, k).filter((e) => draftOf(sheet, e) !== baseOf(e)).map((e) => ({ ...e, on: draftOf(sheet, e) })));
  stop(sheet);
  if (!changes.length) return sheet.render();

  const prepared = new Map();
  for (const kind of kindsOf(actor)) for (const e of entriesOf(sheet, kind)) prepared.set(e.key, state.draft.get(e.key));
  await applyPreparation(actor, prepared);
  await sheet.render();
}

function toggleEntry(sheet, key) {
  const state = _states.get(sheet);
  if (!state?.draft.has(key)) return;
  state.draft.set(key, !state.draft.get(key));
  drawView(sheet, sheet.element);
}

const nativeRow = (html, uuid) => html.querySelector(`section.tab li.item[data-document-uuid="${uuid}"]:not(.arcanist-prep-row)`);

function prepRow(li, sheet, kind, entry, withAction) {
  li.hidden = false;
  li.removeAttribute("draggable");
  li.classList.remove("draggable");
  li.classList.add("arcanist-prep-row");
  li.dataset.arcanistKey = entry.key;
  li.classList.toggle("arcanist-on", draftOf(sheet, entry));
  for (const el of li.querySelectorAll('[data-action="useAbility"]')) { el.removeAttribute("data-action"); el.classList.remove("rollable"); }
  li.querySelector(".arcanist-unprepared")?.remove();
  li.classList.remove("arcanist-unprepared-row");
  if (withAction && entry.item) li.querySelector(".item-row > .item-column.item-cost")?.insertAdjacentHTML("afterend", `<div class="item-column item-action">${esc(actionLabel(entry.item))}</div>`);
  return li;
}

function headerFor(html, kind, count, limit, feature, uuid) {
  const row = uuid && nativeRow(html, uuid);
  const source = row?.closest("section.item-list-container")?.querySelector(":scope > .item-header")
    ?? html.querySelector(`section.tab.${feature ? "features" : "abilities"} section.item-list-container${feature ? ".feature-list-container" : ""}:not(.arcanist-prep-kind) > .item-header`);
  const header = source ? source.cloneNode(true) : document.createElement("div");
  header.classList.add("item-header");
  let name = header.querySelector(".item-column.item-name");
  if (!name) { name = document.createElement("div"); name.className = "item-column item-name"; header.prepend(name); }
  name.innerHTML = `${esc(kindLabel(kind))} <span class="arcanist-prep-count">${count} / ${limit}</span>`;
  const controls = header.querySelector(".item-column.item-controls");
  if (controls) controls.replaceChildren();
  if (!feature) header.querySelector(".item-column.item-cost")?.insertAdjacentHTML("afterend", `<div class="item-column item-action">${esc(L("ColumnAction"))}</div>`);
  return header;
}

function drawView(sheet, html) {
  const tab = html?.querySelector("section.tab.abilities");
  if (!tab) return;
  tab.querySelector(":scope > .arcanist-prep")?.remove();
  const state = _states.get(sheet);
  tab.classList.toggle("arcanist-preparing", !!state);
  if (!state) return;
  const actor = sheet.document;
  const view = document.createElement("div");
  view.className = "arcanist-prep";
  for (const kind of kindsOf(actor)) {
    const feature = kind === "grimoire";
    const entries = entriesOf(sheet, kind);
    const count = countOf(sheet, kind);
    const limit = limitOf(actor, kind);
    const section = document.createElement("section");
    section.className = `item-list-container arcanist-prep-kind${count > limit || count < neededOf(sheet, kind) ? " over" : ""}`;
    const header = headerFor(html, kind, count, limit, feature, entries.find((e) => e.item)?.uuid);
    section.append(header);
    const list = document.createElement("ol");
    list.className = `item-list ${feature ? "features-list" : "abilities-list"}`;
    for (const entry of entries) {
      const source = nativeRow(html, entry.uuid);
      if (!source) continue;
      list.append(prepRow(source.cloneNode(true), sheet, kind, entry, !feature));
    }
    section.append(list);
    view.append(section);
  }
  view.addEventListener("click", (event) => {
    if (event.target.closest(".item-controls, .document-description")) return;
    const key = keyAt(event.target);
    if (key) toggleEntry(sheet, key, event.shiftKey);
  });
  tab.prepend(view);
}

function onSheet(sheet, html) {
  if (!isArcanist(sheet.document) || !sheet.document.isOwner) return;
  syncHeader(sheet);
  drawView(sheet, html);
}

export function registerPrepMode() {
  Hooks.on("renderDrawSteelHeroSheet", onSheet);
  Hooks.on("closeDrawSteelHeroSheet", stop);
}
