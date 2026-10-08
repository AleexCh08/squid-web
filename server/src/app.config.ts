import {
  defineServer,
  defineRoom,
  monitor,
  playground,
  createRouter,
  createEndpoint,
} from "colyseus";

import { SquidRoom } from "./rooms/SquidRoom.js";

export default defineServer({
  /**
   * Define your room handlers:
   */
  rooms: {
    squid_room: defineRoom(SquidRoom)
  },

  routes: createRouter({
    api_hello: createEndpoint("/api/hello", { method: "GET" }, async (ctx) => {
      return { message: "Hello World" };
    }),
  }),

  express: (app) => {
    app.get("/hi", (req, res) => {
      res.send("It's time to kick ass and chew bubblegum!");
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  }
});