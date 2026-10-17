import { registerConditions } from "./conditions.mjs";
import { registerBladedSpells } from "./bladed-spells.mjs";
import { registerPrepared } from "./prepared.mjs";

Hooks.once("init", () => {
  registerConditions();
  registerBladedSpells();
  registerPrepared();
});
