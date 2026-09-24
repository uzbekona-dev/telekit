# Telekit’ga hissa qo‘shish

Issue yoki pull request ochishdan oldin mavjud issue’larni tekshiring. Bug report’da reproduksiya qadamlari, kutilgan va amaldagi natija, Node/pnpm versiyasi bo‘lsin.

## Lokal tekshiruv

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Har bir bug fix regressiya testi bilan, yangi API esa kamida unit test va qisqa hujjat bilan kelishi kerak. Public API o‘zgarishida backwards compatibility va migration yo‘lini PR izohida yozing.

Commitlar kichik va bitta maqsadli bo‘lsin. Token, `.env`, production database yoki foydalanuvchi ma’lumotini commit qilmang.

Security muammolarini public issue’da oshkor qilmang; [SECURITY.md](./SECURITY.md) yo‘riqnomasidan foydalaning.
