# Plugin yaratish

Plugin — nomi va bir marta ishlaydigan `setup(app)` funksiyasidan iborat. Uni `prepare()` yoki `start()`dan oldin ro‘yxatdan o‘tkazing.

```ts
import type { TelekitPlugin } from "@telekit/core";

export const healthCommands: TelekitPlugin = {
  name: "health-commands",
  setup(app) {
    app.command("ping", (ctx) => ctx.reply("pong"));
  },
};

app.plugin(healthCommands);
```

`setup` async bo‘lishi mumkin. Bir xil nomli plugin ikki marta ulanmaydi va startup boshlanganidan keyin yangi plugin qabul qilinmaydi. Plugin middleware’ni `app.use`, route’larni `app.command`, `app.event` yoki `app.inline` orqali ulaydi.
