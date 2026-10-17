import { MODULE_ID } from "./constants.mjs";
import { L, isArcanist, kindsOf, itemsOfKind, limitOf, isPrepared, applyPreparation, locksOf, lockKey } from "./prepared.mjs";

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

function flashBlock(sheet, kind, entry, shift) {
  const state = _states.get(sheet);
  if (state?.mode !== "flash" || (game.user.isGM && shift)) return null;
  if (locksOf(sheet.document)[lockKey(kind)]) return "locked";
  const changed = changedKinds(sheet);
  if (changed.length && !changed.includes(kind)) return "other";
  const { on, off } = diffOf(sheet, kind);
  let nOn = on.length;
  let nOff = off.length;
  const turningOn = !draftOf(sheet, entry);
  if (baseOf(entry)) nOff += turningOn ? -1 : 1;
  else nOn += turningOn ? 1 : -1;
  return nOn > 1 || nOff > 1 ? "more" : null;
}

function flashTooMany(sheet, changed) {
  return changed.length > 1 || changed.some((k) => { const d = diffOf(sheet, k); return d.on.length > 1 || d.off.length > 1; })
    || changed.some((k) => locksOf(sheet.document)[lockKey(k)]);
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
  const tip = L(on ? "ToggleOff" : sheet.isPlayMode ? "ToggleNeedsEdit" : "ToggleOnFlash");
  btn.dataset.tooltip = tip;
  btn.setAttribute("aria-label", tip);
  if (mode) mode.disabled = on;
}

function onToggle(sheet, event) {
  if (preparing(sheet)) return finish(sheet, event);
  return start(sheet, "flash");
}

async function start(sheet, mode) {
  const actor = sheet.document;
  if (sheet.isPlayMode || preparing(sheet)) return;
  const kinds = kindsOf(actor);
  const draft = new Map();
  for (const kind of kinds) for (const item of itemsOfKind(actor, kind)) draft.set(item.id, isPrepared(item));
  _states.set(sheet, { mode, draft });
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
  if (state.mode === "flash" && !shift) {
    if (flashTooMany(sheet, changed)) return void ui.notifications.warn(L("FlashOneSwap"));
  }
  const changes = changed.flatMap((k) => entriesOf(sheet, k).filter((e) => draftOf(sheet, e) !== baseOf(e)).map((e) => ({ ...e, on: draftOf(sheet, e) })));
  stop(sheet);
  if (!changes.length) return sheet.render();

  const prepared = new Map();
  for (const kind of kindsOf(actor)) for (const e of entriesOf(sheet, kind)) prepared.set(e.key, state.draft.get(e.key));
  await applyPreparation(actor, prepared, { flash: state.mode === "flash", changedKinds: changed });
  await sheet.render();
}

function toggleEntry(sheet, key, shift = false) {
  const state = _states.get(sheet);
  if (!state?.draft.has(key)) return;
  const kind = kindsOf(sheet.document).find((k) => entriesOf(sheet, k).some((e) => e.key === key));
  const entry = entriesOf(sheet, kind).find((e) => e.key === key);
  const blocked = flashBlock(sheet, kind, entry, shift);
  if (blocked) return void ui.notifications.info(L(blocked === "locked" ? "Locked" : "FlashOneSwap"));
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
  li.classList.toggle("arcanist-blocked", !!flashBlock(sheet, kind, entry, false));
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
  const flash = state.mode === "flash";
  const changed = flash ? changedKinds(sheet) : [];
  for (const kind of kindsOf(actor)) {
    if (changed.length && !changed.includes(kind)) continue;
    const feature = kind === "grimoire";
    const entries = entriesOf(sheet, kind);
    const count = countOf(sheet, kind);
    const limit = limitOf(actor, kind);
    const locked = flash && !!locksOf(actor)[lockKey(kind)];
    const section = document.createElement("section");
    section.className = `item-list-container arcanist-prep-kind${count > limit || count < neededOf(sheet, kind) ? " over" : ""}${locked ? " locked" : ""}`;
    const header = headerFor(html, kind, count, limit, feature, entries.find((e) => e.item)?.uuid);
    if (locked) header.querySelector(".item-name")?.insertAdjacentHTML("beforeend", ` <i class="fa-solid fa-lock arcanist-lock" data-tooltip="${esc(L(game.user.isGM ? "LockedGM" : "Locked"))}"></i>`);
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

function onMenu(sheet, options) {
  if (sheet.document?.type !== "hero") return;
  const inView = (target) => !!target?.closest?.(".arcanist-prep");
  for (const option of options) {
    for (const key of ["visible", "condition"]) {
      if (!(key in option)) continue;
      const original = option[key];
      option[key] = (target) => !inView(target) && (typeof original === "function" ? original(target) : original !== false);
    }
    if (!("visible" in option) && !("condition" in option)) option.visible = (target) => !inView(target);
  }
  const drafted = (target) => !!_states.get(sheet)?.draft.get(keyAt(target));
  options.push(
    { label: "ARCANIST.Prepared.MenuView", icon: "fa-solid fa-eye", visible: inView,
      onClick: async (event, target) => (await fromUuid(target.closest("[data-document-uuid]")?.dataset.documentUuid))?.sheet?.render(true) },
    { label: "ARCANIST.Prepared.MenuPrepare", icon: "fa-solid fa-book-open", visible: (target) => inView(target) && !drafted(target), onClick: (event, target) => toggleEntry(sheet, keyAt(target), event.shiftKey) },
    { label: "ARCANIST.Prepared.MenuUnprepare", icon: "fa-solid fa-book-sparkles", visible: (target) => inView(target) && drafted(target), onClick: (event, target) => toggleEntry(sheet, keyAt(target), event.shiftKey) },
  );
}

export function registerPrepMode() {
  Hooks.on("renderDrawSteelHeroSheet", onSheet);
  Hooks.on("getDocumentListContextOptions", onMenu);
  Hooks.on("closeDrawSteelHeroSheet", stop);
}
