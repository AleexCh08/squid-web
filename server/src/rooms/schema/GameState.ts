import { Schema, type, MapSchema } from "@colyseus/schema";
import { Player } from "./Player.js";

export class GameState extends Schema {
  // Fases del juego: "LOBBY" (Esperando), "PLAYING" (Jugando), "GAME_OVER" (Fin)
  @type("string") status: string = "LOBBY";

  // El semáforo letal: "GREEN" o "RED"
  // Falla intencional mitigada: Empezamos en rojo por seguridad, para que un evento asíncrono no elimine a nadie al cargar.
  @type("string") light: string = "RED"; 

  // Mapa optimizado para almacenar jugadores usando su SessionID de WebSockets
  @type({ map: Player }) players = new MapSchema<Player>();
}