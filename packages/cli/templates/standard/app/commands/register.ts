import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "register",
  description: "Ro'yxatdan o'tish (conversation namunasi)",

  async handle(ctx) {
    await ctx.enter?.("register");
  },
});
