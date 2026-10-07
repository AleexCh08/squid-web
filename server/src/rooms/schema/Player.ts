import { Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "Player";
  
  // Posición lineal hacia la meta. Solo el servidor decide su valor real.
  @type("number") zPos: number = 0; 
  
  // Estados vitales
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isMoving: boolean = false;
}