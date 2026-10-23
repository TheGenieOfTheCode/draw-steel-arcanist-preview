import { MODULE_ID } from "./constants.mjs";
import { wrap } from "./prepared.mjs";

const PONDER = "arcanist-ponder";
const DOMINION = "arcanist-destructive-dominion";

const owns = (actor, dsid) => !!actor?.items?.some((i) => i.system?._dsid === dsid);

const _roundGain = new WeakSet();

async function gainSurge(actor) {
  const roll = await new ds.rolls.DSRoll("1").evaluate();
  const title = game.i18n.format("DRAW_STEEL.EDITOR.Enrichers.Gain.MessageTitle.Default", {
    type: game.i18n.localize("DRAW_STEEL.Actor.hero.FIELDS.hero.surges.label"), targets: "",
  });
  await ChatMessage.implementation.create({
    title,
    rolls: [],
    type: "standard",
    "system.parts": [{ type: "roll", flavor: title, rolls: [roll] }],
    flags: { core: { canPopout: true } },
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
  });
  await actor.modifyTokenAttribute("hero.surges", roll.total, true, false);
}

export function registerPaths() {
  const heroBase = Object.getPrototypeOf(CONFIG.Actor.dataModels.hero.prototype);

  wrap("CONFIG.Actor.dataModels.hero.prototype._onStartTurn", async function (wrapped, combatant, ...args) {
    if (owns(this.parent, PONDER) && !_roundGain.has(this.parent)) return heroBase._onStartTurn.call(this, combatant, ...args);
    return wrapped(combatant, ...args);
  }, "MIXED");

  wrap("CONFIG.Combat.documentClass.prototype._onStartRound", async function (wrapped, ...args) {
    const result = await wrapped(...args);
    const seen = new Set();
    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (actor?.type !== "hero" || seen.has(actor.id) || !owns(actor, PONDER) || actor.statuses.has("dead")) continue;
      seen.add(actor.id);
      _roundGain.add(actor);
      try { await actor.system._onStartTurn(combatant); } catch (err) { console.error(`${MODULE_ID} | Ponder round gain`, err); } finally { _roundGain.delete(actor); }
    }
    return result;
  });

  wrap("CONFIG.Actor.dataModels.hero.prototype.startCombat", async function (wrapped, ...args) {
    const result = await wrapped(...args);
    if (owns(this.parent, DOMINION)) await gainSurge(this.parent);
    return result;
  });
}
