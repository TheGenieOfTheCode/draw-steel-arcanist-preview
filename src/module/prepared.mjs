import { MODULE_ID } from "./constants.mjs";
const FLAG = "prepared";
const CLASS_DSID = "arcanist";
const GRIMOIRE_PREFIX = "arcanist-grimoire-of-";
const HEROIC_BY_LEVEL = [
  null, [3, 5], [3, 5, 5], [3, 5, 5, 7], [3, 5, 5, 7], [3, 5, 5, 7, 9],
  [3, 5, 5, 7, 9, 9], [3, 5, 5, 7, 9, 9], [3, 5, 5, 7, 9, 9, 11], [3, 5, 5, 7, 9, 9, 11, 11], [3, 5, 5, 7, 9, 9, 11, 11],
];

export const L = (key, data) => (data ? game.i18n.format(`ARCANIST.Prepared.${key}`, data) : game.i18n.localize(`ARCANIST.Prepared.${key}`));

const dsidOf = (item) => item?.system?._dsid ?? "";

export const isArcanist = (actor) => !!actor?.items?.some((i) => i.type === "class" && dsidOf(i) === CLASS_DSID);

export function arcanistLevel(actor) {
  const cls = actor?.items?.find((i) => i.type === "class" && dsidOf(i) === CLASS_DSID);
  return Math.max(1, Math.min(10, Number(cls?.system?.level ?? actor?.system?.level ?? 1) || 1));
}

const sourceOf = (item) => item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? null;

const advancementsOf = (item) => {
  const advs = item?.system?.advancements;
  if (!advs) return [];
  return advs.contents ?? (typeof advs.values === "function" ? [...advs.values()] : Object.values(advs));
};

export function grimoireOf(item) {
  const actor = item?.actor;
  const source = sourceOf(item);
  if (!actor || !source) return null;
  return actor.items.find((g) => dsidOf(g).startsWith(GRIMOIRE_PREFIX)
    && advancementsOf(g).some((a) => (a.pool ?? []).some((p) => p.uuid === source))) ?? null;
}

export function kindOf(item) {
  const dsid = dsidOf(item);
  if (!dsid.startsWith("arcanist-") || !isArcanist(item.actor)) return null;
  if (item.type === "feature" && dsid.startsWith(GRIMOIRE_PREFIX)) return "grimoire";
  if (item.type !== "ability") return null;
  const sys = item.system;
  if (sys.category === "signature") return "signature";
  if (sys.category === "heroic" && Number(sys.resource) > 0) return `h${Number(sys.resource)}`;
  if (grimoireOf(item)) return "maneuver";
  if (sys.type === "triggered" && !sys.category) return "triggered";
  return null;
}

export function limitOf(actor, kind) {
  const level = arcanistLevel(actor);
  if (kind === "signature") return 2;
  if (kind === "triggered") return 1;
  if (kind === "grimoire") return level >= 4 ? 3 : 2;
  if (/^h\d+$/.test(kind)) return HEROIC_BY_LEVEL[level].filter((c) => `h${c}` === kind).length;
  return Infinity;
}

const byOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

export const itemsOfKind = (actor, kind) => actor.items.filter((i) => kindOf(i) === kind).sort(byOrder);

export function isPrepared(item) {
  const kind = kindOf(item);
  if (!kind) return true;
  if (kind === "maneuver") return isPrepared(grimoireOf(item));
  const flag = item.getFlag(MODULE_ID, FLAG);
  if (typeof flag === "boolean") return flag;
  const peers = itemsOfKind(item.actor, kind);
  const explicit = peers.filter((p) => p.getFlag(MODULE_ID, FLAG) === true).length;
  const open = Math.max(0, limitOf(item.actor, kind) - explicit);
  return peers.filter((p) => typeof p.getFlag(MODULE_ID, FLAG) !== "boolean").indexOf(item) < open;
}

export const unprepared = (item) => !!kindOf(item) && !isPrepared(item);

export const kindsOf = (actor) => {
  const kinds = new Set(actor.items.map(kindOf).filter((k) => k && k !== "maneuver"));
  const order = (k) => (k === "signature" ? 0 : k.startsWith("h") ? Number(k.slice(1)) : k === "triggered" ? 100 : k === "grimoire" ? 200 : 300);
  return [...kinds].sort((a, b) => order(a) - order(b));
};

function wrap(path, wrapper) {
  if (game.modules.get("lib-wrapper")?.active) return libWrapper.register(MODULE_ID, path, wrapper, "WRAPPER");
  const parts = path.split(".");
  const name = parts.pop();
  const owner = parts.slice(1).reduce((o, k) => o?.[k], globalThis[parts[0]]);
  const original = owner?.[name];
  if (typeof original !== "function") return;
  owner[name] = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
}

function onSheet(app, html) {
  const actor = app.document;
  if (!isArcanist(actor)) return;
  for (const li of html.querySelectorAll("li.item[data-document-uuid]")) {
    const item = fromUuidSync(li.dataset.documentUuid, { strict: false });
    if (!item || !unprepared(item)) continue;
    
    
    if (item.type === "ability" && !game.settings.get(MODULE_ID, "showUnprepared")) { li.remove(); continue; }
    li.classList.add("arcanist-unprepared-row");
    if (!game.settings.get(MODULE_ID, "unpreparedBadge")) continue;
    const name = li.querySelector(".name .label, .item-name .label, .name");
    if (name && !name.querySelector(".arcanist-unprepared")) name.insertAdjacentHTML("beforeend", ` <span class="arcanist-unprepared">${L("Badge")}</span>`);
  }
}

export function registerPrepared() {
  const rerender = () => { for (const app of foundry.applications.instances.values()) if (app.document?.type === "hero" && isArcanist(app.document)) app.render(); };
  game.settings.register(MODULE_ID, "showUnprepared", {
    name: "ARCANIST.Settings.ShowUnprepared.name",
    hint: "ARCANIST.Settings.ShowUnprepared.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: rerender,
  });
  game.settings.register(MODULE_ID, "unpreparedBadge", {
    name: "ARCANIST.Settings.UnpreparedBadge.name",
    hint: "ARCANIST.Settings.UnpreparedBadge.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: rerender,
  });

  wrap("CONFIG.Item.dataModels.ability.prototype.use", async function (wrapped, ...args) {
    const item = this.parent;
    if (unprepared(item)) ui.notifications.warn(L("UsedUnprepared", { name: item.name }));
    return wrapped(...args);
  });

  Hooks.on("renderDrawSteelHeroSheet", onSheet);

}
