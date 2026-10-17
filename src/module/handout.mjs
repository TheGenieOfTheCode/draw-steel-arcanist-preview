

const CHR = /@chr\b/g;

function boxCharacteristic(root) {
  for (const card of root.querySelectorAll(".arcanist-handout .arc-card")) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue.includes("@chr")) hits.push(node);
    for (const node of hits) {
      const parts = node.nodeValue.split(CHR);
      const frag = document.createDocumentFragment();
      parts.forEach((text, i) => {
        if (i) {
          const box = document.createElement("span");
          box.className = "arc-chr";
          box.textContent = "R";
          frag.append(box);
        }
        if (text) frag.append(text);
      });
      node.replaceWith(frag);
    }
    for (const el of card.querySelectorAll("[data-tooltip*='@chr']")) el.dataset.tooltip = el.dataset.tooltip.replace(CHR, "R");
  }
}

export function registerHandout() {
  Hooks.on("renderJournalEntryPageTextSheet", (app, element) => boxCharacteristic(element));
}
