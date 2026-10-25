import { MODULE_ID } from "./constants.mjs";
import { wrap } from "./prepared.mjs";

const PATH = "ds.applications.apps.advancement.ItemGrantConfigurationDialog.prototype.fulfillsRequirements";

const grimoireSchool = (item) => {
  const flags = item?.flags?.[MODULE_ID];
  return flags?.slot === "grimoire" ? flags.school : null;
};

function takenGrimoires(dialog) {
  const chain = dialog.node?.chain;
  const taken = new Set((chain?.actor?.items ?? []).filter(grimoireSchool).map((i) => i.system._dsid));
  for (const node of chain?.activeNodes?.() ?? []) {
    if (node === dialog.node || node.advancement?.type !== "itemGrant") continue;
    for (const uuid of node.chosenSelection ?? []) {
      const item = node.choices?.[uuid]?.item;
      if (grimoireSchool(item)) taken.add(item.system._dsid);
    }
  }
  return taken;
}

export function registerGrimoirePool() {
  wrap(PATH, function (wrapped, item) {
    if (!wrapped(item)) return false;
    const school = grimoireSchool(item);
    if (!school || Object.values(this.advancement?.pool ?? {}).length < 2) return true;
    return !this.fulfilledDSID.has(`arcanist-${school}`) && !takenGrimoires(this).has(item.system._dsid);
  });
}
