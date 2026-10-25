import { MODULE_ID } from "./constants.mjs";
import { registerPrepMode, preparing } from "./prep-mode.mjs";

const FLAG = "prepared";
const LOCKS = "flashLocks";
const PORE = "poreOverPages";
const CLASS_DSID = "arcanist";
const GRIMOIRE_PREFIX = "arcanist-grimoire-of-";
const RULES_FEATURE = "arcanist-arcanist-abilities";

const HEROIC_BY_LEVEL = [
  null, [3, 5], [3, 5, 5], [3, 5, 5, 7], [3, 5, 5, 7], [3, 5, 5, 7, 9],
  [3, 5, 5, 7, 9, 9], [3, 5, 5, 7, 9, 9], [3, 5, 5, 7, 9, 9, 11], [3, 5, 5, 7, 9, 9, 11, 11], [3, 5, 5, 7, 9, 9, 11, 11],
];

export const L = (key, data) => (data ? game.i18n.format(`ARCANIST.Prepared.${key}`, data) : game.i18n.localize(`ARCANIST.Prepared.${key}`));

const dsidOf = (item) => item?.system?._dsid ?? "";

const dropKey = () => new foundry.data.operators.ForcedDeletion();

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

const isSupernaturalPerk = (item) => item?.type === "perk" && item.system?.perkType === "supernatural";

export function perkLimit(actor) {
  const level = Number(actor?.system?.level ?? arcanistLevel(actor)) || 1;
  let limit = 0;
  for (const item of actor?.items ?? []) {
    for (const adv of advancementsOf(item)) {
      if (adv.type !== "itemGrant" || adv.additional?.type !== "perk") continue;
      if (adv.requirements?.level && adv.requirements.level > level) continue;
      const types = [...(adv.additional.perkType ?? [])];
      if (types.length && !types.includes("supernatural")) continue;
      const slots = Number(adv.chooseN) || 1;
      if (types.length === 1) limit += slots;
      else limit += Math.min(slots, actor.items.filter((i) => isSupernaturalPerk(i) && i.flags?.["draw-steel"]?.advancement?.advancementId === adv.id).length);
    }
  }
  return limit;
}

export function kindOf(item) {
  if (item?.type === "perk") return isSupernaturalPerk(item) && isArcanist(item.actor) ? "perk" : null;
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
  if (kind === "perk") return perkLimit(actor);
  return Infinity;
}

const byOrder = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

export const itemsOfKind = (actor, kind) => actor.items.filter((i) => kindOf(i) === kind).sort(byOrder);

export function isPrepared(item) {
  const kind = kindOf(item);
  if (!kind || kind === "perk") return true;
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
  if (isArcanist(actor) && perkLimit(actor) > 0) kinds.add("perk");
  const order = (k) => (k === "signature" ? 0 : k.startsWith("h") ? Number(k.slice(1)) : k === "triggered" ? 100 : k === "grimoire" ? 200 : 300);
  return [...kinds].sort((a, b) => order(a) - order(b));
};

export const lockKey = (kind) => kind;
export const locksOf = (actor) => actor.getFlag(MODULE_ID, LOCKS) ?? {};

export const poreReady = (actor) => !!actor?.getFlag(MODULE_ID, PORE);

export async function applyPreparation(actor, prepared, { flash = false, changedKinds = [], usePore = false } = {}) {
  const updates = [];
  for (const [id, on] of prepared) {
    const item = actor.items.get(id);
    if (item && kindOf(item) !== "perk" && item.getFlag(MODULE_ID, FLAG) !== on) updates.push({ _id: id, [`flags.${MODULE_ID}.${FLAG}`]: on });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, { render: false });
  const actorUpdate = {};
  if (flash && changedKinds.length) {
    const locks = { ...locksOf(actor) };
    for (const k of changedKinds) locks[lockKey(k)] = { at: Date.now() };
    actorUpdate[`flags.${MODULE_ID}.${LOCKS}`] = locks;
  }
  if (usePore && poreReady(actor)) actorUpdate[`flags.${MODULE_ID}.${PORE}`] = dropKey();
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate, { render: false });
  refreshTriggers();
  return updates.length;
}

