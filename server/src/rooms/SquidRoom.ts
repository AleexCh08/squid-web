import { Room, Client } from "colyseus";
import { GameState } from "./schema/GameState.js";
import { Player } from "./schema/Player.js";

export class SquidRoom extends Room {
  // Cuánta distancia avanza por cada toque correcto de L o R
  private distancePerStep = 2.0; 

  onCreate(options: any) {
    this.setState(new GameState());

    // 1. Escuchar el evento de PASO del Gamepad
    this.onMessage("STEP", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      
      if (!player || !player.isAlive || state.status !== "PLAYING") return;

      // VALIDACIÓN AUTORITATIVA: El servidor manda.
      if (state.light === "RED") {
        // Tramposo o lag extremo: se movió en rojo.
        player.isAlive = false;
        console.log(`[ELIMINADO] ${player.name} se movió en LUZ ROJA.`);
      } else {
        // Avance legal
        player.zPos += this.distancePerStep;
        
        if (player.zPos >= 100) {
          // Llegó a la meta
          console.log(`[VICTORIA] ${player.name} ha llegado a la meta.`);
          // (Opcional: Cambiar isAlive a true u otro estado de victoria)
        }
      }
    });

    // 2. Escuchar cuando el Gamepad confiesa que murió (por equilibrio o inacción)
    this.onMessage("PLAYER_DIED", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      
      if (player && player.isAlive) {
        player.isAlive = false;
        console.log(`[ELIMINADO] ${player.name} confesó su muerte (Equilibrio fallido).`);
      }
    });

    // 3. Escuchar eventos del Host (La Pantalla 3D)
    this.onMessage("HOST_START_GAME", (client, message) => {
      const state = this.state as GameState;
      state.status = "PLAYING";
      state.light = "RED"; 
      console.log("[JUEGO INICIADO]");
    });

    this.onMessage("CHANGE_LIGHT", (client, data: { light: string }) => {
      const state = this.state as GameState;
      state.light = data.light;
      console.log(`[LUZ CAMBIADA] ${data.light}`);
    });
    
  }

  onJoin(client: Client, options: any) {
    const state = this.state as GameState;
    const newPlayer = new Player();
    newPlayer.id = client.sessionId;
    newPlayer.name = options.name || "Jugador " + Math.floor(Math.random() * 1000); 
    
    state.players.set(client.sessionId, newPlayer);
    console.log(`[JOIN] ${newPlayer.name} ha entrado.`);
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    state.players.delete(client.sessionId);
    console.log(`[LEAVE] ${client.sessionId} salió.`);
  }

  onDispose() {
    console.log(`[DISPOSE] Sala cerrada.`);
  }
}