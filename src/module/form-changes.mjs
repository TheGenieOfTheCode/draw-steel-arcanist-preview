import { MODULE_ID } from "./constants.mjs";

const KEY = "formChanges";
const L = (key, data) => (data ? game.i18n.format(`ARCANIST.FormChanges.${key}`, data) : game.i18n.localize(`ARCANIST.FormChanges.${key}`));

const DEFAULTS = [
  ["Aspect of the Wild", "self"], ["Furious Change", "self"], ["Disciple of the Green", "self"], ["Chimeric Manifestation", "self"],
  ["Umbral Form", "self"], ["Shadowmeld", "self"], ["Animal Form", "self"], ["Slight Case of Lycanthropy", "self"],
  ["Stolen Face", "self"], ["Curse of Stone", "self"], ["Full Wolf", "self"], ["Shapeshifter", "self"],
  ["Aggressive Mimicry", "self"], ["Violent Transformation", "self"], ["Red Mist Rising", "self"], ["Bat Form", "self"],
  ["Heady or Not", "self"], ["Feast", "self"], ["Mask of the Many", "self"], ["Paper Trappings", "self"],
  ["To Stone!", "effect"], ["Stone Eyes", "effect"], ["Twist Shape", "effect"], ["Oozing Transformation", "effect"],
  ["Devolving Tentacles", "effect"], ["Petrify", "effect"], ["Mass Petrify", "effect"], ["Petrifying Eye Beams", "effect"],
  ["Summoner's Cackletongue", "targets"], ["Endless Hunger", "targets"], ["Abyssal Evolution", "targets"],
  ["Elemental Transformation", "targets"], ["Alter Form", "targets"],
].map(([name, mode]) => ({ name, mode }));

const MODES = ["self", "effect", "targets"];

const current = () => game.settings.get(MODULE_ID, KEY) ?? DEFAULTS;

function hand() {
  game.modules.get("draw-steel-triggers")?.api?.registerFormChanges?.(MODULE_ID, current());
}

class FormChangesMenu extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "arcanist-form-changes",
    tag: "form",
    classes: ["draw-steel", "standard-form", "ctlib-scroll-window", "arcanist-form-changes"],
    window: { title: "ARCANIST.FormChanges.title", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: FormChangesMenu.#save, closeOnSubmit: true },
  };

  #rows = foundry.utils.deepClone(current());

  async _renderHTML() {
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const options = (mode) => MODES.map((m) => `<option value="${m}"${m === mode ? " selected" : ""}>${esc(L(`mode.${m}`))}</option>`).join("");
    const rows = this.#rows.map((row, i) => `
      <div class="form-group arcanist-fc-row">
        <input type="text" name="name.${i}" value="${esc(row.name)}" aria-label="${esc(L("name"))}">
        <select name="mode.${i}" aria-label="${esc(L("mode.label"))}">${options(row.mode)}</select>
        <button type="button" class="icon fa-solid fa-trash" data-remove="${i}" aria-label="${esc(L("remove"))}"></button>
      </div>`).join("");
    return `
      <p class="hint">${esc(L("intro"))}</p>
      <ul class="hint arcanist-fc-modes">${MODES.map((m) => `<li><strong>${esc(L(`mode.${m}`))}</strong>: ${esc(L(`modeHint.${m}`))}</li>`).join("")}</ul>
      <div class="arcanist-fc-list">${rows}</div>
      <footer class="form-footer">
        <button type="button" data-add><i class="fa-solid fa-plus"></i> ${esc(L("add"))}</button>
        <button type="button" data-reset><i class="fa-solid fa-rotate-left"></i> ${esc(L("reset"))}</button>
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("save"))}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    const keep = () => { this.#rows = this.#read(content); };
    content.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
      keep();
      this.#rows.splice(Number(b.dataset.remove), 1);
      this.render();
    }));
    content.querySelector("[data-add]")?.addEventListener("click", () => {
      keep();
      this.#rows.push({ name: "", mode: "self" });
      this.render();
    });
    content.querySelector("[data-reset]")?.addEventListener("click", () => {
      this.#rows = foundry.utils.deepClone(DEFAULTS);
      this.render();
    });
  }

  #read(root) {
    return [...root.querySelectorAll(".arcanist-fc-row")].map((row) => ({
      name: row.querySelector("input")?.value.trim() ?? "",
      mode: row.querySelector("select")?.value ?? "self",
    }));
  }

  static async #save(_event, form) {
    const rows = this.#read(form).filter((r) => r.name);
    await game.settings.set(MODULE_ID, KEY, rows);
  }
}

export function registerFormChanges() {
  game.settings.register(MODULE_ID, KEY, {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULTS,
    onChange: hand,
  });
  game.settings.registerMenu(MODULE_ID, "formChangesMenu", {
    name: "ARCANIST.FormChanges.menu.name",
    label: "ARCANIST.FormChanges.menu.label",
    hint: "ARCANIST.FormChanges.menu.hint",
    icon: "fa-solid fa-masks-theater",
    type: FormChangesMenu,
    restricted: true,
  });
  Hooks.once("ready", hand);
}
