import { registerConditions } from "./conditions.mjs";
import { registerBladedSpells } from "./bladed-spells.mjs";
import { registerPrepared } from "./prepared.mjs";
import { registerHandout } from "./handout.mjs";
import { registerComponents } from "./components.mjs";
import { registerPaths } from "./paths.mjs";
import { registerAugury } from "./augury.mjs";
import { registerRoundStart } from "./round-start.mjs";
import { registerGrimoirePool } from "./grimoire-pool.mjs";

Hooks.once("init", () => {
  registerConditions();
  registerBladedSpells();
  registerPrepared();
  registerHandout();
  registerComponents();
  registerRoundStart();
  registerPaths();
  registerAugury();
  registerGrimoirePool();
});
