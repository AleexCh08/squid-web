import { Room, Client } from "colyseus";
import { GameState } from "./schema/GameState.js";
import { Player } from "./schema/Player.js";

export class SquidRoom extends Room {
  // Velocidad de avance por cada "tick" del servidor
  private moveSpeed = 0.5;

  onCreate(options: any) {
    this.setState(new GameState());

    // 1. Escuchar eventos del Gamepad (Teléfonos)
    this.onMessage("START_MOVE", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      // Solo puede moverse si está vivo y el juego ha iniciado
      if (player && player.isAlive && state.status === "PLAYING") {
        player.isMoving = true;
      }
    });

    this.onMessage("STOP_MOVE", (client, message) => {
      const state = this.state as GameState;
      const player = state.players.get(client.sessionId);
      if (player) {
        player.isMoving = false;
      }
    });

    // 2. Escuchar eventos del Host (Pantalla 3D)
    this.onMessage("HOST_START_GAME", (client, message) => {
      const state = this.state as GameState;
      state.status = "PLAYING";
      state.light = "RED"; // Siempre arranca en rojo para evitar accidentes
    });

    this.onMessage("CHANGE_LIGHT", (client, data: { light: string }) => {
      const state = this.state as GameState;
      // data.light debe ser "GREEN" o "RED"
      state.light = data.light;
    });

    // 3. El Bucle Físico Autoritativo (Tick Rate)
    // Se ejecuta 30 veces por segundo (1000ms / 30 = ~33.3ms)
    this.setSimulationInterval((deltaTime) => {
      this.update(deltaTime);
    }, 1000 / 30);
  }

  // La matemática que el cliente no puede hackear
  update(deltaTime: number) {
    const state = this.state as GameState;
    if (state.status !== "PLAYING") return;

    state.players.forEach((player: Player) => {
      // Si el jugador reporta estar moviéndose...
      if (player.isAlive && player.isMoving) {
        
        if (state.light === "GREEN") {
          // Incrementa su posición Z
          player.zPos += this.moveSpeed;
          
          // Condición de victoria (La meta está a 100 unidades)
          if (player.zPos >= 100) {
            player.isMoving = false;
            // Aquí en el futuro emitiremos evento de "Sobrevivió"
          }

        } else if (state.light === "RED") {
          // Si el servidor evalúa este tick, la luz es roja y el jugador sigue en isMoving = true, muere inmediatamente.
          player.isAlive = false;
          player.isMoving = false;
        }
      }
    });
  }

  onJoin(client: Client, options: any) {
    const state = this.state as GameState;
    const newPlayer = new Player();
    newPlayer.id = client.sessionId;
    // Capturamos el nombre que escriba en el formulario del móvil
    newPlayer.name = options.name || "Jugador " + Math.floor(Math.random() * 1000); 
    
    state.players.set(client.sessionId, newPlayer);
    console.log(`[JOIN] ${newPlayer.name} (${client.sessionId}) ha entrado a la sala.`);
  }

  onLeave(client: Client, code?: number) {
    const state = this.state as GameState;
    state.players.delete(client.sessionId);
    console.log(`[LEAVE] ${client.sessionId} salió de la sala con código: ${code}.`);
  }

  onDispose() {
    console.log(`[DISPOSE] Sala ${this.roomId} cerrada.`);
  }
}