export async function swapPerks(actor, removed, added) {
  const creates = added.map((doc, i) => {
    const data = game.items.fromCompendium(doc, { clearFolder: true });
    const link = removed[i]?.getFlag("draw-steel", "advancement");
    if (link) foundry.utils.setProperty(data, "flags.draw-steel.advancement", link);
    return data;
  });
  if (removed.length) await actor.deleteEmbeddedDocuments("Item", removed.map((i) => i.id), { render: false });
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates, { render: false });
}

export async function clearLocks(actor, kind = null) {
  if (!kind) return actor.unsetFlag(MODULE_ID, LOCKS);
  return actor.update({ [`flags.${MODULE_ID}.${LOCKS}.${lockKey(kind)}`]: dropKey() });
}

const triggersApi = () => game.modules.get("draw-steel-triggers")?.active ? game.modules.get("draw-steel-triggers").api : null;
export const refreshTriggers = () => { try { triggersApi()?.refreshIgnored?.(); } catch (err) { console.warn(`${MODULE_ID} | Triggers refresh`, err); } };

export function wrap(path, wrapper, type = "WRAPPER") {
  if (game.modules.get("lib-wrapper")?.active) return libWrapper.register(MODULE_ID, path, wrapper, type);
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
  for (const li of html.querySelectorAll("li.item[data-document-uuid]:not(.arcanist-prep-row)")) {
    const item = fromUuidSync(li.dataset.documentUuid, { strict: false });
    if (!item || !unprepared(item)) continue;
    
    
    if (item.type === "ability" && !game.settings.get(MODULE_ID, "showUnprepared")) { if (!preparing(app)) li.remove(); continue; }
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
  game.settings.register(MODULE_ID, "requireFlashRecall", {
    name: "ARCANIST.Settings.RequireFlashRecall.name",
    hint: "ARCANIST.Settings.RequireFlashRecall.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: rerender,
  });
  game.settings.register(MODULE_ID, "blockUnprepared", {
    name: "ARCANIST.Settings.BlockUnprepared.name",
    hint: "ARCANIST.Settings.BlockUnprepared.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  registerPrepMode();

  wrap("CONFIG.Item.dataModels.ability.prototype.use", async function (wrapped, ...args) {
    const item = this.parent;
    if (unprepared(item)) {
      const bypass = game.user.isGM && game.keyboard?.isModifierActive?.("Shift");
      if (game.settings.get(MODULE_ID, "blockUnprepared") && !bypass) {
        ui.notifications.warn(L(game.user.isGM ? "BlockedUnpreparedGM" : "BlockedUnprepared", { name: item.name }));
        return null;
      }
      ui.notifications.warn(L("UsedUnprepared", { name: item.name }));
    }
    return wrapped(...args);
  }, "MIXED");

  wrap("CONFIG.Actor.dataModels.hero.prototype.takeRespite", async function (wrapped, ...args) {
    const result = await wrapped(...args);
    const actor = this.parent;
    if (isArcanist(actor)) await actor.update({ [`flags.${MODULE_ID}.${LOCKS}`]: dropKey(), [`flags.${MODULE_ID}.${PORE}`]: true }, { render: false });
    return result;
  });

  
  Hooks.on("combatStart", (combat) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const c of combat.combatants) {
      const actor = c.actor;
      if (poreReady(actor)) actor.update({ [`flags.${MODULE_ID}.${PORE}`]: dropKey() }, { render: false });
    }
  });

  Hooks.on("updateActor", (actor, changes) => {
    if (changes.flags?.[MODULE_ID]) Hooks.callAll(`${MODULE_ID}.poreChanged`, actor);
  });

  Hooks.on("preUpdateActor", (actor, changes, options) => {
    const next = foundry.utils.getProperty(changes, "system.hero.victories");
    if (next !== undefined) options.arcanistVictoriesBefore = actor.system?.hero?.victories ?? 0;
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options.arcanistVictoriesBefore === undefined) return;
    const next = foundry.utils.getProperty(changes, "system.hero.victories");
    if (next > options.arcanistVictoriesBefore && isArcanist(actor) && Object.keys(locksOf(actor)).length) clearLocks(actor);
  });

  Hooks.on("renderDrawSteelHeroSheet", onSheet);

  Hooks.once("ready", () => {
    const api = triggersApi();
    if (!api?.registerIgnoreRule) return;
    
    api.registerIgnoreRule(MODULE_ID, (item) => unprepared(item) || dsidOf(item) === RULES_FEATURE
      || (dsidOf(item) === "arcanist-augury" && !item.actor?.getFlag(MODULE_ID, "auguryNotes")?.length));
  });
}
