import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLocaleResources } from "../../src/i18n/loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "locales");

describe("loadLocaleResources", () => {
  it("scans <locale>/<namespace>.json and prefixes keys with the namespace", async () => {
    const resources = await loadLocaleResources(FIXTURES_DIR);

    expect(resources.uz).toEqual({
      "bot.welcome": "Assalomu alaykum, {name}!",
      "bot.orders.count": "{count, plural, one {# ta buyurtma} other {# ta buyurtma}}",
    });
    expect(resources.ru).toEqual({ "bot.welcome": "Здравствуйте, {name}!" });
  });

  it("returns an empty object for a directory that doesn't exist", async () => {
    expect(await loadLocaleResources(path.join(FIXTURES_DIR, "does-not-exist"))).toEqual({});
  });
});
