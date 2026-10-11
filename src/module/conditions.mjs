import { STATUS_DISORIENTED, DISORIENTED_SQUARES } from "./constants.mjs";

export function registerConditions() {
  const id = STATUS_DISORIENTED;
  const data = {
    name: "ARCANIST.Status.Disoriented",
    img: "icons/svg/daze.svg",
    description: "ARCANIST.Status.DisorientedDescription",
    system: {
      changes: [{
        key: "flags.draw-steel-ctlib.loe.rangeCap",
        type: "override",
        value: String(DISORIENTED_SQUARES),
        phase: "initial",
        priority: null,
      }],
    },
  };
  if (!CONFIG.statusEffects[id]) CONFIG.statusEffects[id] = { id, _id: id.padEnd(16, "0"), order: 2, ...data };
  if (ds.CONFIG.conditions && !ds.CONFIG.conditions[id]) ds.CONFIG.conditions[id] = { ...data };

  Hooks.once("i18nInit", () => {
    for (const entry of [CONFIG.statusEffects?.[id], ds.CONFIG.conditions?.[id]]) {
      if (entry?.description?.startsWith?.("ARCANIST.")) entry.description = game.i18n.localize(entry.description);
    }
  });
}
