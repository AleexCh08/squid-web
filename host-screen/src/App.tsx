import { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Text, useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { QRCodeCanvas } from 'qrcode.react';

// ==================== COMPONENTES 3D ====================
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
      <mesh position={[6, 5, 0]}><cylinderGeometry args={[0.5, 0.8, 10]} /><meshStandardMaterial color="#4E342E" /></mesh>
      <mesh position={[6, 12, 0]}><sphereGeometry args={[4]} /><meshStandardMaterial color="#2E7D32" /></mesh>
      <mesh position={[0, 4, 0]}><cylinderGeometry args={[1, 2, 8]} /><meshStandardMaterial color="#FF9800" /></mesh>
      <group ref={headRef} position={[0, 9, 0]}>
        <mesh><sphereGeometry args={[1.5]} /><meshStandardMaterial color="#FFCCBC" /></mesh>
        <mesh position={[-0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="black" /></mesh>
        <mesh position={[0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshBasicMaterial color="black" /></mesh>
      </group>
    </group>
  );
}

useGLTF.preload('/playerM.glb');
useGLTF.preload('/playerF.glb');

function PlayerMale() {
  const { scene } = useGLTF('/playerM.glb');
  return <group position={[0, 0, 0]} scale={[2.3, 2.3, 2.3]}><Clone object={scene} castShadow /></group>;
}

function PlayerFemale() {
  const { scene } = useGLTF('/playerF.glb');
  return <group position={[0, 0, 0]} scale={[2.3, 2.3, 2.3]}><Clone object={scene} castShadow /></group>;
}

function SceneryDecals() {
  return (
    <group>
      <mesh position={[-29, 14, 40]}><sphereGeometry args={[3, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
      <mesh position={[-29, 11, 83]}><sphereGeometry args={[2.5, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
      <mesh position={[29, 13, 80]}><sphereGeometry args={[4, 16, 16]} /><meshBasicMaterial color="blue" /></mesh>
    </group>
  );
}

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

// ==================== LÓGICA DE RED ====================
const isLocal = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168.");
const BACKEND_URL = isLocal 
  ? `http://${window.location.hostname}:2567` 
  : "https://tu-futuro-backend.onrender.com"; 

const WS_URL = BACKEND_URL.replace(/^http/, 'ws');
const client = new Client(WS_URL);

// ==================== APLICACIÓN PRINCIPAL ====================
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

  // 1. PANTALLA DE CONEXIÓN
  if (gameStatus === "CONNECTING") {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#050505', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '60px', height: '60px', border: '4px solid #E91E63', marginBottom: '30px', animation: 'spin 2s linear infinite' }}></div>
        <h2 style={{ color: '#E91E63', fontFamily: 'sans-serif', fontWeight: '900', letterSpacing: '8px', animation: 'pulse 1.5s infinite' }}>
          SISTEMA INICIANDO
        </h2>
      </div>
    );
  }

  const isPanelVisible = gameStatus === "LOBBY" || gameStatus === "GAME_OVER";
  const winner: any = gameStatus === "GAME_OVER" ? Object.values(players).find((p: any) => p.isAlive) : null;
  const hasWinner = !!winner;

  // ==================== INTERFAZ PRINCIPAL ====================
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      
      {/* 2. CORTINA DE LOBBY (CÓDIGO QR) */}
      {gameStatus === "PRE_LOBBY" && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100, backgroundColor: '#050505', backgroundImage: 'radial-gradient(circle at center, #1a0005 0%, #050505 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          
          <h1 style={{ fontSize: '70px', color: '#E91E63', margin: '0 0 10px 0', letterSpacing: '15px', fontWeight: '900', textShadow: '0 0 30px rgba(233,30,99,0.6)', lineHeight: '1.1' }}>
            SQUID <span style={{ color: 'white' }}>GAME</span>
          </h1>
          
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', letterSpacing: '8px', margin: '0 0 15px 0' }}>
            LUZ <span style={{ color: '#E91E63' }}>ROJA</span> <span style={{ color: '#333', margin: '0 15px' }}>|</span> LUZ <span style={{ color: '#14B8A6' }}>VERDE</span>
          </h2>

          <p style={{ fontSize: '14px', color: '#666', marginBottom: '35px', letterSpacing: '8px', fontWeight: 'bold' }}>SISTEMA DE EMPAREJAMIENTO</p>
          
          <div style={{ background: 'white', padding: '15px', border: '4px solid #E91E63', marginBottom: '25px', boxShadow: '0 0 50px rgba(233, 30, 99, 0.4)' }}>
            <QRCodeCanvas value={gamepadUrl} size={220} level={"H"} />
          </div>

          <h2 style={{ color: '#14B8A6', marginBottom: '15px', letterSpacing: '4px', fontSize: '14px', fontWeight: 'bold' }}>SUJETOS DETECTADOS: <span style={{fontSize: '20px'}}>{playerCount}</span></h2>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '800px', marginBottom: '40px', minHeight: '50px' }}>
            {Object.values(players).map((p: any, i) => (
              <span key={i} style={{ background: '#111', border: '1px solid #E91E63', padding: '8px 16px', color: '#E91E63', fontWeight: '900', letterSpacing: '2px', boxShadow: '0 0 10px rgba(233,30,99,0.2)', fontSize: '14px' }}>
                #{p.name}
              </span>
            ))}
          </div>

          <button 
            onClick={goToArena}
            disabled={playerCount === 0}
            style={{ 
              padding: '15px 60px', fontSize: '18px', fontWeight: '900', letterSpacing: '6px',
              cursor: playerCount === 0 ? 'not-allowed' : 'pointer', 
              background: playerCount === 0 ? '#111' : '#E91E63', 
              color: playerCount === 0 ? '#444' : 'white', 
              border: playerCount === 0 ? '2px solid #222' : '2px solid #E91E63', 
              boxShadow: playerCount === 0 ? 'none' : '0 0 30px rgba(233,30,99,0.6)',
              transition: 'all 0.3s', textTransform: 'uppercase'
            }}
          >
            Aperturar Puertas
          </button>
        </div>
      )}
      
      {/* 3. PANEL DE CONTROL COMPACTO (MAESTRO) */}
      {isPanelVisible && (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(5,5,5,0.95)', padding: '20px', color: 'white', border: '2px solid #E91E63', boxShadow: '0 0 30px rgba(233,30,99,0.3)', width: 'auto', minWidth: '260px' }}>
          
          <h2 style={{ margin: '0 0 5px 0', color: '#E91E63', fontSize: '18px', letterSpacing: '3px', fontWeight: '900' }}>PANEL DE CONTROL</h2>
          <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '9px', letterSpacing: '2px' }}>ACCESO RESTRINGIDO - FRONTMAN</p>

          {gameStatus === "GAME_OVER" && (
            <div style={{ borderLeft: `3px solid ${hasWinner ? '#14B8A6' : '#E91E63'}`, paddingLeft: '10px', marginBottom: '20px' }}>
              <h3 style={{ color: hasWinner ? '#14B8A6' : '#E91E63', margin: 0, fontSize: '13px', letterSpacing: '1px' }}>
                {hasWinner ? "NIVEL COMPLETADO" : "ELIMINACIÓN TOTAL"}
              </h3>
            </div>
          )}
          
          {gameStatus === "LOBBY" ? (
            <button onClick={startGame} style={{ padding: '12px 20px', width: '100%', cursor: 'pointer', background: '#E91E63', color: 'white', border: 'none', fontWeight: '900', letterSpacing: '2px', fontSize: '14px', textTransform: 'uppercase', boxShadow: '0 0 15px rgba(233,30,99,0.4)' }}>
              INICIAR JUEGO
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={restartMatch} style={{ padding: '10px 15px', cursor: 'pointer', background: 'transparent', color: '#14B8A6', border: '2px solid #14B8A6', fontWeight: 'bold', letterSpacing: '1px', fontSize: '11px', textTransform: 'uppercase', transition: 'all 0.2s' }}>
                NUEVA RONDA
              </button>
              <button onClick={returnToQr} style={{ padding: '10px 15px', cursor: 'pointer', background: 'transparent', color: '#E91E63', border: '2px solid #E91E63', fontWeight: 'bold', letterSpacing: '1px', fontSize: '11px', textTransform: 'uppercase', transition: 'all 0.2s' }}>
                VOLVER AL LOBBY
              </button>
            </div>
          )}

          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#888', letterSpacing: '1px', fontWeight: 'bold' }}>SUJETOS ACTIVOS:</span>
            <span style={{ fontSize: '20px', color: '#14B8A6', fontWeight: '900' }}>{Object.keys(players).length}</span>
          </div>
        </div>
      )}

      {/* 4. OVERLAYS DE ACCIÓN A PRUEBA DE COLISIONES */}
      {gameStatus === "STARTING" && countdown !== null && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#E91E63', fontSize: '200px', fontWeight: '900', textShadow: '0 0 50px rgba(233,30,99,0.8)', animation: 'pulse 1s infinite' }}>
          {countdown}
        </div>
      )}
      
      {/* Alertas dinámicas con Key para reiniciar animación */}
      {gameStatus === "PLAYING" && countdown === null && (
        <>
          {lightColor === "GREEN" && (
            <div key="green" style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#14B8A6', fontSize: '100px', fontWeight: '900', letterSpacing: '10px', textShadow: '0 0 40px rgba(20,184,166,0.8)', whiteSpace: 'nowrap', animation: 'fadeOut 2s forwards' }}>
              LUZ VERDE
            </div>
          )}
          {lightColor === "RED" && (
            <div key="red" style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#E91E63', fontSize: '100px', fontWeight: '900', letterSpacing: '10px', textShadow: '0 0 40px rgba(233,30,99,0.8)', whiteSpace: 'nowrap', animation: 'fadeOut 2s forwards' }}>
              LUZ ROJA
            </div>
          )}
        </>
      )}
      
      {gameStatus === "GAME_OVER" && winner && (
        <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, textAlign: 'center', animation: 'winnerPop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', whiteSpace: 'nowrap' }}>
          <h1 style={{ fontSize: '80px', margin: 0, color: '#14B8A6', textShadow: '0 0 40px rgba(20,184,166,0.6)', fontWeight: '900', letterSpacing: '15px' }}>
            SUPERVIVIENTE
          </h1>
          <div style={{ display: 'inline-block', marginTop: '20px', border: '4px solid #14B8A6', padding: '15px 50px', backgroundColor: 'rgba(5,5,5,0.8)' }}>
            <h2 style={{ fontSize: '40px', margin: 0, color: 'white', letterSpacing: '8px', fontWeight: '900' }}>
              JUGADOR #{winner.name}
            </h2>
          </div>
        </div>
      )}

      {/* 5. RENDERIZADO 3D */}
      <Canvas camera={{ position: [0, 8, -20], fov: 60 }}>
        <Suspense fallback={null}>  
          <CameraRig players={players} />
          <Sky sunPosition={[100, 20, 100]} turbidity={0.5} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 5]} intensity={1.5} castShadow />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 50]}><planeGeometry args={[60, 140]} /><meshStandardMaterial color="#d4a373" roughness={1} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[60, 1]} /><meshStandardMaterial color="#ffffff" /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 100]}><planeGeometry args={[60, 3]} /><meshStandardMaterial color="#E91E63" /></mesh>

          <mesh position={[-30, 10, 50]}><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[30, 10, 50]}><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[0, 10, -20]}><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <mesh position={[0, 10, 130]}><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#87CEEB" roughness={1} /></mesh>
          <SceneryDecals />

          {/* Guardias */}
          <group position={[-8, 2, 105]}>
            <mesh><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            <mesh position={[0, 1, -1.02]}><torusGeometry args={[0.3, 0.06, 16, 32]} /><meshBasicMaterial color="black" /></mesh>
          </group>
          <group position={[8, 2, 105]}>
            <mesh><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            <mesh position={[0, 1, -1.02]} rotation={[0, 0, Math.PI / 4]}><torusGeometry args={[0.35, 0.06, 4, 4]} /><meshBasicMaterial color="black" /></mesh>
          </group>

          <Doll light={lightColor} />

          {/* Jugadores */}
          {Object.entries(players).map(([sessionId, player]: [string, any], index: number) => {
            if (!player.isAlive) return null;
            const total = Object.keys(players).length;
            const xPos = (index - (total - 1) / 2) * 3;

            return (
              <group key={sessionId} position={[xPos, 0, player.zPos || 0]}>
                {player.gender === 'F' ? <PlayerFemale /> : <PlayerMale />}
                <Text position={[0, 2.8, 0]} rotation={[0, Math.PI, 0]} fontSize={0.5} color="white" outlineWidth={0.05} outlineColor="black" fontWeight="bold">
                  {player.name}
                </Text>
              </group>
            );
          })}
        </Suspense>
      </Canvas>
      
      {/* ESTILOS Y ANIMACIONES INYECTADAS */}
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(1.5); }
        }
        @keyframes winnerPop {
          0% { transform: translate(-50%, -50%) scale(0.1); opacity: 0; filter: blur(10px); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; filter: blur(0px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;