import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isMoving: boolean = false;
  @type("number") zPos: number = 0;
}