import { registerConditions } from "./conditions.mjs";
import { registerBladedSpells } from "./bladed-spells.mjs";
import { registerPrepared } from "./prepared.mjs";
import { registerHandout } from "./handout.mjs";
import { registerComponents } from "./components.mjs";

Hooks.once("init", () => {
  registerConditions();
  registerBladedSpells();
  registerPrepared();
  registerHandout();
  registerComponents();
});
