import { beforeAll } from "vitest";

/**
 * jsdom does not implement HTMLElement.innerText; contract parsing uses
 * innerText to mirror browser TipTap output. Delegate to textContent in tests only.
 */
beforeAll(() => {
  const desc = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "innerText"
  );
  if (desc?.get) return;
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
  });
});
