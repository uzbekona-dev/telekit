# __PROJECT_NAME__

Telekit yordamida yaratilgan Telegram bot.

## Ishga tushirish

```bash
pnpm install       # yoki: npm install

cp .env.example .env
# .env faylini oching va BOT_TOKEN ni kiriting (@BotFather dan oling)

pnpm dev
```

## Buyruqlar

```text
pnpm dev        development server (fayl o'zgarishlarini kuzatadi)
pnpm build      production build (dist/)
pnpm start      production'da ishga tushirish (avval build kerak)
pnpm doctor     muhitni tekshirish (token, ulanish, fayl strukturasi)
```

## Struktura

```text
app/
  commands/     /buyruq fayllari — fayl nomi buyruq nomiga aylanadi
  events/       Telegram event handlerlari (message:text va h.k.)
telekit.config.ts
main.ts
```

Yangi buyruq qo'shish uchun `app/commands/` ichiga fayl qo'shing:

```ts
// app/commands/profile.ts
import { defineCommand } from "@telekit/core";

export default defineCommand({
  name: "profile",
  async handle(ctx) {
    await ctx.reply("Profil");
  },
});
```

Bot qayta ishga tushirilganda `/profile` avtomatik ishlaydi — markaziy
registratsiya kerak emas.
