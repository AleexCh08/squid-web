import { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Text, useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { QRCodeCanvas } from 'qrcode.react';

// La Muñeca
function Doll({ light }: { light: string }) {
  const headRef = useRef<THREE.Group>(null);
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

// Modelos (Jugadores)
useGLTF.preload('/playerM.glb');
useGLTF.preload('/playerF.glb');

function PlayerMale() {
  const { scene } = useGLTF('/playerM.glb');
  return (
    <group position={[0, 0, 0]} scale={[2.3, 2.3, 2.3]}>
      <Clone object={scene} castShadow />
    </group>
  );
}

function PlayerFemale() {
  const { scene } = useGLTF('/playerF.glb');
  return (
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

// CÁMARA INTELIGENTE
function CameraRig({ players }: { players: any }) {
  useFrame((state) => {
    const playerArray = Object.values(players) as any[];
    const alivePlayers = playerArray.filter(p => p.isAlive);
    
    if (alivePlayers.length > 0) {
      const maxZ = Math.max(...alivePlayers.map(p => p.zPos || 0));
      const clampedZ = Math.min(maxZ, 90); 
      
      const targetPosition = new THREE.Vector3(0, 8, clampedZ - 20);
      state.camera.position.lerp(targetPosition, 0.05);
      state.camera.lookAt(0, 2, clampedZ + 15);
    }
  });
  return null;
}

// LA APLICACIÓN PRINCIPAL
const isLocal = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168.");
const BACKEND_URL = isLocal 
  ? `http://${window.location.hostname}:2567` 
  : "https://tu-futuro-backend.onrender.com"; // Cambiarás esto al subirlo a la nube

const WS_URL = BACKEND_URL.replace(/^http/, 'ws');
const client = new Client(WS_URL);

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<any>({});
  
  const [gameStatus, setGameStatus] = useState("CONNECTING");
  const [lightColor, setLightColor] = useState("RED");
  const [countdown, setCountdown] = useState<number | null>(null);

  const isConnecting = useRef(false);

  useEffect(() => {
    if (isConnecting.current) return;
    isConnecting.current = true;
    let currentRoom: Room;

    const connectHost = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/matchmake/joinOrCreate/squid_room`, {
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
              activePlayers[sessionId] = { isAlive: player.isAlive, zPos: player.zPos, name: player.name, gender: player.gender };
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
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  const goToArena = () => { if (room) room.send("GO_TO_ARENA"); };
  const restartMatch = () => { if (room) room.send("RESTART_MATCH"); };
  const returnToQr = () => { if (room) room.send("RETURN_TO_QR"); };

  const gamepadUrl = isLocal
      ? `http://${window.location.hostname}:5173` 
      : window.location.origin;
  const playerCount = Object.keys(players).length;

  if (gameStatus === "CONNECTING") {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#E91E63', fontFamily: 'sans-serif', fontWeight: 'bold', letterSpacing: '2px', animation: 'pulse 1.5s infinite' }}>
          CONECTANDO AL SERVIDOR...
        </h2>
      </div>
    );
  }

  const isPanelVisible = gameStatus === "LOBBY" || gameStatus === "GAME_OVER";
  const winner: any = gameStatus === "GAME_OVER" ? Object.values(players).find((p: any) => p.isAlive) : null;
  const hasWinner = !!winner;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      
      {gameStatus === "PRE_LOBBY" && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100, backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: 'white' }}>
          <h1 style={{ fontSize: '50px', color: '#E91E63', marginBottom: '10px', letterSpacing: '8px', fontWeight: '900' }}>LUZ ROJA, LUZ VERDE</h1>
          <p style={{ fontSize: '20px', color: '#888', marginBottom: '40px' }}>Escanea para conectar tu Gamepad</p>
          
          <div style={{ background: 'white', padding: '20px', borderRadius: '15px', marginBottom: '40px', boxShadow: '0 0 30px rgba(233, 30, 99, 0.3)' }}>
            <QRCodeCanvas value={gamepadUrl} size={250} level={"H"} />
          </div>

          <h2 style={{ color: '#28a745', marginBottom: '15px' }}>Jugadores en sala: {playerCount}</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '600px', marginBottom: '40px', minHeight: '40px' }}>
            {Object.values(players).map((p: any, i) => (
              <span key={i} style={{ background: '#222', border: '1px solid #444', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
                {p.name}
              </span>
            ))}
          </div>

          <button 
            onClick={goToArena}
            disabled={playerCount === 0}
            style={{ 
              padding: '20px 60px', fontSize: '24px', fontWeight: 'bold', borderRadius: '10px', 
              cursor: playerCount === 0 ? 'not-allowed' : 'pointer', 
              background: playerCount === 0 ? '#333' : '#28a745', 
              color: playerCount === 0 ? '#666' : 'white', 
              border: 'none', transition: 'all 0.3s'
            }}
          >
            IR AL ESCENARIO
          </button>
        </div>
      )}
      
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
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={restartMatch} style={{ flex: 1, padding: '15px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px' }}>
                VOLVER A JUGAR
              </button>
              <button onClick={returnToQr} style={{ flex: 1, padding: '15px', cursor: 'pointer', background: '#ffc107', color: 'black', border: 'none', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px' }}>
                VOLVER AL QR
              </button>
            </div>
          )}
          <p style={{ marginTop: '20px', fontSize: '14px', color: '#ccc' }}>Jugadores Conectados: <strong>{Object.keys(players).length}</strong></p>
        </div>
      )}

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

      <Canvas camera={{ position: [0, 8, -20], fov: 60 }}>
        {/* <Stats /> */}
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
            <mesh position={[0, 1, -1.02]}>
              <torusGeometry args={[0.3, 0.06, 16, 32]} />
              <meshBasicMaterial color="black" />
            </mesh>
          </group>
          <group position={[8, 2, 105]}>
            <mesh><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            <mesh position={[0, 1, -1.02]} rotation={[0, 0, Math.PI / 4]}>
              <torusGeometry args={[0.35, 0.06, 4, 4]} />
              <meshBasicMaterial color="black" />
            </mesh>
          </group>

          {/* Muñeca */}
          <Doll light={lightColor} />

          {/* Renderizado de Jugadores */}
          {Object.entries(players).map(([sessionId, player]: [string, any], index: number) => {
            if (!player.isAlive) return null;
            const total = Object.keys(players).length;
            const xPos = (index - (total - 1) / 2) * 3;

            return (
              <group key={sessionId} position={[xPos, 0, player.zPos || 0]}>
                {/*<PlayerCharacter />*/}
                {player.gender === 'F' ? <PlayerFemale /> : <PlayerMale />}
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