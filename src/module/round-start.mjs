import { MODULE_ID } from "./constants.mjs";
import { wrap } from "./prepared.mjs";

const _handlers = [];

export const onRoundStart = (handler) => _handlers.push(handler);

export function registerRoundStart() {
  wrap("CONFIG.Combat.documentClass.prototype._onStartRound", async function (wrapped, ...args) {
    const result = await wrapped(...args);
    for (const handler of _handlers) {
      try { await handler(this); } catch (err) { console.error(`${MODULE_ID} | round start`, err); }
    }
    return result;
  });
}
