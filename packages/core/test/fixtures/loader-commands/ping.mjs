export default {
  name: "ping",
  handle(ctx) {
    ctx.state.pong = true;
  },
};
