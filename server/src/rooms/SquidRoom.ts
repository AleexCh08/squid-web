import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") gender: string = "M";
  @type("boolean") isAlive: boolean = true;
  @type("boolean") isMoving: boolean = false;
  @type("number") zPos: number = 0;
}

export class GameState extends Schema {
  @type("string") status: string = "PRE_LOBBY"; 
  @type("string") light: string = "RED";
  
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class SquidRoom extends Room {
  private distancePerStep = 0.2; 
  private lightTimeout?: NodeJS.Timeout;
  private readonly FINISH_LINE_Z = 100;

  private checkGameOver() {
    const state = this.state as GameState;
    if (state.status !== "PLAYING") return;

    let anyAlive = false;
    state.players.forEach(p => { 
      if (p.name !== "HOST_ADMIN" && p.isAlive) anyAlive = true; 
    });

    if (!anyAlive) {
      state.status = "GAME_OVER";
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      this.unlock(); 
    }
  }

  onCreate(options: any) {
    this.setState(new GameState());

    this.onMessage("GO_TO_ARENA", (client, message) => {
      const state = this.state as GameState;
      if (state.status === "PRE_LOBBY") {
        state.status = "LOBBY"; 
      }
    });

    this.onMessage("STEP", (client, message) => {
      const state = this.state as GameState;
      if (state.status !== "PLAYING") return;
      
      const player = state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;

      if (state.light === "RED") {
        player.isAlive = false;
        this.checkGameOver(); 
        return;
      }

      player.zPos += this.distancePerStep;

      if (player.zPos >= this.FINISH_LINE_Z) {
        state.status = "GAME_OVER";
        if (this.lightTimeout) clearTimeout(this.lightTimeout);
        this.unlock();
        
        state.players.forEach((p, sessionId) => {
          if (p.name !== "HOST_ADMIN" && sessionId !== client.sessionId) {
            p.isAlive = false; 
          }
        });
        
        console.log(`¡Jugador ${player.name} ha ganado!`);
      }
    });

    this.onMessage("PLAYER_DIED", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      if (player) {
        player.isAlive = false;
        this.checkGameOver(); 
      }
    });

    this.onMessage("HOST_START_GAME", (client, message) => {
      const state = this.state as GameState;
      if (state.status !== "LOBBY") return; 
      
      state.status = "STARTING"; 
      this.lock(); 
      
      setTimeout(() => {
        state.status = "PLAYING";
        state.light = "GREEN";
        this.lightTimeout = setTimeout(() => this.runLightCycle(), 6000); 
      }, 3000);
    });

    this.onMessage("RESTART_MATCH", (client, message) => {
      const state = this.state as GameState;
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      
      state.status = "LOBBY";
      state.light = "RED";
      
      state.players.forEach(player => {
        player.isAlive = true;
        player.zPos = 0;
      });
      
      this.unlock();
    });

    this.onMessage("RETURN_TO_QR", (client, message) => {
      const state = this.state as GameState;
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      
      state.status = "PRE_LOBBY";
      state.light = "RED";
      
      this.clients.forEach(c => {
        const p = state.players.get(c.sessionId);
        if (p && p.name !== "HOST_ADMIN") {
          c.leave();
        }
      });
      
      this.unlock();
    });

    this.onMessage("CHANGE_LIGHT", (client, data: { light: string }) => {
      const state = this.state as GameState;
      state.light = data.light;
    });
  }

  private runLightCycle() {
    const state = this.state as GameState;
    if (state.status !== "PLAYING") return;

    if (state.light === "RED") {
      state.light = "GREEN";
      const greenTime = Math.random() * 3000 + 3000;
      this.lightTimeout = setTimeout(() => this.runLightCycle(), greenTime);
      
    } else if (state.light === "GREEN") {
      state.light = "WARNING";
      this.lightTimeout = setTimeout(() => this.runLightCycle(), 300);
      
    } else if (state.light === "WARNING") {
      state.light = "RED";
      const redTime = Math.random() * 3000 + 3000; 
      this.lightTimeout = setTimeout(() => this.runLightCycle(), redTime);
    }
  }

  onJoin(client: Client, options: any = {}) {
    const state = this.state as GameState;
    const newPlayer = new Player();
    newPlayer.id = client.sessionId;
    newPlayer.name = options?.name || "Jugador " + Math.floor(Math.random() * 1000);
    newPlayer.gender = options?.gender || "M"; 
    
    state.players.set(client.sessionId, newPlayer);
    console.log(`[JOIN] ${newPlayer.name} ha entrado.`);
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    const player = state.players.get(client.sessionId);

    if (player) {
      if (player.name === "HOST_ADMIN") {
        console.log("[SISTEMA] Host desconectado. Destruyendo la sala...");
        this.disconnect(); 
        return;
      }
      
      console.log(`[LEAVE] ${player.name} abandonó la partida.`);

      if (state.status === "PLAYING" || state.status === "STARTING") {
        player.isAlive = false;
        this.checkGameOver(); 
      } else {
        state.players.delete(client.sessionId);
      }
    }
  }
}