# Telekit

O‘zbekcha developer experience’ga yo‘naltirilgan modular TypeScript Telegram bot framework.

> **Holat: early preview.** Asosiy API ishlaydi va avtomatik testlar bilan qoplangan, ammo loyiha hali production security auditi va yakuniy API barqarorlashtirish bosqichidan o‘tmagan.

## Nimalar bor

- typed Telegram Bot API client;
- polling va webhook rejimlari;
- command, event va inline routing;
- middleware pipeline va per-chat sequencer;
- HMAC bilan imzolangan callback’lar;
- memory/database session’lar;
- replay asosidagi conversation flow’lar;
- SQLite va PostgreSQL integratsiyasi;
- ICU lokalizatsiya;
- media va fayl yordamchilari;
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

- Node.js 20.11 yoki yangiroq
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

- 65 ta test fayli
- 487 ta avtomatik test
- barcha workspace paketlari TypeScript strict mode’da tekshiriladi

## Hujjatlar

- [To‘liq texnik topshiriq](./Toliq-TZ.md)
- [Dastlabki vision hujjati](./Toliq-TZ.v1-vision.md)
- [Minimal bot namunasi](./examples/minimal-bot)

## Hozirgi cheklovlar

Bu versiya o‘rganish, prototiplash va framework rivojiga hissa qo‘shish uchun yaroqli. Production’da ishlatishdan oldin security hardening, global concurrency/backpressure, graceful shutdown va public API stabilizatsiyasi yakunlanishi kerak.

## Xavfsizlik

`.env`, bot tokenlari, signing key’lar va lokal SQLite fayllarini repozitoriyga commit qilmang. Namuna konfiguratsiyalari faqat placeholder qiymatlardan foydalanadi.

---

Telekit — Telegram bot yaratishni tushunarli, typed va testlanadigan qilishga qaratilgan ochiq loyiha.
