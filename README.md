# Telekit

O‘zbekcha developer experience’ga yo‘naltirilgan modular TypeScript Telegram bot framework.

> **Holat: preview.** Asosiy runtime hardening qilingan va avtomatik testlar bilan qoplangan. `1.0` gacha public API’da breaking change bo‘lishi mumkin; katta production deployment oldidan mustaqil security audit tavsiya etiladi.

## Nimalar bor

- to‘liq typed Telegram Bot API client (`@grammyjs/types` sxemasi asosida);
- polling va webhook rejimlari;
- command, event va inline routing;
- middleware pipeline, per-chat ordering, global concurrency va bounded backpressure;
- HMAC bilan imzolangan callback’lar;
- memory/database session’lar, 64 KiB limit va optimistic-lock retry;
- replay asosidagi conversation flow’lar, saqlanadigan `flow.params`;
- SQLite va PostgreSQL integratsiyasi;
- ICU lokalizatsiya;
- media va nested multipart fayl yordamchilari;
- outgoing global/per-chat rate limiter va graceful shutdown;
- reusable `app.plugin(...)` extension kontrakti;
- CLI, loyiha shablonlari va Telegram’siz test muhiti.

## Paketlar

| Paket | Vazifasi |
| --- | --- |
| `@telekit/core` | Application lifecycle, routing, Telegram client, webhook, i18n va database |
| `@telekit/types` | Telegram obyektlari, update va metod turlari |
| `@telekit/callbacks` | Typed va imzolangan callback payload’lari |
| `@telekit/sessions` | Memory/database session store |
| `@telekit/conversations` | Replay-safe conversation va deklarativ flow |
| `@telekit/testing` | Fake Telegram, test bot, actor va matcher’lar |
| `@telekit/cli` | `new`, `dev`, `build`, `start`, `doctor`, migration va diagnostika |

## Talablar

- Node.js 22.13 yoki yangiroq (`node:sqlite` talab qilinadi)
- pnpm 11

## Ishga tushirish

```bash
git clone https://github.com/uzbekona-dev/telekit.git
cd telekit
pnpm install
pnpm typecheck
pnpm test
```

Minimal namunani ishga tushirish:

```bash
cp examples/minimal-bot/.env.example examples/minimal-bot/.env
# examples/minimal-bot/.env ichiga BOT_TOKEN yozing
pnpm --filter minimal-bot dev
```

## Tekshiruv holati

- 68 ta test fayli
- 507 ta avtomatik test
- barcha workspace paketlari TypeScript strict mode’da tekshiriladi
- GitHub Actions’da Node.js 22 va 24 matritsasi

## Hujjatlar

- [To‘liq texnik topshiriq](./Toliq-TZ.md)
- [Dastlabki vision hujjati](./Toliq-TZ.v1-vision.md)
- [Minimal bot namunasi](./examples/minimal-bot)
- [Plugin yaratish](./docs/plugins.md)
- [Hissa qo‘shish](./CONTRIBUTING.md)
- [v1 roadmap](./ROADMAP.md)
- [Security policy](./SECURITY.md)

## Hozirgi cheklovlar

Runtime’dagi asosiy xavfsizlik va yuklama boshqaruvi mavjud. Qolgan asosiy xavf — loyiha hali `1.0` API stability va keng real-world production tajribasiga yetmagan. Shu sabab preview versiyada versiyani pin qilish va yangilanish changelog’ini tekshirish kerak.

## Xavfsizlik

`.env`, bot tokenlari, signing key’lar va lokal SQLite fayllarini repozitoriyga commit qilmang. Namuna konfiguratsiyalari faqat placeholder qiymatlardan foydalanadi.

---

Telekit — Telegram bot yaratishni tushunarli, typed va testlanadigan qilishga qaratilgan ochiq loyiha.
