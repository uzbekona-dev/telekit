# TELEKIT

## Telegram Application Framework

**Hujjat turi:** Texnik topshiriq
**Loyiha turi:** Open-source TypeScript Framework
**Asosiy platforma:** Telegram Bot API
**Asosiy til:** TypeScript
**Maqsad:** Telegram botlarni yaratish, test qilish, boshqarish, kuzatish va production'ga chiqarishni yagona framework ichida hal qilish.

---

# 1. Loyiha konsepsiyasi

Telekit oddiy Telegram API wrapper yoki bot kutubxonasi bo‘lmaydi.

Telekit:

> Telegram bot asosidagi ilovalarni yaratish uchun to‘liq application framework.

Framework developerga Telegram API bilan ishlash uchun past darajadagi vositalarni emas, tayyor application infratuzilmasini beradi.

Developerning asosiy vazifasi:

```text
biznes logika yozish
```

bo‘lishi kerak.

Quyidagilarni esa Telekit boshqaradi:

```text
Telegram connection
routing
polling
webhook
configuration
environment
logging
error handling
rate limiting
retry
updates
callbacks
sessions
conversations
database integrations
admin panel
analytics
broadcast
required channels
localization
testing
DevTools
deployment
health monitoring
```

---

# 2. Asosiy pozitsiyalash

Telekit quyidagicha pozitsiyalanadi:

> **Telekit — The TypeScript Framework for Telegram Applications.**

Asosiy g‘oya:

> **Tokenni kiriting. Telekit infratuzilmani quradi. Siz bot logikasini yozing.**

Telekit grammY, Telegraf yoki boshqa kutubxonalarni takrorlashga urinmaydi.

Farq:

```text
Telegram library
    ↓
Telegram API bilan ishlash vositasi


Telekit
    ↓
Telegram Application yaratish platformasi
```

---

# 3. Frameworkning asosiy ustunliklari

Telekitning raqobatdagi asosiy ustunliklari:

1. Zero-config loyiha yaratish.
2. Tayyor professional loyiha strukturasi.
3. TypeScript-first architecture.
4. File-based routing.
5. Type-safe callbacks.
6. Signed callback payload.
7. Built-in conversations.
8. Built-in localization.
9. Auto polling/webhook.
10. Tayyor Admin Panel.
11. Built-in analytics.
12. Broadcast tizimi.
13. Majburiy obuna tizimi.
14. Visual keyboard builder.
15. DevTools.
16. Telegram update inspector.
17. Update replay.
18. Bot simulator.
19. Built-in testing framework.
20. Production lifecycle management.
21. Modular architecture.
22. CLI generator.
23. Database/storage adapterlari.
24. Queue va scheduler.
25. Bot health monitoring.
26. Multilingual installer.
27. UZ / RU / EN admin panel.
28. Bir buyruqda development environment.
29. Bir buyruqda build.
30. Bir buyruqda production start.

---

# 4. Texnologik stack

## 4.1 Framework Core

```text
TypeScript
Node.js LTS
ESM
Native Fetch API
pnpm workspace
```

Core imkon qadar runtime-independent yoziladi.

Node.js asosiy reference runtime hisoblanadi.

Kelajakda:

```text
Node.js
Bun
Deno
Cloudflare Workers
Serverless
```

qo‘llab-quvvatlanishi kerak.

---

# 5. Monorepo

Repository:

```text
telekit/
│
├── packages/
│   ├── core/
│   ├── api/
│   ├── types/
│   ├── cli/
│   ├── config/
│   ├── router/
│   ├── callbacks/
│   ├── conversations/
│   ├── localization/
│   ├── sessions/
│   ├── testing/
│   ├── devtools/
│   ├── admin/
│   ├── analytics/
│   ├── broadcast/
│   ├── subscriptions/
│   ├── scheduler/
│   ├── queue/
│   └── health/
│
├── adapters/
│   ├── node/
│   ├── bun/
│   ├── cloudflare/
│   ├── fastify/
│   ├── hono/
│   ├── express/
│   ├── sqlite/
│   ├── postgres/
│   └── redis/
│
├── create-telekit/
├── examples/
├── docs/
├── benchmarks/
└── tests/
```

Core boshqa qismlarga majburiy bog‘lanmaydi.

Masalan:

```text
@telekit/core
```

ishlashi uchun:

```text
PostgreSQL
Redis
Admin Panel
Vue
Queue
```

talab qilinmaydi.

---

# 6. Loyiha yaratish

Asosiy tavsiya etilgan buyruq:

```bash
npx telekit new my-bot
```

Shuningdek:

```bash
npm create telekit@latest my-bot
```

qo‘llab-quvvatlanadi.

Global CLI o‘rnatilgan bo‘lsa:

```bash
telekit new my-bot
```

ishlaydi.

---

# 7. Installer — birinchi ekran

Birinchi savol har doim til haqida bo‘ladi.

```text
╭──────────────────────────────────────╮
│               TELEKIT                │
│     Telegram Application Framework   │
╰──────────────────────────────────────╯

Choose your language
Tilni tanlang
Выберите язык

❯ 🇺🇿 O‘zbekcha
  🇷🇺 Русский
  🇬🇧 English
```

