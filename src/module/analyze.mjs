const DSID = "arcanist-analyze";
const MODULE = "draw-steel-arcanist-preview";

const L = (key, data) => (data ? game.i18n.format(`ARCANIST.Analyze.${key}`, data) : game.i18n.localize(`ARCANIST.Analyze.${key}`));
const esc = (text) => foundry.utils.escapeHTML(String(text ?? ""));
const list = (items) => (items.length ? items.map(esc).join(", ") : L("None"));

const damageLabel = (key) => (key === "all" ? L("AllDamage") : game.i18n.localize(ds.CONFIG.damageTypes[key]?.label ?? key));
const traits = (map) => Object.entries(map ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${damageLabel(k)} ${v}`);

function creatureReport(actor) {
  const s = actor.system;
  const keywords = [...(s.monster?.keywords ?? [])].map((k) => ds.CONFIG.monsters?.keywords?.[k]?.label ?? k);
  const malice = actor.type === "npc"
    ? actor.items.filter((i) => i.type === "ability" && Number(i.system.resource) > 0).map((i) => L("Cost", { name: i.name, cost: i.system.resource }))
    : [];
  return [
    [L("Keywords"), list(keywords)],
    [L("Immunities"), list(traits(s.damage?.immunities))],
    [L("Weaknesses"), list(traits(s.damage?.weaknesses))],
    [L("Malice"), list(malice)],
  ];
}

function objectReport(actor) {
  const o = actor.system.object ?? {};
  return [
    [L("Keywords"), list([o.categoryLabel, o.roleLabel].filter(Boolean))],
    [L("Properties"), list([o.area, o.squareStamina ? L("SquareStamina") : null].filter(Boolean))],
    [L("Immunities"), list(traits(actor.system.damage?.immunities))],
    [L("Weaknesses"), list(traits(actor.system.damage?.weaknesses))],
  ];
}

const doubleEdged = (html) => String(html ?? "").replace(/\[\[\/test ([^\]]*)\]\]/g, (m, cfg) => (/\bedges=/.test(cfg) ? m : `[[/test ${cfg} edges=2]]`));

const isDeactivate = (item) => /^deactivate$/i.test(item?.name ?? "") && item.actor?.type === "object";

async function abilitiesReport(actor) {
  const items = actor.items.filter((i) => ["feature", "ability"].includes(i.type)).sort((a, b) => isDeactivate(b) - isDeactivate(a));
  if (!items.length) return "";
  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const sections = [];
  for (const i of items) {
    const raw = i.system.description?.value ?? [...(i.system.effects?.contents ?? [])].map((e) => e.description ?? "").join("");
    const text = await TextEditor.enrichHTML(isDeactivate(i) ? doubleEdged(raw) : raw, { relativeTo: i });
    sections.push(`<details class="arcanist-analyze-feature"><summary>${esc(i.name)}</summary>${text}</details>`);
  }
  return `<h4>${esc(L("Abilities"))}</h4><p class="arcanist-analyze-hint">${esc(L("DeactivateHint"))}</p>${sections.join("")}`;
}

async function noteAnalyzed(caster, object) {
  if (!caster || caster.effects.some((e) => e.getFlag(MODULE, "analyzed") === object.uuid)) return;
  await caster.createEmbeddedDocuments("ActiveEffect", [{
    name: L("Analyzed", { name: object.name }), img: object.img, transfer: false,
    description: `<p>${esc(L("AnalyzedDescription", { name: object.name }))}</p>`,
    flags: { [MODULE]: { analyzed: object.uuid }, "draw-steel-battle-log": { gmOnly: true } },
  }]);
}

async function report(token, { spent = false, caster = null } = {}) {
  const actor = token.actor;
  const object = actor.type === "object";
  const rows = object ? objectReport(actor) : creatureReport(actor);
  const content = `<div class="arcanist-analyze"><h3>${esc(L("Title", { name: token.name }))}</h3>`
    + `<dl class="arcanist-analyze-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`
    + (object && spent ? await abilitiesReport(actor) : "") + "</div>";
  const whisper = [game.user.id, ...game.users.filter((u) => u.isGM).map((u) => u.id)];
  await ChatMessage.create({ content, whisper: [...new Set(whisper)], speaker: { alias: L("Speaker") } });
  if (object && spent) await noteAnalyzed(caster, actor);
}

const analyzedBy = (actor, object) => actor.effects.some((e) => {
  const uuid = e.getFlag(MODULE, "analyzed");
  return uuid && (uuid === object.uuid || fromUuidSync(uuid, { strict: false })?.id === object.id);
});

function deactivateOf(link) {
  if (link.closest("[data-message-id]")) return null;
  const doc = foundry.applications.instances.get(link.closest(".application")?.id)?.document;
  const item = doc?.documentName === "Item" ? doc : doc?.items?.get(link.closest("[data-item-id]")?.dataset.itemId);
  return isDeactivate(item) ? item : null;
}

async function remind(actor, object) {
  const whisper = game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id);
  const note = await ChatMessage.create({ whisper, speaker: { alias: L("Speaker") },
    content: `<p>${L("DeactivateReminder", { name: esc(actor.name), object: esc(object.name) })}</p>` });
  const done = () => { Hooks.off("createChatMessage", hook); clearTimeout(timer); note?.delete().catch(() => {}); };
  const hook = Hooks.on("createChatMessage", (m) => { if (m.id !== note?.id && m.speaker?.actor === actor.id && m.rolls?.length) done(); });
  const timer = setTimeout(done, 5 * 60000);
}

function onTestClick(event) {
  const link = event.target.closest?.('a[data-type="test"]');
  const item = link && deactivateOf(link);
  if (!item) return;
  const testers = [...ds.utils.tokensToActors()].filter((a) => analyzedBy(a, item.actor));
  if (!testers.length) return;
  
  const was = link.dataset.edges;
  if (!(Number(was) >= 2)) link.dataset.edges = "2";
  setTimeout(() => { if (was === undefined) delete link.dataset.edges; else link.dataset.edges = was; }, 0);
  for (const actor of testers) remind(actor, item.actor).catch((err) => console.warn("draw-steel-arcanist-preview | Analyze", err));
}

export function registerAnalyze() {
  Hooks.on("createChatMessage", (message, _options, userId) => {
    if (userId !== game.user.id) return;
    const part = [...(message.system?.parts?.contents ?? [])].find((p) => p.type === "abilityUse");
    const item = part?.abilityUuid ? fromUuidSync(part.abilityUuid) : null;
    if (item?.system?._dsid !== DSID) return;
    const spent = (Number(String(message.flavor ?? "").match(/^Spent (\d+)/i)?.[1]) || 0) > (Number(item.system.resource) || 0);
    for (const token of game.user.targets) {
      if (token.actor) report(token, { spent, caster: item.actor }).catch((err) => console.warn("draw-steel-arcanist-preview | Analyze", err));
    }
  });
  
  document.addEventListener("click", onTestClick, true);
}
