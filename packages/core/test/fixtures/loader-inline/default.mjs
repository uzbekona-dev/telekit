export default {
  handle: async (ctx, query) => {
    ctx.state.inline = `default:${query}`;
  },
};