Tanlangan til:

* CLI tili;
* default bot tili;
* admin panel default tili;
* validation xabarlari;
* starter kontenti;
* default command tavsiflari;

uchun ishlatiladi.

---

# 8. O‘zbek tilidagi installer

```text
Loyiha nomi:
> my-bot

Loyiha turini tanlang:

❯ Standard
  Minimal
  Bot + API
  Mini App

Admin panel o‘rnatilsinmi?

❯ Ha
  Yo‘q

Ma'lumotlar bazasi:

❯ SQLite
  PostgreSQL
  Yo‘q

Bot ishlash rejimi:

❯ Avtomatik
  Polling
  Webhook

DevTools o‘rnatilsinmi?

❯ Ha
  Yo‘q

Bot nechta tilni qo‘llab-quvvatlasin?

❯ Faqat O‘zbekcha
  O‘zbekcha + Русский
  O‘zbekcha + Русский + English
```

Rus yoki ingliz tili tanlansa savollar to‘liq shu tilda ko‘rsatiladi.

---

# 9. Loyiha template'lari

## Minimal

Faqat framework core.

```text
app/
commands/
events/
config/
tests/
```

Admin panel yo‘q.

Analytics yo‘q.

Database majburiy emas.

---

## Standard

Telekitning tavsiya qilinadigan default varianti.

Quyidagilar mavjud:

```text
Core
Admin Panel
DevTools
Users
Analytics
Broadcast
Required Channels
Localization
Scheduler
Testing
SQLite
```

---

## Bot + API

Telegram bot bilan birga HTTP API.

Masalan:

```text
/api/users
/api/orders
/api/webhooks
```

---

## Mini App

Telegram Mini App backend va Telegram bot bir loyihada.

---

# 10. Generated loyiha strukturasi

Standard loyiha:

```text
my-bot/
│
├── app/
│   ├── commands/
│   │   ├── start.ts
│   │   └── help.ts
│   │
│   ├── callbacks/
│   ├── conversations/
│   ├── events/
│   ├── middleware/
│   ├── services/
│   ├── keyboards/
│   └── modules/
│
├── config/
│   ├── app.ts
│   ├── bot.ts
│   ├── database.ts
│   ├── admin.ts
│   └── logging.ts
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema/
│
├── resources/
│   └── locales/
│       ├── uz/
│       ├── ru/
│       └── en/
│
├── storage/
│   ├── logs/
│   └── telekit.sqlite
│
├── tests/
│
├── public/
│
├── .env
├── .env.example
├── telekit.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

Papka nomlari tarjima qilinmaydi.

Framework API ham doim ingliz tilida bo‘ladi.

Masalan:

```ts
defineCommand()
defineCallback()
defineConversation()
defineMiddleware()
ctx.reply()
ctx.t()
```

---

# 11. Environment

Default:

```env
APP_NAME=MyBot
APP_ENV=development
APP_DEBUG=true

APP_LOCALE=uz
APP_FALLBACK_LOCALE=en

BOT_TOKEN=

BOT_MODE=auto

DATABASE_DRIVER=sqlite

LOG_LEVEL=debug
```

Token kiritilgandan keyin bot ishga tushishga tayyor bo‘ladi.

---

# 12. Birinchi ishga tushirish

```bash
npm run dev
```

Terminal:

```text
╭──────────────────────────────────────╮
│              TELEKIT                 │
├──────────────────────────────────────┤
│ Bot       @my_test_bot               │
│ Runtime   Node.js                     │
│ Mode      Polling                     │
│ Locale    uz                          │
│ Database  SQLite                      │
│ Routes    2                           │
│ DevTools  enabled                     │
╰──────────────────────────────────────╯

✓ Telegram bilan aloqa o‘rnatildi
✓ Database tayyor
✓ /start yuklandi
✓ /help yuklandi
✓ Admin Panel ishga tushdi
✓ DevTools ishga tushdi

Bot tayyor.
```

---

# 13. Default bot

Token kiritilgan zahoti ishlaydigan `/start` mavjud.

```text
Assalomu alaykum 👋

Bot muvaffaqiyatli ishga tushdi.

Telekit yordamida yaratildi.
```

Rus tilida yaratilgan loyiha:

```text
Здравствуйте 👋

Бот успешно запущен.

Создано с помощью Telekit.
```

Inglizcha:

```text
Hello 👋

Your bot is up and running.

