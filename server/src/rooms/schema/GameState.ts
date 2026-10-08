import { Schema, MapSchema, type } from "@colyseus/schema";
import { Player } from "./Player.js";

export class GameState extends Schema {
  @type("string") status: string = "LOBBY";
  @type("string") light: string = "RED";
  
  @type({ map: Player }) players = new MapSchema<Player>();
}