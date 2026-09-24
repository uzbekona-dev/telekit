import { expect } from "vitest";
import { telekitMatchers, type TelekitMatchers } from "./matchers.js";

/**
 * Add to `setupFiles` in vitest.config.ts to get the spec §28.3 matchers
 * (`toHaveReplied`, `toHaveRepliedWithKey`, `toHaveButton`, ...) on `expect`.
 */
expect.extend(telekitMatchers);

declare module "vitest" {
  interface Matchers<T = any> extends TelekitMatchers<T> {}
}
