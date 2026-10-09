# Draw Steel: The Arcanist

Foundry VTT module for the Arcanist master class by Jenny [REDACTED], for the Draw Steel system. Level 1 (First Level
Preview) content. Private until release.

Built for Foundry v14 and Draw Steel 1.1.2.

## Layout

| Path | What it is |
| --- | --- |
| `module.json` | The manifest |
| `src/packs/` | Compendium **sources**, one JSON file per document |
| `packs/` | The **built** LevelDB compendiums Foundry loads: class, abilities, effects |
| `assets/icons/` | School and arcane path symbols |

## Compendiums

**Never edit `packs/` by hand.** Change `src/packs/` and rebuild with the Foundry CLI while no world using the module
is open. Document ids are deterministic; never change an existing `_id`, since compendium UUIDs and advancement pools
are built from them.