Built with Telekit.
```

---

# 14. File-based routing

Developer markaziy `bot.ts` ichida barcha commandlarni registratsiya qilmaydi.

Masalan:

```text
app/commands/start.ts
```

avtomatik `/start` command sifatida yuklanadi.

Kod:

```ts
export default defineCommand({
    name: "start",
    description: "Botni ishga tushirish",

    async handle(ctx) {
        await ctx.reply(
            ctx.t("bot.start")
        );
    }
});
```

Framework startup vaqtida route manifest yaratadi.

---

# 15. Event routing

```text
app/events/message.text.ts
app/events/message.photo.ts
app/events/member.joined.ts
```

Misol:

```ts
export default defineEvent("message:text", async ctx => {
    console.log(ctx.message.text);
});
```

---

# 16. Typed Context

Context event turiga qarab TypeScript tomonidan aniqlanadi.

```ts
defineEvent("message:text", async ctx => {
    ctx.message.text;
});
```

Bu handler ichida `message.text` mavjudligi kafolatlanadi.

Callback handler:

```ts
defineEvent("callback:data", async ctx => {
    ctx.callbackQuery.data;
});
```

---

# 17. Typed Callback System

Telekitning eng katta xususiyatlaridan biri.

Oddiy yondashuv:

```text
delete_user_8291
```

kabi stringlarni parse qilish tavsiya qilinmaydi.

Telekit:

```ts
export const deleteUser = defineCallback({
    name: "user.delete",

    schema: {
        userId: number()
    }
});
```

Button:

```ts
button(
    "O‘chirish",
    deleteUser({
        userId: user.id
    })
);
```

Handler:

```ts
deleteUser.handle(async (ctx, data) => {
    await users.delete(data.userId);
});
```

`data.userId` TypeScript uchun `number`.

---

# 18. Callback xavfsizligi

Telekit callback payload'larni:

```text
serialize
validate
compress
sign
```

qila olishi kerak.

Masalan foydalanuvchi callback_data'ni qo‘lda o‘zgartirsa:

```text
signature mismatch
```

aniqlanadi.

Framework handlerni ishga tushirmaydi.

Signed callback default yoqilgan bo‘lishi tavsiya qilinadi.

---

# 19. Keyboard API

Oddiy:

```ts
keyboard()
    .button("Profil", profile)
    .button("Yordam", help);
```

Semantik style:

```ts
keyboard()
    .primary("Davom etish", next)
    .success("Tasdiqlash", confirm)
    .danger("O‘chirish", remove);
```

Qo‘llab-quvvatlanadigan style:

```text
default
primary
success
danger
```

Telegram versiyasi yoki client style'ni qo‘llamasa, Telekit avtomatik default ko‘rinishga qaytadi.

---

# 20. Visual Keyboard Builder

Admin Panel orqali keyboard yaratish.

Admin:

```text
[ Mahsulotlar ]
[ Profil ] [ Sozlamalar ]
[ Yopish ]
```

ko‘rinishida drag-and-drop orqali layout tuza oladi.

Har button uchun:

```text
Text
Type
Callback
URL
Mini App
Style
Payload
```

sozlanadi.

---

# 21. Conversations

Multi-step bot flow framework core konsepsiyasi bo‘ladi.

Misol:

```ts
export default defineConversation(
    "register",

    async flow => {
        const name = await flow.text(
            "Ismingizni kiriting:"
        );

        const phone = await flow.contact(
            "Telefon raqamingizni yuboring:"
        );

        const age = await flow.number(
            "Yoshingiz:"
        );

        await flow.confirm(
            "Ma'lumotlarni tasdiqlaysizmi?"
        );

        await users.create({
            name,
            phone,
            age
        });
    }
);
```

State avtomatik saqlanadi.

---

# 22. Conversation Storage

Qo‘llab-quvvatlanadi:

```text
Memory
SQLite
PostgreSQL
Redis
Custom Adapter
```

Development:

```text
SQLite
```

Production:

```text
PostgreSQL
```

tavsiya qilinadi.

---

# 23. Localization

Telekit localization framework ichida native bo‘ladi.

```ts
await ctx.reply(
    ctx.t("welcome", {
        name: ctx.from.firstName
    })
);
```

`resources/locales/uz/bot.json`

```json
{
    "welcome": "Assalomu alaykum, {name}!"
}
```

Rus:

```json
{
    "welcome": "Здравствуйте, {name}!"
}
```

English:

```json
{
    "welcome": "Hello, {name}!"
}
```

---

# 24. Locale aniqlash

Telekit quyidagi strategiyalarni qo‘llaydi:

```text
project
telegram
user
custom
```

`telegram`:

Telegram yuborgan user locale asosida.

`user`:

foydalanuvchi bot ichida til tanlaydi.

Masalan:

```text
Tilni tanlang:

[ 🇺🇿 O‘zbekcha ]
[ 🇷🇺 Русский ]
[ 🇬🇧 English ]
```

Tanlov database'da saqlanadi.

---

# 25. Polling / Webhook

Default:

```ts
bot: {
    mode: "auto"
}
```

Telekit avtomatik qaror qiladi.

Development:

```text
npm run dev

→ polling
```

Production:

```text
PUBLIC_URL mavjud
+
HTTPS mavjud

→ webhook
```

Public URL bo‘lmasa:

```text
→ polling
```

---

# 26. Manual mode

Developer xohlasa:

```env
BOT_MODE=polling
```

yoki:

```env
BOT_MODE=webhook
BOT_WEBHOOK_URL=https://example.com
```

yozadi.

Webhook registration, update va delete jarayonini Telekit boshqaradi.

---

# 27. Auto mode algoritmi

```text
BOT_MODE = auto

          ↓

development?
   │
   YES
   ↓
 polling


production
   ↓
PUBLIC_URL mavjud?
   │
 ┌─┴─┐
NO   YES
│     │
↓     ↓
poll  HTTPS?
      │
    ┌─┴─┐
   NO   YES
   │     │
   ↓     ↓
 poll  webhook
