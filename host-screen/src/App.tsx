import { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Text, useGLTF, Clone, Stats } from '@react-three/drei';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';

// 1. LA MUÑECA (Componente Reactivo a la luz)
function Doll({ light }: { light: string }) {
  const headRef = useRef<THREE.Group>(null);

  // La muñeca mira a los jugadores si es ROJO o ADVERTENCIA
  const targetRotation = (light === 'RED' || light === 'WARNING') ? Math.PI : 0;

  useFrame(() => {
    if (headRef.current) {
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetRotation, 0.25);
    }
  });

  return (
    <group position={[0, 0, 110]}>
      {/* Árbol y Refugio */}
      <mesh position={[6, 5, 0]}>
        <cylinderGeometry args={[0.5, 0.8, 10]} />
        <meshStandardMaterial color="#4E342E" />
      </mesh>
      <mesh position={[6, 12, 0]}>
        <sphereGeometry args={[4]} />
        <meshStandardMaterial color="#2E7D32" />
      </mesh>

      {/* Cuerpo y Cabeza de la Muñeca */}
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[1, 2, 8]} />
        <meshStandardMaterial color="#FF9800" />
      </mesh>
      <group ref={headRef} position={[0, 9, 0]}>
        <mesh>
          <sphereGeometry args={[1.5]} />
          <meshStandardMaterial color="#FFCCBC" />
        </mesh>
        <mesh position={[-0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="black" /></mesh>
        <mesh position={[0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="black" /></mesh>
      </group>
    </group>
  );
}

// MODELO GEOMÉTRICO (COMENTADO PARA RESPALDO)
/*
function PlayerCharacter() {
  return (
    <group position={[0, 1, 0]}>

      <mesh position={[-0.25, -0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 1]} />
        <meshStandardMaterial color="#00796B" />
      </mesh>
      <mesh position={[0.25, -0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 1]} />
        <meshStandardMaterial color="#00796B" />
      </mesh>

      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 1]} />
        <meshStandardMaterial color="#009688" />
      </mesh>

      <mesh position={[0, 0.4, 0.36]}>
        <planeGeometry args={[0.15, 1]} />
        <meshBasicMaterial color="white" />
      </mesh>

      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.3]} />
        <meshStandardMaterial color="#FFCCBC" />
      </mesh>
    </group>
  );
} 
*/
useGLTF.preload('/player.glb');
function GLTFPlayer() {
  // Extraemos la escena estática del archivo
  const { scene } = useGLTF('/player.glb');
  
  return (
    // scale=[1,1,1] es la escala original. Si el modelo se ve gigante o microscópico, ajusta estos números (ej: [0.5, 0.5, 0.5])
    <group position={[0, 0, 0]} scale={[2.3, 2.3, 2.3]}>
      <Clone object={scene} castShadow />
    </group>
  );
}

function SceneryDecals() {
  return (
    <group>
      {/* Nubes simples pintadas en las paredes */}
      <mesh position={[-29, 14, 40]}><sphereGeometry args={[3, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
      <mesh position={[-29, 11, 83]}><sphereGeometry args={[2.5, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
      <mesh position={[29, 13, 80]}><sphereGeometry args={[4, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
    </group>
  );
}

// 2. CÁMARA INTELIGENTE
function CameraRig({ players }: { players: any }) {
  useFrame((state) => {
    const playerArray = Object.values(players) as any[];
    const alivePlayers = playerArray.filter(p => p.isAlive);
    
    if (alivePlayers.length > 0) {
      // Buscar al jugador más adelantado
      const maxZ = Math.max(...alivePlayers.map(p => p.zPos || 0));
      // Frenar la cámara en Z=90 para no atravesar a la muñeca
      const clampedZ = Math.min(maxZ, 90); 
      
      const targetPosition = new THREE.Vector3(0, 8, clampedZ - 20);
      state.camera.position.lerp(targetPosition, 0.05);
      state.camera.lookAt(0, 2, clampedZ + 15);
    }
  });
  return null;
}

// 3. LA APLICACIÓN PRINCIPAL
const client = new Client("ws://192.168.1.6:2567");

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<any>({});
  
  // Variables locales extraídas del servidor para gobernar la UI
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [lightColor, setLightColor] = useState("RED");
  const [countdown, setCountdown] = useState<number | null>(null);

  const isConnecting = useRef(false);

  useEffect(() => {
    if (isConnecting.current) return;
    isConnecting.current = true;
    let currentRoom: Room;

    const connectHost = async () => {
      try {
        const response = await fetch(`http://192.168.1.6:2567/matchmake/joinOrCreate/squid_room`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: "HOST_ADMIN" })
        });
        
        if (!response.ok) throw new Error("Rechazado");
        
        let data = await response.json();
        if (!data.room) data = { sessionId: data.sessionId, room: { name: data.name, roomId: data.roomId, processId: data.processId } };

        const r = await client.consumeSeatReservation(data);
        setRoom(r);
        currentRoom = r;

        r.onStateChange((state: any) => {
          setGameStatus(state.status);
          setLightColor(state.light);

          const activePlayers: any = {};
          state.players.forEach((player: any, sessionId: string) => {
            if (player.name !== "HOST_ADMIN") {
              activePlayers[sessionId] = { isAlive: player.isAlive, zPos: player.zPos, name: player.name };
            }
          });
          setPlayers(activePlayers);
        });
      } catch (error) {
        console.error("Error Host:", error);
      }
    };

    connectHost();
    return () => {
      if (currentRoom) currentRoom.leave();
      isConnecting.current = false;
    };
  }, []);

  // Temporizador local de 3 segundos en el Host cuando el servidor dicta "STARTING"
  useEffect(() => {
    if (gameStatus === "STARTING") {
      setCountdown(3);
      const interval = setInterval(() => {
        setCountdown((prev) => (prev !== null && prev > 1 ? prev - 1 : null));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [gameStatus]);

  const startGame = () => { 
    if (room) room.send("HOST_START_GAME"); 
    // Disparar pantalla completa al interactuar con el botón
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  const restartGame = () => { if (room) room.send("RESTART_GAME"); };

  const isPanelVisible = gameStatus === "LOBBY" || gameStatus === "GAME_OVER";
  
  // Calcular si hubo ganadores para alterar el título del panel
  const winner: any = gameStatus === "GAME_OVER" ? Object.values(players).find((p: any) => p.isAlive) : null;
  const hasWinner = !!winner;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      
      {/* INTERFAZ 2D (Panel de Control) */}
      {isPanelVisible && (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(0,0,0,0.9)', padding: '25px', color: 'white', borderRadius: '12px', fontFamily: 'sans-serif', border: '1px solid #444' }}>
          <h2 style={{ margin: '0 0 15px 0', color: '#ffc107' }}>Control Maestro</h2>
          {gameStatus === "GAME_OVER" && (
            <h3 style={{ color: hasWinner ? '#28a745' : '#dc3545', marginTop: 0, fontSize: '24px' }}>
              {hasWinner ? "¡HAY UN GANADOR!" : "TODOS ELIMINADOS"}
            </h3>
          )}
          
          {gameStatus === "LOBBY" ? (
            <button onClick={startGame} style={{ padding: '15px', width: '100%', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '18px', borderRadius: '6px' }}>
              INICIAR PARTIDA
            </button>
          ) : (
            <button onClick={restartGame} style={{ padding: '15px', width: '100%', cursor: 'pointer', background: '#ffc107', color: 'black', border: 'none', fontWeight: 'bold', fontSize: '18px', borderRadius: '6px' }}>
              REINICIAR TODO
            </button>
          )}
          <p style={{ marginTop: '20px', fontSize: '14px', color: '#ccc' }}>Jugadores Conectados: <strong>{Object.keys(players).length}</strong></p>
        </div>
      )}

      {/* OVERLAY DEL CONTADOR GIGANTE EN EL HOST */}
      {gameStatus === "STARTING" && countdown !== null && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: 'white', fontSize: '150px', fontWeight: '900', textShadow: '0px 0px 20px black' }}>
          {countdown}
        </div>
      )}
      {gameStatus === "PLAYING" && lightColor === "GREEN" && countdown === null && (
        <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#28a745', fontSize: '120px', fontWeight: '900', textShadow: '0px 0px 20px black', animation: 'fadeOut 2s forwards' }}>
          ¡CORRE!
        </div>
      )}
      {gameStatus === "GAME_OVER" && winner && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, color: '#FFD700', textAlign: 'center', animation: 'winnerPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
          <h1 style={{ fontSize: '90px', margin: 0, textShadow: '0px 0px 30px #E91E63', fontWeight: '900', letterSpacing: '5px' }}>
            ¡GANADOR!
          </h1>
          <h2 style={{ fontSize: '50px', margin: '10px 0 0 0', color: 'white', textShadow: '0px 0px 20px black', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px 40px', borderRadius: '15px' }}>
            JUGADOR {winner.name.toUpperCase()}
          </h2>
        </div>
      )}

      {/* RENDERIZADO 3D */}
      <Canvas camera={{ position: [0, 8, -20], fov: 60 }}>
        <Stats />
        <Suspense fallback={null}>  
          <CameraRig players={players} />
          <Sky sunPosition={[100, 20, 100]} turbidity={0.5} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 5]} intensity={1.5} castShadow />

          {/* Suelo Principal */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 50]}>
            <planeGeometry args={[60, 140]} />
            <meshStandardMaterial color="#d4a373" roughness={1} />
          </mesh>

          {/* Líneas de Demarcación */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <planeGeometry args={[60, 1]} />
            <meshStandardMaterial color="#ffffff" /> {/* Línea de salida */}
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 100]}>
            <planeGeometry args={[60, 3]} />
            <meshStandardMaterial color="#E91E63" /> {/* Línea de Meta */}
          </mesh>

          {/* Muros Perimetrales (Cielo Falso) y Nubes */}
          <mesh position={[-30, 10, 50]}><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[30, 10, 50]}><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[0, 10, -20]}><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[0, 10, 130]}><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <SceneryDecals />

          {/* Guardias de Élite Rojos */}
          <group position={[-8, 2, 105]}>
            <mesh><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            {/* Símbolo Círculo */}
            <mesh position={[0, 1, -1.02]}>
              <torusGeometry args={[0.3, 0.06, 16, 32]} />
              <meshBasicMaterial color="black" />
            </mesh>
          </group>
          <group position={[8, 2, 105]}>
            <mesh><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            {/* Símbolo Cuadrado (Toroide de 4 segmentos rotado 45 grados) */}
            <mesh position={[0, 1, -1.02]} rotation={[0, 0, Math.PI / 4]}>
              <torusGeometry args={[0.35, 0.06, 4, 4]} />
              <meshBasicMaterial color="black" />
            </mesh>
          </group>

          {/* Muñeca */}
          <Doll light={lightColor} />

          {/* Renderizado de Jugadores (Nuevos Muñequitos) */}
          {Object.entries(players).map(([sessionId, player]: [string, any], index: number) => {
            if (!player.isAlive) return null;
            const total = Object.keys(players).length;
            const xPos = (index - (total - 1) / 2) * 3; // Separación ampliada a 3

            return (
              <group key={sessionId} position={[xPos, 0, player.zPos || 0]}>
                {/*<PlayerCharacter />*/}
                <GLTFPlayer />
                <Text 
                  position={[0, 2.8, 0]} 
                  rotation={[0, Math.PI, 0]} 
                  fontSize={0.5} 
                  color="white" 
                  outlineWidth={0.05} 
                  outlineColor="black" 
                  fontWeight="bold"
                >
                  {player.name || "JUGADOR"}
                </Text>
              </group>
            );
          })}
        </Suspense>
      </Canvas>
      
      {/* CSS inyectado para la animación de desvanecimiento del ¡CORRE! */}
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(1.5); }
        }
        @keyframes winnerPop {
          0% { transform: translate(-50%, -50%) scale(0.1); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default App;