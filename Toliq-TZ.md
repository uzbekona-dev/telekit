# TELEKIT — Texnik topshiriq

**The TypeScript Framework for Telegram Applications**

| | |
|---|---|
| **Hujjat versiyasi** | 2.0 |
| **Status** | Draft → Review |
| **Sana** | 2026-09-19 |
| **Oldingi versiya** | [Toliq-TZ.v1-vision.md](Toliq-TZ.v1-vision.md) (vizyon hujjati) |
| **Hujjat turi** | Muhandislik spetsifikatsiyasi |
| **Litsenziya** | MIT |

---

## Bu versiya nimasi bilan farq qiladi

v1 — vizyon hujjati edi: *nima* qurilishini aytardi. v2 — spetsifikatsiya: *qanday* qurilishini aytadi.

v1'dagi yopilmagan 14 ta texnik bo‘shliq shu hujjatda hal qilindi:

| # | Muammo | Yechim |
|---|---|---|
| 1 | Callback payload 64 baytga sig‘maydi | [ADR-003](#adr-003--callback-wire-format) — binary packing + kesilgan HMAC + overflow store |
| 2 | Conversations suspend/resume modeli yo‘q | [ADR-004](#adr-004--conversations-ijro-modeli) — deterministik replay engine |
| 3 | Context naming ziddiyatli | [ADR-002](#adr-002--context-shakli) — raw `snake_case`, transform yo‘q |
| 4 | Data layer noaniq | [ADR-005](#adr-005--data-layer) — Kysely, ORM majburlanmaydi |
| 5 | `PUBLIC_URL`, `APP_KEY`, portlar `.env`'da yo‘q | [Ilova A](#ilova-a--environment-reference) — to‘liq reference |
| 6 | Multi-instance / dedup / per-chat tartib | [§14](#14-update-pipeline), [§41](#41-scaling-va-deployment-topologiyasi) |
| 7 | Broadcast Telegram limitlarini hisobga olmagan | [§32](#32-broadcast), [Ilova D](#ilova-d--telegram-platforma-limitlari) |
| 8 | Keyboard `primary/success/danger` — Bot API'da yo‘q | [§24](#24-keyboards) — semantik dekorator sifatida qayta ta'riflandi |
| 9 | Analytics SQLite'da o‘lchamaydi | [§31](#31-analytics) — buffer + rollup + retention |
| 10 | Content Manager vs locale fayllar — ustunlik yo‘q | [§34](#34-content-manager) — aniq precedence zanjiri |
| 11 | Sessions bo‘limi umuman yo‘q edi | [§19](#19-sessions) |
| 12 | Xatolar taksonomiyasi yo‘q | [§20](#20-xatolar-va-error-handling), [Ilova B](#ilova-b--error-code-jadvali) |
| 13 | Pluralization (ru/uz) yo‘q | [§26](#26-localization) — ICU MessageFormat + `Intl.PluralRules` |
| 14 | Yo‘l xaritasi realistik emas | [§44](#44-yol-xaritasi) — soatli baholar bilan |

Qo‘shilgan yangi bo‘limlar: media pipeline, inline mode, pagination, performance budgeti, observability, RFC jarayoni, DB sxemasi (DDL), xavfsizlik threat modeli.

---

## Mundarija

**Qism I — Mahsulot**
[1](#1-muammo) · [2](#2-pozitsiyalash) · [3](#3-auditoriya) · [4](#4-non-goals) · [5](#5-muvaffaqiyat-mezonlari)

**Qism II — Me'moriy qarorlar (ADR)**
[ADR-001 Runtime va HTTP](#adr-001--runtime-va-http-qatlami) · [ADR-002 Context](#adr-002--context-shakli) · [ADR-003 Callback format](#adr-003--callback-wire-format) · [ADR-004 Conversations](#adr-004--conversations-ijro-modeli) · [ADR-005 Data layer](#adr-005--data-layer) · [ADR-006 Monorepo](#adr-006--monorepo-va-paket-chegaralari) · [ADR-007 Nomlar va litsenziya](#adr-007--nomlar-va-litsenziya)

**Qism III — Core**
[13](#13-application-lifecycle) · [14](#14-update-pipeline) · [15](#15-routing) · [16](#16-context-api) · [17](#17-middleware) · [18](#18-telegram-api-client) · [19](#19-sessions) · [20](#20-xatolar-va-error-handling) · [21](#21-logging) · [22](#22-configuration)

**Qism IV — DX modullari**
[23](#23-callbacks) · [24](#24-keyboards) · [25](#25-conversations) · [26](#26-localization) · [27](#27-media-va-fayllar) · [28](#28-testing) · [29](#29-cli)

**Qism V — Application modullari**
[30](#30-data-model) · [31](#31-analytics) · [32](#32-broadcast) · [33](#33-subscription-gate) · [34](#34-content-manager) · [35](#35-queue-va-scheduler) · [36](#36-health-monitoring) · [37](#37-admin-panel) · [38](#38-devtools)

**Qism VI — Non-functional**
[39](#39-performance-budgeti) · [40](#40-xavfsizlik) · [41](#41-scaling-va-deployment-topologiyasi) · [42](#42-observability) · [43](#43-moslik-siyosati)

**Qism VII — Reja**
[44](#44-yol-xaritasi) · [45](#45-risklar-registri) · [46](#46-ochiq-savollar)

**Ilovalar**
[A Environment](#ilova-a--environment-reference) · [B Error kodlari](#ilova-b--error-code-jadvali) · [C DB sxemasi](#ilova-c--database-sxemasi) · [D Telegram limitlari](#ilova-d--telegram-platforma-limitlari) · [E Lug‘at](#ilova-e--lugat)

---

# QISM I — MAHSULOT

## 1. Muammo

Telegram bot ekotizimida kutubxonalar yetarli (grammY, Telegraf, node-telegram-bot-api, aiogram). **Application qatlami yetishmaydi.**

Har bir jiddiy Telegram loyihasi noldan qayta yozadigan narsalar:

```text
loyiha strukturasi          admin panel
callback data parsing       foydalanuvchilar bazasi
multi-step dialoglar        broadcast + queue + retry
til qatlami                 majburiy obuna
polling/webhook almashuvi   analitika
xatolarni boshqarish        deployment
rate limiting               monitoring
```

Bularning har biri o‘rtacha loyihada **4–10 hafta** ishni yeydi va har safar noldan, xato bilan, testsiz yoziladi.

**Telekit gipotezasi:** bu qatlamni standartlashtirish mumkin — xuddi Laravel PHP uchun, Nuxt Vue uchun qilgani kabi.

### 1.1 Muvaffaqiyat shartlari

Telekit muvaffaqiyatli deb hisoblanadi, agar:

1. Yangi developer **15 daqiqada** ishlaydigan, admin panelli, bazaga foydalanuvchi yozadigan botni ishga tushira olsa.
2. Tajribali developer frameworkni **chetlab o‘tishga majbur bo‘lmasa** — har bir default almashtiriladigan bo‘lsa.
3. Production'da **100k+ foydalanuvchili** bot Telekit ustida ishonchli ishlasa.

---

## 2. Pozitsiyalash

```text
┌─────────────────────────────────────────────────┐
│  Telegram Bot API                               │  ← protokol
├─────────────────────────────────────────────────┤
│  grammY / Telegraf / aiogram                    │  ← kutubxona
│  «API bilan qanday gaplashaman?»                │
├─────────────────────────────────────────────────┤
│  TELEKIT                                        │  ← framework
│  «Ilovani qanday quraman, boshqaraman,          │
│   testlayman va production'da ushlab turaman?»  │
└─────────────────────────────────────────────────┘
```

**Shior:** Tokenni kiriting. Telekit infratuzilmani quradi. Siz biznes logika yozasiz.

### 2.1 Raqobat bilan farq

| | grammY | Telegraf | Telekit |
|---|---|---|---|
| Telegram API | ✅ | ✅ | ✅ |
| Typed context | ✅ | qisman | ✅ |
| Conversations | plugin | ❌ | core |
| File-based routing | ❌ | ❌ | ✅ |
| Typed + signed callbacks | ❌ | ❌ | ✅ |
| Loyiha generatori | ❌ | ❌ | ✅ |
| Admin panel | ❌ | ❌ | ✅ |
| Analytics / Broadcast | ❌ | ❌ | ✅ |
| DevTools / simulator | ❌ | ❌ | ✅ |
| Testing harness | qisman | ❌ | ✅ |

Telekit grammY bilan **raqobatlashmaydi** — u boshqa qatlamda. Texnik jihatdan Telekit o‘z API clientini yozadi (ADR-001), chunki rate limiting, retry, observability va multi-runtime talablari kutubxona darajasida boshqacha.

---

## 3. Auditoriya

| Daraja | Kim | Nimadan foydalanadi | Nimani bilmasligi mumkin |
|---|---|---|---|
| **Beginner** | 1-yillik dev, freelancer | `telekit new` → defaultlar | webhook, queue, migration |
| **Professional** | mahsulot jamoasi | config + rasmiy modullar | framework internals |
| **Advanced** | platforma jamoasi | adapters, custom services, internals | — |

**Qat'iy qoida:** beginner uchun soddalik advanced developer imkoniyatini cheklamaydi. Har bir "sehr" ostida ochiq API bo‘ladi.

Misol: file-based routing sehrli, lekin `app.router.register()` ham public API.

---

## 4. Non-goals

Telekit **bo‘lmaydi**:

```text
❌ umumiy maqsadli web framework    → Nest/Hono ni ishlating
❌ ORM                              → Drizzle/Prisma/Kysely
❌ no-code platforma                → Flow Builder bor, lekin kod birlamchi
❌ CMS                              → Content Manager faqat bot matnlari uchun
❌ MTProto / userbot                → faqat Bot API
❌ Telegram client                  → —
❌ SaaS hosting                     → framework self-hosted
```

**Telemetriya:** Telekit hech qanday ma'lumotni Telekit serverlariga yubormaydi. Opt-in ham yo‘q (v1.0 doirasida).

---

## 5. Muvaffaqiyat mezonlari

O‘lchanadigan, relizda tekshiriladigan:

| Mezon | Maqsad | O‘lchash usuli |
|---|---|---|
| Time-to-first-bot | ≤ 15 daqiqa | onboarding yozuvi, 5 ta yangi foydalanuvchi |
| `npx telekit new` → `/start` javob | ≤ 3 daqiqa (token tayyor bo‘lsa) | CI E2E |
| Core bundle (min+gzip) | ≤ 45 KB | `benchmarks/bundle` |
| Cold start (core) | ≤ 120 ms | `benchmarks/boot` |
| Throughput (echo, 1 instance) | ≥ 2 000 update/s | `benchmarks/throughput` |
| Test coverage (core) | ≥ 85 % | `vitest --coverage` |
| Public API breaking change | faqat major | `api-extractor` diff CI'da |

---

# QISM II — ME'MORIY QARORLAR

ADR-001…007 hujjatning 6–12-bo‘limlari o‘rnini egallaydi — shu sababli Qism III §13 dan boshlanadi.

Har bir ADR formati: **Kontekst → Ko‘rib chiqilgan variantlar → Qaror → Oqibatlar.**

Bu qarorlar **qaytarilishi qiyin**: ularning har biri public API'ga yoki ma'lumot formatiga ta'sir qiladi. O‘zgartirish kerak bo‘lsa — yangi ADR yoziladi, eskisi `Superseded` deb belgilanadi.

---

## ADR-001 — Runtime va HTTP qatlami

### Kontekst

Telekit'ga HTTP server kerak: webhook endpoint, admin panel, `/health`, ixtiyoriy REST API. Shu bilan birga v1'da Node/Bun/Deno/Cloudflare Workers qo‘llab-quvvatlash maqsadi bor.

### Variantlar

| | Plus | Minus |
|---|---|---|
| **Express** | eng ko‘p tanish | Node-only, Web-standard emas, sekin |
| **Fastify** | tez, plugin ekotizimi | Node-only, og‘ir |
| **Hono** | Web-standard `Request`/`Response`, barcha runtime, ~14 KB | ekotizim kichikroq |
| **O‘z serverimiz** | nol dependency | multipart, routing, CORS — hammasini yozish |

### Qaror

**Hono** — `@telekit/core` ichidagi ichki HTTP qatlami.

```ts
// core ichida
import { Hono } from "hono";
```

Sabab: Hono'ning `fetch(Request): Response` interfeysi Node, Bun, Deno va Workers'da bir xil ishlaydi — bu ADR-001'ning asosiy talabini bitta qarorda yopadi. Node uchun `@hono/node-server` adapteri.

**Mavjud ilovaga o‘rnatish** (Express/Fastify loyihasi ichiga bot qo‘shish) adapterlar orqali:

```ts
// adapters/express
import { telekitMiddleware } from "@telekit/adapter-express";
expressApp.use("/bot", telekitMiddleware(app));
```

### Port va route taqsimoti

Bitta port (`APP_PORT`, default `3000`):

```text
POST /telegram/webhook/:secretPath   webhook ingress
GET  /health/live                    liveness  (hech narsa tekshirmaydi)
GET  /health/ready                   readiness (DB + Telegram)
GET  /health                         to‘liq hisobot (auth talab qiladi)
GET  /admin/*                        Admin SPA (statik)
*    /admin/api/*                    Admin backend
*    /api/*                          foydalanuvchi API (Bot+API template)
```

DevTools **alohida portda** (`DEVTOOLS_PORT`, default `4545`) va **faqat `127.0.0.1`**'ga bind qilinadi. Sabab: DevTools raw update'lar va env qiymatlarini ko‘rsatadi — uni hech qachon production portiga qo‘shmaslik arxitektura darajasida kafolatlanadi.

### Oqibatlar

- Core'ga bitta katta bo‘lmagan dependency qo‘shiladi (Hono ~14 KB) — [§39](#39-performance-budgeti) budjetiga sig‘adi.
- Polling rejimida ham HTTP server ko‘tariladi, **agar** admin/API/health kerak bo‘lsa. Minimal template'da server umuman ishga tushmaydi (`server.enabled: false`).

---

## ADR-002 — Context shakli

### Kontekst

v1 hujjatida `ctx.from.firstName` (camelCase) va `{first_name}` (snake_case) aralash ishlatilgan. Telegram Bot API **butunlay snake_case**. Qaror qaytarilmas: u generated type layer (`@telekit/types`) va hujjatlarga ta'sir qiladi.

### Variantlar

**A. To‘liq camelCase transform.** Har update kirishda rekursiv qayta nomlanadi.
- ➕ JS idiomatik
- ➖ Bot API hujjatidan copy-paste ishlamaydi
- ➖ Har Bot API relizida mapping qatlami yangilanadi
- ➖ Runtime xarajat: har update uchun rekursiv obyekt qurish (~15–40 µs)
- ➖ `ctx.update` raw holda qoladi → **ikkita haqiqat**

**B. Raw snake_case, transform yo‘q.**
- ➕ `@telegram-bot-api-spec` dan type'lar to‘g‘ridan-to‘g‘ri generatsiya qilinadi
- ➕ core.telegram.org hujjati 1:1 ishlaydi
- ➖ `ctx.from.first_name` JS uchun biroz notanish

### Qaror

**B — raw snake_case.** Telegram payload hech qachon o‘zgartirilmaydi.

Telekit'ning o‘z abstraksiyalari alohida namespace'da va **camelCase**:

```ts
// Telegram'dan kelgan — o‘zgarmagan, snake_case
ctx.update.message.from.first_name
ctx.message.text
ctx.callbackQuery          // ⚠ yo‘q — quyida qarang
ctx.update.callback_query.data

// Telekit abstraksiyalari — camelCase
ctx.user.firstName         // Telekit User entity (DB'dan)
ctx.user.locale
ctx.session.cartItems
ctx.services.get(UserService)
ctx.t("welcome", { name: ctx.user.firstName })
ctx.reply("...")
ctx.log.info({ ... })
```

**Shortcut'lar** (raw obyektlarga havola, nusxa emas):

```ts
ctx.message      → ctx.update.message | ctx.update.edited_message | undefined
ctx.chat         → xabar/callback qaysi bo‘lsa, o‘shandan
ctx.from         → update turiga qarab
ctx.callback     → ctx.update.callback_query  (camelCase shortcut nomi,
                   lekin ichidagi maydonlar raw: .data, .message, .from)
```

`ctx.callbackQuery` emas, `ctx.callback` — chunki u Telekit shortcut'i, raw maydon emas. Bu farq hujjatda alohida ta'kidlanadi.

### Interpolatsiya sintaksisi

Butun framework bo‘ylab **bitta** sintaksis — ICU MessageFormat:

```text
{name}                                   oddiy
{count, plural, one {# ta} other {# ta}} plural
{gender, select, male {u} other {ular}}  select
{price, number, ::currency/UZS}          format
```

Content Manager o‘zgaruvchilari ham shu sintaksisda, `snake_case` nomlar bilan:

```text
{first_name}  {last_name}  {username}  {user_id}  {bot_name}  {chat_id}
```

v1'dagi `ctx.t("welcome", {name})` + `{first_name}` ziddiyati shu bilan yopiladi: `t()` argumentlari developer bergan kalitlar, Content Manager esa oldindan belgilangan `snake_case` kontekst o‘zgaruvchilarini in'ektsiya qiladi.

### Oqibatlar

- v1 hujjatidagi `ctx.from.firstName` misoli **xato** — `ctx.user.firstName` yoki `ctx.from.first_name` bo‘lishi kerak.
- `@telekit/types` to‘liq kod generatsiyasi bilan yaratiladi, qo‘lda mapping yo‘q ([§43](#43-moslik-siyosati)).

---

## ADR-003 — Callback wire format

### Kontekst

Telegram `callback_data` — **1 dan 64 baytgacha** (UTF-8). Bu qat'iy platforma limiti.

v1 hujjati "serialize + validate + compress + sign" va'da qilgan. Muammolar:

1. **Compression 64 bayt doirasida ma'nosiz.** gzip/deflate ~100 baytdan kichik ma'lumotni kattalashtiradi (header + Huffman jadvali). Ya'ni siqish hech qachon foyda bermaydi.
2. **To‘liq HMAC-SHA256 sig‘maydi** — 32 bayt = base64url'da 43 belgi, budjetning 67 %.

Demak signed callback ishlashi uchun **aniq wire format** kerak.

### Qaror

Format:

```text
<routeId> "." <payload> "." <sig>
```

| Qism | Uzunlik | Tavsif |
|---|---|---|
| `routeId` | 4 belgi | `base64url(SHA-256(callbackName))[0:4]` — 24 bit |
| `.` | 1 | ajratuvchi (base64url alifbosida yo‘q → xavfsiz) |
| `payload` | ≤ 49 belgi | binary packing → base64url, padding'siz |
| `.` | 1 | ajratuvchi |
| `sig` | 8 belgi | `base64url(HMAC-SHA256(key, routeId‖payloadRaw))[0:8]` — 48 bit |

**Umumiy overhead: 14 bayt. Payload uchun 50 bayt → 37 xom bayt.**

#### routeId — nega hash, nega indeks emas

Manifestdagi tartib raqami (`a1`, `a2`…) deploy'da o‘zgaradi → eski xabardagi tugmalar boshqa handler'ga tushadi. Bu **xavfsizlik xatosi** (foydalanuvchi "Bekor qilish" bosadi, "O‘chirish" ishlaydi).

Nom hash'i deploy'dan mustaqil. 24 bitda to‘qnashuv ehtimoli 100 ta callback uchun ≈ 0.03 % — shuning uchun **build vaqtida to‘qnashuv tekshiriladi** va topilsa build yiqiladi:

```text
✖ Callback ID collision
  "user.delete"  va  "order.refund"  bir xil routeId (7Kd2) beradi.
  Birini qayta nomlang.
```

#### Payload packing

Schema maydonlari **e'lon tartibida** ketma-ket paketlanadi:

| Tur | Kodlash | Hajm |
|---|---|---|
| `int()` | zigzag + LEB128 varint | 1–10 bayt |
| `uint()` | LEB128 varint | 1–10 bayt |
| `bool()` | bitfield (8 ta bool = 1 bayt) | ~0.125 bayt |
| `enum([...])` | indeks, varint | 1–2 bayt |
| `uuid()` | xom 16 bayt | 16 bayt |
| `str(max)` | varint uzunlik + UTF-8 | 1+N bayt |
| `null` qiymat | bitfield'dagi null-mask biti | ~0.125 bayt |

Amaliy misol:

```ts
defineCallback({
  name: "user.delete",
  schema: { userId: uint(), confirm: bool() }
});
```

```text
userId = 1928391234   → varint 5 bayt
confirm = true        → bitfield  1 bayt
                        ─────────────────
xom payload             6 bayt
base64url               8 belgi
to‘liq callback_data    4 + 1 + 8 + 1 + 8 = 22 bayt ✓
```

37 xom baytga sig‘adigan narsa: **6 ta katta integer**, yoki 2 ta UUID, yoki 30 belgili matn. Real ehtiyojlarning ~95 % i.

#### Overflow — 37 baytdan oshsa

Framework avtomatik **ref store**'ga o‘tadi:

```text
"!" + 16 belgi base64url (96 bit crypto-random)   → 17 bayt
```

Payload `telekit_callback_refs` jadvaliga yoziladi (yoki Redis'ga):

```sql
id TEXT PK, route TEXT, payload BLOB,
chat_id BIGINT, user_id BIGINT,
created_at, expires_at
```

- TTL default **7 kun** (`callbacks.refTtl`).
- Tozalash — scheduler job, soatiga bir marta.
- Store sozlanmagan bo‘lsa → **startup xatosi**, runtime'da emas:
  `TK2104: callback "x.y" overflows 37 bytes and no ref store is configured`.
- Development'da overflow har safar `warn` log beradi — jim degradatsiya yo‘q.

#### Imzo va xavfsizlik

Kalit: `APP_KEY` (32 bayt, base64), installer generatsiya qiladi.

**48-bitli tag yetarlimi?** Hujum vektori: foydalanuvchi qo‘lda `callback_data` yuborishi. Bir urinishning muvaffaqiyat ehtimoli 2⁻⁴⁸. Telegram tomonidan 30 so‘rov/s limiti bilan o‘rtacha muvaffaqiyat vaqti ≈ 2⁴⁸/30 s ≈ **297 000 yil**. Yuqori talablar uchun `callbacks.sigBytes: 8 | 16` sozlanadi (payload budjeti mos ravishda kamayadi).

**Scope — kim bosishi mumkin:**

```ts
defineCallback({
  name: "user.delete",
  scope: "user",    // "global" (default) | "user" | "chat"
  schema: { ... }
});
```

- `global` — imzoga faqat route+payload kiradi. Guruhdagi umumiy tugmalar.
- `user` — imzoga `from.id` ham qo‘shiladi (payload'ga **yozilmaydi**, joy yemaydi). Boshqa foydalanuvchi bosa — `TK2102 CallbackSignatureError`, handler ishlamaydi.
- `chat` — imzoga `chat.id` qo‘shiladi.

**Kalit rotatsiyasi:** `APP_KEY_PREVIOUS` mavjud bo‘lsa, tekshirish ikkala kalit bilan, imzolash faqat joriysi bilan. Grace period — eski tugmalar amal qilish muddati (7 kun tavsiya).

#### Eskirgan tugmalar

Deploy'dan keyin olib tashlangan route'ga tegishli tugma bosilsa:

```text
TK2103 RouteNotFoundError
→ ctx.answerCallbackQuery({ text: t("errors.button_expired"), show_alert: true })
→ analytics'ga `callback.stale` event
```

Default matn barcha lokalda starter bilan keladi.

#### Imzosiz rejim

`callbacks.sign: false` — faqat development. Production'da:

```text
TK1003 ConfigurationError:
  callbacks.sign=false in production.
  Set callbacks.allowUnsignedInProduction=true to override (not recommended).
```

### Oqibatlar

- `compress` opsiyasi **API'dan olib tashlanadi** — u foyda bermaydi (v1 §18 tuzatildi).
- Callback schema'si `string()` ishlatsa, linter ogohlantiradi va overflow riskini ko‘rsatadi.
- `telekit routes` har callback uchun hisoblangan bayt budjetini ko‘rsatadi.

---

## ADR-004 — Conversations ijro modeli

### Kontekst

Va'da qilingan DX:

```ts
const name = await flow.text("Ismingizni kiriting:");
const phone = await flow.contact("Raqamingizni yuboring:");
```

JavaScript'da funksiya ijrosini **to‘xtatib, keyinroq davom ettirish mumkin emas**: process qayta ishga tushsa yoki boshqa instance update'ni olsa, stack yo‘qoladi. Serverless'da (Cloudflare Workers) har so‘rov yangi izolyat.

### Variantlar

**A. Generator'ni xotirada ushlash.** Eng oddiy. Restart → barcha dialoglar yo‘qoladi. Multi-instance → ishlamaydi. **Rad etildi.**

**B. Deterministik replay.** Har update kelganda conversation funksiyasi **boshidan** qayta ijro etiladi; `flow.*` chaqiriqlari saqlangan log'dan javob qaytaradi; log tugagan joyda funksiya yangi update'ni kutadi va to‘xtaydi.
- ➕ DX to‘liq saqlanadi, serverless'da ishlaydi
- ➖ Funksiya **deterministik** bo‘lishi shart
- ➖ n-qadamda O(n²) ijro

**C. Deklarativ step machine.**
```ts
steps: { name: { ask, expect: "text", next: "phone" }, ... }
```
- ➕ Serverless-safe, vizuallashtiriladi (Flow Builder), debug oson
- ➖ Shartli mantiq, sikllar noqulay

### Qaror

**B + C gibrid.**

- **Core = replay engine (B)** — `defineConversation` ning asosiy API'si.
- **Deklarativ qatlam (C)** — `defineFlow`, replay engine ustida quriladi; Visual Flow Builder (§110 v1) aynan shuni generatsiya qiladi.

#### Determinizm rejimi — majburiy

Conversation tanasi ichida **barcha yon ta'sirlar** `flow` orqali o‘tishi shart:

```ts
export default defineConversation("register", async (flow, ctx) => {
  const name  = await flow.text("Ismingizni kiriting:");
  const phone = await flow.contact("Raqamingizni yuboring:");

  // ✅ tashqi yon ta'sir — natija log'ga yoziladi, replay'da qayta chaqirilmaydi
  const exists = await flow.external("check-phone", () =>
    users.existsByPhone(phone)
  );

  if (exists) {
    await flow.reply(ctx.t("register.phone_taken"));
    return;
  }

  // ✅ nondeterministik manbalar flow orqali
  const code = flow.random.int(100000, 999999);
  const now  = flow.now();

  await flow.external("create-user", () =>
    users.create({ name, phone, code, createdAt: now })
  );

  await flow.reply(ctx.t("register.done"));
});
```

**Runtime himoyasi.** Conversation ijrosi `AsyncLocalStorage` kontekstida ketadi. Shu kontekst ichida:

| Harakat | Natija |
|---|---|
| `ctx.reply()` to‘g‘ridan-to‘g‘ri | `TK2201 ConversationSideEffectError` — `flow.reply()` ishlating |
| `ctx.api.*` to‘g‘ridan-to‘g‘ri | shu xato |
| `Math.random()` | development'da `warn`, production'da `warn` (patch qilinmaydi) |
| `Date.now()` | development'da `warn` |
| `flow.external` siz `await db.*` | aniqlanmaydi — hujjatda va linter qoidasi bilan qoplanadi |

`@telekit/eslint-plugin` da `telekit/no-raw-effects-in-conversation` qoidasi — conversation fayllari ichida `flow` dan tashqari `await` ni ogohlantiradi.

#### Log formati

```ts
type ConversationLog = {
  version: 1;
  entries: Array<
    | { k: "ask"; i: number; value: unknown }        // foydalanuvchi javobi
    | { k: "ext"; i: number; id: string; value: unknown }
    | { k: "rnd"; i: number; value: number }
    | { k: "now"; i: number; value: number }
    | { k: "cp";  i: number; state: unknown }        // checkpoint
  >;
};
```

`telekit_conversations` jadvalida (JSON), optimistik qulflash uchun `version` ustuni bilan.

#### O(n²) muammosi va checkpoint

20-qadamli dialogda 20-update 20 ta log yozuvini qayta ijro etadi. Yozuvlar arzon (I/O yo‘q), lekin `flow.external` natijalari kattalashsa, log o‘sadi.

Chegaralar:

```ts
conversations: {
  maxSteps: 50,          // oshsa → TK2203 ConversationTooLongError
  maxLogBytes: 64 * 1024,
  ttl: "24h",            // faol bo‘lmagan dialog tugatiladi
}
```

**Checkpoint** log'ni qisqartiradi:

```ts
const cart = await flow.checkpoint("cart", { items, total });
// shu nuqtadan oldingi barcha yozuvlar tashlanadi,
// faqat `state` saqlanadi
```

#### Bekor qilish va timeout

```ts
defineConversation("register", handler, {
  cancelCommands: ["/cancel", "/bekor"],
  timeout: "30m",
  onTimeout: async (flow) => flow.reply(t("register.timeout")),
  onCancel:  async (flow) => flow.reply(t("register.cancelled")),
});
```

#### `flow` API

```ts
// So‘rovlar (kutish nuqtalari)
flow.text(prompt?, opts?): Promise<string>
flow.number(prompt?, { min?, max? }): Promise<number>
flow.contact(prompt?): Promise<Contact>
flow.location(prompt?): Promise<Location>
flow.photo(prompt?): Promise<PhotoSize[]>
flow.document(prompt?): Promise<Document>
flow.choice(prompt, options[]): Promise<T>        // keyboard bilan
flow.confirm(prompt): Promise<boolean>
flow.wait(filter?): Promise<Update>               // xom update

// Chiqish (log'ga yozilmaydi, replay'da qayta yuborilmaydi)
flow.reply(...)   flow.edit(...)   flow.delete(...)

// Nondeterminizm
flow.external(id, fn)   flow.random   flow.now()   flow.uuid()

// Boshqaruv
flow.checkpoint(id, state)   flow.exit()   flow.restart()
flow.goto(conversationName, params?)
```

Har so‘rovda validatsiya va qayta so‘rash:

```ts
const age = await flow.number("Yoshingiz:", {
  min: 14, max: 100,
  retry: 3,
  invalidMessage: t("errors.invalid_age"),
});
```

### Oqibatlar

- Conversation kodi oddiy funksiyadan **farq qiladi** — bu hujjatda birinchi sahifada ta'kidlanadi.
- `flow.external` unutilishi eng ko‘p uchraydigan xato bo‘ladi → linter qoidasi MVP doirasida majburiy.
- Replay engine `@telekit/conversations` ichida, core'dan mustaqil.

---

## ADR-005 — Data layer

### Kontekst

Telekit modullariga (users, analytics, broadcast, admin, queue) SQLite va PostgreSQL ustida ishlaydigan ma'lumot qatlami kerak. Ayni paytda foydalanuvchiga ORM majburlanmasligi kerak (v1 §72).

### Variantlar

| | Plus | Minus |
|---|---|---|
| **O‘z ORM'imiz** | to‘liq nazorat | 6–12 oy ish, migration diff, dialektlar |
| **Prisma** | DX yaxshi | Rust engine binary, bundle og‘ir, Workers'da muammo |
| **Drizzle** | schema-in-TS, tez | `drizzle-kit` alohida CLI, migration generatsiyasi fikrli |
| **Kysely** | ~30 KB, sof query builder, `Migrator` ichida, dialektlar | schema DSL yo‘q (bizga kerak ham emas) |

### Qaror

**Kysely** — `@telekit/core` ning ichki ma'lumot qatlami.

```ts
// Framework ichkarisi
const rows = await db
  .selectFrom("telekit_users")
  .where("is_blocked", "=", false)
  .selectAll()
  .execute();
```

Sabablar:
1. Migration runner **ichida bor** — o‘zimiz yozmaymiz (v1 §72'dagi eng katta yashirin scope yopiladi).
2. Dialekt qatlami: `SqliteDialect` (better-sqlite3 / libsql), `PostgresDialect` (pg), kelajakda `MysqlDialect`.
3. Kod generatsiyasi talab qilmaydi → build bosqichi soddalashadi.
4. Bundle hajmi [§39](#39-performance-budgeti) budjetiga sig‘adi.

**Foydalanuvchiga majburlanmaydi.** Telekit `ctx.db` (Kysely instance) beradi, lekin loyiha xohlagan ORM'ni yonida ishlatishi mumkin — bitta connection pool ulashiladi:

```ts
// telekit.config.ts
database: {
  driver: "postgres",
  url: env("DATABASE_URL"),
  // mavjud pool'ni berish
  pool: myExistingPgPool,
}
```

**Repository interfeysi** faqat framework modullari uchun:

```ts
interface UserRepository {
  findById(id: number): Promise<TelekitUser | null>;
  upsertFromTelegram(from: TgUser, chat: TgChat): Promise<TelekitUser>;
  markBlocked(id: number): Promise<void>;
  query(filter: UserFilter, page: Page): Promise<Paginated<TelekitUser>>;
}
```

Custom storage (masalan MongoDB) — bu interfeyslarni implement qilish orqali.

### Migration

```bash
telekit migrate            # kutilayotganlarni qo‘llash
telekit migrate:status     # holat
telekit migrate:rollback   # oxirgi batch
telekit make:migration add_users_city
```

- Framework migratsiyalari `@telekit/*` paketlari ichida keladi, `telekit_` prefiksi bilan, foydalanuvchi migratsiyalaridan **alohida ketma-ketlikda** yuritiladi (`telekit_migrations` va `migrations` jadvallari).
- Production'da `telekit start` avtomatik migrate **qilmaydi** (default). `migrations.autoRunInProduction: true` bilan yoqiladi.
- Har migratsiya `up`/`down` bilan; `down` yo‘q bo‘lsa rollback xato beradi.

### Oqibatlar

- `better-sqlite3` — native modul. Bun/Deno/Workers uchun `libsql` yoki D1 dialekti (adapters).
- Cloudflare Workers'da SQLite o‘rniga **D1** yoki tashqi Postgres (Hyperdrive) — adapter darajasida.

---

## ADR-006 — Monorepo va paket chegaralari

### Qaror

```text
telekit/
├── packages/
│   ├── types/           Bot API generated types (dependency: 0)
│   ├── core/            runtime, router, ctx, api client, http, db, errors
│   ├── cli/             telekit buyrug‘i
│   ├── callbacks/       ADR-003 implementatsiyasi
│   ├── conversations/   ADR-004 replay engine
│   ├── localization/    ICU + locale resolution
│   ├── sessions/        session store abstraksiyasi
│   ├── testing/         test harness
│   ├── devtools/        inspector, replay, simulator (dev-only)
│   ├── admin/           admin backend + Vue SPA build
│   ├── analytics/
│   ├── broadcast/
│   ├── subscriptions/
│   ├── scheduler/
│   ├── queue/
│   └── health/
├── adapters/
│   ├── node/ bun/ cloudflare/
│   ├── express/ fastify/ hono/
│   └── sqlite/ postgres/ redis/
├── create-telekit/      npm create telekit
├── examples/            8+ ishlaydigan misol
├── benchmarks/
├── docs/                VitePress, uz/ru/en
└── e2e/                 real Telegram test bot bilan E2E
```

### Dependency qoidalari (CI'da tekshiriladi)

```text
types        → hech nima
core         → types, hono, kysely
callbacks    → core
sessions     → core
localization → core, @formatjs/intl-messageformat
conversations→ core, sessions
queue        → core
scheduler    → core, queue
analytics    → core
broadcast    → core, queue, analytics
subscriptions→ core
admin        → core + yuqoridagilarning ixtiyoriy peer'lari
devtools     → core (devDependency sifatida o‘rnatiladi)
```

**Qat'iy taqiq:** `core` hech qachon `admin`, `analytics`, `broadcast`, `queue`, `redis`, `postgres`, `vue` ga bog‘lanmaydi. CI'da `dependency-cruiser` qoidasi bu grafni majburlaydi.

### Paket menejeri

`pnpm` workspace + `turborepo` (build cache) + `changesets` (versiyalash va changelog).

---

## ADR-007 — Nomlar va litsenziya

### Litsenziya

**MIT.** Sabab: maksimal qabul qilinish. Vue, Laravel, Express, grammY — barchasi MIT. Apache-2.0 patent grant beradi, lekin korporativ huquqshunoslar uchun qo‘shimcha ko‘rib chiqish talab qiladi va freelancer auditoriyasi uchun to‘siq.

Barcha `packages/*` va `adapters/*` — MIT. `examples/*` — CC0/MIT.

### npm nomlari — Phase 0 vazifasi

Qurish boshlanishidan oldin band qilinishi shart:

```text
telekit              ← npx telekit new  uchun HAYOTIY MUHIM
create-telekit       ← npm create telekit@latest
@telekit             ← scope
```

**Risk:** `telekit` nomi band bo‘lishi mumkin. Zaxira variantlar: `telekitjs`, `@telekit/cli` (u holda `npx @telekit/cli new`).

Domen: `telekit.dev` (hujjatlar), `telekit.uz` (o‘zbek jamoasi).

GitHub: `telekit/telekit`.

### Node.js versiyasi

```json
"engines": { "node": ">=22.13.0" }
```

Sabab: `node:test` barqaror, `AsyncLocalStorage` performansi, native `fetch` barqaror, ESM to‘liq. Node 18 EOL — 2025-04.

Runtime matritsasi ([§41](#41-scaling-va-deployment-topologiyasi)da to‘liq):

| Runtime | v1.0 | Cheklov |
|---|---|---|
| Node ≥ 22.13 | ✅ birlamchi | `node:sqlite` uchun |
| Bun ≥ 1.1 | ✅ | `better-sqlite3` → `bun:sqlite` |
| Deno ≥ 2 | 🟡 eksperimental | — |
| Cloudflare Workers | 🟡 eksperimental | polling yo‘q, DB → D1/Hyperdrive |

---

# QISM III — CORE

## 13. Application lifecycle

### 13.1 Bootstrap ketma-ketligi

```text
 1. Env yuklash (.env → process.env, override qilmasdan)
 2. Env validatsiya (schema)              ─┐ xato → darhol to‘xtash
 3. telekit.config.ts yuklash va merge     │  (TK1001…TK1099)
 4. Config validatsiya                    ─┘
 5. Logger yaratish (secret masking bilan)
 6. Service container yaratish
 7. Modullarni ro‘yxatdan o‘tkazish (register fazasi — I/O yo‘q)
 8. Database ulanish + migration status tekshiruvi
 9. Route manifest yuklash (build artefakti yoki runtime scan)
10. Callback manifest + collision tekshiruvi
11. Modullarni boot qilish (boot fazasi — I/O ruxsat)
12. Telegram getMe → bot identifikatsiyasi
13. Bot mode aniqlash (ADR: §22.4 auto algoritmi)
14. HTTP server ko‘tarish (agar kerak bo‘lsa)
15. Webhook o‘rnatish yoki polling boshlash
16. Scheduler + queue worker ishga tushirish
17. Health "ready" holatiga o‘tish
```

Har bosqich `startup.step` eventi chiqaradi — DevTools va `telekit doctor` shundan foydalanadi.

### 13.2 Modul interfeysi

```ts
interface TelekitModule {
  name: string;
  version: string;
  dependsOn?: string[];

  register?(app: AppBuilder): void | Promise<void>;
  boot?(app: Application): void | Promise<void>;
  shutdown?(): Promise<void>;

  migrations?: MigrationProvider;
  adminNav?: AdminNavItem[];
  permissions?: PermissionDef[];
  cliCommands?: CliCommand[];
  health?: HealthCheck[];
}
```

`register` — sof (servislar e'loni, config merge). `boot` — I/O (ulanish, warm-up). Ikki faza modullar orasidagi tartib muammosini yopadi.

### 13.3 Graceful shutdown

`SIGTERM` / `SIGINT`:

```text
1. Health "ready" → false   (LB trafikni to‘xtatadi)
2. drain davri: shutdown.drainDelay (default 5s)
3. Yangi update qabul qilish to‘xtaydi
   polling  → getUpdates sikli to‘xtaydi
   webhook  → 503 qaytariladi
4. Ishlayotgan handlerlar kutiladi (shutdown.timeout, default 30s)
5. Queue worker'lar joriy job'ni tugatadi
6. Scheduler to‘xtaydi
7. Analytics buferi flush qilinadi
8. DB connection pool yopiladi
9. HTTP server yopiladi
10. process.exit(0)
```

Timeout oshsa — `exit(1)` va `shutdown.forced` log. Ikkinchi `SIGINT` — darhol chiqish.

**Webhook drain nozikligi:** shutdown paytida Telegram'ga webhook `deleteWebhook` **yuborilmaydi** (rolling deploy'da yangi pod o‘sha URL'ni oladi). Webhook faqat mode o‘zgarganda o‘chiriladi.

---

## 14. Update pipeline

### 14.1 To‘liq yo‘l

```text
┌─ Ingress ──────────────────────────────────────┐
│  polling: getUpdates(timeout=50, limit=100)    │
│  webhook: POST + secret_token tekshiruvi       │
└──────────────────┬─────────────────────────────┘
                   ↓
       ┌───────────────────────┐
       │ 1. Dedup (update_id)  │──► takrorlangan → drop + metric
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 2. Sequencer          │  chat_id bo‘yicha FIFO navbat
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 3. Context qurish     │  ctx.update, ctx.chat, ctx.from…
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 4. Global middleware  │  user upsert → locale → session →
       │                       │  rateLimit → subscriptionGate → …
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 5. Router dispatch    │  conversation? → callback? →
       │                       │  command? → event? → fallback
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 6. Route middleware   │
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 7. Handler            │
       └───────────┬───────────┘
                   ↓
       ┌───────────────────────┐
       │ 8. Post-processing    │  analytics event, devtools event,
       │                       │  session persist, metrics
       └───────────────────────┘

Har bosqich error boundary ichida → §20
```

**Dispatch ustunligi muhim:** faol conversation callback va commanddan **oldin** tekshiriladi, aks holda dialog o‘rtasida `/help` yozgan foydalanuvchi dialogdan chiqib ketadi. Lekin `cancelCommands` conversationdan oldin ishlaydi.

```text
1. cancelCommands       (/cancel)
2. faol conversation
3. callback_query
4. command
5. event (message:text, …)
6. fallback handler
```

### 14.2 Deduplication

**Nega kerak:** Telegram webhook'ga 200 javob kechiksa, o‘sha update'ni qayta yuboradi. Polling'da `offset` noto‘g‘ri commit bo‘lsa ham takrorlanish bo‘ladi.

| Rejim | Store | Konfiguratsiya |
|---|---|---|
| 1 instance | LRU xotirada (10 000 ta ID, ~5 min) | default |
| N instance | Redis `SET NX PX` | `dedup.store: "redis"` |
| o‘chirilgan | — | `dedup.enabled: false` |

Redis kaliti: `tk:dedup:<botId>:<updateId>`, TTL 300 s.

**Multi-instance'da xotira store ishlatilsa** — startup'da ogohlantirish:
`TK1015: dedup.store="memory" with instances>1 is unsafe`.

### 14.3 Sequencer — per-chat tartib

Talab: bitta chatdagi update'lar **ketma-ket**, turli chatlar **parallel**.

**Single instance:** `Map<chatId, Promise>` — zanjir. Chat tugagach yozuv o‘chiriladi (memory leak'dan himoya).

**Multi-instance:** Redis lease lock:

```text
SET tk:seq:<botId>:<chatId> <instanceId> NX PX 30000
```

Lock olinmasa — update qisqa backoff bilan kutadi (max `sequencer.waitMs`, default 5000). Oshsa — parallel ijroga ruxsat beriladi va `sequencer.degraded` metrikasi oshadi (xabar yo‘qolmasligi tartibdan muhimroq).

```ts
concurrency: {
  global: 100,          // bir vaqtda ishlayotgan handler
  perChat: 1,           // 1 = qat'iy tartib; >1 = tartib yo‘q
  queueLimit: 1000,     // kutayotgan update; oshsa backpressure
}
```

**Backpressure:** polling'da in-flight > `global` bo‘lsa `getUpdates` pauza qiladi. Webhook'da navbat to‘lsa `429` + `Retry-After` qaytariladi — Telegram qayta yuboradi.

### 14.4 Polling

```ts
polling: {
  timeout: 50,                 // long polling, sekund
  limit: 100,
  allowedUpdates: undefined,   // undefined = router manifestdan avtomatik
  dropPendingUpdates: false,
}
```

`allowedUpdates` **avtomatik hisoblanadi**: router qaysi event turlarini tinglasa, faqat o‘shalar so‘raladi. Bu trafik va parsingni sezilarli kamaytiradi. `telekit routes` hisoblangan ro‘yxatni ko‘rsatadi.

**Bitta poller kafolati.** `getUpdates` ni ikki process parallel chaqirsa, update'lar ikkiga bo‘linib ketadi. Telekit startup'da advisory lock oladi:

```text
DB:    INSERT INTO telekit_locks (name='poller', owner, expires_at)
Redis: SET tk:poller:<botId> <instanceId> NX PX 60000  (har 20s yangilanadi)
```

Lock band bo‘lsa:

```text
TK1020 PollerLockError
  Another instance is already polling (owner: pod-7f3a, since 14:02:11).
  Polling supports exactly one instance. Use webhook mode to scale
  horizontally, or set polling.lock=false if you know what you are doing.
```

Egasi halok bo‘lsa, lease muddati tugagach boshqa instance egallaydi.

### 14.5 Webhook

```ts
webhook: {
  url: env("PUBLIC_URL"),           // + /telegram/webhook/<secretPath>
  secretToken: env("BOT_WEBHOOK_SECRET"),  // yo‘q bo‘lsa APP_KEY dan hosil
  secretPath: "<derived>",          // APP_KEY dan HMAC, URL guessing'dan himoya
  maxConnections: 40,               // Telegram: 1..100
  dropPendingUpdates: false,
  ipAllowlist: true,                // Telegram subnetlari
}
```

Tekshiruvlar, tartib bilan:

```text
1. IP allowlist (149.154.160.0/20, 91.108.4.0/22)  → 403
2. X-Telegram-Bot-Api-Secret-Token doimiy-vaqtli taqqoslash → 401
3. Content-Length ≤ 5 MB                            → 413
4. JSON parse                                       → 400
5. 200 OK darhol qaytariladi, ishlov asinxron       → §14.6
```

### 14.6 Webhook javob strategiyasi

Telegram javobni **60 s** kutadi va kechikkanda qayta yuboradi.

```ts
webhook: { responseMode: "immediate" }  // default
```

| Rejim | Xatti-harakat | Qachon |
|---|---|---|
| `immediate` | 200 darhol, ishlov fon rejimida | default; kechikish yo‘q |
| `await` | handler tugagach 200 | serverless (Workers) — fon ijro yo‘q |

`immediate` rejimida process halok bo‘lsa update yo‘qoladi. Kafolat kerak bo‘lsa `webhook.persistIngress: true` — update avval `telekit_inbox` jadvaliga yoziladi, keyin ishlanadi (at-least-once + dedup = amalda exactly-once).

**Serverless'da** `await` majburiy va `responseMode` avtomatik shunga o‘tadi.

### 14.7 Auto mode algoritmi

```text
BOT_MODE=auto
   │
   ├─ APP_ENV=development ──────────────────────► POLLING
   │
   └─ APP_ENV=production
         │
         ├─ PUBLIC_URL yo‘q ──────────────────► POLLING (+ warn TK1030)
         │
         ├─ PUBLIC_URL https:// emas ─────────► POLLING (+ warn TK1031)
         │
         └─ https://  → HEAD so‘rov (5s)
               ├─ muvaffaqiyatsiz ────────────► POLLING (+ warn TK1032)
               └─ 2xx/3xx/4xx javob ──────────► WEBHOOK
```

`TK103x` ogohlantirishlari startup banner'ida **ko‘rinadigan** bo‘lib chiqadi — "nega webhook ishlamadi" savoli eng ko‘p so‘raladigan savol bo‘lmasligi uchun.

**Mode o‘tishlarini boshqarish:**

| Oldingi holat (`getWebhookInfo`) | Yangi rejim | Harakat |
|---|---|---|
| webhook o‘rnatilgan | polling | `deleteWebhook(drop_pending=false)` |
| webhook yo‘q | webhook | `setWebhook(...)` |
| webhook boshqa URL'da | webhook | `setWebhook` (yangi URL) |
| webhook ayni URL, ayni secret | webhook | **hech nima qilinmaydi** (keraksiz API chaqiruvi yo‘q) |

---

## 15. Routing

### 15.1 Fayl konvensiyasi

```text
app/
├── commands/
│   ├── start.ts              → /start
│   ├── help.ts               → /help
│   ├── admin/
│   │   ├── stats.ts          → /admin_stats
│   │   └── users.ts          → /admin_users
│   └── settings.lang.ts      → /settings_lang
│
├── callbacks/
│   ├── user.delete.ts        → callback "user.delete"
│   └── cart/
│       └── add.ts            → callback "cart.add"
│
├── events/
│   ├── message.text.ts       → "message:text"
│   ├── message.photo.ts      → "message:photo"
│   ├── chat_member.ts        → "chat_member"
│   └── my_chat_member.ts     → "my_chat_member"
│
├── inline/
│   └── default.ts            → inline_query
│
├── conversations/
│   └── register.ts           → conversation "register"
│
├── middleware/               → global, alifbo tartibida
│   ├── 010.locale.ts
│   └── 020.subscription.ts
│
├── keyboards/                → eksport qilinadi, avtomatik registratsiya yo‘q
├── services/                 → service container'ga avtomatik
└── modules/                  → lokal modullar
```

Qoidalar:
- `.` → `_` (command nomida), papka → prefiks.
- `_` bilan boshlangan fayl/papka **e'tiborsiz** (`_helpers.ts`).
- `index.ts` papka nomini oladi.
- `.test.ts`, `.spec.ts` — e'tiborsiz.

### 15.2 Manifest

**Development:** fayllar skan qilinadi + `chokidar` bilan kuzatiladi → HMR.

**Production:** `telekit build` `dist/.telekit/manifest.json` generatsiya qiladi:

```json
{
  "version": 1,
  "buildId": "8f3a2c1e",
  "commands": [
    { "name": "start", "file": "app/commands/start.ts",
      "chunk": "./chunks/start-a1b2.js", "middleware": [], "scopes": ["default"] }
  ],
  "callbacks": [
    { "name": "user.delete", "routeId": "7Kd2", "file": "...",
      "payloadBytes": 6, "budget": 37 }
  ],
  "events": [ { "type": "message:text", "file": "..." } ],
  "allowedUpdates": ["message", "callback_query", "chat_member"]
}
```

Sabab: production'da fayl tizimini skan qilish cold start'ni sekinlashtiradi va bundler'lar (Workers, `--bundle`) uchun umuman ishlamaydi. Manifest — build artefakti.

**Lazy loading:** har route alohida chunk; handler birinchi chaqirilganda `import()` qilinadi. Cold start budjeti ([§39](#39-performance-budgeti)) shu hisobga erishiladi.

### 15.3 Dasturiy registratsiya

Fayl konvensiyasi — qulaylik, yagona yo‘l emas:

```ts
app.command("start", handler);
app.callback(deleteUser, handler);
app.event("message:text", handler);
app.conversation("register", flow);

// dinamik: DB'dan yuklangan buyruqlar
for (const cmd of await db.loadCommands()) {
  app.command(cmd.name, makeHandler(cmd));
}
```

### 15.4 Command definition

```ts
export default defineCommand({
  name: "profile",
  aliases: ["me"],
  description: "Profil ma'lumotlari",        // string yoki i18n kalit
  descriptionKey: "commands.profile.desc",

  scopes: ["private"],                        // private | group | channel | all
  visibility: "public",                       // public | hidden | admin
  middleware: [rateLimit({ limit: 3, window: "1m" })],

  args: {                                      // /profile 123
    id: uint().optional(),
  },

  async handle(ctx) {
    await ctx.reply(ctx.t("profile.title"));
  },
});
```

`visibility: "public"` bo‘lgan buyruqlar `setMyCommands` orqali Telegram menyusiga **avtomatik** sinxronlanadi — har locale uchun alohida (`scope` + `language_code`). Sinxronizatsiya startup'da, faqat farq bo‘lsa (`getMyCommands` bilan solishtirib).

### 15.5 Event turlari

```text
message:text  message:photo  message:video  message:document  message:audio
message:voice message:sticker message:animation message:contact
message:location message:poll message:dice message:any
edited_message  channel_post  edited_channel_post
callback_query  inline_query  chosen_inline_result
chat_member  my_chat_member  chat_join_request
poll  poll_answer
pre_checkout_query  shipping_query  successful_payment
message_reaction  message_reaction_count
```

Filtrlar bilan:

```ts
defineEvent("message:text", { filter: (ctx) => ctx.chat.type === "private" }, handler);
defineEvent("message:text", { match: /^\d{9}$/ }, handler);
defineEvent("chat_member", { filter: isJoinTransition }, handler);
```

---

## 16. Context API

```ts
interface Context<U extends Update = Update> {
  // ── Xom Telegram ma'lumoti (snake_case, o‘zgarmagan) ──
  readonly update: U;
  readonly message?: Message;
  readonly chat?: Chat;
  readonly from?: User;
  readonly callback?: CallbackQuery;

  // ── Telekit abstraksiyalari (camelCase) ──
  readonly user: TelekitUser;          // DB entity; middleware upsert qiladi
  readonly session: Session;            // §19
  readonly locale: string;
  readonly services: ServiceContainer;
  readonly db: Kysely<Database>;
  readonly api: TelegramApi;            // xom API client
  readonly log: Logger;                 // update_id bilan bog‘langan
  readonly state: Record<string, unknown>;  // middleware'lararo uzatish

  // ── Qisqartmalar ──
  reply(text: string, opts?: ReplyOptions): Promise<Message>;
  replyWithPhoto(photo: InputFile | string, opts?): Promise<Message>;
  editText(text: string, opts?): Promise<Message | true>;
  deleteMessage(messageId?: number): Promise<true>;
  answerCallback(opts?: AnswerCallbackOptions): Promise<true>;

  t(key: string, params?: Record<string, unknown>): string;
  tn(key: string, count: number, params?): string;   // plural qisqartma

  // ── Conversations ──
  enter(conversation: string, params?: unknown): Promise<void>;
  exit(): Promise<void>;
  readonly inConversation: string | null;
}
```

### 16.1 Typed narrowing

```ts
defineEvent("message:text", async (ctx) => {
  ctx.message.text;     // string — `?` yo‘q, kafolatlangan
  ctx.chat.id;          // number
});

defineEvent("message:photo", async (ctx) => {
  ctx.message.photo;    // PhotoSize[] — kafolatlangan
  ctx.message.text;     // ✖ TypeScript xatosi
});
```

Implementatsiya: `Update` turidan diskriminant bo‘yicha `DeepRequired` chiqarish. `@telekit/types` da har event turi uchun `NarrowedUpdate<"message:text">` map'i generatsiya qilinadi.

### 16.2 Kengaytirish

```ts
// types/telekit.d.ts
declare module "@telekit/core" {
  interface Context {
    cart: Cart;
  }
  interface TelekitUser {
    city: string | null;
    plan: "free" | "pro";
  }
  interface Session {
    step: number;
  }
}
```

Middleware to‘ldiradi:

```ts
export default defineMiddleware(async (ctx, next) => {
  ctx.cart = await carts.forUser(ctx.user.id);
  await next();
});
```

### 16.3 `ctx.reply` defaultlari

```ts
reply(text, {
  parse_mode: "HTML",            // config'dan, default HTML
  link_preview_options: { is_disabled: true },   // default o‘chiq
  reply_parameters: undefined,
})
```

`parse_mode: "HTML"` default bo‘lgani uchun **matn avtomatik escape qilinmaydi** — bu xavfsizlik nuqtasi. Shuning uchun:

```ts
ctx.reply(html`Salom, ${ctx.user.firstName}!`);   // tagged template — escape qiladi
ctx.reply(ctx.t("welcome", { name }));            // t() interpolatsiyada escape qiladi
ctx.reply(rawUserInput);                           // ⚠ linter ogohlantiradi
```

`html` tagged template va `t()` ning avtomatik escape'i — [§40](#40-xavfsizlik) talabidir.

---

## 17. Middleware

```ts
type Middleware = (ctx: Context, next: () => Promise<void>) => Promise<void>;
```

Koa uslubidagi onion. Global middleware `app/middleware/` dagi fayl nomi tartibida (raqam prefiksi bilan boshqariladi).

### 17.1 Framework middleware'lari va tartibi

```text
000  requestId        update_id → logger bog‘lash
010  telemetry        boshlanish vaqti, metrikalar
020  userUpsert       telekit_users upsert (batch)
030  locale           §26.3 aniqlash zanjiri
040  session          §19 lazy load
050  rateLimit        §17.2
060  subscriptionGate §33  (ixtiyoriy)
070  maintenance      maintenance rejimi (ixtiyoriy)
...  foydalanuvchi middleware'lari
999  errorBoundary    eng tashqi
```

`app.use(mw, { before: "050" })` bilan aniq joyga qo‘yish mumkin.

### 17.2 Rate limiting

```ts
rateLimit({
  limit: 5,
  window: "10s",
  scope: "user",          // user | chat | user-chat | command | global
  strategy: "sliding",    // fixed | sliding | token-bucket
  onLimit: async (ctx, info) =>
    ctx.reply(ctx.t("errors.rate_limited", { seconds: info.retryAfter })),
  skip: (ctx) => ctx.user.isAdmin,
});
```

Store: xotira (1 instance) yoki Redis (N instance). Xotira store'i multi-instance'da `N×limit` ga aylanadi — startup ogohlantirishi beriladi.

---

## 18. Telegram API client

Telekit o‘z clientini yozadi (ADR-001). Talablar: rate limiting, retry, observability, multi-runtime, generated types.

### 18.1 Interfeys

```ts
await ctx.api.sendMessage({ chat_id, text });   // snake_case — Bot API bilan 1:1
await ctx.api.raw("sendMessage", { ... });      // yangi metodlar uchun
```

Barcha metodlar `@telekit/types` dan generatsiya qilinadi → Bot API yangilanishi kod o‘zgarishisiz type'larga tushadi.

### 18.2 Retry siyosati

```ts
telegram: {
  retry: {
    enabled: true,
    attempts: 5,
    baseDelay: 300,        // ms
    maxDelay: 30_000,
    jitter: true,          // full jitter
  },
  timeout: 30_000,
}
```

| Holat | Harakat |
|---|---|
| `429` + `retry_after` | **aynan** `retry_after` kutiladi (exponential emas) |
| `5xx` | exponential backoff + jitter |
| Tarmoq / timeout | exponential backoff |
| `400` (`chat not found`, `message is not modified`, …) | retry **yo‘q** → `TelegramApiError` |
| `403` (`bot was blocked by the user`) | retry yo‘q → user `blocked` deb belgilanadi |
| `409` (`terminated by other getUpdates`) | retry yo‘q → `TK1020` |

`message is not modified` va `query is too old` kabi zararsiz xatolar uchun `telegram.ignoreBenignErrors: true` (default) — ular `debug` darajasida loglanadi va exception ko‘tarmaydi.

### 18.3 Chiquvchi rate limiter

Telegram limitlari ([Ilova D](#ilova-d--telegram-platforma-limitlari)) client darajasida majburlanadi:

```ts
telegram: {
  rateLimit: {
    global: 30,             // so‘rov/sekund
    perChat: 1,             // xabar/sekund (private)
    perGroup: { limit: 20, window: "60s" },
    store: "memory",        // yoki "redis" — multi-instance uchun SHART
  }
}
```

Token bucket. Multi-instance'da xotira store ishlatilsa, umumiy tezlik `N × 30` ga chiqadi va Telegram 429 bera boshlaydi → startup ogohlantirishi `TK1016`.

### 18.4 Observability

Har API chaqiruv:

```json
{ "event": "telegram.call", "method": "sendMessage", "duration_ms": 84,
  "attempt": 1, "ok": true, "chat_id": "***" }
```

Metrikalar: `telegram_calls_total{method,status}`, `telegram_call_duration_seconds{method}`, `telegram_rate_limit_waits_total`, `telegram_429_total`.

---

## 19. Sessions

v1 hujjatida `packages/sessions` bor edi, lekin spetsifikatsiya yo‘q edi. To‘ldiriladi.

### 19.1 Model

```ts
ctx.session.cartItems ??= [];
ctx.session.cartItems.push(itemId);
// yozish avtomatik — pipeline oxirida, faqat o‘zgargan bo‘lsa
```

```ts
sessions: {
  enabled: true,
  key: "user-chat",        // user | chat | user-chat | custom fn
  store: "database",       // memory | database | redis | custom
  ttl: "30d",
  lazy: true,              // faqat ctx.session ga murojaat bo‘lsa yuklanadi
  maxBytes: 64 * 1024,
}
```

`lazy: true` muhim: sessiyaga tegmaydigan handler'lar uchun DB o‘qish bo‘lmaydi.

### 19.2 Konkurentlik

Sequencer per-chat tartibni ta'minlagani uchun odatda poyga bo‘lmaydi. Lekin `perChat > 1` yoki multi-instance degradatsiyasida — **optimistik qulflash**:

```sql
UPDATE telekit_sessions SET data=?, version=version+1, updated_at=?
WHERE key=? AND version=?
```

0 qator yangilansa → `TK2301 SessionConflictError` → pipeline update'ni **bir marta** qayta uradi, keyin xato.

### 19.3 O‘lcham va tozalash

- `maxBytes` oshsa → `TK2302 SessionTooLargeError` (jim kesish yo‘q).
- TTL tugagan sessiyalar scheduler job bilan o‘chiriladi (kuniga).
- `ctx.session.$clear()`, `ctx.session.$reload()` xizmat metodlari.

---

## 20. Xatolar va error handling

### 20.1 Ierarxiya

```text
TelekitError (code, retryable, context, cause)
├── ConfigurationError        TK10xx   startup'da to‘xtatadi
├── TelegramApiError          TK11xx   error_code, description, parameters
├── NetworkError              TK12xx
├── ValidationError           TK20xx
├── CallbackError             TK21xx
│   ├── CallbackSignatureError    TK2102
│   ├── CallbackExpiredError      TK2105
│   └── RouteNotFoundError        TK2103
├── ConversationError         TK22xx
├── SessionError              TK23xx
├── DatabaseError             TK30xx
├── QueueError                TK40xx
├── SubscriptionRequired      TK50xx   (boshqariladigan oqim, xato emas)
└── AdminError                TK60xx
```

To‘liq jadval — [Ilova B](#ilova-b--error-code-jadvali). Har kod hujjatda `telekit.dev/errors/TK2102` sahifasiga ega; xato xabarida shu URL chiqadi.

### 20.2 Error boundary

```ts
app.onError(async (error, ctx) => {
  ctx.log.error({ err: error, update_id: ctx.update.update_id });

  if (error instanceof TelegramApiError && error.errorCode === 403) {
    await users.markBlocked(ctx.from.id);
    return;   // foydalanuvchiga yozib bo‘lmaydi
  }

  await ctx.reply(ctx.t("errors.generic"));
});
```

Kafolatlar:
- Handler xatosi **hech qachon** processni yiqitmaydi.
- `onError` ning o‘zi xato bersa — `fatal` loglanadi, update tashlab yuboriladi.
- `unhandledRejection` / `uncaughtException` alohida: loglanadi, `shutdown.onUncaught` siyosati bo‘yicha (`"log"` | `"exit"`, default `"exit"` production'da — process supervisor qayta ko‘taradi).

### 20.3 Developer xatosi ko‘rinishi

Development'da terminalda:

```text
╭─ Telekit Error ──────────────────────────────────────────╮
│ TK3001  DatabaseUnavailableError                         │
├──────────────────────────────────────────────────────────┤
│ Update    19283921  (message:text)                       │
│ Route     /profile                                       │
│ Handler   app/commands/profile.ts:14                     │
│ User      1928391  (@xojisaid)                           │
│ Duration  31ms                                           │
├──────────────────────────────────────────────────────────┤
│ SQLITE_BUSY: database is locked                          │
│                                                          │
│   12 │ const user = await ctx.db                         │
│   13 │   .selectFrom("telekit_users")                    │
│ → 14 │   .where("id", "=", ctx.from.id)                  │
│   15 │   .executeTakeFirst();                            │
├──────────────────────────────────────────────────────────┤
│ https://telekit.dev/errors/TK3001                        │
╰──────────────────────────────────────────────────────────╯
```

Production'da — bir qatorli strukturali JSON, stack `error.stack` maydonida.

---

## 21. Logging

Strukturali JSON (`pino`). Development'da `pino-pretty`.

```json
{ "level":"info", "time":1758276000000, "event":"command.handled",
  "command":"start", "update_id":839281, "user_id":1928391,
  "chat_id":1928391, "duration_ms":12, "bot_id":7654321 }
```

### 21.1 Secret masking

Logger serializer **majburiy** quyidagilarni yashiradi:

```text
BOT_TOKEN, APP_KEY, APP_KEY_PREVIOUS, DATABASE_URL (parol qismi),
REDIS_URL (parol), BOT_WEBHOOK_SECRET, har qanday `*_SECRET`, `*_TOKEN`,
`*_PASSWORD`, `*_KEY`, HTTP `authorization` header, cookie
```

Ko‘rinish: `BOT_TOKEN=7654321:AAF*****` (bot id ochiq — debug uchun foydali, sir emas).

### 21.2 PII siyosati

```ts
logging: {
  level: "info",
  pii: "minimal",     // none | minimal | full
}
```

| Rejim | Nima loglanadi |
|---|---|
| `none` | faqat ID'lar hash qilingan holda |
| `minimal` (production default) | `user_id`, `chat_id` — ism, username, matn **yo‘q** |
| `full` (development default) | hammasi |

**DevTools va Update Inspector** ([§38](#38-devtools)) xom payload ko‘rsatadi — shuning uchun ular faqat development'da va `127.0.0.1` da. Production'dan olingan update'ni replay qilish uchun **eksport** vositasi bor va u sanitizatsiya profilini majburlaydi ([§38.4](#384-production-update-eksporti)).

### 21.3 Transportlar

`stdout` (default), fayl (rotatsiya bilan), va `logging.transport` orqali ixtiyoriy (Loki, Datadog, Sentry). Sentry uchun rasmiy adapter — `@telekit/adapter-sentry`.

---

## 22. Configuration

### 22.1 Ustunlik zanjiri

```text
1. CLI flag           --port 4000
2. process.env        APP_PORT=4000
3. .env.{APP_ENV}.local
4. .env.local
5. .env.{APP_ENV}
6. .env
7. telekit.config.ts
8. framework defaultlari
```

`.env*.local` — git'ga kirmaydi, `.gitignore` ga generator qo‘shadi.

### 22.2 Validatsiya

Env **startup'da**, schema bilan tekshiriladi. Xato — birinchi update emas, birinchi sekundda:

```text
✖ Environment validation failed

  BOT_TOKEN       majburiy, lekin berilmagan
                  → @BotFather dan oling va .env ga qo‘ying

  APP_KEY         noto‘g‘ri format (32 bayt base64 kutilgan, 18 bayt keldi)
                  → telekit key:generate

  DATABASE_URL    driver=postgres bo‘lganda majburiy

3 ta xato. Hujjat: https://telekit.dev/errors/TK1001
```

### 22.3 `telekit.config.ts` — to‘liq shakl

```ts
import { defineConfig, env } from "@telekit/core";

export default defineConfig({
  app: {
    name: env("APP_NAME", "MyBot"),
    env: env("APP_ENV", "development"),
    debug: env.bool("APP_DEBUG", false),
    key: env("APP_KEY"),
    url: env("PUBLIC_URL", null),
    port: env.int("APP_PORT", 3000),
    host: env("APP_HOST", "0.0.0.0"),
    timezone: env("APP_TIMEZONE", "Asia/Tashkent"),
  },

  bot: {
    token: env("BOT_TOKEN"),
    mode: env("BOT_MODE", "auto"),        // auto | polling | webhook
    polling: { timeout: 50, limit: 100, lock: true },
    webhook: {
      secretToken: env("BOT_WEBHOOK_SECRET", null),
      maxConnections: 40,
      ipAllowlist: true,
      responseMode: "immediate",
      persistIngress: false,
    },
  },

  telegram: {
    apiRoot: env("TELEGRAM_API_ROOT", "https://api.telegram.org"),
    timeout: 30_000,
    retry: { enabled: true, attempts: 5, baseDelay: 300, maxDelay: 30_000 },
    rateLimit: { global: 30, perChat: 1, store: "memory" },
    ignoreBenignErrors: true,
  },

  concurrency: { global: 100, perChat: 1, queueLimit: 1000 },
  dedup:       { enabled: true, store: "memory", ttl: "5m" },

  database: {
    driver: env("DATABASE_DRIVER", "sqlite"),   // sqlite | postgres | none
    url: env("DATABASE_URL", null),
    file: env("DATABASE_FILE", "storage/telekit.sqlite"),
    pool: { min: 2, max: 10 },
    migrations: { autoRunInProduction: false },
  },

  cache:    { driver: env("CACHE_DRIVER", "memory") },   // memory | redis
  redis:    { url: env("REDIS_URL", null) },

  sessions: { enabled: true, key: "user-chat", store: "database", ttl: "30d" },

  callbacks: {
    sign: true,
    sigBytes: 6,
    refStore: "database",
    refTtl: "7d",
    allowUnsignedInProduction: false,
  },

  conversations: { store: "database", ttl: "24h", maxSteps: 50 },

  locale: {
    default: env("APP_LOCALE", "uz"),
    fallback: env("APP_FALLBACK_LOCALE", "en"),
    supported: ["uz", "ru", "en"],
    strategy: ["user", "telegram", "project"],
    path: "resources/locales",
  },

  admin:     { enabled: true, path: "/admin", theme: { primary: "#10b981" } },
  devtools:  { enabled: env("APP_ENV") !== "production", port: 4545 },
  analytics: { enabled: true, flushInterval: "10s", rawRetention: "30d" },
  broadcast: { enabled: true, rate: 25, batchSize: 100 },
  subscriptions: { enabled: false },
  queue:     { driver: env("QUEUE_DRIVER", "database"), workers: 2 },
  scheduler: { enabled: true, timezone: env("APP_TIMEZONE", "Asia/Tashkent") },

  logging:   { level: env("LOG_LEVEL", "info"), pii: "minimal", pretty: false },

  shutdown:  { drainDelay: 5_000, timeout: 30_000, onUncaught: "exit" },
});
```

### 22.4 Type-safe env

```ts
env("BOT_TOKEN")                  // string, majburiy
env("APP_NAME", "MyBot")          // string, default bilan
env.int("APP_PORT", 3000)         // number
env.bool("APP_DEBUG", false)      // boolean
env.enum("BOT_MODE", ["auto","polling","webhook"], "auto")
env.url("PUBLIC_URL", null)       // URL validatsiyasi
```

To‘liq env ro‘yxati — [Ilova A](#ilova-a--environment-reference).

---

# QISM IV — DX MODULLARI

## 23. Callbacks

Wire format va xavfsizlik modeli — [ADR-003](#adr-003--callback-wire-format). Bu yerda public API.

### 23.1 E'lon

```ts
// app/callbacks/user.delete.ts
import { defineCallback, uint, bool } from "@telekit/callbacks";

export default defineCallback({
  name: "user.delete",
  scope: "user",
  schema: {
    userId: uint(),
    confirm: bool().default(false),
  },
  middleware: [adminOnly()],

  async handle(ctx, data) {
    //          ↑         ↑ { userId: number; confirm: boolean }
    if (!data.confirm) {
      return ctx.editText(ctx.t("user.confirm_delete"), {
        reply_markup: keyboard()
          .row(
            btn.callback(ctx.t("common.yes"), self({ userId: data.userId, confirm: true })),
            btn.callback(ctx.t("common.no"), closeMenu({})),
          ),
      });
    }
    await ctx.services.get(UserService).delete(data.userId);
    await ctx.answerCallback({ text: ctx.t("user.deleted") });
  },
});
```

`self` — shu callbackning o‘ziga havola (recursive tugmalar uchun), fayl ichida avtomatik mavjud.

### 23.2 Schema turlari

```ts
uint()            // 0 … 2^53-1      varint
int()             // manfiy ham      zigzag varint
bool()            // bitfield
enum(["a","b"])   // indeks
uuid()            // 16 bayt
str(max)          // ⚠ joy yeydi — linter ogohlantiradi
literal(42)       // 0 bayt — imzoga kiradi, payloadga emas

.optional()       // null-mask biti
.default(v)
```

### 23.3 Budjet nazorati

`telekit routes` va build har callback uchun hisobot beradi:

```text
CALLBACKS                        routeId   payload   budjet   holat
user.delete                      7Kd2         6 B     37 B    ✓
cart.add                         q9Zx        11 B     37 B    ✓
order.note   (str(120))          Lm4p       121 B     37 B    ⚠ overflow → ref store
```

Build'da `callbacks.failOnOverflow: true` (default `false`) bo‘lsa overflow build'ni yiqitadi.

### 23.4 Foydalanuvchi API'si

```ts
deleteUser({ userId: 12 })          // → CallbackData (tugmaga beriladi)
deleteUser.name                     // "user.delete"
deleteUser.routeId                  // "7Kd2"
deleteUser.encode({ userId: 12 })   // string — qo‘lda kerak bo‘lsa
deleteUser.decode(dataString)       // { userId: 12 } | throws
```

---

## 24. Keyboards

### 24.1 Builder

```ts
import { keyboard, btn } from "@telekit/core";

const kb = keyboard()
  .row(btn.callback(t("menu.profile"), profileCb({})))
  .row(
    btn.callback(t("menu.orders"), ordersCb({ page: 1 })),
    btn.callback(t("menu.settings"), settingsCb({})),
  )
  .row(btn.url(t("menu.site"), "https://example.com"))
  .row(btn.webApp(t("menu.shop"), "https://shop.example.com"));

await ctx.reply(t("menu.title"), { reply_markup: kb });
```

Tugma turlari: `callback`, `url`, `webApp`, `login`, `switchInline`, `switchInlineCurrent`, `copyText`, `pay`, `game`.

Reply keyboard: `replyKeyboard()` — `.contact()`, `.location()`, `.poll()`, `.requestUsers()`, `.requestChat()`, `.resize()`, `.oneTime()`, `.persistent()`, `.placeholder()`.

### 24.2 Avtomatik layout

```ts
keyboard().grid(items, { columns: 2, map: (x) => btn.callback(x.title, openCb({ id: x.id })) });
keyboard().auto(items, { maxWidth: 30 });   // matn uzunligiga qarab
```

### 24.3 Pagination — standart komponent

Bot ro‘yxatlari uchun v1'da yo‘q edi; qo‘shiladi.

```ts
const page = await orders.paginate({ page: data.page, perPage: 5 });

await ctx.editText(render(page.items), {
  reply_markup: paginator({
    page: page.current,
    total: page.pages,
    callback: (p) => ordersCb({ page: p }),
    labels: { prev: "‹", next: "›", counter: "{page}/{total}" },
  }),
});
```

Chiqish: `‹  2/7  ›` — bir qatorda, chekkalarda o‘chirilgan tugmalar `noop` callback bilan.

### 24.4 Semantik uslublar — v1 §19 tuzatildi

**Muhim tuzatish.** v1 hujjatida `primary / success / danger` "tugma ranglari" sifatida va'da qilingan. **Telegram Bot API inline tugmalar uchun rang yoki uslub maydonini bermaydi** (Bot API 9.x holatiga ko‘ra; implementatsiya paytida `core.telegram.org/bots/api` changelog bilan qayta tasdiqlanadi). Ya'ni v1'dagi "client qo‘llamasa default'ga qaytadi" amalda "har doim default" degani — API dekorativ bo‘lib qolardi.

Qayta ta'riflandi: uslub — **matn dekoratori**, ranglar emas, va bu hujjatda ochiq aytiladi.

```ts
// telekit.config.ts
keyboards: {
  decorators: {
    enabled: true,
    styles: {
      primary: { prefix: "▸ " },
      success: { prefix: "✅ " },
      danger:  { prefix: "🗑 " },
      warning: { prefix: "⚠️ " },
    },
  },
}
```

```ts
btn.callback(t("common.delete"), removeCb({ id }), { style: "danger" })
// → "🗑 O‘chirish"
```

`decorators.enabled: false` bo‘lsa prefikslar qo‘shilmaydi va kod o‘zgarishsiz ishlaydi. Bot API kelajakda haqiqiy uslub qo‘shsa, shu API o‘sha maydonga ulanadi — public API o‘zgarmaydi.

### 24.5 Visual Keyboard Builder

Admin paneldagi drag-and-drop muharrir ([§37](#37-admin-panel)) shu builder'ga kompilyatsiya qilinadigan JSON hosil qiladi:

```json
{ "version": 1, "rows": [
  [{ "type":"callback","textKey":"menu.products","callback":"catalog.open","payload":{"page":1},"style":"primary" }],
  [{ "type":"callback","textKey":"menu.profile","callback":"profile.open","payload":{} },
   { "type":"webApp","textKey":"menu.shop","url":"https://shop.example.com" }]
]}
```

Muharrir faqat **ro‘yxatdan o‘tgan** callback'larni taklif qiladi va payload maydonlarini schema'dan oladi — noto‘g‘ri payload yaratib bo‘lmaydi. Saqlashda payload validatsiya qilinadi va bayt budjeti tekshiriladi.

---

## 25. Conversations

Ijro modeli — [ADR-004](#adr-004--conversations-ijro-modeli). Bu yerda API va qo‘shimcha detallar.

### 25.1 To‘liq misol

```ts
// app/conversations/register.ts
export default defineConversation("register", async (flow, ctx) => {
  const name = await flow.text(ctx.t("register.ask_name"), {
    validate: (v) => v.trim().length >= 2 || ctx.t("errors.name_too_short"),
    retry: 3,
  });

  const phone = await flow.contact(ctx.t("register.ask_phone"), {
    keyboard: replyKeyboard().contact(ctx.t("register.share_phone")).oneTime(),
    ownContactOnly: true,
  });

  const age = await flow.number(ctx.t("register.ask_age"), { min: 14, max: 100 });

  const city = await flow.choice(ctx.t("register.ask_city"), CITIES, {
    columns: 2,
    label: (c) => c.name,
  });

  if (!(await flow.confirm(ctx.t("register.confirm", { name, phone, age })))) {
    return flow.restart();
  }

  await flow.external("create-user", () =>
    ctx.services.get(UserService).register({ name, phone, age, cityId: city.id })
  );

  await flow.reply(ctx.t("register.done"), { reply_markup: mainMenu() });
}, {
  cancelCommands: ["/cancel"],
  timeout: "30m",
  onTimeout: (flow) => flow.reply("register.timeout"),
  onCancel:  (flow) => flow.reply("register.cancelled"),
});
```

Kirish:

```ts
await ctx.enter("register");
await ctx.enter("register", { source: "start" });   // params flow.params da
```

### 25.2 Deklarativ qatlam

Chiziqli oqimlar va Visual Flow Builder uchun:

```ts
export default defineFlow("feedback", {
  start: "rating",
  steps: {
    rating: { ask: "feedback.rating", expect: choice([1,2,3,4,5]), next: "comment" },
    comment:{ ask: "feedback.comment", expect: "text", optional: true, next: "save" },
    save:   { run: "feedback.save", next: null },
  },
});
```

`run` — service container'dagi `FeedbackService.save` metodiga havola. Bu qatlam replay engine ustida quriladi, alohida runtime emas.

### 25.3 Concurrency va nested

- Bir foydalanuvchi bir chatda **bitta** faol conversation'ga ega. Ikkinchisiga kirish urinishi: `conversations.onConflict` — `"replace"` (default) | `"reject"` | `"stack"`.
- `flow.goto("other")` — joriysini tugatib boshqasiga o‘tish (stack emas).
- `"stack"` rejimi kichik stek (max 3) beradi; `flow.exit()` oldingisiga qaytaradi.

### 25.4 Conversation testlash

```ts
const flow = bot.conversation("register");
await flow.expectPrompt("register.ask_name");
await flow.send("Xojisaid");
await flow.sendContact("+998901234567");
await flow.send("25");
await flow.tapButton("Toshkent");
await flow.tapButton("common.yes");
expect(flow.finished).toBe(true);
expect(await db.users.count()).toBe(1);
```

---

## 26. Localization

### 26.1 Format

`resources/locales/<locale>/<namespace>.json`:

```json
// resources/locales/uz/bot.json
{
  "welcome": "Assalomu alaykum, {name}!",
  "orders": {
    "count": "{count, plural, one {# ta buyurtma} other {# ta buyurtma}}",
    "total": "Jami: {sum, number, ::currency/UZS}"
  }
}
```

```json
// resources/locales/ru/bot.json
{
  "welcome": "Здравствуйте, {name}!",
  "orders": {
    "count": "{count, plural, one {# заказ} few {# заказа} many {# заказов} other {# заказа}}"
  }
}
```

**ICU MessageFormat** — `@formatjs/intl-messageformat` ustida. Sabab: rus tilida 4 xil plural forma bor (`one/few/many/other`), o‘zbekchada 2 (`one/other`). Oddiy `{{count}}` interpolatsiyasi buni qoplay olmaydi — v1'dagi bo‘shliq.

Kirish: `ctx.t("bot.welcome", { name })`, namespace default `bot`.

### 26.2 Type-safe kalitlar

`telekit build` va `telekit dev` locale fayllaridan tur generatsiya qiladi:

```ts
// .telekit/locales.d.ts (avtomatik)
type LocaleKey = "bot.welcome" | "bot.orders.count" | ...;
```

Natijada `ctx.t("bot.welcom")` — kompilyatsiya xatosi. Parametrlar ham tekshiriladi: `{name}` talab qilinsa, `ctx.t("bot.welcome")` xato beradi.

### 26.3 Locale aniqlash

```ts
locale: { strategy: ["user", "telegram", "project"] }
```

Zanjir birinchi natija bergan joyda to‘xtaydi:

| Manba | Tavsif |
|---|---|
| `user` | `telekit_users.locale` — foydalanuvchi bot ichida tanlagan |
| `telegram` | `from.language_code` → `supported` bilan moslash (`ru-RU` → `ru`) |
| `project` | `locale.default` |
| `custom` | `(ctx) => string \| null` funksiyasi |

Fallback: kalit topilmasa `locale.fallback`; u yerda ham yo‘q bo‘lsa — development'da xato, production'da kalitning o‘zi qaytariladi + `warn`.

### 26.4 Til tanlash — tayyor komponent

```ts
// app/commands/lang.ts
export default defineCommand({
  name: "lang",
  handle: (ctx) => ctx.reply(ctx.t("lang.choose"), {
    reply_markup: localePicker(),      // framework beradi
  }),
});
```

Tanlov `telekit_users.locale` ga yoziladi va `setMyCommands` shu foydalanuvchi uchun qayta sinxronlanadi.

### 26.5 Xavfsizlik

`t()` natijasi `parse_mode: "HTML"` bilan yuborilgani uchun **interpolatsiya qiymatlari avtomatik escape qilinadi**:

```json
{ "welcome": "Salom, {name}!" }
```

`name = "<b>hack</b>"` → `Salom, &lt;b&gt;hack&lt;/b&gt;!`

HTML kerak bo‘lsa — aniq belgilanadi: `ctx.t("key", { link: raw('<a href="...">…</a>') })`.

### 26.6 Tarjima yetishmasligini aniqlash

```bash
telekit i18n:check
```

```text
ru/bot.json        3 ta kalit yetishmayapti
  orders.total
  errors.rate_limited
  register.timeout

en/bot.json        ✓
uz/bot.json        ✓  (reference)

1 ta ortiqcha kalit: ru/bot.json → legacy.old_message
```

CI'da `--strict` bilan build yiqiladi.

---

## 27. Media va fayllar

v1'da yo‘q edi — bot ilovalari uchun majburiy qism.

### 27.1 Yuborish

```ts
import { InputFile } from "@telekit/core";

await ctx.replyWithPhoto(InputFile.path("storage/img/promo.jpg"));
await ctx.replyWithDocument(InputFile.buffer(pdfBuffer, "hisobot.pdf"));
await ctx.replyWithVideo(InputFile.stream(readable, "clip.mp4"));
await ctx.replyWithPhoto("AgACAgIAAxkBAAI...");        // file_id — qayta yuborish
await ctx.replyWithPhoto(InputFile.url("https://…"));   // Telegram o‘zi yuklaydi

await ctx.replyWithMediaGroup([
  { type: "photo", media: InputFile.path("a.jpg"), caption: "Birinchi" },
  { type: "photo", media: InputFile.path("b.jpg") },
]);
```

Multipart yuklash streaming — fayl xotiraga to‘liq o‘qilmaydi.

### 27.2 Yuklab olish

```ts
const file = await ctx.download(ctx.message.photo.at(-1).file_id);
file.path;                       // vaqtinchalik fayl
await file.saveTo("storage/uploads/x.jpg");
await file.buffer();
file.stream();
await file.dispose();            // yoki avtomatik — pipeline oxirida
```

### 27.3 Limitlar va validatsiya

Bot API limitlari majburlanadi va tushunarli xato beriladi:

| Amal | Limit | Xato |
|---|---|---|
| `getFile` yuklab olish | 20 MB | `TK1105 FileTooLargeError` |
| Fayl yuborish | 50 MB | `TK1106` |
| Foto yuborish | 10 MB | `TK1107` |
| Caption | 1024 belgi | `TK2005` |
| Matn | 4096 belgi | `TK2004` |

**Uzun matn:** `ctx.reply(longText, { split: true })` — matnni 4096 chegarasida so‘z/qator bo‘yicha bo‘lib, ketma-ket yuboradi. Default `false` (jim xulq-atvor yo‘q).

### 27.4 Kiruvchi fayl validatsiyasi

```ts
const doc = await flow.document(ctx.t("ask.file"), {
  maxSize: "5MB",
  mimeTypes: ["application/pdf", "image/*"],
  onInvalid: (ctx, reason) => ctx.reply(ctx.t(`errors.file.${reason}`)),
});
```

`mime_type` Telegram'dan keladi va **ishonchsiz** — haqiqiy tur kerak bo‘lsa magic-byte tekshiruvi tavsiya etiladi (hujjatda ko‘rsatiladi, core bajarmaydi).

---

## 28. Testing

### 28.1 Prinsip

Testda **hech qanday tarmoq chaqiruvi bo‘lmaydi**. Telegram API to‘liq mock qilinadi; DB — in-memory SQLite (har test uchun yangi).

### 28.2 Asosiy API

```ts
import { createTestBot } from "@telekit/testing";

const bot = await createTestBot({
  locale: "uz",
  user: { id: 1, first_name: "Test", username: "tester" },
  database: "memory",
});

afterEach(() => bot.reset());
```

```ts
test("/start yangi foydalanuvchini saqlaydi", async () => {
  // Arrange — bot tayyor

  // Act
  const res = await bot.command("start");

  // Assert
  expect(res.replies).toHaveLength(1);
  expect(res.replies[0].text).toContain("Assalomu alaykum");
  expect(await bot.db.users.count()).toBe(1);
});
```

### 28.3 To‘liq sirt

```ts
// Kirish
bot.command("start", { args: "123" })
bot.message("Salom")
bot.photo(InputFile.path("fixtures/a.jpg"))
bot.contact({ phone_number: "+998901234567" })
bot.location({ latitude: 41.3, longitude: 69.2 })
bot.callback(deleteUser, { userId: 12 })     // typed — schema tekshiriladi
bot.callbackRaw("user.delete.7Kd2...")
bot.inlineQuery("qidiruv")
bot.chatMember({ old_chat_member, new_chat_member })
bot.as({ id: 2, first_name: "Boshqa" }).message("...")   // boshqa foydalanuvchi
bot.inChat({ id: -100123, type: "supergroup" }).message("...")

// Natija
res.replies            // yuborilgan xabarlar
res.edits              // tahrirlar
res.deletes
res.apiCalls           // barcha API chaqiruvlar (method, payload)
res.answeredCallback
res.error              // handler xatosi (bo‘lsa)
res.duration

// Assertions
expect(res).toHaveReplied();
expect(res).toHaveRepliedWith(/Assalomu/);
expect(res).toHaveRepliedWithKey("bot.start");   // locale kalit bo‘yicha
expect(res).toHaveButton("Profil");
expect(res).toHaveCalledApi("sendPhoto");
expect(res).toHaveAnsweredCallback();
```

`toHaveRepliedWithKey` — locale kalit bo‘yicha tekshirish testlarni tarjima o‘zgarishlariga bog‘liq bo‘lmagan holga keltiradi.

### 28.4 Telegram xatolarini simulyatsiya qilish

```ts
bot.api.mock("sendMessage", { error: { error_code: 403, description: "bot was blocked by the user" } });
const res = await bot.command("start");
expect(await bot.db.users.findById(1)).toMatchObject({ status: "blocked" });

bot.api.mock("sendMessage", { error: { error_code: 429, parameters: { retry_after: 3 } } });
expect(res.apiCalls.filter(c => c.method === "sendMessage")).toHaveLength(2);  // retry
```

Vaqt nazorati: `bot.clock.advance("5m")` — timeout, TTL va scheduler testlari uchun.

### 28.5 Test turlari va qamrov

| Tur | Nimani qoplaydi | Vosita |
|---|---|---|
| Unit | encoder'lar, validatorlar, utillar | Vitest |
| Integration | handler + DB + locale | `createTestBot` |
| Conversation | to‘liq dialog oqimi | `bot.conversation()` |
| Admin API | HTTP endpointlar | Supertest + Hono |
| E2E | real Telegram test boti | `e2e/` — faqat CI, alohida token |
| Bundle/perf | hajm, cold start, throughput | `benchmarks/` |

Qamrov maqsadi: `packages/core` ≥ 85 %, boshqa paketlar ≥ 80 %. CI'da majburlanadi.

---

## 29. CLI

### 29.1 Buyruqlar

```text
LOYIHA
  telekit new <name>              interaktiv generator
  telekit dev                     dev server (HMR, DevTools)
  telekit build                   production build
  telekit start                   production ishga tushirish

GENERATORLAR
  telekit make:command <name>     (alias: g command)
  telekit make:callback <name>
  telekit make:event <type>
  telekit make:conversation <name>
  telekit make:middleware <name>
  telekit make:service <name>
  telekit make:module <name>
  telekit make:migration <name>

BAZA
  telekit migrate                 telekit migrate:status
  telekit migrate:rollback        telekit seed

DIAGNOSTIKA
  telekit doctor                  to‘liq tekshiruv
  telekit routes                  route + callback budjet jadvali
  telekit inspect <update.json>   update qaysi handler'ga tushishini ko‘rsatadi
  telekit i18n:check              tarjima to‘liqligi

MODULLAR
  telekit add <module>            telekit remove <module>

BOSHQARUV
  telekit admin:create            telekit key:generate
  telekit webhook:set             telekit webhook:delete   telekit webhook:info

TEST
  telekit test                    telekit test --coverage
```

### 29.2 Installer

Birinchi savol — til:

```text
╭──────────────────────────────────────╮
│               TELEKIT                │
│     Telegram Application Framework   │
╰──────────────────────────────────────╯

Choose your language · Tilni tanlang · Выберите язык

❯ 🇺🇿 O‘zbekcha
  🇷🇺 Русский
  🇬🇧 English
```

Tanlangan til: CLI tili, bot default locale, admin panel default tili, validatsiya xabarlari, starter kontenti, README tili, buyruq tavsiflari.

Keyingi savollar (o‘zbekcha):

```text
Loyiha nomi ............... my-bot
Loyiha turi ............... ❯ Standard · Minimal · Bot + API · Mini App
Admin panel ............... ❯ Ha · Yo‘q
Ma'lumotlar bazasi ........ ❯ SQLite · PostgreSQL · Yo‘q
Bot rejimi ................ ❯ Avtomatik · Polling · Webhook
DevTools .................. ❯ Ha · Yo‘q
Bot tillari ............... ❯ uz · uz+ru · uz+ru+en
Docker .................... ❯ Yo‘q · Ha
Git repozitoriy ........... ❯ Ha · Yo‘q
Paket menejeri ............ ❯ pnpm · npm · bun · yarn
```

Generator ishlari:
1. Template nusxalash + o‘zgaruvchilarni almashtirish
2. `APP_KEY` generatsiya (`.env`)
3. `.env.example` (sirlar bo‘sh)
4. `.gitignore` (`.env`, `.env*.local`, `storage/`, `dist/`, `.telekit/`)
5. Dependency o‘rnatish
6. `git init` + birinchi commit
7. Migration ishga tushirish (SQLite tanlansa)

```text
✓ Loyiha tayyor: my-bot

  cd my-bot
  .env ichiga BOT_TOKEN ni qo‘ying   (@BotFather)
  pnpm dev

  Hujjat: https://telekit.dev/uz
```

**Token installerda so‘ralmaydi** — sirni interaktiv promptdan olish uni shell history va CI loglariga tushirish xavfini tug‘diradi.

### 29.3 `telekit dev` chiqishi

```text
╭────────────────────────────────────────────────╮
│                   TELEKIT  0.5.0               │
├────────────────────────────────────────────────┤
│ Bot        @my_test_bot  (7654321)             │
│ Runtime    Node.js 22.11.0                     │
│ Mode       Polling                             │
│ Locale     uz  (fallback: en)                  │
│ Database   SQLite · storage/telekit.sqlite     │
│ Routes     2 commands · 1 callback · 3 events  │
├────────────────────────────────────────────────┤
│ App        http://localhost:3000               │
│ Admin      http://localhost:3000/admin         │
│ DevTools   http://localhost:4545               │
╰────────────────────────────────────────────────╯

✓ Telegram aloqasi           142ms
✓ Migratsiyalar              3/3
✓ Route manifest             6 ta
✓ Callback imzolari          yoqilgan
✓ Admin panel                1 ta administrator
✓ DevTools

Bot tayyor · o‘zgarishlar kuzatilmoqda
```

### 29.4 `telekit doctor`

```text
MUHIT
  ✓ Node.js 22.13.0                    (talab: ≥22.13)
  ✓ Paket menejeri  pnpm 9.12.0
  ✓ Disk bo‘sh joyi  18 GB

KONFIGURATSIYA
  ✓ .env mavjud
  ✓ BOT_TOKEN format to‘g‘ri
  ✓ APP_KEY 32 bayt
  ⚠ PUBLIC_URL o‘rnatilmagan — production'da polling ishlatiladi

TELEGRAM
  ✓ getMe  @my_test_bot                184ms
  ✓ Webhook holati  o‘rnatilmagan (polling rejimi bilan mos)
  ℹ Kutayotgan update: 0

BAZA
  ✓ SQLite ulanish                     3ms
  ✓ Migratsiyalar  3/3 qo‘llangan
  ✓ Yozish huquqi  storage/

MODULLAR
  ✓ Admin panel   1 ta administrator
  ✓ Scheduler     2 ta vazifa
  ⚠ Queue         driver=database — yuqori yuklama uchun Redis tavsiya etiladi
  ✗ Redis         REDIS_URL o‘rnatilgan, lekin ulanib bo‘lmadi
                  → ECONNREFUSED 127.0.0.1:6379

XAVFSIZLIK
  ✓ Callback imzolash yoqilgan
  ✓ Sirlar loglarda maskalanadi
  ⚠ Admin paroli oxirgi marta 180 kun oldin o‘zgartirilgan

1 ta xato, 3 ta ogohlantirish.
```

Chiqish kodi: xato bo‘lsa `1` — CI'da ishlatish uchun.

---

# QISM V — APPLICATION MODULLARI

## 30. Data model

To‘liq DDL — [Ilova C](#ilova-c--database-sxemasi). Bu yerda mantiq.

### 30.1 Foydalanuvchilar

`telekit_users` — Telegram foydalanuvchisi + Telekit metadata. Upsert `020.userUpsert` middleware'ida.

**Yozish optimizatsiyasi muhim.** Har update'da `UPDATE` qilish SQLite'da eng katta yuklamani beradi. Strategiya:

```text
Birinchi ko‘rish        → INSERT
Keyingi ko‘rishlar      → faqat quyidagilar o‘zgarsa UPDATE:
                          first_name, last_name, username, language_code,
                          is_premium, status
last_seen_at            → buferlanadi, 60 sekundda bir marta batch UPDATE
                          (users.lastSeenFlushInterval)
```

Natija: faol botda yozish soni ~50× kamayadi.

```ts
interface TelekitUser {
  id: number;                    // telegram user id
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  locale: string | null;         // bot ichida tanlangan
  isPremium: boolean;
  isBot: boolean;
  status: "active" | "blocked" | "deleted" | "banned";
  source: string | null;         // deep-link start parametri
  joinedAt: Date;
  lastSeenAt: Date;
  messagesCount: number;
  commandsCount: number;
  attributes: Record<string, unknown>;   // custom fieldlar
  bannedAt: Date | null;
  bannedReason: string | null;
}
```

`status`:
- `blocked` — foydalanuvchi botni bloklagan (`403` dan aniqlanadi)
- `banned` — admin bloklagan
- `deleted` — Telegram akkaunti o‘chirilgan

### 30.2 Custom atributlar

v1 §33 "developer custom field qo‘shadi" degan edi; mexanizm:

```ts
// app/user-attributes.ts
export default defineUserAttributes({
  city:     attr.string({ label: { uz: "Shahar", ru: "Город" }, filterable: true }),
  plan:     attr.enum(["free", "pro"], { default: "free", filterable: true }),
  balance:  attr.number({ default: 0, format: "currency" }),
  verified: attr.boolean({ default: false, filterable: true }),
});
```

- `attributes` JSON ustunida saqlanadi.
- `filterable: true` bo‘lgan maydonlar uchun migration generator **generated column + indeks** yaratadi (SQLite `GENERATED ALWAYS AS`, Postgres `jsonb` + expression index) — admin paneldagi filtrlar sekin bo‘lmasligi uchun.
- Admin panel bu ta'rifdan avtomatik ustun, filtr va tahrir formasini quradi.
- Type kengaytmasi avtomatik: `ctx.user.city` — `string`.

```ts
await ctx.user.set({ city: "Toshkent" });
await ctx.user.increment("balance", 5000);
```

### 30.3 Segmentlar

Broadcast va analitika uchun qayta ishlatiladigan filtr:

```ts
defineSegment("aktiv-uz", {
  label: { uz: "Faol o‘zbek tilidagilar" },
  filter: (q) => q
    .where("status", "=", "active")
    .where("locale", "=", "uz")
    .where("last_seen_at", ">", daysAgo(7)),
});
```

Admin panelda vizual konstruktor ham shu segment obyektini hosil qiladi.

---

## 31. Analytics

### 31.1 Muammo — v1'dagi bo‘shliq

v1 "analytics Telekit bazasida saqlanadi" degan. 50k foydalanuvchili bot kuniga ~2M event beradi. Xom event'larni SQLite'ga to‘g‘ridan-to‘g‘ri yozish: yozish qulfi, disk o‘sishi (~200 MB/kun), `COUNT(DISTINCT)` so‘rovlari sekundlarga cho‘ziladi.

### 31.2 Yechim — uch qatlamli

```text
┌─ 1. Xotira buferi ──────────────────────────────┐
│  Event'lar 10 sekund buferlanadi, agregatlanadi │
│  flushInterval: "10s" · maxBuffer: 5000         │
└────────────────┬────────────────────────────────┘
                 ↓  batch INSERT
┌─ 2. Xom qatlam ─────────────────────────────────┐
│  telekit_events — kunlik partitsiya             │
│  retention: 30 kun (rawRetention)               │
│  Faqat drill-down va debug uchun                │
└────────────────┬────────────────────────────────┘
                 ↓  soatlik rollup job
┌─ 3. Agregat qatlam ─────────────────────────────┐
│  telekit_daily_stats   (metric, dim, value)     │
│  telekit_user_days     (user_id, day) — DAU/MAU │
│  telekit_cohorts       (cohort_day, day_n, n)   │
│  Abadiy saqlanadi — kichik                      │
└─────────────────────────────────────────────────┘
```

`telekit_user_days` — `PRIMARY KEY (user_id, day)`. DAU = bir kunlik qatorlar soni. MAU = 30 kunlik `COUNT(DISTINCT user_id)`. 100k foydalanuvchi × 365 kun ≈ 36M qator eng yomon holatda; amalda faol foydalanuvchilar ulushi 5–15 % → ~3M qator, SQLite uchun ham qabul qilinadigan. Bufer shu jadvalga kuniga bir marta yozadi (xotirada `Set<userId>` saqlanadi).

### 31.3 Metrikalar

```text
Auditoriya     DAU · WAU · MAU · yangi foydalanuvchilar · o‘sish
Retention      D1 · D7 · D30 · kohorta jadvali
Faollik        xabarlar · buyruqlar · callbacklar (soatlik taqsimot)
Buyruqlar      top buyruqlar · xatolar ulushi · o‘rtacha davomiylik
Yo‘qotish      bloklaganlar · kunlik churn
Segmentatsiya  til · manba (deep-link) · custom atributlar
Konversiya     voronka (§31.5)
```

### 31.4 Custom eventlar

```ts
await ctx.track("order.created", { amount: 120000, currency: "UZS", items: 3 });
await ctx.trackOnce("onboarding.completed");    // foydalanuvchi uchun bir marta
```

### 31.5 Voronka

```ts
defineFunnel("registration", {
  steps: ["start", "phone_shared", "profile_completed", "first_order"],
  window: "7d",
});
```

Admin panel bosqichma-bosqich o‘tish foizini ko‘rsatadi.

### 31.6 Kafolatlar

- Analitika **hech qachon** handler'ni bloklamaydi — yozish asinxron, xato bo‘lsa loglanadi va tashlanadi.
- Shutdown'da bufer flush qilinadi ([§13.3](#133-graceful-shutdown), 7-qadam).
- `analytics.enabled: false` — barcha `track` chaqiruvlari no-op, xarajat nol.
- Tashqi tizimga eksport: `analytics.sink` (PostHog, Mixpanel, ClickHouse) — ixtiyoriy adapter.

---

## 32. Broadcast

### 32.1 Real o‘tkazuvchanlik — v1'dagi bo‘shliq

Telegram bot uchun global limit **~30 xabar/sekund**. Demak:

```text
   1 000 foydalanuvchi  →  ~40 sekund
  10 000                →  ~7 daqiqa
 100 000                →  ~1 soat 7 daqiqa
 500 000                →  ~5 soat 35 daqiqa
1 000 000               →  ~11 soat
```

Bu **platforma cheklovi**, optimizatsiya bilan chetlab o‘tilmaydi. Shuning uchun:
- Admin panelda progress emas, **ETA** ko‘rsatiladi.
- Default tezlik `broadcast.rate: 25` (30 emas) — boshqa bot trafiki uchun zaxira qoldiriladi.
- Broadcast paytida oddiy handler'lar ustuvorlikka ega: rate limiter'da broadcast `priority: "low"`.

### 32.2 Oqim

```text
Yaratish → Preview → Test yuborish → Rejalashtirish/Boshlash
    → Queue'ga target'lar yoziladi (batch 100 ta)
    → Worker'lar rate limiter ostida yuboradi
    → Har natija yoziladi
    → Tugash + hisobot
```

`telekit_broadcast_targets` jadvali: har foydalanuvchi uchun bitta qator (`pending` → `sent` | `failed` | `blocked` | `skipped`). Bu **qayta boshlash** va **aniq hisobot** imkonini beradi; xotiradagi ro‘yxat bilan restart'da hamma narsa yo‘qolardi.

### 32.3 Holatlar

```text
draft → scheduled → running ⇄ paused → completed
                       ↓
                  cancelled / failed
```

Progress:

```text
Broadcast #293 · running

████████████░░░░░░░░  71%

Yuborildi     91 204
Bloklangan       941
Xato           1 201
Qoldi         35 196

Tezlik        24.7 msg/s
ETA           23 daqiqa  (18:42 gacha)
```

### 32.4 Xatolarni boshqarish

| Telegram javobi | Harakat |
|---|---|
| `403 bot was blocked by the user` | target `blocked`, user `status=blocked`, retry yo‘q |
| `400 chat not found` | target `failed`, user `status=deleted` |
| `403 user is deactivated` | target `failed`, user `status=deleted` |
| `429 retry_after=N` | butun worker N sekund pauza, target `pending` qoladi |
| `5xx` / tarmoq | 3 marta retry, keyin `failed` |

`failed` target'lar uchun `Qayta urinish` tugmasi — faqat `failed` larni qayta navbatga qo‘yadi.

### 32.5 Kontent va targeting

Kontent: text, photo, video, audio, document, animation, media group, `copyMessage`, `forwardMessage`. Keyboard qo‘shish mumkin (Visual Builder orqali ham).

Targeting:
```text
Barcha faol foydalanuvchilar
Til bo‘yicha
Ro‘yxatdan o‘tgan sana oralig‘i
Oxirgi faollik bo‘yicha
Segment (§30.3)
Custom atribut filtri
ID ro‘yxati (CSV yuklash)
```

Target tanlangach **oldindan hisob** ko‘rsatiladi: `Qamrov: 127 341 foydalanuvchi · ETA ~1 soat 25 daqiqa`.

### 32.6 Test yuborish

`Test yuborish` — xabarni adminning o‘z Telegram akkauntiga yuboradi (admin profiliga bog‘langan `telegram_id` orqali). Haqiqiy yuborishdan oldin majburiy qadam sifatida sozlash mumkin: `broadcast.requireTestSend: true`.

### 32.7 Rejalashtirilgan broadcast

```text
Sana      21-sentabr 2026
Vaqt      18:00
Mintaqa   Asia/Tashkent
```

Scheduler ([§35](#35-queue-va-scheduler)) ishga tushiradi. Yuborishdan oldin target ro‘yxati **qayta hisoblanadi** (segment dinamik).

---

## 33. Subscription gate

### 33.1 Sozlash

Admin panelda yoki kodda:

```ts
subscriptions: {
  enabled: true,
  mode: "block",            // block | soft (eslatma, lekin o‘tkazadi)
  checkInterval: "1h",      // natija kesh muddati
  exemptCommands: ["/start", "/help", "/lang"],
  exemptUsers: (ctx) => ctx.user.isAdmin,
}
```

Kanal yozuvi: `username | chat_id`, `title`, `join_url` (private kanal uchun invite link), `button_title` (locale bo‘yicha), `enabled`, `order`.

### 33.2 Tekshirish

`getChatMember(channelId, userId)` → `member | administrator | creator | restricted(is_member=true)` bo‘lsa obuna hisoblanadi.

**Kesh majburiy:** tekshiruvsiz har update'da N ta API chaqiruvi bo‘lardi (N = kanallar soni) — bu rate limitni yeb qo‘yadi. Natija `checkInterval` davomida keshlanadi (`telekit_subscription_cache` yoki Redis). Foydalanuvchi "Tekshirish" tugmasini bosganda kesh **chetlab o‘tiladi**.

### 33.3 Admin panelda diagnostika

Har kanal uchun avtomatik tekshiruv:

```text
@mychannel
  ✅ Bot kanalga qo‘shilgan
  ✅ Administrator huquqi bor
  ✅ Obunani tekshirish ishlaydi   (sinov: 142ms)

@otherchannel
  ✅ Bot kanalga qo‘shilgan
  ❌ Administrator emas
     → Obunani tekshirib bo‘lmaydi. Botni kanalga admin qiling.
```

Bu tekshiruv sozlash paytida ham, `telekit doctor` da ham ishlaydi.

### 33.4 Foydalanuvchi tajribasi

```text
Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:

[ 📢 Yangiliklar kanali ]
[ 📢 E'lonlar ]

[ ✅ Tekshirish ]
```

Tekshirish muvaffaqiyatli bo‘lsa — **to‘xtatilgan update qayta ijro etiladi**, foydalanuvchi buyruqni qaytadan yozmaydi. To‘xtatilgan update `telekit_sessions` da vaqtincha saqlanadi (TTL 10 daqiqa).

---

## 34. Content Manager

### 34.1 Precedence — v1'dagi ziddiyat yopildi

v1'da admin paneldagi matnlar va `resources/locales/*.json` fayllari orasida ustunlik aniqlanmagan edi. Qoida:

```text
1. DB override  (telekit_content, faol versiya)
2. Locale fayl  (resources/locales/<locale>/…)
3. Fallback locale fayl
4. Kalitning o‘zi + warn
```

Ammo **jim yutilish bo‘lmaydi**: agar locale faylda kalit o‘zgargan bo‘lsa-yu, DB override mavjud bo‘lsa, admin panelda ochiq belgi chiqadi:

```text
⚠ bot.start — bu matn admin paneldan o‘zgartirilgan.
  Kodda yangi versiya bor (deploy 2026-09-19).

  [ Kod versiyasiga qaytish ]   [ Farqni ko‘rish ]   [ O‘z versiyamni qoldirish ]
```

Taqqoslash `source_hash` orqali: override yaratilganda asl fayl qiymatining hash'i saqlanadi; deploy'dan keyin hash mos kelmasa — drift aniqlanadi.

### 34.2 Versiyalash

Har tahrir `telekit_content_versions` ga yoziladi: kim, qachon, eski qiymat, yangi qiymat. `Qaytarish` bir bosishda.

### 34.3 Kesh va multi-instance

- Kontent xotirada keshlanadi (`content.cacheTtl`, default 60 s).
- Tahrirlanganda barcha instance'larga invalidatsiya signali: Redis pub/sub (`tk:content:invalidate`) yoki `updated_at` polling (Redis yo‘q bo‘lsa).

### 34.4 Tahrirlanadigan kontent

```ts
defineContent({
  "bot.start":        { label: { uz: "/start xabari" }, type: "message" },
  "bot.help":         { label: { uz: "/help xabari" }, type: "message" },
  "subscription.required": { type: "message" },
  "errors.generic":   { type: "text" },
  "maintenance":      { type: "message" },
});
```

`type: "message"` — matn + ixtiyoriy media + keyboard. `type: "text"` — faqat matn.

O‘zgaruvchilar ([ADR-002](#adr-002--context-shakli) sintaksisi):

```text
{first_name} {last_name} {username} {user_id} {bot_name} {chat_id}
```

Custom o‘zgaruvchi:

```ts
defineContentVariable("balance", (ctx) => formatMoney(ctx.user.balance));
```

Muharrirda o‘zgaruvchilar ro‘yxati va **jonli preview** (test foydalanuvchi ma'lumotlari bilan) ko‘rsatiladi. Saqlashdan oldin HTML validatsiya qilinadi (Telegram qo‘llab-quvvatlaydigan teglar ro‘yxati bo‘yicha).

---

## 35. Queue va Scheduler

### 35.1 Queue

```ts
queue: {
  driver: "database",      // memory | database | redis
  workers: 2,
  pollInterval: 1000,      // database driver uchun
  maxAttempts: 3,
  backoff: "exponential",
}
```

| Driver | Qachon | Cheklov |
|---|---|---|
| `memory` | test, oddiy dev | restart'da yo‘qoladi |
| `database` | default, o‘rta yuklama | polling, ~100 job/s |
| `redis` | yuqori yuklama, multi-instance | Redis talab qiladi |

Job e'loni:

```ts
export const SendReceipt = defineJob("receipt.send", {
  schema: { orderId: uint() },
  maxAttempts: 5,
  timeout: "2m",
  async handle({ orderId }, ctx) { ... },
});

await SendReceipt.dispatch({ orderId: 42 });
await SendReceipt.dispatch({ orderId: 42 }, { delay: "10m", priority: 5 });
```

`database` driver'da job olish `SELECT … FOR UPDATE SKIP LOCKED` (Postgres) yoki `BEGIN IMMEDIATE` + `UPDATE … RETURNING` (SQLite) bilan — ikki worker bir job'ni olmasligi kafolatlanadi.

Muvaffaqiyatsiz job'lar `telekit_failed_jobs` ga ko‘chiriladi; admin panelda ko‘rish va qayta urinish mumkin.

### 35.2 Scheduler

```ts
// app/schedules/daily-report.ts
export default defineSchedule({
  name: "daily-report",
  cron: "0 9 * * *",
  timezone: "Asia/Tashkent",
  overlap: false,            // oldingisi tugamagan bo‘lsa o‘tkazib yuborish
  async handle(ctx) { ... },
});
```

**Multi-instance:** har vazifa bajarilishidan oldin distributed lock olinadi (`telekit_locks` yoki Redis) — vazifa N martalab ishlamasligi uchun. Lock nomi: `schedule:<name>:<scheduledAt>`.

**DST va timezone:** cron hisoblash `Intl.DateTimeFormat` + IANA mintaqa bilan. DST o‘tishida takrorlanadigan soat uchun `scheduledAt` unikal kaliti takrorlanishni oldini oladi.

Admin panelda: vazifalar ro‘yxati, oxirgi ishga tushish, davomiylik, keyingi vaqt, qo‘lda ishga tushirish.

---

## 36. Health monitoring

### 36.1 Endpointlar

| Endpoint | Maqsad | Auth |
|---|---|---|
| `GET /health/live` | process tirikmi — hech narsa tekshirmaydi | yo‘q |
| `GET /health/ready` | trafik qabul qila oladimi — DB + Telegram | yo‘q |
| `GET /health` | to‘liq hisobot | `HEALTH_TOKEN` yoki admin sessiya |

`live` va `ready` farqi muhim: k8s `livenessProbe` DB tushganda podni qayta ko‘tarmasligi kerak, `readinessProbe` esa trafikni to‘xtatishi kerak.

```json
// GET /health
{
  "status": "degraded",
  "uptime_s": 84213,
  "version": "1.0.2",
  "checks": {
    "telegram":  { "status": "healthy",  "latency_ms": 142 },
    "database":  { "status": "healthy",  "latency_ms": 3, "pool": { "used": 2, "max": 10 } },
    "redis":     { "status": "healthy",  "latency_ms": 1 },
    "queue":     { "status": "degraded", "pending": 12043, "oldest_s": 340 },
    "webhook":   { "status": "healthy",  "pending_updates": 0, "last_error": null },
    "storage":   { "status": "healthy",  "free_mb": 18420 },
    "scheduler": { "status": "healthy",  "last_run": "2026-09-19T09:00:00Z" }
  }
}
```

### 36.2 Ogohlantirish qoidalari

| Tekshiruv | `degraded` | `unhealthy` |
|---|---|---|
| Telegram latency | > 2 s | 3 ketma-ket xato |
| DB latency | > 500 ms | ulanib bo‘lmadi |
| Queue kutayotgan | > 1000 yoki eng eskisi > 5 min | worker yo‘q |
| Webhook `pending_updates` | > 100 | > 1000 yoki `last_error` bor |
| Disk | < 1 GB | < 100 MB |

`health.alerts` orqali admin Telegram'iga xabar yuborish yoki webhook chaqirish sozlanadi.

---

## 37. Admin Panel

### 37.1 Texnologiya

Frontend: **Vue 3 + TypeScript + Vite**, statik build sifatida `@telekit/admin` paketida keladi. Backend: Hono router, `@telekit/core` ichida mount qilinadi. Alohida deploy talab qilinmaydi.

State: Pinia. Router: Vue Router (hash emas, history — `/admin/*` rewrite serverda). UI: o‘z komponentlar to‘plami (tashqi UI kit yo‘q — bundle va brendlash nazorati uchun).

**Lazy yuklash:** `admin.enabled: false` bo‘lsa `@telekit/admin` umuman `import()` qilinmaydi — [§39](#39-performance-budgeti) budjeti shunga tayanadi.

### 37.2 Modullar

```text
Dashboard            Broadcast            Logs
Users                Required Channels    System Health
User detail          Content              Administrators
Segments             Commands             Settings
Analytics            Keyboard Builder     Audit Log
                     Conversations
                     Scheduler / Queue
```

Modul mavjudligi o‘rnatilgan paketlarga bog‘liq: `@telekit/broadcast` yo‘q bo‘lsa, Broadcast bo‘limi navigatsiyada ko‘rinmaydi.

### 37.3 Autentifikatsiya

**Parol hash:** Argon2id, OWASP tavsiyasi bo‘yicha `m=19456 KiB, t=2, p=1`. (bcrypt emas — uzun parollarda 72-bayt kesilishi va GPU qarshiligi pastroq.)

Birinchi admin:

```bash
telekit admin:create
```

yoki `telekit dev` birinchi ishga tushishda:

```text
Admin Panel:  http://localhost:3000/admin

Administrator topilmadi. Hozir yaratilsinmi?
❯ Ha
  Yo‘q

Ism:     
Email:   
Parol:   (ko‘rsatilmaydi, ≥12 belgi, zaiflik tekshiriladi)
```

Credential hech qachon repozitoriyga yozilmaydi, `.env` ga ham yozilmaydi — faqat DB.

**Telegram orqali kirish** (ixtiyoriy, tavsiya etiladi): admin profiliga `telegram_id` bog‘lanadi, kirish bir martalik kod bot orqali yuboriladi. Parolsiz oqim.

### 37.4 Sessiya xavfsizligi

```text
Cookie          __Host-telekit_admin
                HttpOnly · Secure · SameSite=Lax · Path=/
Sessiya         serverda (telekit_admin_sessions), ID 256 bit
Rotatsiya       login'da va huquq o‘zgarganda yangi ID
Muddat          absolut 12 soat · harakatsizlik 60 daqiqa
CSRF            double-submit token (mutatsiya so‘rovlarida majburiy)
Throttling      5 urinish / 15 daqiqa  (IP + akkaunt bo‘yicha alohida)
2FA             TOTP, ixtiyoriy; owner uchun majburiy qilinishi mumkin
Production      HTTPS majburiy — HTTP so‘rov 421 bilan rad etiladi
```

### 37.5 Rollar va huquqlar

```text
Owner           barcha huquqlar + admins.manage + settings.update
Administrator   owner'dan tashqari deyarli hammasi
Editor          content.*, commands.*, keyboards.*
Analyst         analytics.view, users.view (faqat o‘qish)
Support         users.view, users.message, users.block
```

Atomar huquqlar:

```text
users.view  users.block  users.message  users.export  users.edit
broadcast.view  broadcast.create  broadcast.send  broadcast.cancel
analytics.view  analytics.export
content.view  content.update
channels.manage  commands.manage  keyboards.manage
scheduler.view  scheduler.run  queue.manage
logs.view  health.view
admins.manage  settings.update  audit.view
```

Modullar o‘z huquqlarini `permissions` orqali qo‘shadi ([§13.2](#132-modul-interfeysi)).

### 37.6 Audit log

Yoziladi: kim, qanday amal, qaysi resurs, eski qiymat, yangi qiymat, IP, User-Agent, vaqt.

```text
2026-09-19 14:40:12   admin@bot    broadcast.send      Broadcast #293   127 341 ta qabul qiluvchi
2026-09-19 14:12:03   editor@bot   content.update      bot.start        "Assalomu…" → "Salom…"
2026-09-19 13:58:41   admin@bot    users.block         user#1928391     reason: spam
```

Jadval **faqat qo‘shish uchun**: admin API'da `UPDATE`/`DELETE` yo‘q. Saqlash muddati `audit.retention` (default 1 yil). Eksport CSV/JSON.

### 37.7 UI prinsiplari

```text
minimal · tez · desktop-first · mobil ishlatsa bo‘ladi
dark/light · klaviatura bilan boshqarish · WCAG 2.1 AA
keraksiz animatsiya yo‘q · ma'lumot zichligi yuqori
```

Brendlash:

```ts
admin: {
  theme: { primary: "#10b981", logo: "/public/logo.svg", name: "MyBot Admin" }
}
```

Tili: admin o‘zi tanlaydi (uz/ru/en), bu loyiha default locale'ini **o‘zgartirmaydi**.

---

## 38. DevTools

### 38.1 Chegaralar

```text
Faqat APP_ENV != production
Faqat 127.0.0.1 ga bind   (DEVTOOLS_HOST bilan o‘zgartirilsa — ogohlantirish)
Alohida port  (DEVTOOLS_PORT, default 4545)
Production build'ga umuman kirmaydi (devDependency)
```

Bu qatlamli himoya: DevTools xom update'lar va konfiguratsiyani ko‘rsatadi, uni internetga chiqarib bo‘lmasligi arxitektura darajasida ta'minlanadi.

### 38.2 Dashboard

```text
Bot holati · Routes · Updates · Handlers · Telegram so‘rovlari
Errors · DB so‘rovlari · Queue jobs · Performance · Environment (maskalangan)
```

### 38.3 Update Inspector

```text
Update #839281                                    12:04:31.204

Turi        message:text
Chat        1928391 (private)
User        1928391  @xojisaid
Handler     app/commands/start.ts
Davomiyligi 12ms

  Pipeline
    dedup            0.1ms   ✓
    sequencer        0.2ms   ✓
    userUpsert       1.8ms   ✓  (UPDATE telekit_users)
    locale           0.1ms   ✓  uz  (manba: user)
    session          0.0ms   —  (lazy, ishlatilmadi)
    rateLimit        0.1ms   ✓  2/5
    handler          8.4ms   ✓
      → sendMessage  7.9ms   ✓  200

  [ Raw payload ]  [ Replay ]  [ Copy as test ]
```

`Copy as test` — shu update uchun tayyor test kodini buferga nusxalaydi:

```ts
test("…", async () => {
  const res = await bot.as({ id: 1928391 }).command("start");
  expect(res).toHaveReplied();
});
```

### 38.4 Production update eksporti

Replay ([v1 §53](Toliq-TZ.v1-vision.md)) production update'ini development'da qayta ijro etishni va'da qilgan, lekin bu maxfiylik siyosati ([§21.2](#212-pii-siyosati)) bilan ziddiyatda edi. Yechim:

```bash
telekit update:export --id 839281 --profile safe > update.json
```

| Profil | Nima qoladi |
|---|---|
| `safe` (default) | struktura, turlar, uzunliklar; matn `"x".repeat(n)`, ism/username/telefon → soxta |
| `ids` | + haqiqiy ID'lar (user_id, chat_id, message_id) |
| `full` | hamma narsa — `--i-understand` flagi talab qilinadi, audit logga yoziladi |

Eksport faqat `logs.view` + `users.export` huquqi bilan. Production'da xom update'lar **saqlanmaydi** (`webhook.persistIngress` yoqilmagan bo‘lsa) — eksport faqat joriy xatolar buferi (oxirgi 100 ta xatoli update) ustida ishlaydi.

### 38.5 Bot Simulator

Telegram ilovasini ochmasdan sinash:

```text
Test foydalanuvchi:  ID · Ism · Username · Locale · Premium · Chat turi

Yuborish:  matn · buyruq · callback (tugmalar ro‘yxatidan) · foto
           kontakt · lokatsiya · guruhga qo‘shilish eventi

Bot javoblari chat ko‘rinishida, tugmalar bosiladi.
```

Simulator `@telekit/testing` ustida ishlaydi — ya'ni haqiqiy Telegram API chaqirilmaydi, lekin to‘liq pipeline ishlaydi (DB, session, conversation ham).

---

# QISM VI — NON-FUNCTIONAL TALABLAR

## 39. Performance budgeti

v1 "core lightweight bo‘lishi kerak" degan edi — raqamsiz. Raqamlar CI'da o‘lchanadi va regressiya build'ni yiqitadi.

### 39.1 Byudjet

| Metrika | Byudjet | O‘lchash |
|---|---|---|
| `@telekit/core` bundle (min+gzip) | ≤ 45 KB | `size-limit` |
| Minimal loyiha to‘liq bundle | ≤ 120 KB | `size-limit` |
| Cold start — core (Node 22) | ≤ 120 ms | `benchmarks/boot` |
| Cold start — Standard template | ≤ 400 ms | `benchmarks/boot` |
| Update throughput (echo, DB'siz, 1 core) | ≥ 2 000 /s | `benchmarks/throughput` |
| Update throughput (Standard, SQLite) | ≥ 400 /s | `benchmarks/throughput` |
| Middleware zanjiri overhead (p95) | ≤ 1.5 ms | `benchmarks/pipeline` |
| Callback encode + sign | ≤ 25 µs | `benchmarks/callbacks` |
| Callback decode + verify | ≤ 30 µs | `benchmarks/callbacks` |
| Xotira (bo‘sh ishlayotgan, Standard) | ≤ 90 MB RSS | `benchmarks/memory` |
| Xotira 10k faol sessiya bilan | ≤ 250 MB RSS | `benchmarks/memory` |
| Admin panel SPA (gzip) | ≤ 280 KB | `size-limit` |
| Admin dashboard LCP | ≤ 1.2 s (lokal) | Lighthouse CI |

Regressiya chegarasi: **+5 %** — oshsa PR bloklanadi, `perf-budget-override` yorlig‘i bilan ochiq asoslanadi.

### 39.2 Prinsiplar

- **Lazy hamma joyda:** modullar, route handler'lari, admin SPA, session yuklash, DB ulanish — birinchi ehtiyoj paytida.
- **Tree-shaking:** barcha paketlar ESM, `sideEffects: false`, named export'lar.
- **Nol xarajat o‘chirilgan modullar:** `analytics.enabled: false` → `ctx.track` — bo‘sh funksiya, import qilinmaydi.
- **Yozishlarni batch qilish:** `last_seen_at`, analytics eventlari, session yozish.
- **Allocation'ni kamaytirish:** context obyekti qayta ishlatilmaydi (xavfsizlik), lekin prototip ulashadi; raw payload nusxalanmaydi (ADR-002 shu sababdan ham).

---

## 40. Xavfsizlik

### 40.1 Threat model

| Aktor | Vektor | Himoya |
|---|---|---|
| Oddiy foydalanuvchi | `callback_data` ni qo‘lda o‘zgartirish | HMAC imzo ([ADR-003](#adr-003--callback-wire-format)) |
| Oddiy foydalanuvchi | Boshqa foydalanuvchining tugmasini bosish | `scope: "user"` |
| Oddiy foydalanuvchi | Handler'ga HTML/injection kiritish | `t()` auto-escape, `html` tagged template |
| Oddiy foydalanuvchi | Spam / DoS | rate limiting, concurrency limit, backpressure |
| Tashqi hujumchi | Soxta webhook so‘rovi | secret token + IP allowlist + maxfiy URL yo‘li |
| Tashqi hujumchi | Admin panelga brute-force | throttling, Argon2id, 2FA |
| Tashqi hujumchi | Admin sessiyasini o‘g‘irlash | `__Host-` cookie, HttpOnly, Secure, rotatsiya |
| Tashqi hujumchi | CSRF | double-submit token, SameSite |
| Ichki | Sirlar loglarga tushishi | majburiy masking serializer |
| Ichki | Repozitoriyga sir commit qilinishi | `.gitignore`, `.env.example`, secret-scan hook |
| Ichki | Admin huquqlaridan suiiste'mol | RBAC + o‘zgarmas audit log |

### 40.2 Sirlar

```text
BOT_TOKEN            .env · hech qachon logga to‘liq tushmaydi
APP_KEY              32 bayt base64 · installer generatsiya qiladi
APP_KEY_PREVIOUS     rotatsiya davri uchun
BOT_WEBHOOK_SECRET   32+ belgi · yo‘q bo‘lsa APP_KEY dan HKDF bilan hosil qilinadi
HEALTH_TOKEN         /health uchun
DATABASE_URL         parol qismi maskalanadi
```

Production'da `APP_KEY` yo‘q bo‘lsa — **startup rad etiladi** (`TK1002`). Development'da avtomatik vaqtinchalik kalit generatsiya qilinadi + `warn`.

`telekit key:generate` — yangi kalit chiqaradi va rotatsiya qo‘llanmasini ko‘rsatadi.

### 40.3 Kirish validatsiyasi

Chegaralarda majburiy:

| Chegara | Validatsiya |
|---|---|
| Webhook body | hajm ≤ 5 MB, JSON schema (`update` shakli) |
| `callback_data` | uzunlik, format, imzo, TTL |
| Command argumentlari | schema (`args`) |
| Conversation javoblari | `validate` + tur |
| Admin API | har endpoint uchun schema (Zod/Valibot) |
| Fayl yuklash | hajm, MIME, kengaytma |

### 40.4 Chiqish xavfsizligi

- `parse_mode: "HTML"` default → interpolatsiya auto-escape ([§26.5](#265-xavfsizlik)).
- Foydalanuvchi matnini to‘g‘ridan-to‘g‘ri `reply` ga uzatish — linter ogohlantirishi.
- Xato xabarlari foydalanuvchiga **stack trace ko‘rsatmaydi**; faqat `TK` kodi va tarjima qilingan matn.
- Admin API javoblari — faqat kerakli maydonlar (DTO), entity to‘g‘ridan-to‘g‘ri serializatsiya qilinmaydi.

### 40.5 Ta'minot zanjiri

- Core dependency'lari minimal ([ADR-006](#adr-006--monorepo-va-paket-chegaralari)) va har biri qo‘lda ko‘rib chiqiladi.
- `pnpm audit` CI'da, `npm provenance` bilan publish.
- Lockfile majburiy; Dependabot/Renovate haftalik.
- Release'lar imzolanadi, `SECURITY.md` va 90 kunlik oshkor qilish siyosati.

---

## 41. Scaling va deployment topologiyasi

### 41.1 Nima qayerda ishlaydi

| Xususiyat | 1 instance polling | 1 instance webhook | N instance webhook | Serverless |
|---|---|---|---|---|
| Commands / events | ✅ | ✅ | ✅ | ✅ |
| Callbacks | ✅ | ✅ | ✅ | ✅ |
| Sessions | ✅ | ✅ | ✅ (shared store) | ✅ (shared store) |
| Conversations | ✅ | ✅ | ✅ (shared store) | ✅ (replay) |
| Dedup | xotira | xotira | **Redis shart** | **Redis shart** |
| Per-chat tartib | ✅ | ✅ | Redis lock | ⚠ kafolat yo‘q |
| Rate limiting | xotira | xotira | **Redis shart** | **Redis shart** |
| Queue | database | database | database/redis | tashqi (Cloud Tasks) |
| Scheduler | ✅ | ✅ | lock bilan | tashqi cron |
| Polling | ✅ | — | ❌ (faqat 1 ta) | ❌ |
| DevTools | ✅ | ✅ | — | — |

**Startup tekshiruvi:** `INSTANCE_COUNT > 1` yoki `INSTANCE_ID` mavjud bo‘lsa, Telekit xotira-store ishlatilayotgan joylarni tekshiradi va `TK101x` ogohlantirishlarini beradi. `scaling.strict: true` bo‘lsa — ogohlantirish o‘rniga xato.

### 41.2 Tavsiya etilgan konfiguratsiyalar

```text
< 10k foydalanuvchi       1 instance · polling · SQLite
                           VPS 1 vCPU / 1 GB

10k – 100k                1 instance · webhook · PostgreSQL
                           VPS 2 vCPU / 2 GB

100k – 1M                 2–4 instance · webhook · PostgreSQL + Redis
                           queue: redis · dedup: redis · rateLimit: redis

> 1M                      N instance + alohida worker pool
                           broadcast uchun maxsus worker'lar
                           read-replica analitika uchun
```

### 41.3 Docker

Generator ixtiyoriy `Dockerfile` (multi-stage, distroless, non-root) va `docker-compose.yml` (bot + postgres + redis) beradi.

```dockerfile
# qisqartirilgan
FROM node:22-slim AS build
...
FROM gcr.io/distroless/nodejs22-debian12
USER nonroot
COPY --from=build /app/dist /app/dist
CMD ["dist/main.js"]
```

`HEALTHCHECK` → `/health/live`. `STOPSIGNAL SIGTERM`, `stop_grace_period: 40s` (shutdown timeout + drain'dan katta).

### 41.4 Deployment adapterlari

v1.0 da hujjatlashtirilgan qo‘llanmalar: Docker, VPS (systemd), Railway, Render, Fly.io.
Eksperimental: Cloudflare Workers, Vercel.
v1.0 dan keyin: AWS Lambda, Google Cloud Run.

### 41.5 Production defaultlari

`APP_ENV=production` bo‘lganda avtomatik:

```text
APP_DEBUG=false
devtools.enabled=false          (majburiy — override yo‘q)
logging.pretty=false
logging.pii="minimal"
admin sessiyalari secure
graceful shutdown yoqilgan
retry yoqilgan
health endpointlar ochiq
stack trace foydalanuvchiga ko‘rinmaydi
migrations.autoRun=false
```

---

## 42. Observability

### 42.1 Metrikalar

Prometheus formatida `GET /metrics` (ixtiyoriy, `HEALTH_TOKEN` bilan himoyalangan):

```text
telekit_updates_total{type,status}
telekit_update_duration_seconds{type,route}          histogram
telekit_handler_errors_total{route,code}
telekit_telegram_calls_total{method,status}
telekit_telegram_call_duration_seconds{method}       histogram
telekit_telegram_429_total{method}
telekit_rate_limit_hits_total{scope}
telekit_queue_pending{queue}
telekit_queue_job_duration_seconds{job}              histogram
telekit_broadcast_sent_total{broadcast_id,result}
telekit_db_query_duration_seconds{op}                histogram
telekit_sessions_active
telekit_conversations_active
telekit_build_info{version,node,bot_id}
```

### 42.2 Tracing

OpenTelemetry ixtiyoriy adapter (`@telekit/adapter-otel`). Har update — bitta trace:

```text
update.handle
├── middleware.userUpsert
│   └── db.query
├── middleware.locale
├── route.command.start
│   ├── db.query
│   └── telegram.sendMessage
└── analytics.track
```

### 42.3 Route bo‘yicha performans

Admin panelda va DevTools'da:

```text
Route              Soni    O‘rtacha   p95     p99     Xato    TG chaq.   DB
/start            12 403     14ms     31ms    62ms    0.02%      1.0     1.2
/profile           8 201     42ms    118ms   240ms    0.31%      1.0     3.4
user.delete          412     28ms     61ms   102ms    0.00%      2.0     2.0
message:text      41 883      6ms     12ms    28ms    0.01%      0.4     0.1
```

---

## 43. Moslik siyosati

### 43.1 Semantik versiyalash

```text
MAJOR.MINOR.PATCH
```

- **PATCH** — xato tuzatish, xavfsizlik.
- **MINOR** — yangi xususiyat, orqaga mos. Mavjud public API **buzilmaydi**.
- **MAJOR** — breaking change.

**Public API** — `api-extractor` bilan `.api.md` fayllariga qayd qilinadi; PR'da farq ko‘rinadi va MINOR'da buzilish CI'ni yiqitadi.

`_` bilan boshlanadigan yoki `@internal` deb belgilangan hamma narsa public emas.

### 43.2 Deprecation

```ts
/** @deprecated 0.8.0 dan beri. `defineCallback` ishlating. 1.0.0 da olib tashlanadi. */
```

Runtime'da bir marta `warn` (takrorlanmaydi). Deprecation minimal **bitta MINOR sikl** yashaydi, keyin MAJOR'da olib tashlanadi.

### 43.3 Telegram Bot API moslashuvi

```text
Telegram Bot API schema (JSON)
            ↓  haftalik CI job
   @telekit/types generatsiyasi
            ↓
  Farq bo‘lsa → avtomatik PR
            ↓
  Yangi metodlar: darhol ishlaydi (raw client)
  Yangi turlar:   MINOR relizda
  O‘chirilgan:    deprecation → MAJOR
```

Yangi Bot API metodi chiqqanda foydalanuvchi `ctx.api.raw("newMethod", {...})` bilan **darhol** ishlata oladi — type yangilanishini kutmaydi.

### 43.4 LTS

v1.0 dan boshlab: har MAJOR **12 oy** xavfsizlik yangilanishlarini oladi. Node.js qo‘llab-quvvatlash — faqat faol LTS versiyalari.

---

# QISM VII — REJA

## 44. Yo‘l xaritasi

Baholar: **1 ta tajribali TypeScript developer, to‘liq bandlik.** Jamoada 2–3 kishi bo‘lsa taxminan 2–2.5× tezroq (hamma ish parallellashmaydi).

### Phase 0 — Poydevor · 2 hafta

```text
npm nomlarini band qilish (telekit, create-telekit, @telekit)   ← BLOKLOVCHI
GitHub tashkiloti, repo, LICENSE (MIT), CODE_OF_CONDUCT, SECURITY.md
pnpm workspace + turborepo + changesets
CI: lint, typecheck, test, build, dependency-cruiser, size-limit
@telekit/types generatori (Bot API schema → TS)
benchmarks/ karkasi
```

**Chiqish mezoni:** bo‘sh paketlar CI'dan yashil o‘tadi; `@telekit/types` to‘liq Bot API turlarini beradi.

### v0.1 — Ishlaydigan yadro · 9 hafta

```text
core: application lifecycle, config, env validatsiya, logger
core: Telegram API client (retry, rate limit, masking)
core: polling (lock bilan)
core: update pipeline (dedup, sequencer, middleware)
core: routing — commands + events, manifest
core: typed context (ADR-002)
core: error handling + graceful shutdown
core: Kysely integratsiyasi + migration runner
cli: new, dev, start, build, routes, make:*
template: Minimal
testing: createTestBot (asosiy)
docs: Getting Started (uz/en)
```

**Chiqish mezoni (avtomatlashtirilgan):**
```text
✓ npx telekit new x --template minimal → ishlaydi
✓ BOT_TOKEN qo‘yilgach `pnpm dev` → /start real botda javob beradi
✓ throughput benchmark ≥ 2000/s
✓ core bundle ≤ 45 KB
✓ core coverage ≥ 85%
```

### v0.2 — DX qatlami · 8 hafta

```text
callbacks: ADR-003 to‘liq (packing, imzo, scope, ref store, budjet hisoboti)
keyboards: builder, grid/auto, paginator, dekoratorlar
localization: ICU, type-safe kalitlar, locale zanjiri, i18n:check
sessions: store abstraksiyasi + database/memory
webhook: ingress, secret, IP allowlist, auto mode algoritmi
database: SQLite + PostgreSQL adapterlari
template: Standard (admin'siz)
doctor
```

**Chiqish mezoni:**
```text
✓ callback budjet jadvali to‘g‘ri; overflow → ref store ishlaydi
✓ imzo buzilganda handler ishlamaydi (test)
✓ auto mode 3 ta stsenariyda to‘g‘ri qaror qiladi (test)
✓ ru plural formalari to‘g‘ri (test)
```

### v0.3 — Conversations va Testing · 7 hafta

```text
conversations: replay engine (ADR-004)
conversations: flow API to‘liq, checkpoint, timeout, cancel
conversations: AsyncLocalStorage himoyasi + eslint qoidasi
defineFlow deklarativ qatlam
testing: conversation harness, clock, API mock, matcher'lar
media: InputFile, download, limitlar, split
inline mode
docs: Conversations, Testing (uz/ru/en)
```

**Chiqish mezoni:**
```text
✓ 10 qadamli dialog restart'dan keyin davom etadi
✓ flow.external replay'da qayta chaqirilmaydi (test)
✓ ctx.reply conversation ichida xato beradi (test)
✓ conversation coverage ≥ 85%
```

### v0.5 — Application modullari · 18 hafta

```text
queue (database + memory) · scheduler (lock bilan)        3 hafta
users modeli, custom atributlar, segmentlar                2 hafta
analytics (bufer, rollup, retention, voronka)              3 hafta
broadcast (queue, targeting, retry, ETA, preview)          3 hafta
subscriptions (gate, kesh, diagnostika)                    1 hafta
content manager (precedence, versiyalash, invalidatsiya)   1 hafta
admin panel: auth, RBAC, audit, dashboard, users,          5 hafta
             broadcast, channels, content, commands,
             keyboard builder, health, logs, settings
```

**Chiqish mezoni:** [§118 acceptance criteria](#4418-admin-panel-qabul-mezonlari) to‘liq o‘tadi.

### v0.8 — DevTools va production · 8 hafta

```text
devtools: dashboard, inspector, replay, simulator, copy-as-test
update:export sanitizatsiya profillari
redis adapteri (dedup, rateLimit, queue, cache, lock)
health monitoring + alertlar
observability: metrics, OTel adapteri
docker, deployment qo‘llanmalari
performance tuning → byudjetlar
```

### v1.0 — Barqarorlik · 10 hafta

```text
Public API muzlatish (api-extractor baseline)
Hujjatlar to‘liq: uz + ru + en
8+ example loyiha
E2E suite (real test boti bilan CI)
Xavfsizlik auditi (tashqi, callback + admin + webhook)
Yuklama testi (100k foydalanuvchi simulyatsiyasi)
Migratsiya qo‘llanmasi (grammY/Telegraf dan)
Module system + community modul shabloni
```

### Jami

| Bosqich | Hafta |
|---|---|
| Phase 0 | 2 |
| v0.1 | 9 |
| v0.2 | 8 |
| v0.3 | 7 |
| v0.5 | 18 |
| v0.8 | 8 |
| v1.0 | 10 |
| **Jami** | **62 hafta ≈ 14 oy** (1 dev) |
| | **≈ 6–7 oy** (3 dev) |

v1 hujjatidagi to‘liq scope (Visual Flow Builder, multi-bot, marketplace, cloud dashboard bilan) — **3–5 kishi-yil**. Yuqoridagi reja shu scope'ning v1.0 uchun zarur qismini ajratadi; qolgani v1.0 dan keyin.

### 44.1 Kechiktirilgan (v1.0 dan keyin)

```text
Visual Flow Builder        Payments moduli       Referral moduli
Multi-bot boshqaruv        CRM moduli            Plugin marketplace
Cloud dashboard            A/B testing           Feature flags
Distributed workers        Advanced analytics    Mini App tools
```

Bular v1.0 API'si ustida **modul sifatida** qurilishi mumkin — core o‘zgarishini talab qilmaydi. Bu ADR-006 dagi paket chegaralarining asosiy sinovi.

---

### 44.15 Loyiha yaratish qabul mezonlari

```bash
npx telekit new test-bot
# O‘zbekcha · Standard · Admin: Ha · SQLite · Auto · DevTools: Ha
cd test-bot
# .env → BOT_TOKEN
pnpm dev
```

Natija avtomatik tekshiriladi:

```text
✓ Bot polling rejimida ishga tushadi
✓ /start javob beradi (o‘zbekcha)
✓ /help javob beradi
✓ telekit_users jadvaliga foydalanuvchi yoziladi
✓ analytics eventi qayd etiladi
✓ Admin panel http://localhost:3000/admin da ochiladi
✓ Birinchi admin yaratish oqimi ishlaydi
✓ DevTools http://localhost:4545 da ochiladi
✓ DevTools'da update ko‘rinadi, replay ishlaydi
✓ Boshidan oxirigacha ≤ 3 daqiqa (token tayyor bo‘lsa)
```

### 44.16 Lokalizatsiya qabul mezonlari

Installerda `Русский` tanlansa:

```text
✓ CLI barcha savollari ruscha
✓ Generatsiya qilingan README ruscha
✓ Default bot xabarlari ruscha
✓ APP_LOCALE=ru
✓ Admin panel ruscha ochiladi
✓ Admin interfeys tilini uz/en ga o‘zgartira oladi
✓ Bu o‘zgarish loyiha default locale'ini o‘zgartirmaydi
✓ /lang orqali foydalanuvchi tilini almashtira oladi, tanlov DB'da saqlanadi
✓ Rus tilida plural formalari to‘g‘ri (1 заказ / 2 заказа / 5 заказов)
```

### 44.17 Auto mode qabul mezonlari

```text
✓ development                           → polling
✓ production + PUBLIC_URL yo‘q          → polling + TK1030 ogohlantirish
✓ production + http:// URL              → polling + TK1031
✓ production + https:// + yetib bo‘lmas → polling + TK1032
✓ production + https:// + yetib bo‘ladi → webhook
✓ webhook → polling o‘tishda deleteWebhook chaqiriladi
✓ webhook URL o‘zgarmagan bo‘lsa setWebhook chaqirilmaydi
✓ ikkinchi polling instance TK1020 bilan rad etiladi
```

### 44.18 Admin panel qabul mezonlari

```text
✓ statistika ko‘rish (dashboard grafiklar bilan)
✓ foydalanuvchilarni ko‘rish, qidirish, filtrlash
✓ custom atribut bo‘yicha filtrlash
✓ foydalanuvchiga xabar yuborish
✓ foydalanuvchini bloklash / blokdan chiqarish
✓ segment yaratish
✓ broadcast yaratish (matn + rasm + tugma)
✓ broadcast preview va test yuborish
✓ broadcast yuborish, pauza, davom ettirish, bekor qilish
✓ broadcast ETA to‘g‘ri hisoblanadi
✓ majburiy kanal qo‘shish + diagnostika
✓ majburiy obunani yoqish / o‘chirish
✓ /start matnini tahrirlash va jonli preview
✓ keyboard builder orqali menyu yaratish
✓ bot health ko‘rish
✓ yangi admin yaratish, rol berish
✓ audit log ko‘rish va eksport
✓ barcha mutatsiyalar audit logga tushadi
✓ ruxsatsiz rol bloklangan endpointga kira olmaydi (test)
```

### 44.19 Developer tajribasi qabul mezonlari

```text
✓ telekit make:command profile → app/commands/profile.ts yaratiladi
✓ Fayl darhol ishlaydi, markaziy registratsiya talab qilinmaydi
✓ HMR: fayl saqlansa bot qayta ishga tushmasdan route yangilanadi
✓ ctx.t() da noto‘g‘ri kalit → TypeScript xatosi
✓ callback payload turi handler ichida to‘g‘ri aniqlanadi
✓ Xato yuz berganda terminalda fayl:qator va TK kodi ko‘rinadi
✓ telekit doctor barcha muammolarni tushunarli tilda ko‘rsatadi
```

---

## 45. Risklar registri

| # | Risk | Ehtimol | Ta'sir | Yumshatish |
|---|---|---|---|---|
| R1 | `telekit` npm nomi band | O‘rta | Yuqori | Phase 0 da birinchi ish; zaxira `telekitjs` |
| R2 | Scope juda katta, v1.0 ga yetib bo‘lmaydi | **Yuqori** | Yuqori | Bosqichli reja, har bosqich mustaqil qiymat beradi; v0.1 o‘zi foydali mahsulot |
| R3 | Replay engine determinizmi foydalanuvchini chalg‘itadi | Yuqori | O‘rta | Runtime guard + eslint qoidasi + hujjatda birinchi sahifa + aniq xato xabari |
| R4 | Bot API o‘zgarishi type generatsiyasini buzadi | O‘rta | O‘rta | Haftalik CI, `raw()` chiqish yo‘li |
| R5 | Admin panel alohida mahsulotga aylanib, core'ni sekinlashtiradi | Yuqori | Yuqori | v0.5 gacha boshlanmaydi; core mustaqil relizlanadi |
| R6 | SQLite yuklama ostida yetarli emas | O‘rta | O‘rta | Bufer + rollup + batch; hujjatda aniq chegaralar (§41.2) |
| R7 | 48-bitli imzo yetarli emas deb topiladi | Past | Yuqori | `sigBytes` sozlanadi; tashqi audit v1.0 da |
| R8 | grammY o‘xshash xususiyatlarni chiqaradi | O‘rta | O‘rta | Farqlantiruvchi — admin panel + DevTools + generator, kutubxona emas |
| R9 | Uch tilli hujjat yuritish qimmat | Yuqori | Past | uz+en majburiy, ru jamoa yordami bilan |
| R10 | Jamoa yo‘q, bitta developer | ? | Yuqori | Har bosqichda relizga tayyor holat; open-source hissa uchun ochiq arxitektura |
| R11 | Callback ref store DB yuklamasini oshiradi | Past | O‘rta | Overflow default emas; budjet hisoboti bilan oldindan ogohlantiriladi |
| R12 | Cloudflare Workers qo‘llab-quvvatlash ko‘zlangandan qiyin | O‘rta | Past | v1.0 da "eksperimental" deb belgilangan |

---

## 46. Ochiq savollar

Hal qilinishi kerak, lekin qurishni bloklamaydi:

| # | Savol | Kimga | Muddat |
|---|---|---|---|
| Q1 | `telekit` npm nomi bo‘shmi? | Phase 0 | darhol |
| Q2 | Bot API inline tugma uslublarini qo‘shdimi? (§24.4 tekshirish) | v0.2 | implementatsiya paytida |
| Q3 | Admin panel uchun o‘z UI kit yozilsinmi yoki minimal tashqi? | v0.5 boshi | — |
| Q4 | Mini App template qanchalik chuqur bo‘lsin (auth, initData validatsiya)? | v0.5 | — |
| Q5 | `@telekit/types` manbasi qaysi schema? (`telegram-bot-api-spec` vs o‘z parser) | Phase 0 | — |
| Q6 | Community modul reestri qanday ishlaydi (npm keyword vs o‘z reestr)? | v1.0 | — |
| Q7 | Hujjat sayti: VitePress yetarlimi, yoki Nuxt Content? | v0.3 | — |
| Q8 | E2E uchun real Telegram test boti CI'da qanday himoyalanadi (token sir)? | v0.3 | — |

---

# ILOVALAR

## Ilova A — Environment reference

v1 hujjatida 9 ta o‘zgaruvchi bor edi va ularning orasida `PUBLIC_URL` hamda `APP_KEY` yo‘q edi — auto mode va callback imzolash ishlashi mumkin emas edi. To‘liq ro‘yxat:

### Majburiy

| O‘zgaruvchi | Tur | Tavsif |
|---|---|---|
| `BOT_TOKEN` | string | @BotFather tokeni |
| `APP_KEY` | base64(32B) | Imzolash va shifrlash kaliti. Production'da majburiy. `telekit key:generate` |

### Ilova

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `APP_NAME` | `MyBot` | Loglar va admin panel sarlavhasi |
| `APP_ENV` | `development` | `development` \| `production` \| `test` |
| `APP_DEBUG` | `true` (dev) | Batafsil xatolar |
| `APP_PORT` | `3000` | HTTP port |
| `APP_HOST` | `0.0.0.0` | Bind manzili |
| `APP_TIMEZONE` | `Asia/Tashkent` | Scheduler va sanalar uchun |
| `APP_LOCALE` | `uz` | Default til |
| `APP_FALLBACK_LOCALE` | `en` | Zaxira til |
| `APP_KEY_PREVIOUS` | — | Kalit rotatsiyasi davrida |
| `PUBLIC_URL` | — | Tashqi HTTPS URL. **Auto mode shunga qaraydi** |

### Bot

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `BOT_MODE` | `auto` | `auto` \| `polling` \| `webhook` |
| `BOT_WEBHOOK_URL` | `PUBLIC_URL` | Webhook bazaviy URL |
| `BOT_WEBHOOK_SECRET` | `APP_KEY` dan hosil | `X-Telegram-Bot-Api-Secret-Token` |
| `TELEGRAM_API_ROOT` | `https://api.telegram.org` | Local Bot API server uchun |

### Ma'lumotlar bazasi

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `DATABASE_DRIVER` | `sqlite` | `sqlite` \| `postgres` \| `none` |
| `DATABASE_FILE` | `storage/telekit.sqlite` | SQLite yo‘li |
| `DATABASE_URL` | — | Postgres uchun majburiy |
| `DATABASE_POOL_MIN` | `2` | |
| `DATABASE_POOL_MAX` | `10` | |

### Infratuzilma

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `REDIS_URL` | — | Multi-instance uchun |
| `CACHE_DRIVER` | `memory` | `memory` \| `redis` |
| `QUEUE_DRIVER` | `database` | `memory` \| `database` \| `redis` |
| `QUEUE_WORKERS` | `2` | |
| `INSTANCE_ID` | avtomatik | Multi-instance identifikatori |
| `INSTANCE_COUNT` | `1` | Startup tekshiruvlari uchun |

### Kuzatuv

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `LOG_LEVEL` | `info` | `trace`…`fatal` |
| `LOG_PII` | `minimal` (prod) | `none` \| `minimal` \| `full` |
| `LOG_PRETTY` | `true` (dev) | |
| `HEALTH_TOKEN` | — | `/health` va `/metrics` uchun |
| `METRICS_ENABLED` | `false` | Prometheus endpoint |

### Admin va DevTools

| O‘zgaruvchi | Default | Tavsif |
|---|---|---|
| `ADMIN_ENABLED` | `true` | |
| `ADMIN_PATH` | `/admin` | |
| `DEVTOOLS_ENABLED` | `true` (dev) | Production'da majburan `false` |
| `DEVTOOLS_PORT` | `4545` | |
| `DEVTOOLS_HOST` | `127.0.0.1` | O‘zgartirilsa ogohlantirish |

### `.env.example`

```env
# ── Majburiy ────────────────────────────────
BOT_TOKEN=
APP_KEY=

# ── Ilova ───────────────────────────────────
APP_NAME=MyBot
APP_ENV=development
APP_DEBUG=true
APP_PORT=3000
APP_TIMEZONE=Asia/Tashkent
APP_LOCALE=uz
APP_FALLBACK_LOCALE=en

# Production'da webhook uchun:
# PUBLIC_URL=https://bot.example.com

# ── Bot ─────────────────────────────────────
BOT_MODE=auto

# ── Baza ────────────────────────────────────
DATABASE_DRIVER=sqlite
DATABASE_FILE=storage/telekit.sqlite
# DATABASE_URL=postgres://user:pass@localhost:5432/mybot

# ── Infratuzilma (ixtiyoriy) ────────────────
# REDIS_URL=redis://localhost:6379

# ── Loglar ──────────────────────────────────
LOG_LEVEL=debug
```

---

## Ilova B — Error code jadvali

Har kod `https://telekit.dev/errors/<kod>` sahifasiga ega.

### TK10xx — Konfiguratsiya (startup'da to‘xtatadi)

| Kod | Nomi | Tavsif |
|---|---|---|
| TK1001 | `EnvValidationError` | Env o‘zgaruvchilari validatsiyadan o‘tmadi |
| TK1002 | `MissingAppKeyError` | Production'da `APP_KEY` yo‘q |
| TK1003 | `UnsafeConfigError` | Production'da xavfli sozlama (imzosiz callback va h.k.) |
| TK1004 | `ConfigFileError` | `telekit.config.ts` yuklanmadi |
| TK1005 | `ModuleDependencyError` | Modul bog‘liqligi qanoatlantirilmadi |
| TK1010 | `DatabaseConfigError` | Driver va URL mos emas |
| TK1015 | `UnsafeDedupStoreWarning` | Multi-instance + xotira dedup |
| TK1016 | `UnsafeRateLimitStoreWarning` | Multi-instance + xotira rate limit |
| TK1020 | `PollerLockError` | Boshqa instance allaqachon polling qilmoqda |
| TK1030 | `AutoModeNoPublicUrl` | Production, `PUBLIC_URL` yo‘q → polling |
| TK1031 | `AutoModeInsecureUrl` | `PUBLIC_URL` HTTPS emas → polling |
| TK1032 | `AutoModeUrlUnreachable` | URL javob bermadi → polling |
| TK1040 | `RouteConflictError` | Ikki fayl bir xil route beradi |
| TK1041 | `CallbackIdCollision` | Ikki callback bir xil `routeId` |
| TK1050 | `MigrationPendingError` | Qo‘llanmagan migratsiyalar bor |
| TK1051 | `ConfigurationError` | Bir migratsiya nomi ikki manbada turlicha ta‘riflangan |

### TK11xx — Telegram API

| Kod | Nomi | Tavsif |
|---|---|---|
| TK1101 | `TelegramApiError` | Umumiy API xatosi |
| TK1102 | `TelegramRateLimitError` | 429, `retry_after` bilan |
| TK1103 | `BotBlockedError` | 403 — foydalanuvchi bloklagan |
| TK1104 | `ChatNotFoundError` | 400 |
| TK1105 | `FileTooLargeError` | Yuklab olish > 20 MB |
| TK1106 | `UploadTooLargeError` | Yuborish > 50 MB |
| TK1107 | `PhotoTooLargeError` | Foto > 10 MB |
| TK1108 | `WebhookConflictError` | 409 — polling va webhook bir vaqtda |

### TK12xx — Tarmoq

| Kod | Nomi |
|---|---|
| TK1201 | `NetworkTimeoutError` |
| TK1202 | `NetworkUnreachableError` |

### TK20xx — Validatsiya

| Kod | Nomi | Tavsif |
|---|---|---|
| TK2001 | `ValidationError` | Umumiy |
| TK2002 | `CommandArgsError` | Buyruq argumentlari |
| TK2004 | `TextTooLongError` | > 4096 belgi |
| TK2005 | `CaptionTooLongError` | > 1024 belgi |

### TK21xx — Callback

| Kod | Nomi | Tavsif |
|---|---|---|
| TK2101 | `CallbackDecodeError` | Format buzilgan |
| TK2102 | `CallbackSignatureError` | Imzo mos emas |
| TK2103 | `RouteNotFoundError` | `routeId` topilmadi (eskirgan tugma) |
| TK2104 | `CallbackOverflowError` | Payload sig‘madi, ref store yo‘q |
| TK2105 | `CallbackExpiredError` | Ref store yozuvi muddati tugagan |
| TK2106 | `CallbackScopeError` | Boshqa foydalanuvchi/chat bosdi |

### TK22xx — Conversations

| Kod | Nomi | Tavsif |
|---|---|---|
| TK2201 | `ConversationSideEffectError` | `flow` dan tashqari yon ta'sir |
| TK2202 | `ConversationNotFoundError` | Ro‘yxatdan o‘tmagan dialog |
| TK2203 | `ConversationTooLongError` | `maxSteps` yoki `maxLogBytes` oshdi |
| TK2204 | `ConversationTimeoutError` | TTL tugadi |
| TK2205 | `ConversationReplayMismatch` | Log kod bilan mos kelmadi (kod o‘zgargan) |
| TK2206 | `FlowDefinitionError` | `defineFlow` spec‘i nomuvofiq (qadam, action, next) |

### TK23xx — Sessions

| Kod | Nomi |
|---|---|
| TK2301 | `SessionConflictError` |
| TK2302 | `SessionTooLargeError` |

### TK30xx — Ma'lumotlar bazasi

| Kod | Nomi |
|---|---|
| TK3001 | `DatabaseUnavailableError` |
| TK3002 | `MigrationFailedError` |
| TK3003 | `MigrationIrreversibleError` |

### TK40xx — Queue va Scheduler

| Kod | Nomi |
|---|---|
| TK4001 | `JobFailedError` |
| TK4002 | `JobTimeoutError` |
| TK4003 | `ScheduleOverlapSkipped` |

### TK50xx — Subscriptions

| Kod | Nomi | Tavsif |
|---|---|---|
| TK5001 | `SubscriptionRequired` | Oqim signali, xato emas |
| TK5002 | `ChannelNotAccessible` | Bot kanalda admin emas |

### TK60xx — Admin

| Kod | Nomi |
|---|---|
| TK6001 | `AdminAuthError` |
| TK6002 | `AdminPermissionError` |
| TK6003 | `AdminThrottledError` |
| TK6004 | `CsrfTokenError` |

---

## Ilova C — Database sxemasi

Dialekt-neytral ko‘rinishda. Haqiqiy DDL Kysely migratsiyalarida; SQLite'da `BIGINT` → `INTEGER`, `JSONB` → `TEXT`, `TIMESTAMPTZ` → `TEXT` (ISO-8601).

```sql
-- ══ FOYDALANUVCHILAR ══════════════════════════════════

CREATE TABLE telekit_users (
  id              BIGINT PRIMARY KEY,          -- telegram user id
  first_name      TEXT NOT NULL,
  last_name       TEXT,
  username        TEXT,
  language_code   TEXT,
  locale          TEXT,                        -- bot ichida tanlangan
  is_premium      BOOLEAN NOT NULL DEFAULT FALSE,
  is_bot          BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'active',  -- active|blocked|deleted|banned
  source          TEXT,                        -- deep-link start parametri
  joined_at       TIMESTAMPTZ NOT NULL,
  last_seen_at    TIMESTAMPTZ NOT NULL,
  messages_count  INTEGER NOT NULL DEFAULT 0,
  commands_count  INTEGER NOT NULL DEFAULT 0,
  attributes      JSONB NOT NULL DEFAULT '{}',
  banned_at       TIMESTAMPTZ,
  banned_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_users_status       ON telekit_users (status);
CREATE INDEX idx_users_locale       ON telekit_users (locale);
CREATE INDEX idx_users_last_seen    ON telekit_users (last_seen_at);
CREATE INDEX idx_users_joined       ON telekit_users (joined_at);
CREATE INDEX idx_users_source       ON telekit_users (source);
-- filterable custom atributlar uchun generated column + indeks
-- migration generator avtomatik qo‘shadi

-- ══ SESSIYA VA DIALOG ═════════════════════════════════

CREATE TABLE telekit_sessions (
  key         TEXT PRIMARY KEY,                -- "<chatId>:<userId>"
  data        JSONB NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,      -- optimistik qulf
  expires_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expires ON telekit_sessions (expires_at);

CREATE TABLE telekit_conversations (
  key            TEXT PRIMARY KEY,             -- "<chatId>:<userId>"
  name           TEXT NOT NULL,
  log            JSONB NOT NULL,               -- ADR-004 replay log
  params         JSONB,
  step           INTEGER NOT NULL DEFAULT 0,
  version        INTEGER NOT NULL DEFAULT 1,
  code_hash      TEXT,                         -- TK2205 aniqlash uchun
  started_at     TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ
);
CREATE INDEX idx_conv_expires ON telekit_conversations (expires_at);

-- ══ CALLBACK OVERFLOW ═════════════════════════════════

CREATE TABLE telekit_callback_refs (
  id          TEXT PRIMARY KEY,                -- 16 belgi base64url
  route       TEXT NOT NULL,
  payload     BLOB NOT NULL,
  chat_id     BIGINT,
  user_id     BIGINT,
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_cbref_expires ON telekit_callback_refs (expires_at);

-- ══ INGRESS (webhook.persistIngress) ══════════════════

CREATE TABLE telekit_inbox (
  update_id    BIGINT PRIMARY KEY,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);
CREATE INDEX idx_inbox_unprocessed ON telekit_inbox (processed_at) WHERE processed_at IS NULL;

-- ══ ANALITIKA ═════════════════════════════════════════

CREATE TABLE telekit_events (
  id          BIGSERIAL PRIMARY KEY,
  day         DATE NOT NULL,                   -- partitsiya kaliti
  name        TEXT NOT NULL,
  user_id     BIGINT,
  chat_id     BIGINT,
  props       JSONB,
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_events_day_name ON telekit_events (day, name);
CREATE INDEX idx_events_user     ON telekit_events (user_id, day);

CREATE TABLE telekit_user_days (
  user_id  BIGINT NOT NULL,
  day      DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX idx_user_days_day ON telekit_user_days (day);

CREATE TABLE telekit_daily_stats (
  day        DATE NOT NULL,
  metric     TEXT NOT NULL,                    -- dau|new_users|messages|…
  dimension  TEXT NOT NULL DEFAULT '',         -- locale|command nomi|…
  value      BIGINT NOT NULL,
  PRIMARY KEY (day, metric, dimension)
);

CREATE TABLE telekit_cohorts (
  cohort_day DATE NOT NULL,
  day_n      INTEGER NOT NULL,                 -- 0,1,7,30
  users      BIGINT NOT NULL,
  PRIMARY KEY (cohort_day, day_n)
);

-- ══ BROADCAST ═════════════════════════════════════════

CREATE TABLE telekit_broadcasts (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT,
  status         TEXT NOT NULL,   -- draft|scheduled|running|paused|completed|cancelled|failed
  content        JSONB NOT NULL,  -- turi, matn, media, keyboard
  target         JSONB NOT NULL,  -- segment/filtr ta'rifi
  total          INTEGER NOT NULL DEFAULT 0,
  sent           INTEGER NOT NULL DEFAULT 0,
  failed         INTEGER NOT NULL DEFAULT 0,
  blocked        INTEGER NOT NULL DEFAULT 0,
  rate           INTEGER NOT NULL DEFAULT 25,
  scheduled_at   TIMESTAMPTZ,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_by     BIGINT,
  created_at     TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_broadcasts_status ON telekit_broadcasts (status);

CREATE TABLE telekit_broadcast_targets (
  broadcast_id BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed|blocked|skipped
  message_id   BIGINT,
  error        TEXT,
  attempts     SMALLINT NOT NULL DEFAULT 0,
  sent_at      TIMESTAMPTZ,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX idx_bt_pending ON telekit_broadcast_targets (broadcast_id, status);

-- ══ MAJBURIY OBUNA ════════════════════════════════════

CREATE TABLE telekit_channels (
  id           BIGSERIAL PRIMARY KEY,
  chat_id      BIGINT,
  username     TEXT,
  title        TEXT NOT NULL,
  join_url     TEXT,
  button_title JSONB,                          -- { uz, ru, en }
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  last_check   TIMESTAMPTZ,
  last_status  TEXT,
  created_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE telekit_subscription_cache (
  user_id    BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  subscribed BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);

-- ══ KONTENT ═══════════════════════════════════════════

CREATE TABLE telekit_content (
  key         TEXT NOT NULL,
  locale      TEXT NOT NULL,
  value       JSONB NOT NULL,                  -- matn + media + keyboard
  source_hash TEXT,                            -- drift aniqlash (§34.1)
  updated_by  BIGINT,
  updated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, locale)
);

CREATE TABLE telekit_content_versions (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT NOT NULL,
  locale      TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB NOT NULL,
  admin_id    BIGINT,
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_cv_key ON telekit_content_versions (key, locale, created_at);

-- ══ QUEUE VA SCHEDULER ════════════════════════════════

CREATE TABLE telekit_jobs (
  id            BIGSERIAL PRIMARY KEY,
  queue         TEXT NOT NULL DEFAULT 'default',
  name          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  priority      SMALLINT NOT NULL DEFAULT 0,
  attempts      SMALLINT NOT NULL DEFAULT 0,
  max_attempts  SMALLINT NOT NULL DEFAULT 3,
  available_at  TIMESTAMPTZ NOT NULL,
  reserved_at   TIMESTAMPTZ,
  reserved_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_jobs_ready ON telekit_jobs (queue, available_at, priority);

CREATE TABLE telekit_failed_jobs (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  error      TEXT NOT NULL,
  failed_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE telekit_schedules (
  name         TEXT PRIMARY KEY,
  cron         TEXT NOT NULL,
  timezone     TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at  TIMESTAMPTZ,
  last_status  TEXT,
  last_duration_ms INTEGER,
  next_run_at  TIMESTAMPTZ
);

CREATE TABLE telekit_locks (
  name        TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

-- ══ ADMIN ═════════════════════════════════════════════

CREATE TABLE telekit_admins (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,                -- argon2id
  telegram_id    BIGINT UNIQUE,
  role           TEXT NOT NULL,
  permissions    JSONB,                        -- rol ustidan qo‘shimcha
  locale         TEXT NOT NULL DEFAULT 'uz',
  totp_secret    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE telekit_admin_sessions (
  id          TEXT PRIMARY KEY,                -- 256 bit
  admin_id    BIGINT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_asessions_admin ON telekit_admin_sessions (admin_id);

CREATE TABLE telekit_admin_login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT,
  ip          TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_attempts_ip ON telekit_admin_login_attempts (ip, created_at);

CREATE TABLE telekit_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT,
  admin_email TEXT,
  action      TEXT NOT NULL,                   -- broadcast.send, content.update…
  resource    TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_audit_created ON telekit_audit_log (created_at);
CREATE INDEX idx_audit_admin   ON telekit_audit_log (admin_id, created_at);
-- faqat INSERT: admin API da UPDATE/DELETE yo‘q

-- ══ MIGRATSIYA ════════════════════════════════════════

CREATE TABLE telekit_migrations (
  name        TEXT PRIMARY KEY,
  batch       INTEGER NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL
);
-- foydalanuvchi migratsiyalari alohida: `migrations`
```

---

## Ilova D — Telegram platforma limitlari

Implementatsiyaga ta'sir qiladigan qat'iy raqamlar. Implementatsiya paytida `core.telegram.org/bots/api` va `core.telegram.org/bots/faq` bilan qayta tasdiqlanadi.

| Limit | Qiymat | Telekit'da qayerda |
|---|---|---|
| `callback_data` | 1–64 **bayt** | [ADR-003](#adr-003--callback-wire-format) |
| Xabar matni | 4096 belgi | `split` opsiyasi, TK2004 |
| Caption | 1024 belgi | TK2005 |
| Inline keyboard tugmalari | 100 ta (8 ta qator × …) | builder validatsiyasi |
| Umumiy yuborish tezligi | ~30 xabar/s | [§18.3](#183-chiquvchi-rate-limiter), [§32.1](#321-real-otkazuvchanlik--v1dagi-boshliq) |
| Bir chatga | ~1 xabar/s | per-chat limiter |
| Guruhga | 20 xabar/daqiqa | per-group limiter |
| Fayl yuklab olish (`getFile`) | 20 MB | TK1105 |
| Fayl yuborish | 50 MB | TK1106 |
| Foto yuborish | 10 MB | TK1107 |
| Webhook `max_connections` | 1–100 (default 40) | config |
| Webhook javob kutish | ~60 s | [§14.6](#146-webhook-javob-strategiyasi) |
| `secret_token` | 1–256 belgi, `A-Za-z0-9_-` | [§14.5](#145-webhook) |
| Telegram webhook IP'lari | `149.154.160.0/20`, `91.108.4.0/22` | IP allowlist |
| `getUpdates` bir vaqtda | faqat 1 ta ulanish | [§14.4](#144-polling) poller lock |
| `setMyCommands` | 100 ta buyruq, tavsif 1–256 belgi | sync validatsiyasi |
| Media group | 2–10 element | builder validatsiyasi |
| `answerCallbackQuery` muddati | ~15 s | TK1101 (`query is too old`) |

**Local Bot API server** (`TELEGRAM_API_ROOT`) ishlatilsa, fayl limitlari 2 GB gacha ko‘tariladi — Telekit limitlarni `getMe` javobidan emas, konfiguratsiyadan oladi (`telegram.fileLimits`).

---

## Ilova E — Lug‘at

| Atama | Ma'nosi |
|---|---|
| **Update** | Telegram'dan kelgan hodisa obyekti |
| **Handler** | Update'ni qayta ishlovchi funksiya |
| **Route** | Update ↔ handler moslik qoidasi (command, callback, event) |
| **Manifest** | Build vaqtida yaratilgan route jadvali |
| **routeId** | Callback nomining 4 belgili barqaror hash'i |
| **Payload** | Callback ichidagi tipizatsiyalangan ma'lumot |
| **Ref store** | 64 baytga sig‘magan payload uchun server tomonidagi saqlash |
| **Scope** (callback) | Tugmani kim bosishi mumkinligi: global / user / chat |
| **Conversation** | Ko‘p qadamli dialog |
| **Replay** | Conversation funksiyasini log asosida boshidan qayta ijro etish |
| **Checkpoint** | Replay log'ini qisqartiruvchi holat surati |
| **Sequencer** | Bir chat ichidagi update tartibini ta'minlovchi mexanizm |
| **Dedup** | Takrorlangan update'ni aniqlash |
| **Gate** | O‘tishni to‘suvchi middleware (masalan, majburiy obuna) |
| **Segment** | Qayta ishlatiladigan foydalanuvchi filtri |
| **Rollup** | Xom eventlardan agregat jadval hosil qilish |
| **Drift** | Kod va admin paneldagi kontent orasidagi nomuvofiqlik |
| **ADR** | Architecture Decision Record — asoslangan me'moriy qaror |

---

## Hujjatni yuritish

Bu hujjat **jonli spetsifikatsiya**. Qoidalar:

1. Kod bilan ziddiyat topilsa — **kod haq**, hujjat tuzatiladi (yoki kod xato deb tan olinadi).
2. Me'moriy qaror o‘zgarsa — yangi ADR qo‘shiladi, eskisi `Superseded by ADR-00X` deb belgilanadi, **o‘chirilmaydi**.
3. Har MINOR relizda [§46 ochiq savollar](#46-ochiq-savollar) ko‘rib chiqiladi.
4. Public API o‘zgarishi `api-extractor` baseline'i bilan sinxron.

**Manbalar:**
[Toliq-TZ.v1-vision.md](Toliq-TZ.v1-vision.md) — dastlabki vizyon hujjati (tarixiy).

---

**TELEKIT**

**The TypeScript Framework for Telegram Applications.**

```text
Create.  Build.  Test.  Manage.  Deploy.
```

Barchasi bitta framework ichida.




