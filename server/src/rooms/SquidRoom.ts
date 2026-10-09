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

    // Si todos murieron, cerramos el juego
    if (!anyAlive) {
      state.status = "GAME_OVER";
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      this.unlock(); // Abrimos la sala para la siguiente ronda
    }
  }

  onCreate(options: any) {
    this.setState(new GameState());

    this.onMessage("STEP", (client, message) => {
      const state = this.state as GameState;
      if (state.status !== "PLAYING") return;
      
      const player = state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;

      if (state.light === "RED") {
        player.isAlive = false;
        this.checkGameOver(); // Validamos si fue el último en morir
        return;
      }

      player.zPos += this.distancePerStep;

      // VALIDACIÓN DE VICTORIA
      if (player.zPos >= this.FINISH_LINE_Z) {
        state.status = "GAME_OVER";
        if (this.lightTimeout) clearTimeout(this.lightTimeout);
        this.unlock();
        
        // Ejecución masiva: Eliminamos a todos menos al ganador y al Host
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
        this.checkGameOver(); // Validamos si fue el último
      }
    });

    this.onMessage("HOST_START_GAME", (client, message) => {
      const state = this.state as GameState;
      if (state.status !== "LOBBY") return; // Evitar múltiples clics
      
      state.status = "STARTING"; // Estado puente de 3 segundos
      this.lock(); 
      
      setTimeout(() => {
        state.status = "PLAYING";
        state.light = "GREEN";
        this.lightTimeout = setTimeout(() => this.runLightCycle(), 6000); 
      }, 3000); // 3000 ms = 3 segundos
    });

    this.onMessage("RESTART_GAME", (client, message) => {
      const state = this.state as GameState;
      
      // Detener el ciclo de luces
      if (this.lightTimeout) clearTimeout(this.lightTimeout);
      
      // Resetear el estado general
      state.status = "LOBBY";
      state.light = "RED";
      
      // Revivir a todos los jugadores en sala y devolverlos a la línea de salida
      state.players.forEach(player => {
        player.isAlive = true;
        player.zPos = 0;
      });
      
      // DESBLOQUEAR LA SALA: Permitir nuevos ingresos
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
      // De rojo pasamos a verde
      state.light = "GREEN";
      const greenTime = Math.random() * 3000 + 3000; // Entre 3 y 6 segundos
      this.lightTimeout = setTimeout(() => this.runLightCycle(), greenTime);
      
    } else if (state.light === "GREEN") {
      // ALERTA: La muñeca deja de cantar y gira la cabeza (Aún no mueren)
      state.light = "WARNING";
      this.lightTimeout = setTimeout(() => this.runLightCycle(), 300); // Medio segundo de terror
      
    } else if (state.light === "WARNING") {
      // BALAS REALES: Quien se mueva ahora, muere.
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
    
    state.players.set(client.sessionId, newPlayer);
    console.log(`[JOIN] ${newPlayer.name} ha entrado.`);
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    state.players.delete(client.sessionId);
  }
}