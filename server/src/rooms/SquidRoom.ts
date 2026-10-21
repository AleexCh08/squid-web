import { Room, Client } from "colyseus";
import { Schema, MapSchema, type as colyseusType } from "@colyseus/schema";

export class Player extends Schema {
  @colyseusType("string") id: string = "";
  @colyseusType("string") name: string = "";
  @colyseusType("string") gender: string = "M";
  @colyseusType("boolean") isAlive: boolean = true;
  @colyseusType("boolean") isMoving: boolean = false;
  @colyseusType("number") zPos: number = 0;
}

export class GameState extends Schema {
  @colyseusType("string") status: string = "PRE_LOBBY"; 
  @colyseusType("string") light: string = "RED";
  @colyseusType("string") difficulty: string = "NORMAL";
  
  @colyseusType({ map: Player }) players = new MapSchema<Player>();
}

export class SquidRoom extends Room {
  state: GameState;
  private distancePerStep = 1.25; 
  private lightTimeout?: NodeJS.Timeout;
  private readonly FINISH_LINE_Z = 100;
  private isGameOverHandled: boolean = false;
  private hostDisconnectTimeout?: NodeJS.Timeout;
  private renderPingInterval?: NodeJS.Timeout;

  private checkGameOver() {
    const state = this.state;
    if (state.status !== "PLAYING" || this.isGameOverHandled) return;

    let anyAlive = false;
    state.players.forEach(p => { 
      if (p.name !== "HOST_ADMIN" && p.isAlive) anyAlive = true; 
    });

    if (!anyAlive) {
      this.isGameOverHandled = true; 
      state.status = "GAME_OVER";
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      this.unlock(); 
    }
  }

  onCreate(options: any) {
    this.setState(new GameState());

    this.renderPingInterval = setInterval(() => {
      this.broadcast("HEARTBEAT");
    }, 30000);

    this.onMessage("SET_DIFFICULTY", (client, data: { level: string, distance: number }) => {
      const state = this.state as GameState;
      if (state.status === "PRE_LOBBY" || state.status === "LOBBY") {
        state.difficulty = data.level;
        this.distancePerStep = data.distance;
        console.log(`[SISTEMA] Dificultad cambiada a: ${data.level} (Paso: ${data.distance})`);
      }
    });

    this.onMessage("GO_TO_ARENA", (client, message) => {
      const state = this.state as GameState;
      if (state.status === "PRE_LOBBY") {
        state.status = "LOBBY"; 
      }
    });

    this.onMessage("STEP", (client, message) => {
      const state = this.state;
      if (state.status !== "PLAYING" || this.isGameOverHandled) return;
      
      const player = state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;

      if (state.light === "RED") {
        player.isAlive = false;
        this.checkGameOver(); 
        return;
      }

      player.zPos += this.distancePerStep;

      if (player.zPos >= this.FINISH_LINE_Z) {
        this.isGameOverHandled = true; 
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
      this.isGameOverHandled = false;
      this.lock(); 
      
      setTimeout(() => {
        if (state.status === "STARTING") {
          state.status = "PLAYING";
          state.light = "GREEN";
          this.lightTimeout = setTimeout(() => this.runLightCycle(), 6000); 
        } 
      }, 3000);
    });

    this.onMessage("RESTART_MATCH", (client, message) => {
      const state = this.state as GameState;
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      
      state.status = "LOBBY";
      state.light = "RED";
      this.isGameOverHandled = false;
      
      state.players.forEach(player => {
        player.isAlive = true;
        player.zPos = 0;
      });
      
      this.unlock();
    });

    this.onMessage("RETURN_TO_QR", (client, message) => {
      const state = this.state;
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      
      state.status = "PRE_LOBBY";
      state.light = "RED";
      
      state.players.forEach(player => {
        player.isAlive = true;
        player.zPos = 0;
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

  onJoin(client: Client, options: any) {
    const data = options || {};

    if (data.name === "HOST_ADMIN") {
      client.userData = { isHost: true };
      if (this.hostDisconnectTimeout) clearTimeout(this.hostDisconnectTimeout);
      console.log(`[SISTEMA] Host conectado. Sala blindada.`);
    } else {
      let isDuplicate = false;
      this.state.players.forEach((p) => {
        if (p.name === data.name) isDuplicate = true;
      });

      if (isDuplicate) {
        throw new Error("NUMERO_DUPLICADO");
      }

      const player = new Player();
      player.name = data.name || "000"; 
      player.gender = data.gender || "M";
      player.isAlive = true;
      player.zPos = 0; 
      
      this.state.players.set(client.sessionId, player);
    }
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    const player = state.players.get(client.sessionId);
    const isHost = client.userData?.isHost || player?.name === "HOST_ADMIN";

    if (isHost) {
      console.log(`[SISTEMA] Host desconectado. Iniciando cuenta regresiva de 10s...`);
      this.hostDisconnectTimeout = setTimeout(() => {
        console.log(`[SISTEMA] Tiempo agotado. Destruyendo sala fantasma ${this.roomId}`);
        this.disconnect();
      }, 10000);
      return;
    }

    if (player) {
      console.log(`[LEAVE] ${player.name} abandonó la partida.`);

      if (state.status === "PLAYING" || state.status === "STARTING") {
        player.isAlive = false;
        this.checkGameOver(); 
      } else {
        state.players.delete(client.sessionId);
      }
    }
  }

  onDispose() {
    if (this.renderPingInterval) clearInterval(this.renderPingInterval);
    if (this.lightTimeout) clearTimeout(this.lightTimeout);
    if (this.hostDisconnectTimeout) clearTimeout(this.hostDisconnectTimeout);
    console.log(`[SISTEMA] Sala ${this.roomId} destruida y memoria liberada.`);
  }
}