```

---

# 28. Admin Panel

Admin Panel Telekitning eng muhim competitive feature'laridan biri hisoblanadi.

Standard template'da default mavjud.

Minimal template'da optional.

---

# 29. Admin Panel texnologiyasi

Frontend:

```text
Vue 3
TypeScript
Vite
```

UI framework core'dan mustaqil.

Backend Telekit application ichidagi internal API orqali ishlaydi.

Admin panelni alohida deploy qilish majburiy emas.

---

# 30. Admin Panel modullari

Default:

```text
Dashboard
Users
Analytics
Broadcast
Required Channels
Content
Commands
Keyboard Builder
Conversations
Scheduler
Logs
System Health
Administrators
Settings
Audit Log
```

---

# 31. Dashboard

Dashboard:

```text
Jami foydalanuvchilar

Bugun qo‘shilganlar

7 kunlik aktiv user

30 kunlik aktiv user

Botni bloklaganlar

Yangi foydalanuvchilar grafigi

Xabarlar soni

Callbacklar soni

Commandlar soni

Broadcast holati

System Health
```

ko‘rsatadi.

---

# 32. Users

Admin foydalanuvchilarni:

```text
qidirish
filtrlash
ko‘rish
segmentlash
bloklash
unblock
xabar yuborish
metadata ko‘rish
activity ko‘rish
```

imkoniga ega.

User sahifasi:

```text
ID
First name
Last name
Username
Language
Joined at
Last active
Status
Messages count
Commands count
Subscription status
Custom attributes
```

---

# 33. User Properties

Developer custom field qo‘sha olishi kerak.

Masalan:

```text
role
city
plan
balance
verified
source
```

Admin Panel avtomatik chiqarishi mumkin.

---

# 34. Analytics

Built-in analytics:

```text
DAU
WAU
MAU
new users
retention
commands usage
callback usage
message volume
blocked users
conversion
language distribution
```

Analytics Telekit database ichida saqlanishi mumkin.

External analytics majburiy emas.

Telemetry Telekit serverlariga default yuborilmaydi.

---

# 35. Broadcast

Admin paneldan broadcast yuborish.

Kontent:

```text
Text
Photo
Video
Audio
Document
Animation
Copy Message
Forward Message
```

Keyboard qo‘shish mumkin.

---

# 36. Broadcast targeting

Target:

```text
Barcha foydalanuvchilar
Faol foydalanuvchilar
Til bo‘yicha
Ro‘yxatdan o'tgan sana bo‘yicha
Segment bo‘yicha
Custom filter
ID ro‘yxati
```

---

# 37. Broadcast preview

Yuborishdan oldin:

```text
Preview
```

va:

```text
Test send
```

mavjud.

Admin avval xabarni o‘z Telegram akkauntiga jo‘natib tekshirishi mumkin.

---

# 38. Broadcast Queue

Broadcast to‘g‘ridan-to‘g‘ri loop bilan yuborilmaydi.

Queue orqali.

Holat:

```text
Pending
Running
Paused
Completed
Failed
Cancelled
```

Progress:

```text
71%

Sent: 91,204
Failed: 1,201
Blocked: 941
Remaining: 35,196
```

---

# 39. Broadcast Retry

Temporary Telegram API xatolarida:

```text
automatic retry
```

Permanent xatolarda:

```text
failed
```

Bot blocked bo‘lsa user holati database'da yangilanadi.

---

# 40. Scheduled Broadcast

Admin:

```text
Hozir yuborish
Rejalashtirish
```

tanlaydi.

Misol:

```text
21 sentabr 2026
18:00
Asia/Tashkent
```

---

# 41. Majburiy obuna

Telekitda built-in Subscription Gate mavjud.

Admin panel:

```text
Majburiy obuna

Status: ON

+ Kanal qo‘shish
```

Channel:

```text
Username
Title
Join URL
Button title
Enabled
Order
```

---

# 42. Subscription validation

Telekit kanal holatini tekshiradi.

Admin panelda:

```text
✅ Bot kanalga qo‘shilgan
✅ Admin huquqi mavjud
✅ Membership verification ishlaydi
```

yoki:

```text
⚠ Membership verification mavjud emas
```

ko‘rsatadi.

---

# 43. Subscription Middleware

Kod orqali:

```ts
export default defineMiddleware(
    subscriptionGate()
);
```

yoki configuration:

```ts
subscriptions: {
    enabled: true
}
```

---

# 44. Content Manager

Admin paneldan oddiy bot matnlarini o‘zgartirish.

Masalan:

```text
/start
/help
subscription_required
error
maintenance
welcome
```

Developer kodni deploy qilmasdan content o‘zgartira oladi.

---

# 45. Variables

Content ichida:

```text
{first_name}
{last_name}
{username}
{user_id}
{bot_name}
```

kabi o‘zgaruvchilar.

Developer custom variables registratsiya qila oladi.

---

# 46. Commands Manager

Admin panel:

```text
/start
/help
/profile
/settings
```

commandlarini ko‘rsatadi.

Description locale bo‘yicha.

Telekit Telegram command ro‘yxati bilan sync qiladi.

---

# 47. Admin authentication

Default login/parol kod ichida bo‘lmaydi.

Birinchi ishga tushirish:

```bash
telekit admin:create
```

yoki install jarayonida admin yaratiladi.

Credential environment yoki database orqali xavfsiz saqlanadi.

Password hash qilinadi.

---

# 48. Admin Roles

Default:

```text
Owner
Administrator
Editor
Analyst
Support
```

Developer custom permission yaratishi mumkin.

Masalan:

```text
users.view
users.block
broadcast.create
broadcast.send
analytics.view
settings.update
admins.manage
```

---

# 49. Audit Log

Muhim admin harakatlari yoziladi:

```text
Admin
Action
Resource
Old Value
New Value
IP
Time
```

Masalan:

```text
admin@bot

