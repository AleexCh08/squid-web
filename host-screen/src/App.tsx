import { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { Client, Room } from 'colyseus.js';

const client = new Client("ws://192.168.1.6:2567");

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<any>({});
  
  // Escudo contra el Strict Mode de React para evitar conexiones fantasma
  const isConnecting = useRef(false);

  useEffect(() => {
    if (isConnecting.current) return;
    isConnecting.current = true;

    let currentRoom: Room;

    const connectHost = async () => {
      try {
        // 1. Mismo bypass de red que usamos en el Gamepad para saltar el bug de versiones
        const response = await fetch(`http://192.168.1.6:2567/matchmake/joinOrCreate/squid_room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: "HOST_ADMIN" })
        });
        
        if (!response.ok) throw new Error("El servidor rechazó al Host");
        
        let data = await response.json();
        if (!data.room) {
          data = { sessionId: data.sessionId, room: { name: data.name, roomId: data.roomId, processId: data.processId } };
        }

        // 2. Conexión segura
        const r = await client.consumeSeatReservation(data);
        console.log("Host conectado de forma segura a la sala:", r.roomId);
        setRoom(r);
        currentRoom = r;

        // 3. Forzamos la reactividad leyendo el estado completo en cada "tick" del servidor
        r.onStateChange((state: any) => {
          const activePlayers: any = {};
          
          // Iteramos el MapSchema manualmente
          state.players.forEach((player: any, sessionId: string) => {
            // Condición vital: El Host no es un jugador, no lo dibujamos
            if (player.name !== "HOST_ADMIN") {
              activePlayers[sessionId] = {
                isAlive: player.isAlive,
                zPos: player.zPos,
                name: player.name
              };
            }
          });
          
          setPlayers(activePlayers);
        });

      } catch (error) {
        console.error("Error al conectar el Host:", error);
      }
    };

    connectHost();

    return () => {
      if (currentRoom) currentRoom.leave();
      isConnecting.current = false; // Liberamos el escudo al desmontar
    };
  }, []);

  const startGame = () => {
    if (room) room.send("HOST_START_GAME"); // El servidor ahora hace el resto
  };

  const restartGame = () => {
    if (room) room.send("RESTART_GAME");
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', margin: 0, overflow: 'hidden' }}>
      
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(0,0,0,0.8)', padding: '20px', color: 'white', borderRadius: '8px', fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: '0 0 15px 0' }}>Panel de Control Host</h2>
        
        <button 
          onClick={startGame} 
          style={{ padding: '12px', width: '100%', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '16px' }}>
          INICIAR JUEGO
        </button>
        
        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button 
            onClick={restartGame} 
            style={{ flex: 1, padding: '10px', background: '#ffc107', cursor: 'pointer', border: 'none', color: 'black', fontWeight: 'bold' }}>
            REINICIAR PARTIDA
          </button>
        </div>
        
        <p style={{ marginTop: '15px' }}>Jugadores en sala: <strong>{Object.keys(players).length}</strong></p>
      </div>

      <Canvas camera={{ position: [0, 5, -15], fov: 60 }}>
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 50]} receiveShadow>
          <planeGeometry args={[100, 120]} />
          <meshStandardMaterial color="#e0b179" />
        </mesh>

        {Object.entries(players).map(([sessionId, player]: [string, any], index: number) => {
          if (!player.isAlive) return null; // Si muere, desaparece
          
          // Calculamos la posición X para que se alineen horizontalmente
          const totalPlayers = Object.keys(players).length;
          const spacing = 2; // Unidades de separación entre cubos
          const xPos = (index - (totalPlayers - 1) / 2) * spacing;

          return (
            <mesh key={sessionId} position={[xPos, 0.5, player.zPos || 0]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#007bff" />
            </mesh>
          );
        })}

        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default App;