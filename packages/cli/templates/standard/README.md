# __PROJECT_NAME__

Telekit yordamida yaratilgan Telegram bot — **Standard** shablon: baza
(SQLite), sessiyalar, imzolangan callback'lar, inline keyboard va
ko'p tilli xabarlar (i18n) allaqachon ulangan. Admin panel yo'q (u alohida,
kelajakdagi bosqichda qo'shiladi).

## Ishga tushirish

```bash
pnpm install       # yoki: npm install

cp .env.example .env
# .env faylini oching va BOT_TOKEN ni kiriting (@BotFather dan oling)

pnpm dev
```

## Buyruqlar

```text
pnpm dev          development server (fayl o'zgarishlarini kuzatadi)
pnpm build        production build (dist/)
pnpm start        production'da ishga tushirish (avval build kerak)
pnpm doctor       muhitni tekshirish (token, ulanish, fayl strukturasi)
pnpm migrate      kutilayotgan DB migratsiyalarini qo'llash
pnpm routes       callback routeId/budjet hisoboti + to'qnashuv tekshiruvi
pnpm i18n:check   tarjima kalitlari yetishmasligini tekshirish
```

## Struktura

```text
app/
  commands/       /buyruq fayllari — fayl nomi buyruq nomiga aylanadi
  events/         Telegram event handlerlari (message:text va h.k.)
  callbacks/      defineCallback() — inline tugma handlerlari (main.ts'da qo'lda installCallbacks orqali ulanadi)
  conversations/  defineConversation() — ko'p qadamli dialoglar (main.ts'da qo'lda installConversations orqali ulanadi)
  inline/         defineInline() — inline rejim ("@botingiz <so'z>"); default.ts qolgan barcha so'rovlarga javob beradi
resources/
  locales/        <til>/<namespace>.json — ctx.t() shu yerdan o'qiydi
telekit.config.ts
main.ts
storage/          SQLite fayli (gitignore qilingan)
```

## Namunalar

- `/start`, `/help` — `ctx.t()` orqali ko'p tilli javoblar
- `/lang` — `localePicker()` bilan til tanlash, tanlov bazaga yoziladi
- `/counter` — `defineCallback` + `keyboard()` + `ctx.session` birgalikda
- `/profile` — `ctx.user`/`ctx.db` orqali foydalanuvchi ma'lumotlari
- `/register` — `defineConversation` + `flow.text/number/confirm`: ko'p
  qadamli dialog, holati bazada saqlanadi (bot qayta ishga tushsa ham
  foydalanuvchi javobidan davom etadi)
- inline rejim — `app/inline/default.ts`: istalgan chatda `@botingiz bilim`
  deb yozing (avval @BotFather'da `/setinline` bilan yoqing); natijalar
  `inlinePage()` bilan sahifalanadi

Yangi buyruq qo'shish uchun `app/commands/` ichiga fayl qo'shing — bot qayta
ishga tushirilganda avtomatik ro'yxatdan o'tadi, markaziy registratsiya
kerak emas. Yangi callback qo'shsangiz, `app/callbacks/`ga yozib, uni
`main.ts`dagi `installCallbacks([...])` ro'yxatiga qo'shing. Yangi
conversation qo'shsangiz, `app/conversations/`ga yozib, `installConversations([...])`
ro'yxatiga qo'shing.

## Production'da webhook

`.env`da `PUBLIC_URL=https://...` va `BOT_MODE=auto` (yoki `webhook`)
qo'ying — Telekit avtomatik webhook'ni sozlaydi va tinglaydi (polling'ga
zaxira bilan, agar URL yetib bo'lmasa).
