const MAX_CHARS = 12000;
const TARGET_SELECTORS = ["main", "article", "[role=\"main\"]", "body"];
const MIN_MEANINGFUL_LENGTH = 200;

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const cloneWithoutBlockedTags = (element: Element): HTMLElement => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style").forEach((node) => node.remove());
  return clone;
};

const getLiveNodeText = (element: Element): string => {
  const htmlElement = element as HTMLElement;
  const raw = htmlElement.innerText || htmlElement.textContent || "";
  return normalizeText(raw);
};

export const extractPageText = (): string => {
  const candidates: string[] = [];

  for (const selector of TARGET_SELECTORS) {
    const candidate = document.querySelector(selector);
    if (!candidate) {
      continue;
    }

    // Prefer live node text for reliability on JS-rendered pages.
    const liveText = getLiveNodeText(candidate);
    if (liveText.length >= MIN_MEANINGFUL_LENGTH) {
      return liveText.slice(0, MAX_CHARS);
    }

    const cleanedNode = cloneWithoutBlockedTags(candidate);
    const clonedText = normalizeText(cleanedNode.textContent || "");

    if (clonedText.length > 0) {
      candidates.push(clonedText);
    }
  }

  if (candidates.length > 0) {
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return best.slice(0, MAX_CHARS);
  }

  const bodyText = normalizeText(document.body?.innerText || document.body?.textContent || "");
  if (bodyText.length > 0) {
    return bodyText.slice(0, MAX_CHARS);
  }

  return "";
};
