import { MODULE_ID } from "./constants.mjs";
import { isArcanist, refreshTriggers } from "./prepared.mjs";

const CATEGORY = "component";
const COMPONENT_PACK = `${MODULE_ID}.arcanist-components`;
const ABILITY_PACK = `${MODULE_ID}.arcanist-abilities`;
const GRANTED_BY = "grantedBy";
const CHECKED = "componentsChecked";

export const LC = (key, data) => (data ? game.i18n.format(`ARCANIST.Components.${key}`, data) : game.i18n.localize(`ARCANIST.Components.${key}`));

const dsidOf = (item) => item?.system?._dsid ?? "";

export const needsComponent = (ability) => ability?.type === "ability" && !!ability.flags?.[MODULE_ID]?.component;

const isComponentFor = (item, abilityDsid) => item.type === "treasure"
  && (item.flags?.[MODULE_ID]?.ability === abilityDsid || dsidOf(item) === `${abilityDsid}-component`);

export const holdsComponent = (actor, abilityDsid) => !!actor?.items?.some((i) => isComponentFor(i, abilityDsid));

export const componentMissing = (ability) => needsComponent(ability) && !holdsComponent(ability.actor, dsidOf(ability));

let _componentIndex = null;
async function componentIndex() {
  if (_componentIndex) return _componentIndex;
  const pack = game.packs.get(COMPONENT_PACK);
  const index = pack ? await pack.getIndex({ fields: [`flags.${MODULE_ID}.ability`] }) : [];
  _componentIndex = new Map();
  for (const e of index) {
    const ability = e.flags?.[MODULE_ID]?.ability;
    if (ability) _componentIndex.set(ability, e.uuid ?? pack.getUuid(e._id));
  }
  return _componentIndex;
}

async function componentData(abilityDsid, grantedBy) {
  const uuid = (await componentIndex()).get(abilityDsid);
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc) return null;
  const data = game.items.fromCompendium(doc, { clearFolder: true });
  if (grantedBy) foundry.utils.setProperty(data, `flags.${MODULE_ID}.${GRANTED_BY}`, grantedBy);
  return data;
}

async function grantMissing(actor, abilities) {
  const creates = [];
  const seen = new Set();
  for (const ability of abilities) {
    const dsid = dsidOf(ability);
    if (!needsComponent(ability) || seen.has(dsid) || holdsComponent(actor, dsid)) continue;
    seen.add(dsid);
    const data = await componentData(dsid, ability.id);
    if (data) creates.push(data);
  }
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
  return creates.length;
}

const _pending = new Map();
function queueGrant(ability) {
  const actor = ability.parent;
  let ids = _pending.get(actor);
  if (!ids) {
    ids = new Set();
    _pending.set(actor, ids);
    setTimeout(() => {
      _pending.delete(actor);
      grantMissing(actor, [...ids].map((id) => actor.items.get(id)).filter(Boolean))
        .catch((err) => console.error(`${MODULE_ID} | component grant`, err));
    }, 0);
  }
  ids.add(ability.id);
}

async function checkActor(actor) {
  if (actor?.type !== "hero" || !isArcanist(actor) || actor.getFlag(MODULE_ID, CHECKED)) return;
  await grantMissing(actor, actor.items.filter(needsComponent));
  await actor.setFlag(MODULE_ID, CHECKED, true);
}

let _abilityIndex = null;
async function abilityIndex() {
  if (_abilityIndex) return _abilityIndex;
  const pack = game.packs.get(ABILITY_PACK);
  const index = pack ? await pack.getIndex({ fields: ["system._dsid", `flags.${MODULE_ID}.component`] }) : [];
  _abilityIndex = index.filter((e) => e.flags?.[MODULE_ID]?.component).map((e) => ({ dsid: e.system?._dsid, uuid: e.uuid ?? pack.getUuid(e._id) }));
  return _abilityIndex;
}

const kindOfDoc = (doc) => (doc.system?.category === "signature" ? "signature"
  : doc.system?.category === "heroic" && Number(doc.system?.resource) > 0 ? `h${Number(doc.system.resource)}` : null);

export async function learnableEntries(actor) {
  const owned = new Set(actor.items.filter((i) => i.type === "ability").map(dsidOf));
  const byKind = new Map();
  for (const { dsid, uuid } of await abilityIndex()) {
    if (owned.has(dsid) || !holdsComponent(actor, dsid)) continue;
    const doc = await fromUuid(uuid);
    const kind = doc && kindOfDoc(doc);
    if (!kind) continue;
    
    const view = new CONFIG.Item.documentClass(doc.toObject(), { parent: actor });
    view.system.preparePostActorPrepData?.();
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push({ key: doc.uuid, doc, view, uuid: doc.uuid, name: doc.name, img: doc.img, learn: true });
  }
  for (const list of byKind.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byKind;
}

export async function learnAbilities(actor, docs) {
  if (!docs.length) return [];
  const creates = docs.map((doc) => {
    const data = game.items.fromCompendium(doc, { clearFolder: true });
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.prepared`, true);
    return data;
  });
  const created = await actor.createEmbeddedDocuments("Item", creates, { render: false });
  refreshTriggers();
  return created;
}

function onSheet(app, html) {
  if (!isArcanist(app.document)) return;
  for (const li of html.querySelectorAll("section.tab.equipment li.treasure[data-document-uuid]")) {
    const item = fromUuidSync(li.dataset.documentUuid, { strict: false });
    if (item?.system?.category === CATEGORY) li.closest("section.item-list-container")?.classList.add("arcanist-components");
  }
}

export function registerComponents() {
  const categories = ds.CONFIG.equipment?.categories;
  if (categories && !categories[CATEGORY]) categories[CATEGORY] = { label: "ARCANIST.Components.Category", keywords: [] };

  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.user.id || item.parent?.type !== "hero" || !needsComponent(item)) return;
    queueGrant(item);
  });

  Hooks.on("deleteItem", (item, options, userId) => {
    const actor = item.parent;
    if (userId !== game.user.id || actor?.type !== "hero" || !needsComponent(item)) return;
    const granted = actor.items.filter((i) => i.type === "treasure" && i.getFlag(MODULE_ID, GRANTED_BY) === item.id);
    if (granted.length) actor.deleteEmbeddedDocuments("Item", granted.map((i) => i.id));
  });

  Hooks.on("createActor", (actor, options, userId) => { if (userId === game.user.id) checkActor(actor); });

  Hooks.once("ready", async () => {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const actor of game.actors) await checkActor(actor).catch((err) => console.error(`${MODULE_ID} | component check`, err));
  });

  Hooks.on("renderDrawSteelHeroSheet", onSheet);
}
