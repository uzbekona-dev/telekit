export default {
  match: "gif ",
  handle: async (ctx, query) => {
    ctx.state.inline = `gif:${query}`;
  },
};
