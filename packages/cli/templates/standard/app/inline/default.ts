import { defineInline, inlinePage, inlineResult } from "@telekit/core";

// Inline rejim namunasi: istalgan chatda "@botingiz <so'z>" deb yozing.
// Avval @BotFather'da /setinline buyrug'i bilan inline rejimni yoqing.
const PROVERBS = [
  "Bilim — aql chirog'i.",
  "Mehnat — mehnatning tagi rohat.",
  "Sabr tagi — sariq oltin.",
  "Til — aql bezagi.",
  "Birlashgan o'zar, birlashmagan to'zar.",
  "Ko'p o'qigan emas, ko'p bilgan oldin.",
  "Yaxshi so'z — jon ozig'i.",
  "Vaqt — oltindan qimmat.",
];

export default defineInline({
  async handle(ctx, query) {
    const matches = PROVERBS.filter((p) => p.toLowerCase().includes(query.toLowerCase()));
    if (matches.length === 0) {
      await ctx.answerInline([inlineResult.article("empty", ctx.t("bot.inline.empty_title"), ctx.t("bot.inline.empty_text"))]);
      return;
    }

    // Telegram bir javobda ko'pi bilan 50 ta natija oladi — qolgani next_offset bilan sahifalanadi.
    const page = inlinePage(matches, ctx.inlineQuery!.offset, 20);
    await ctx.answerInline(
      page.items.map((proverb) => inlineResult.article(`p${PROVERBS.indexOf(proverb)}`, proverb, proverb)),
      { next_offset: page.nextOffset },
    );
  },
});
