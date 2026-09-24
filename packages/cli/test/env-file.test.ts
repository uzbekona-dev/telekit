import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotEnvCascade, parseEnvFile } from "../src/env-file.js";
import { makeProject, removeProject, snapshotEnv } from "./helpers.js";

describe("parseEnvFile", () => {
  let dir: string;
  afterEach(() => removeProject(dir));

  it("reads KEY=value pairs, skipping blanks, comments and lines without '='", () => {
    dir = makeProject({
      ".env": [
        "# izoh",
        "",
        "BOT_TOKEN=123:abc",
        "  SPACED  =  qiymat  ",
        'DOUBLE="ikki so\'z"',
        "SINGLE='bir'",
        "NO_EQUALS_LINE",
        "EMPTY=",
        "URL=postgres://u:p@h/db?x=1",
      ].join("\r\n"),
    });

    expect(parseEnvFile(`${dir}/.env`)).toEqual({
      BOT_TOKEN: "123:abc",
      SPACED: "qiymat",
      DOUBLE: "ikki so'z",
      SINGLE: "bir",
      EMPTY: "",
      URL: "postgres://u:p@h/db?x=1",
    });
  });

  it("returns an empty object for a missing file", () => {
    dir = makeProject();
    expect(parseEnvFile(`${dir}/.env`)).toEqual({});
  });
});

describe("loadDotEnvCascade", () => {
  let dir: string;
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = snapshotEnv();
    delete process.env.APP_ENV;
    delete process.env.CASCADE_A;
    delete process.env.CASCADE_B;
    delete process.env.CASCADE_C;
    delete process.env.CASCADE_D;
  });
  afterEach(() => {
    restoreEnv();
    removeProject(dir);
  });

  it("layers .env < .env.<env> < .env.local < .env.<env>.local, and never overrides the shell", () => {
    dir = makeProject({
      ".env": "CASCADE_A=base\nCASCADE_B=base\nCASCADE_C=base\nCASCADE_D=base",
      ".env.development": "CASCADE_B=env",
      ".env.local": "CASCADE_C=local",
      ".env.development.local": "CASCADE_C=env-local\nCASCADE_D=env-local",
    });
    process.env.CASCADE_D = "shell";

    loadDotEnvCascade(dir);

    expect(process.env.CASCADE_A).toBe("base");
    expect(process.env.CASCADE_B).toBe("env");
    expect(process.env.CASCADE_C).toBe("env-local");
    expect(process.env.CASCADE_D).toBe("shell");
  });

  it("uses the command's default APP_ENV when neither the shell nor .env sets one", () => {
    dir = makeProject({
      ".env.development": "CASCADE_A=development",
      ".env.production": "CASCADE_A=production",
    });

    loadDotEnvCascade(dir, "production");

    expect(process.env.CASCADE_A).toBe("production");
  });

  it("an APP_ENV in .env picks the environment file, and the shell's APP_ENV beats both", () => {
    dir = makeProject({
      ".env": "APP_ENV=staging",
      ".env.staging": "CASCADE_A=staging",
      ".env.test": "CASCADE_A=test",
    });

    loadDotEnvCascade(dir, "production");
    expect(process.env.CASCADE_A).toBe("staging");
    expect(process.env.APP_ENV).toBe("staging");

    delete process.env.CASCADE_A;
    process.env.APP_ENV = "test";
    loadDotEnvCascade(dir);
    expect(process.env.CASCADE_A).toBe("test");
  });
});
