import { MODULE_ID } from "./constants.mjs";
import { isPrepared, refreshTriggers } from "./prepared.mjs";
import { onRoundStart } from "./round-start.mjs";

export const AUGURY = "arcanist-augury";
export const NOTES = "auguryNotes";
const USED = "auguryUsed";
const TIER_GLYPH = { 1: "!", 2: "@", 3: "#" };

const LA = (key, data) => game.i18n.format(`ARCANIST.Augury.${key}`, data ?? {});
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const auguryOf = (actor) => actor?.items?.find((i) => i.system?._dsid === AUGURY) ?? null;
export const notesOf = (actor) => actor?.getFlag(MODULE_ID, NOTES) ?? [];
const triggersApi = () => (game.modules.get("draw-steel-triggers")?.active ? game.modules.get("draw-steel-triggers").api : null);

async function setNotes(actor, notes) {
  if (notes.length) await actor.setFlag(MODULE_ID, NOTES, notes);
  else await actor.unsetFlag(MODULE_ID, NOTES);
  refreshTriggers();
}

const tierGlyph = (tier, tooltip = LA("Tier", { tier })) => `<span class="arcanist-augury-tier" data-tooltip="${esc(tooltip)}">${TIER_GLYPH[tier] ?? tier}</span>`;

const queueHTML = (notes) => notes.map((n, i) => `<span class="arcanist-augury-note ${i ? "is-queued" : "is-next"}">${tierGlyph(n.tier, LA("NoteTip", { tier: n.tier }))}</span>`).join("");

async function noteOutcome(actor, combatant) {
  const item = auguryOf(actor);
  if (!item || !isPrepared(item)) return;
  const roll = await new ds.rolls.PowerRoll("2d10 + @R", actor.getRollData()).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.implementation.getSpeaker({ token: combatant.token, actor }),
    flavor: LA("Flavor", { name: item.name }),
  });
  await setNotes(actor, [...notesOf(actor), { tier: roll.product, round: combatant.combat?.round ?? null }]);
}

const useMessageOf = (item) => [...game.messages.contents].reverse().find((m) => Date.now() - m.timestamp < 120000
  && (m.system?.parts?.contents ?? []).some((p) => p.type === "abilityUse" && p.abilityUuid === item.uuid)) ?? null;

async function provideRoll({ item, actor, messageId }) {
  const [note, ...rest] = notesOf(actor);
  if (!item || !note) return null;
  const rollMod = { autoTier: note.tier };
  await setNotes(actor, rest);
  await useMessageOf(item)?.setFlag(MODULE_ID, USED, { tier: note.tier, round: note.round ?? null });
  return rollMod;
}

function onSheet(app, html) {
  const actor = app.document;
  const notes = notesOf(actor);
  const item = auguryOf(actor);
  if (!notes.length || !item) return;
  for (const li of html.querySelectorAll(`li.item[data-document-uuid="${item.uuid}"]`)) {
    const label = li.querySelector(".name .label");
    if (label && !label.querySelector(".arcanist-augury-queue")) {
      label.insertAdjacentHTML("beforeend", ` <span class="arcanist-augury-queue" data-tooltip="${esc(LA("QueueTip"))}">${queueHTML(notes)}</span>`);
    }
  }
}

function onStack(app, html) {
  const api = triggersApi();
  if (!api) return;
  const mirror = api.getQueueMirror();
  for (const li of html.querySelectorAll("li.dst-stack-entry[data-entry-id]")) {
    const entry = mirror.find((e) => e.id === li.dataset.entryId);
    const item = entry?.itemUuid ? fromUuidSync(entry.itemUuid, { strict: false }) : null;
    if (item?.system?._dsid !== AUGURY) continue;
    const notes = notesOf(item.actor);
    const chip = li.querySelector(".dst-impact--auto");
    if (!chip || !notes.length) continue;
    chip.dataset.tooltip = LA("StackTip");
    chip.querySelector(":scope > span")?.replaceWith(Object.assign(document.createElement("span"), {
      className: "arcanist-augury-chip",
      innerHTML: `${esc(LA("NotedOutcome"))} <span class="arcanist-augury-queue">${queueHTML(notes)}</span>`,
    }));
  }
}

const specialOf = (html) => [...html.querySelectorAll("section.effect dl")].find((dl) => dl.querySelector(":scope > dt.effect")?.textContent.trim() === "Special"
  || dl.querySelector(":scope > dd.effect .dsbl-effect-label")?.textContent.trim() === "Special:");

function onChat(message, html) {
  const use = (message.system?.parts?.contents ?? []).find((p) => p.type === "abilityUse");
  const item = use?.abilityUuid ? fromUuidSync(use.abilityUuid, { strict: false }) : null;
  if (item?.system?._dsid !== AUGURY) return;
  if (specialOf(html)) return replaceSpecial(message, html);
  
  const observer = new MutationObserver(() => {
    if (!specialOf(html)) return;
    observer.disconnect();
    replaceSpecial(message, html);
  });
  observer.observe(html, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 5000);
}

function replaceSpecial(message, html) {
  const special = specialOf(html);
  if (!special) return;
  const note = message.getFlag(MODULE_ID, USED);
  if (!note) return void special.remove();
  special.replaceWith(Object.assign(document.createElement("div"), {
    className: "arcanist-augury-used",
    innerHTML: `<div class="arcanist-augury-used-label">${esc(LA("UsedLabel"))}</div>
      <div class="arcanist-augury-used-roll">${tierGlyph(note.tier)}</div>`,
  }));
}

export function registerAugury() {
  onRoundStart(async (combat) => {
    const seen = new Set();
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (actor?.type !== "hero" || seen.has(actor.id) || actor.statuses.has("dead")) continue;
      seen.add(actor.id);
      try { await noteOutcome(actor, combatant); } catch (err) { console.error(`${MODULE_ID} | Augury`, err); }
    }
  });

  Hooks.on("deleteCombat", (combat) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const c of combat.combatants) if (notesOf(c.actor).length) setNotes(c.actor, []);
  });

  Hooks.on("renderDrawSteelHeroSheet", onSheet);
  Hooks.on("renderStackWindow", onStack);
  Hooks.on("renderChatMessageHTML", onChat);

  Hooks.once("ready", () => triggersApi()?.registerRollModProvider?.(AUGURY, provideRoll));
}
