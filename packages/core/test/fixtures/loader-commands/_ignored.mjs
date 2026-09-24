export default {
  name: "ignored",
  handle() {
    throw new Error("_-prefixed fayllar loadRoutes tomonidan hech qachon import qilinmasligi kerak");
  },
};