broadcast.send

Broadcast #293

2026-09-19 14:40
```

---

# 50. DevTools

Development'da:

```bash
telekit dev
```

ishga tushadi.

Default:

```text
http://localhost:4545
```

---

# 51. DevTools Dashboard

Ko‘rsatiladi:

```text
Bot status
Routes
Updates
Handlers
Telegram requests
Errors
Database queries
Queue jobs
Performance
Environment
```

---

# 52. Update Inspector

Har Telegram update ko‘rinadi.

Masalan:

```text
Update #839281

Type:
message:text

User:
1928391

Handler:
app/commands/start.ts

Duration:
12ms
```

Raw payload ham ko‘rinadi.

---

# 53. Update Replay

Developer old update'ni:

```text
Replay
```

qila oladi.

Bu update qayta handler pipeline orqali o'tadi.

Production'dan olingan sanitized update development'da reproduce qilinishi mumkin.

---

# 54. Bot Simulator

DevTools ichida Telegram simulator.

Developer Telegram ilovasiga kirmasdan:

```text
text message
command
callback
photo event
contact
location
join event
```

simulate qila oladi.

---

# 55. Test User

Simulator:

```text
User ID
First Name
Username
Locale
Premium
Chat Type
```

sozlamalarini beradi.

---

# 56. Route Inspector

```bash
telekit routes
```

Natija:

```text
COMMANDS

/start
app/commands/start.ts

/help
app/commands/help.ts


CALLBACKS

user.delete
app/callbacks/user.delete.ts


EVENTS

message:text
app/events/message.text.ts
```

---

# 57. CLI

Asosiy CLI:

```text
telekit new
telekit dev
telekit start
telekit build

telekit routes
telekit doctor
telekit inspect

telekit make:command
telekit make:callback
telekit make:event
telekit make:conversation
telekit make:middleware
telekit make:service
telekit make:module

telekit add
telekit remove

telekit admin:create

telekit migrate
telekit migrate:rollback
telekit seed

telekit test
```

Qisqa aliaslar:

```text
telekit g command
telekit g callback
telekit g event
```

---

# 58. Generator

Misol:

```bash
telekit make:command profile
```

Natija:

```text
✓ app/commands/profile.ts created
```

```bash
telekit make:conversation register
```

Natija:

```text
✓ app/conversations/register.ts created
```

---

# 59. Telekit Doctor

```bash
telekit doctor
```

tekshiradi:

```text
Node.js
Environment
BOT_TOKEN
Telegram connection
Database
Redis
Webhook
SSL
Migrations
File permissions
Admin Panel
Queue
```

Natija:

```text
✓ Node runtime
✓ Telegram connection
✓ SQLite
✓ Migrations
✓ Admin Panel

No problems found.
```

---

# 60. Module System

Telekit modular framework bo‘ladi.

Misol:

```bash
telekit add postgres
```

yoki:

```bash
telekit add redis
```

yoki:

```bash
telekit add broadcast
```

Module:

```text
package
configuration
migration
admin navigation
permissions
CLI commands
services
```

registratsiya qila oladi.

---

# 61. Official Modules

Rasmiy:

```text
@telekit/admin
@telekit/analytics
@telekit/broadcast
@telekit/subscriptions
@telekit/scheduler
@telekit/postgres
@telekit/redis
@telekit/testing
@telekit/devtools
```

---

# 62. Community Modules

Kelajakda:

```text
telekit add payments
telekit add crm
telekit add referral
```

kabi community package'lar ishlashi kerak.

---

# 63. Service Container

Framework service container taqdim etadi.

Masalan:

```ts
export class UserService {
    async find(id: number) {
        //
    }
}
```

Handler:

```ts
defineCommand({
    name: "profile",

    async handle(ctx) {
        const users =
            ctx.services.get(UserService);

        const user =
            await users.find(ctx.from.id);

        await ctx.reply(user.name);
    }
});
```

---

# 64. Middleware

Global:

```ts
app.use(auth());
app.use(locale());
app.use(subscriptionGate());
```

Route-level:

```ts
defineCommand({
    name: "admin",

    middleware: [
        auth(),
        adminOnly()
    ],

    handle(ctx) {}
});
```

---

# 65. Error Handling

Global error handler mavjud.

Xato:

```text
Telekit Error

Update:
19283921

Route:
/profile

Handler:
app/commands/profile.ts

Error:
DatabaseUnavailableError

