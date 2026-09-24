# minimal-bot (example)

`@telekit/core` v0.1 ning eng kichik ishlaydigan namunasi — shu monorepo
ichida `workspace:*` orqali ulanadi (root'da `pnpm install` qilish yetarli).

```bash
cp .env.example .env
# .env ichiga haqiqiy BOT_TOKEN qo'ying

pnpm --filter minimal-bot dev
```

Bu misol quyidagilarni ko'rsatadi: file-based routing (`app/commands`,
`app/events`), typed context, polling, va global error handler. Kod
`packages/cli/templates/minimal` bilan bir xil — u yerdan `telekit new`
orqali generatsiya qilinadi, bu yerda esa doimiy ravishda repo ichida
build/test qilinib turadi.
