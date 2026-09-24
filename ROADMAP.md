# Telekit v1 roadmap

Roadmap sanaga emas, tekshiriladigan release mezonlariga bog‘langan.

## 0.2 — Runtime hardening (bajarildi)

- production callback va `APP_KEY` validatsiyasi;
- global/per-chat concurrency, bounded queue va webhook backpressure;
- outgoing rate limiter;
- graceful shutdown va in-flight drain;
- conversation params/race va session isolation/retry;
- to‘liq Telegram Bot API method typing;
- CI, security va contribution infratuzilmasi.

## 0.3 — Documentation va examples

- har bir paket uchun API guide;
- polling, webhook, Postgres va conversations bo‘yicha runnable examples;
- migration va upgrade guide;
- kamida ikki real botdan olingan case study.

## 0.4 — Extension ecosystem

- plugin authoring contract’ini real integratsiyalarda sinash;
- Redis session/dedup va distributed polling lock adapterlari;
- metrics/tracing adapteri;
- community plugin katalogi va compatibility policy.

## 0.5 — Operations

- load/soak benchmark va e’lon qilingan natijalar;
- webhook readiness/health API;
- multi-instance deployment guide;
- dependency va security audit avtomatizatsiyasi.

## 0.9 — API freeze

- barcha public exportlar inventarizatsiyasi;
- deprecation policy va changelog;
- release candidate’lar, real loyiha feedback’i va migration dry-run.

## 1.0 mezoni

- kamida uchta real production botda tasdiqlangan runtime;
- mustaqil security review’da critical/high ochiq muammo yo‘q;
- documented semver/API compatibility policy;
- Node LTS matritsasida barqaror CI, load test va recovery testlari;
- core, callbacks, sessions, conversations, testing va CLI uchun to‘liq public docs.
