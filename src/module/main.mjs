import { registerConditions } from "./conditions.mjs";
import { registerBladedSpells } from "./bladed-spells.mjs";

Hooks.once("init", () => {
  registerConditions();
  registerBladedSpells();
});