Duration:
31ms
```

Bot butunlay crash bo‘lmaydi.

Critical process error alohida boshqariladi.

---

# 66. Graceful Shutdown

Process:

```text
SIGTERM
SIGINT
```

olsa:

```text
yangi update qabul qilish to‘xtaydi
↓
ishlayotgan handlerlar tugaydi
↓
queue to‘xtaydi
↓
database connection yopiladi
↓
server yopiladi
```

---

# 67. Telegram API Retry

Temporary API xatolarida exponential retry.

Configuration:

```ts
telegram: {
    retry: {
        enabled: true,
        attempts: 5
    }
}
```

---

# 68. Update deduplication

Bir update bir necha marta kelsa framework duplicate'ni aniqlaydi.

```text
duplicate update

→ ignored
```

Optional disable mumkin.

---

# 69. Concurrency

Default prinsip:

```text
bir chat ichidagi update
→ tartib bilan

turli chatlar
→ parallel
```

Bu race conditionlarni kamaytiradi.

Developer concurrency limit belgilashi mumkin.

---

# 70. Rate Limiting

Built-in:

```ts
rateLimit({
    limit: 5,
    window: "10s"
});
```

User, chat, command yoki global scope.

---

# 71. Database

Telekit Core database talab qilmaydi.

Standard starter:

```text
SQLite
```

bilan keladi.

Production uchun:

```text
PostgreSQL
```

adapter.

---

# 72. ORM/Data Layer

Framework database layer provider-based bo‘ladi.

Internal Telekit modullari common repository interface'dan foydalanadi.

Developer framework ORM'dan foydalanishga majbur emas.

Lekin rasmiy starter uchun TypeScript-first migration/schema layer beriladi.

---

# 73. Migration

```bash
telekit migrate
```

```bash
telekit migrate:rollback
```

```bash
telekit migrate:status
```

---

# 74. Queue

Queue quyidagi ishlar uchun:

```text
broadcast
scheduled jobs
notifications
heavy tasks
retries
webhooks
```

ishlatiladi.

Development:

```text
database-backed yoki memory
```

Production high-load:

```text
Redis adapter
```

---

# 75. Scheduler

Framework scheduler:

```ts
schedule("0 9 * * *", async () => {
    //
});
```

yoki Admin Panel.

---

# 76. Testing

Built-in bot test environment.

```ts
import { testBot } from "telekit/testing";

test("/start", async () => {
    const bot = testBot();

    const result =
        await bot.message("/start");

    expect(result.text)
        .toContain("Assalomu");
});
```

Real Telegram API chaqirilmaydi.

---

# 77. Callback testing

```ts
await bot.callback(
    "user.delete",
    {
        userId: 12
    }
);
```

---

# 78. Conversation testing

Test ichida:

```ts
const flow =
    bot.conversation("register");

await flow.send("Xojisaid");

await flow.sendContact(
    "+998..."
);
```

orqali conversation to‘liq test qilinadi.

---

# 79. Security

Framework default:

```text
secure webhook secret
callback signature
environment validation
token masking
admin RBAC
password hashing
CSRF protection
secure cookies
rate limiting
audit log
input validation
safe logging
```

ni qo‘llashi kerak.

---

# 80. Secret masking

Logda:

```text
BOT_TOKEN=123456:ABC*****
```

ko‘rinadi.

To‘liq token logga yozilmaydi.

---

# 81. Admin Panel security

Production:

```text
HTTPS required
Secure Cookie
HttpOnly
SameSite
CSRF
Session expiration
Login throttling
```

mavjud bo‘lishi kerak.

---

# 82. Webhook security

Webhook uchun secret validation.

Noto‘g‘ri request:

```text
401 Unauthorized
```

---

# 83. Health Monitoring

Admin panel:

```text
Telegram API
Database
Redis
Queue
Webhook
Storage
Scheduler
```

holatini ko‘rsatadi.

Misol:

```text
Telegram       ✅ Healthy
PostgreSQL     ✅ Healthy
Redis          ✅ Healthy
Queue          ⚠ Delayed
Webhook        ✅ Healthy
```

---

# 84. Performance monitoring

Telekit route bo‘yicha:

```text
request count
average duration
p95
errors
Telegram API calls
database queries
```

ko‘rsata oladi.

---

# 85. Logs

Structured logging.

```json
{
    "level": "info",
    "event": "command.handled",
    "command": "start",
    "duration": 12
}
```

Production loglarda shaxsiy ma'lumotlarni ortiqcha saqlash default o‘chiq bo‘lishi kerak.

---

# 86. Multilingual Admin Panel

Admin yuqoridan tilni o‘zgartira oladi:

```text
🇺🇿 O‘zbekcha
🇷🇺 Русский
🇬🇧 English
```

Bu project default locale'ni o‘zgartirmaydi.

Faqat joriy admin interfeysiga tegishli.

---

# 87. Admin Panel UI

UI prinsiplari:

```text
minimal
tez
responsive
desktop-first
mobile usable
dark/light mode
accessible
```

Keraksiz animatsiyalar bo‘lmasligi kerak.

---

# 88. Theme

Framework default neutral theme bilan keladi.

Project o‘z brand rangini:

```ts
admin: {
    theme: {
        primary: "#10b981"
    }
}
```

orqali o‘zgartira oladi.

---

# 89. Bot configuration

`telekit.config.ts`:

```ts
export default defineConfig({
    app: {
        locale: "uz",
        fallbackLocale: "en"
    },

    bot: {
        token: env("BOT_TOKEN"),
        mode: "auto"
    },

    admin: {
        enabled: true
    },

    devtools: {
        enabled: env("APP_ENV") !== "production"
    },

    analytics: {
        enabled: true
    }
});
```

---

# 90. Production Build

```bash
npm run build
```

yoki:

```bash
telekit build
```

Natija:

```text
dist/
```

Production:

```bash
telekit start
```

---

# 91. Docker

Optional:

```text
Dockerfile
docker-compose.yml
```

installer orqali:

```text
Docker kerakmi?

