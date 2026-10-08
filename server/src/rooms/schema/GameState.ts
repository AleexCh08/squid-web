import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

// 1. Clase Player pura
export class Player extends Schema {
  id: string = "";
  name: string = "";
  isAlive: boolean = true;
  isMoving: boolean = false;
  zPos: number = 0;
}

// Registro manual invulnerable al compilador
defineTypes(Player, {
  id: "string",
  name: "string",
  isAlive: "boolean",
  isMoving: "boolean",
  zPos: "number"
});

// 2. Clase GameState pura
export class GameState extends Schema {
  status: string = "LOBBY";
  light: string = "RED";
  players = new MapSchema<Player>();
}

// Registro manual invulnerable al compilador
defineTypes(GameState, {
  status: "string",
  light: "string",
  players: { map: Player }
});