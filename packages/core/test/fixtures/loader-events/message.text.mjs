export default {
  type: "message:text",
  handle(ctx) {
    ctx.state.sawText = ctx.message?.text;
  },
};
