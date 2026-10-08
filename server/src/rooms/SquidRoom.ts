import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isMoving: boolean = false;
  @type("number") zPos: number = 0;
}

export class GameState extends Schema {
  @type("string") status: string = "LOBBY";
  @type("string") light: string = "RED";
  
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class SquidRoom extends Room {
  private distancePerStep = 2.0; 

  onCreate(options: any) {
    this.setState(new GameState());

    this.onMessage("STEP", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      if (!player || !player.isAlive || state.status !== "PLAYING") return;

      if (state.light === "RED") {
        player.isAlive = false;
      } else {
        player.zPos += this.distancePerStep;
      }
    });

    this.onMessage("PLAYER_DIED", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      if (player && player.isAlive) {
        player.isAlive = false;
      }
    });

    this.onMessage("HOST_START_GAME", (client, message) => {
      const state = this.state as GameState;
      state.status = "PLAYING";
      state.light = "RED"; 
    });

    this.onMessage("CHANGE_LIGHT", (client, data: { light: string }) => {
      const state = this.state as GameState;
      state.light = data.light;
    });
  }

  onJoin(client: Client, options: any = {}) {
    const state = this.state as GameState;
    const newPlayer = new Player();
    newPlayer.id = client.sessionId;
    newPlayer.name = options?.name || "Jugador " + Math.floor(Math.random() * 1000); 
    
    state.players.set(client.sessionId, newPlayer);
    console.log(`[JOIN] ${newPlayer.name} ha entrado.`);
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    state.players.delete(client.sessionId);
  }
}