● Ha
○ Yo‘q
```

tanlanadi.

---

# 92. Deployment adapters

Kelajak:

```text
Docker
VPS
Railway
Render
Fly.io
Cloudflare
Vercel
AWS
```

---

# 93. Production defaultlari

Production'da avtomatik:

```text
APP_DEBUG=false
DevTools disabled
secure admin session
structured logging
graceful shutdown
retry
health endpoints
```

yoqiladi.

---

# 94. Framework documentation

Docs uch tilda:

```text
O‘zbekcha
Русский
English
```

bo‘lishi maqsad qilinadi.

URL misol:

```text
telekit.dev/uz
telekit.dev/ru
telekit.dev/en
```

---

# 95. Documentation bo‘limlari

```text
Getting Started
Installation
Configuration
Commands
Callbacks
Events
Middleware
Conversations
Sessions
Localization
Database
Admin Panel
Analytics
Broadcast
Subscriptions
DevTools
Testing
Deployment
Modules
API Reference
```

---

# 96. Starter Documentation

Har yangi loyiha `README.md` bilan keladi.

Installerda tanlangan tilda.

O‘zbek tilida tanlansa README ham O‘zbekcha.

---

# 97. Versioning

Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Masalan:

```text
1.4.2
```

---

# 98. Telegram API compatibility

Telekit Telegram Bot API uchun alohida generated type layer ishlatishi kerak.

Bot API schema yangilanganda:

```text
types
methods
objects
parameters
```

yangilanishi maksimal darajada avtomatlashtiriladi.

---

# 99. Backward compatibility

Minor versiyada mavjud API buzilmasligi kerak.

Breaking change faqat major release.

Deprecated API oldindan warning beradi.

---

# 100. Performance prinsipi

Core lightweight bo‘lishi kerak.

Developer ishlatmagan modul application bundle'ga majburiy kirmasligi kerak.

Admin Panel ishlatilmasa:

```text
@telekit/admin
```

runtime'ga yuklanmaydi.

---

# 101. Framework core dependency siyosati

Core imkon qadar kam dependency.

Quyidagilar core'ga qo‘shilmaydi:

```text
ORM
Redis
Vue
Admin Panel
Queue backend
PostgreSQL client
```

Ular adapter/module.

---

# 102. Standard Template falsafasi

Core:

```text
minimal
```

Standard starter:

```text
batteries included
```

Shu bilan ikkala auditoriya ham qamrab olinadi.

---

# 103. Default Standard starter

`npx telekit new my-bot`

natijasida foydalanuvchi default tanlovlarni bosaversa:

```text
TypeScript
Node.js
Auto mode
SQLite
Admin Panel
Analytics
Broadcast
Subscriptions
Localization
DevTools
Testing
```

bilan loyiha yaratiladi.

Developer faqat:

```env
BOT_TOKEN=
```

ni to‘ldiradi.

Keyin:

```bash
npm run dev
```

---

# 104. Birinchi Admin Panel setup

Terminal:

```text
Admin Panel:
http://localhost:3000/admin

No administrator found.

Create one now?
❯ Yes
  No
```

Keyin:

```text
Name:
Email:
Password:
```

Admin yaratiladi.

Default credential repository ichiga yozilmaydi.

---

# 105. UX prinsipi

Yangi developer quyidagi savollarni bermasligi kerak:

```text
botni qayerda initialize qilaman?
commandni qayerga yozaman?
callbackni qanday parse qilaman?
polling qanday yoqiladi?
webhookni qanday o‘rnataman?
errorni qayerda tutaman?
userlarni qayerda saqlayman?
broadcastni qanday qilaman?
admin panelni qanday quraman?
majburiy kanalni qanday tekshiraman?
```

Telekit buning default yechimini beradi.

---

# 106. MVP 0.1

Birinchi ishlaydigan versiyada:

```text
CLI
Project generator
TypeScript Core
Telegram API client
Polling
Webhook
Auto mode
File routing
Commands
Events
Middleware
Typed Context
Typed Callback
Config
Environment
Logging
Error Handler
Graceful Shutdown
Localization
SQLite
Basic testing
```

tayyor bo‘lishi kerak.

---

# 107. MVP 0.5

Keyingi bosqich:

```text
Admin Panel
Users
Analytics
Broadcast
Subscriptions
Keyboard Builder
Scheduler
DevTools
Update Inspector
Replay
Doctor
```

---

# 108. Version 1.0

Stable release:

```text
Core stable API
Admin Panel
DevTools
Testing
Conversations
Sessions
Localization
SQLite
PostgreSQL
Redis
Queue
Broadcast
Subscriptions
Scheduler
Module system
Documentation UZ/RU/EN
Production deployment guides
```

---

# 109. Keyingi versiyalar

Kelajak:

```text
Visual Flow Builder
Mini App tools
Payments module
Referral module
CRM module
Webhook integrations
Plugin Marketplace
Cloud dashboard
Multi-bot management
Distributed workers
Advanced analytics
A/B testing
Feature flags
```

---

# 110. Visual Flow Builder

Kelajakda:

```text
/start
  ↓
