const DSID = "arcanist-analyze";

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

async function report(token) {
  const actor = token.actor;
  const rows = actor.type === "object" ? objectReport(actor) : creatureReport(actor);
  const content = `<h3>${esc(L("Title", { name: token.name }))}</h3>`
    + `<dl class="arcanist-analyze">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const whisper = [game.user.id, ...game.users.filter((u) => u.isGM).map((u) => u.id)];
  await ChatMessage.create({ content, whisper: [...new Set(whisper)], speaker: { alias: L("Speaker") } });
}

export function registerAnalyze() {
  Hooks.on("createChatMessage", (message, _options, userId) => {
    if (userId !== game.user.id) return;
    const part = [...(message.system?.parts?.contents ?? [])].find((p) => p.type === "abilityUse");
    const item = part?.abilityUuid ? fromUuidSync(part.abilityUuid) : null;
    if (item?.system?._dsid !== DSID) return;
    for (const token of game.user.targets) if (token.actor) report(token).catch((err) => console.warn("draw-steel-arcanist | Analyze", err));
  });
}
