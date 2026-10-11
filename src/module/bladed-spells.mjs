import { MODULE_ID, BLADED_SPELLS } from "./constants.mjs";

const MAGIC_STRIKE = ["magic", "strike"];

function convert(model) {
  if (model?.distance?.type !== "ranged") return;
  const actor = model.actor;
  if (!actor?.items?.some((i) => i.system?._dsid === BLADED_SPELLS)) return;
  const keywords = model.keywords;
  if (!keywords || !MAGIC_STRIKE.every((k) => keywords.has(k))) return;
  model.distance.secondary = model.distance.primary;
  model.distance.primary = 1;
  model.distance.type = "meleeRanged";
}

export function registerBladedSpells() {
  const path = "CONFIG.Item.dataModels.ability.prototype.preparePostActorPrepData";
  const after = function (wrapped, ...args) {
    const result = wrapped(...args);
    try { convert(this); } catch (err) { console.warn(`${MODULE_ID} | Bladed Spells`, err); }
    return result;
  };
  if (game.modules.get("lib-wrapper")?.active) libWrapper.register(MODULE_ID, path, after, "WRAPPER");
  else {
    const proto = CONFIG.Item.dataModels.ability.prototype;
    const original = proto.preparePostActorPrepData;
    proto.preparePostActorPrepData = function (...args) { return after.call(this, original.bind(this), ...args); };
  }
}