Subscription Check
  ↓
Ask Phone
  ↓
Save User
  ↓
Show Menu
```

kabi flow'larni Admin Paneldan yaratish.

Framework esa avtomatik executable flow'ga aylantiradi.

---

# 111. Feature Flags

Masalan:

```text
shop_v2
```

faqat:

```text
admins
10% users
uz users
selected segment
```

uchun yoqilishi mumkin.

---

# 112. Multi-bot

Kelajakda bitta Telekit application:

```text
Bot A
Bot B
Bot C
```

ni boshqarishi mumkin.

Lekin Version 1 uchun majburiy emas.

---

# 113. Non-goals

Telekit quyidagilarga aylanmasligi kerak:

```text
Telegram clone
general-purpose web framework
full ERP
no-code platform
massive CMS
ORM replacement
```

Asosiy markaz:

> Telegram Applications.

---

# 114. Framework philosophy

Telekitda uchta daraja bo‘ladi:

```text
Beginner
→ defaultlardan foydalanadi


Professional
→ config va official modules


Advanced
→ adapters, custom services va framework internals
```

Beginner uchun oddiylik advanced developerning imkoniyatlarini cheklamasligi kerak.

---

# 115. Acceptance Criteria — Project Creation

Quyidagi scenario ishlashi shart:

```bash
npx telekit new test-bot
```

User:

```text
O‘zbekcha
Standard
Admin Panel: Ha
SQLite
Auto
DevTools: Ha
```

tanlaydi.

So‘ng:

```bash
cd test-bot
```

`.env` ichiga token qo‘yadi.

```bash
npm run dev
```

beradi.

Natijada:

```text
Telegram bot ishlaydi
/start ishlaydi
/help ishlaydi
Admin Panel ochiladi
SQLite yaratiladi
user avtomatik saqlanadi
analytics ishlaydi
DevTools ochiladi
```

---

# 116. Acceptance Criteria — Localization

Installerda:

```text
Русский
```

tanlansa:

```text
CLI ruscha
default bot xabarlari ruscha
Admin Panel ruscha
README ruscha
default locale ru
```

bo‘lishi shart.

Admin keyin interfeysni O‘zbek yoki Ingliz tiliga o‘zgartira oladi.

---

# 117. Acceptance Criteria — Auto Mode

Development:

```text
auto → polling
```

Production va HTTPS public URL:

```text
auto → webhook
```

Production public URL bo‘lmasa:

```text
auto → polling
```

Framework mode o‘zgarganda oldingi Telegram webhook holatini to‘g‘ri boshqarishi kerak.

---

# 118. Acceptance Criteria — Admin Panel

Admin quyidagilarni qila olishi shart:

```text
statistika ko‘rish
userlarni ko‘rish
user qidirish
broadcast yaratish
test broadcast
broadcast yuborish
kanal qo‘shish
majburiy obunani yoqish/o‘chirish
/start matnini tahrirlash
keyboard yaratish
bot health ko‘rish
admin yaratish
audit log ko‘rish
```

---

# 119. Acceptance Criteria — Developer Experience

Developer yangi command uchun faqat:

```bash
telekit make:command profile
```

beradi.

Framework fayl yaratadi.

Developer handler yozadi.

Qo‘lda central router registratsiyasi talab qilinmaydi.

---

# 120. Asosiy mahsulot xulosasi

Telekit quyidagi yo‘nalishda quriladi:

```text
Telegram Bot Library
        ❌

Telegram API Wrapper
        ❌

Telegram Application Framework
        ✅
```

Telekit developerga:

```text
Core
CLI
Project Structure
Routing
Callbacks
Conversations
Localization
Database
Admin Panel
Analytics
Broadcast
Subscriptions
DevTools
Testing
Production Infrastructure
```

ni bir butun mahsulot sifatida beradi.

Frameworkning asosiy qiymati:

> **Telegram bot yaratishni emas, Telegram application ishlab chiqish jarayonini standartlashtirish.**

Asosiy onboarding:

```bash
npx telekit new my-bot
```

Keyin:

```bash
cd my-bot
```

Token:

```env
BOT_TOKEN=...
```

Va:

```bash
npm run dev
```

Shu nuqtadan developer Telegram infratuzilmasi bilan emas, o‘z loyihasining biznes logikasi bilan shug‘ullanadi.

---

# 121. Telekitning asosiy shiori

**Telekit**

**The TypeScript Framework for Telegram Applications.**

```text
Create.
Build.
Test.
Manage.
Deploy.
```

Barchasi bitta framework ichida.
