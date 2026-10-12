import { useEffect, useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky, Text, useGLTF, Clone, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Client, Room } from 'colyseus.js';
import { QRCodeCanvas } from 'qrcode.react';
import { audio } from './utils/SoundEngine';

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
    <group position={[0, 0, 110]} castShadow>
      <mesh position={[6, 5, 0]} castShadow receiveShadow><cylinderGeometry args={[0.5, 0.8, 10]} /><meshStandardMaterial color="#4E342E" /></mesh>
      <mesh position={[6, 12, 0]} castShadow receiveShadow><sphereGeometry args={[4]} /><meshStandardMaterial color="#2E7D32" /></mesh>
      <mesh position={[0, 4, 0]} castShadow receiveShadow><cylinderGeometry args={[1, 2, 8]} /><meshStandardMaterial color="#FF9800" /></mesh>
      <group ref={headRef} position={[0, 9, 0]}>
        <mesh castShadow receiveShadow><sphereGeometry args={[1.5]} /><meshStandardMaterial color="#FFCCBC" /></mesh>
        <mesh position={[-0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshStandardMaterial color="#111" /></mesh>
        <mesh position={[0.5, 0.2, 1.4]}><sphereGeometry args={[0.2]} /><meshStandardMaterial color="#111" /></mesh>
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

function DaylightArena() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 50]} receiveShadow>
        <planeGeometry args={[60, 140]} />
        <meshStandardMaterial color="#d4a373" roughness={0.9} />
      </mesh>
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <planeGeometry args={[60, 1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 100]} receiveShadow>
        <planeGeometry args={[60, 3]} />
        <meshStandardMaterial color="#E91E63" />
      </mesh>

      <mesh position={[-30, 10, 50]} castShadow receiveShadow><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#9e9e9e" roughness={0.8} /></mesh>
      <mesh position={[30, 10, 50]} castShadow receiveShadow><boxGeometry args={[2, 20, 160]} /><meshStandardMaterial color="#9e9e9e" roughness={0.8} /></mesh>
      <mesh position={[0, 10, -20]} castShadow receiveShadow><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#9e9e9e" roughness={0.8} /></mesh>
      <mesh position={[0, 10, 130]} castShadow receiveShadow><boxGeometry args={[60, 20, 2]} /><meshStandardMaterial color="#9e9e9e" roughness={0.8} /></mesh>
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
  : "https://squid-web-elqu.onrender.com"; // CAMBIAR

const WS_URL = BACKEND_URL.replace(/^http/, 'ws');
const client = new Client(WS_URL);

// ==================== APLICACIÓN PRINCIPAL ====================
function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<any>({});
  
  const [gameStatus, setGameStatus] = useState("CONNECTING");
  const [lightColor, setLightColor] = useState("RED");
  const [countdown, setCountdown] = useState<number | null>(null);

  const [showTutorial, setShowTutorial] = useState(false);
  const [difficulty, setDifficulty] = useState("NORMAL");

  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const isConnecting = useRef(false);

  useEffect(() => {
    audio.setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) {
      audio.stopAll(); 
      return;
    }

    audio.stop('scanning');
    audio.stop('win'); 

    if (gameStatus === "PRE_LOBBY") {
      audio.play('bgLobby');
    } else {
      audio.stop('bgLobby');
    }

    if (gameStatus === "PLAYING") {
      if (lightColor === "GREEN") {
        audio.play('greenLight', true);        
      } else if (lightColor === "WARNING") {
        audio.play('redLight', true);       
      } else if (lightColor === "RED") {
        audio.play('scanning', true);
      }
      
    } else if (gameStatus === "GAME_OVER") {
      const hasWinner = Object.values(players).some((p: any) => p.isAlive);
      if (hasWinner) {
        audio.play('win', true);
      }
    }
  }, [gameStatus, lightColor, soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      if (gameStatus === "PRE_LOBBY" && soundEnabled) {
        audio.play('bgLobby');
      }
      document.removeEventListener('pointerdown', unlockAudio);
    };
    
    document.addEventListener('pointerdown', unlockAudio);
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, [gameStatus, soundEnabled]);

  // SENSOR DE ELIMINACIONES (El francotirador)
  const previousPlayersStatus = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!soundEnabled) {
      const currentStatus: Record<string, boolean> = {};
      Object.entries(players).forEach(([id, p]: [string, any]) => {
        currentStatus[id] = p.isAlive;
      });
      previousPlayersStatus.current = currentStatus;
      return;
    }

    let somebodyDied = false;
    const currentStatus: Record<string, boolean> = {};
    
    Object.entries(players).forEach(([id, p]: [string, any]) => {
      currentStatus[id] = p.isAlive;
      if (previousPlayersStatus.current[id] === true && p.isAlive === false) {
        somebodyDied = true;
      }
    });

    if (somebodyDied) {
      audio.play('gunshot', true);
    }

    previousPlayersStatus.current = currentStatus;
  }, [players, soundEnabled]);

  // SENSOR DE CONEXIONES (El timbre del lobby)
  const prevPlayerCount = useRef<number>(0);

  useEffect(() => {
    const currentPlayerCount = Object.keys(players).length;
    
    if ((gameStatus === "PRE_LOBBY" || gameStatus === "LOBBY") && soundEnabled) {
      if (currentPlayerCount > prevPlayerCount.current) {
        audio.play('join', true);
      }
    }
    
    prevPlayerCount.current = currentPlayerCount;
  }, [players, gameStatus, soundEnabled]);


  // SENSOR DE CUENTA REGRESIVA (El pitido)
  useEffect(() => {
    if (countdown !== null && soundEnabled) {
      audio.play('countdown', true);
    }
  }, [countdown, soundEnabled]);

  useEffect(() => {
    if (isConnecting.current) return;
    isConnecting.current = true;
    let currentRoom: Room;

    const connectHost = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/matchmake/create/squid_room`, {
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
          setDifficulty(state.difficulty);

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
    audio.play('click', true);
    if (room) room.send("HOST_START_GAME"); 
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  const goToArena = () => { 
    audio.play('click', true);
    if (room) room.send("GO_TO_ARENA"); 
  };
  const restartMatch = () => { 
    audio.play('click', true);
    if (room) room.send("RESTART_MATCH"); 
  };
  const returnToQr = () => { 
    audio.play('click', true);
    if (room) room.send("RETURN_TO_QR"); 
  };

  const changeDifficulty = (level: string, distance: number) => {
    audio.play('click', true);
    if (room) room.send("SET_DIFFICULTY", { level, distance });
  };

  const gamepadUrl = isLocal
      ? `http://${window.location.hostname}:5173/?room=${room?.roomId ?? ''}` 
      : `https://gamepad-squid.netlify.app/?room=${room?.roomId ?? ''}`;
  const playerCount = Object.keys(players).length;

  // PANTALLA DE CONEXIÓN
  if (gameStatus === "CONNECTING") {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '60px', height: '60px', border: '8px solid #E91E63', marginBottom: '30px', animation: 'spin 2s linear infinite', boxShadow: '8px 8px 0px #220000' }}></div>
        <h2 style={{ color: '#E91E63', fontFamily: 'sans-serif', fontWeight: '900', letterSpacing: '8px', animation: 'pulse 1.5s infinite', textShadow: '4px 4px 0px #220000' }}>
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
      {/* BOTÓN DE TUTORIAL */}
      {gameStatus === "PRE_LOBBY" && (
        <button 
          onClick={() => { audio.play('click', true); setShowTutorial(true); }}
          style={{ position: 'absolute', top: '30px', right: '30px', zIndex: 200, width: '60px', height: '60px', borderRadius: '50%', background: 'black', border: '4px solid #14B8A6', color: '#14B8A6', fontSize: '30px', fontWeight: '900', boxShadow: '6px 6px 0px #0a221f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
        >
          ?
        </button>
      )}

      {/* BOTÓN DE AJUSTES */}
      {gameStatus === "PRE_LOBBY" && (
        <button 
          onClick={() => { audio.play('click', true); setShowSettings(true); }}
          style={{ position: 'absolute', top: '30px', left: '30px', zIndex: 200, width: '60px', height: '60px', borderRadius: '0', background: 'black', border: '4px solid #14B8A6', color: '#14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '6px 6px 0px #0a221f', cursor: 'pointer', transition: 'all 0.1s' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      )}

      {/* MODAL DE AJUSTES */}
      {showSettings && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 300, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'black', border: '8px solid #14B8A6', padding: '40px', maxWidth: '600px', width: '90%', boxShadow: '15px 15px 0px #0a221f', position: 'relative' }}>
            
            <h2 style={{ color: 'white', fontSize: '30px', fontWeight: '900', margin: '0 0 30px 0', letterSpacing: '8px', textShadow: '4px 4px 0px #14B8A6', textTransform: 'uppercase', textAlign: 'center' }}>
              AJUSTES DEL SISTEMA
            </h2>

            {/* SECCIÓN SONIDO */}
            <div style={{ marginBottom: '40px', padding: '20px', border: '4px solid #333', background: '#0a0a0a' }}>
              <h3 style={{ color: '#aaa', fontSize: '14px', fontWeight: '900', margin: '0 0 15px 0', letterSpacing: '4px' }}>MÓDULO DE AUDIO</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => { audio.play('click', true); setSoundEnabled(true); }} 
                  style={{ flex: 1, padding: '15px', background: soundEnabled ? '#14B8A6' : 'black', color: soundEnabled ? 'black' : '#14B8A6', border: '4px solid #14B8A6', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', transition: 'all 0.1s' }}
                >
                  ACTIVADO
                </button>
                <button 
                  onClick={() => { audio.play('click', true); setSoundEnabled(false); }} 
                  style={{ flex: 1, padding: '15px', background: !soundEnabled ? '#E91E63' : 'black', color: !soundEnabled ? 'black' : '#E91E63', border: '4px solid #E91E63', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', transition: 'all 0.1s' }}
                >
                  MUTEO TOTAL
                </button>
              </div>
            </div>

            {/* SECCIÓN CRÉDITOS */}
            <div style={{ borderTop: '4px solid #14B8A6', paddingTop: '30px', textAlign: 'center' }}>
              <p style={{ color: '#14B8A6', fontSize: '12px', fontWeight: '900', letterSpacing: '4px', marginBottom: '20px' }}>DESARROLLADO POR ALEEXCH</p>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '30px' }}>
                <a href="https://github.com/AleexCh" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'black', color: 'white', border: '4px solid #333', padding: '10px 20px', textDecoration: 'none', fontWeight: '900', letterSpacing: '2px', transition: 'all 0.1s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'white'} onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  GITHUB
                </a>
                
                <a href="https://instagram.com/AleexCh" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'black', color: '#E91E63', border: '4px solid #E91E63', padding: '10px 20px', textDecoration: 'none', fontWeight: '900', letterSpacing: '2px', transition: 'all 0.1s' }} onMouseOver={(e) => {e.currentTarget.style.background = '#E91E63'; e.currentTarget.style.color = 'black';}} onMouseOut={(e) => {e.currentTarget.style.background = 'black'; e.currentTarget.style.color = '#E91E63';}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                  INSTAGRAM
                </a>
              </div>
            </div>

            <button 
              onClick={() => { audio.play('click', true); setShowSettings(false); }}
              style={{ width: '100%', padding: '15px', background: 'transparent', color: 'white', border: '4px solid white', fontSize: '16px', fontWeight: '900', letterSpacing: '6px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.1s' }}
            >
              CERRAR PANEL
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE TUTORIAL */}
      {showTutorial && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 300, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'black', border: '8px solid #14B8A6', padding: '40px', maxWidth: '800px', width: '90%', boxShadow: '15px 15px 0px #0a221f', position: 'relative' }}>
            
            <h2 style={{ color: 'white', fontSize: '40px', fontWeight: '900', margin: '0 0 30px 0', letterSpacing: '8px', textShadow: '4px 4px 0px #14B8A6', textTransform: 'uppercase' }}>
              Manual de Supervivencia
            </h2>

            <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
              <div style={{ flex: 1, border: '4px solid #14B8A6', padding: '20px', background: '#050505', boxShadow: '8px 8px 0px #0a221f' }}>
                <h3 style={{ color: '#14B8A6', fontSize: '24px', fontWeight: '900', margin: '0 0 10px 0', letterSpacing: '2px' }}>1. LUZ VERDE</h3>
                <p style={{ color: '#aaa', fontSize: '13px', fontWeight: 'bold', lineHeight: '1.6' }}>¡AVANZA! Toca los botones <strong style={{color: 'white'}}>L</strong> y <strong style={{color: 'white'}}>R</strong> alternadamente en tu Gamepad para avanzar. Si repites la misma pierna, tropezarás.</p>
                <div style={{ display: 'flex', gap: '15px', marginTop: '20px', justifyContent: 'center' }}>
                  <div style={{ width: '50px', height: '50px', border: '4px solid #14B8A6', color: '#14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '24px', animation: 'blinkL 1s infinite' }}>L</div>
                  <div style={{ width: '50px', height: '50px', border: '4px solid #14B8A6', color: '#14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '24px', animation: 'blinkR 1s infinite' }}>R</div>
                </div>
              </div>

              <div style={{ flex: 1, border: '4px solid #E91E63', padding: '20px', background: '#050505', boxShadow: '8px 8px 0px #220000' }}>
                <h3 style={{ color: '#E91E63', fontSize: '24px', fontWeight: '900', margin: '0 0 10px 0', letterSpacing: '2px' }}>2. LUZ ROJA</h3>
                <p style={{ color: '#aaa', fontSize: '13px', fontWeight: 'bold', lineHeight: '1.6' }}>¡DETENTE! Mantén el dedo presionado sobre el sensor y manten el indicador en el centro. Mueve el dedo en la dirección contraria para controlar.</p>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                  <div style={{ width: '80px', height: '80px', border: '4px solid #E91E63', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: 'black' }}>
                    <span style={{color: '#E91E63', fontSize: '8px', fontWeight: '900', marginBottom: '5px'}}>SENSOR</span>
                    <div style={{ width: '50px', height: '8px', border: '2px solid #555', background: 'black', position: 'relative' }}>
                       <div style={{ position: 'absolute', width: '6px', height: '100%', background: '#E91E63', animation: 'balance 2s infinite ease-in-out' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => { audio.play('click', true); setShowTutorial(false); }}
              style={{ width: '100%', padding: '20px', background: '#14B8A6', color: 'black', border: '4px solid #14B8A6', fontSize: '20px', fontWeight: '900', letterSpacing: '6px', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '8px 8px 0px #0a221f', transition: 'all 0.1s' }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* CÓDIGO QR */}
      {gameStatus === "PRE_LOBBY" && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 100, backgroundColor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', padding: '40px', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', width: '100%', maxWidth: '1400px', height: '100%', gap: '40px' }}>           
            {/* PANEL IZQUIERDO: Dificultad */}
            <div style={{ flex: '1', height: '380px', alignSelf: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '30px', background: '#050505', border: '4px solid #14B8A6', boxShadow: '12px 12px 0px #0a221f' }}>
              <h2 style={{ color: '#14B8A6', fontSize: '20px', fontWeight: '900', letterSpacing: '6px', marginBottom: '30px', textShadow: '2px 2px 0px #0a221f' }}>DIFICULTAD</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button 
                  onClick={() => changeDifficulty("FACIL", 2)}
                  style={{ padding: '20px', background: difficulty === "FACIL" ? '#14B8A6' : 'transparent', color: difficulty === "FACIL" ? 'black' : '#14B8A6', border: '4px solid #14B8A6', fontWeight: '900', letterSpacing: '4px', fontSize: '16px', cursor: 'pointer', transition: 'all 0.1s', display: 'flex', justifyContent: 'center', position: 'relative' }}
                >
                  <span>FÁCIL</span> 
                  {difficulty === "FACIL" && <span style={{ position: 'absolute', right: '20px' }}>●</span>}
                </button>
                <button 
                  onClick={() => changeDifficulty("NORMAL", 1.25)}
                  style={{ padding: '20px', background: difficulty === "NORMAL" ? '#14B8A6' : 'transparent', color: difficulty === "NORMAL" ? 'black' : '#14B8A6', border: '4px solid #14B8A6', fontWeight: '900', letterSpacing: '4px', fontSize: '16px', cursor: 'pointer', transition: 'all 0.1s', display: 'flex', justifyContent: 'center', position: 'relative' }}
                >
                  <span>NORMAL</span> 
                  {difficulty === "NORMAL" && <span style={{ position: 'absolute', right: '20px' }}>●</span>}
                </button>
                <button 
                  onClick={() => changeDifficulty("DIFICIL", 0.25)}
                  style={{ padding: '20px', background: difficulty === "DIFICIL" ? '#14B8A6' : 'transparent', color: difficulty === "DIFICIL" ? 'black' : '#14B8A6', border: '4px solid #14B8A6', fontWeight: '900', letterSpacing: '4px', fontSize: '16px', cursor: 'pointer', transition: 'all 0.1s', display: 'flex', justifyContent: 'center', position: 'relative' }}
                >
                  <span>DIFÍCIL</span> 
                  {difficulty === "DIFICIL" && <span style={{ position: 'absolute', right: '20px' }}>●</span>}
                </button>
              </div>
            </div>

            {/* PANEL CENTRAL: Marca y Conexión (QR) */}
            <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>             
              <h1 style={{ fontSize: '80px', color: '#E91E63', margin: '0 0 10px 0', letterSpacing: '20px', fontWeight: '900', textShadow: '8px 8px 0px #220000', lineHeight: '1.1', textAlign: 'center' }}>
                SQUID <br/><span style={{ color: 'white', textShadow: '8px 8px 0px #333' }}>GAME</span>
              </h1>             
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'white', letterSpacing: '8px', margin: '0 0 30px 0' }}>
                LUZ <span style={{ color: '#E91E63' }}>ROJA</span> <span style={{ color: '#333', margin: '0 15px' }}>|</span> LUZ <span style={{ color: '#14B8A6' }}>VERDE</span>
              </h2>             
              <div style={{ background: 'white', padding: '20px', border: '8px solid #E91E63', marginBottom: '40px', boxShadow: '15px 15px 0px #220000' }}>
                <QRCodeCanvas value={gamepadUrl} size={250} level={"H"} />
              </div>

              <button 
                onClick={goToArena}
                disabled={playerCount === 0}
                style={{ 
                  padding: '20px 40px', width: '100%', maxWidth: '400px', fontSize: '20px', fontWeight: '900', letterSpacing: '6px',
                  cursor: playerCount === 0 ? 'not-allowed' : 'pointer', 
                  background: playerCount === 0 ? 'transparent' : '#E91E63', 
                  color: playerCount === 0 ? '#444' : 'black', 
                  border: playerCount === 0 ? '4px solid #222' : '4px solid #E91E63', 
                  boxShadow: playerCount === 0 ? 'none' : '10px 10px 0px #220000',
                  transition: 'all 0.1s', textTransform: 'uppercase'
                }}
              >
                Iniciar Juego
              </button>
            </div>

            {/* PANEL DERECHO: El "Lobby" */}
            <div style={{ flex: '1', height: '380px', alignSelf: 'center', display: 'flex', flexDirection: 'column', padding: '30px', background: '#050505', border: '4px solid #E91E63', boxShadow: '12px 12px 0px #220000', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#111 2px, transparent 2px), linear-gradient(90deg, #111 2px, transparent 2px)', backgroundSize: '40px 40px', opacity: 0.5, pointerEvents: 'none' }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '4px solid #220000', paddingBottom: '15px', marginBottom: '20px', zIndex: 1 }}>
                <h2 style={{ color: '#E91E63', fontSize: '20px', fontWeight: '900', letterSpacing: '4px', margin: 0, textShadow: '2px 2px 0px #220000' }}>SUJETOS</h2>
                <span style={{ fontSize: '30px', color: '#14B8A6', fontWeight: '900', lineHeight: 1 }}>{playerCount}</span>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1, paddingRight: '10px' }}>
                {Object.values(players).length === 0 ? (
                   <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontWeight: '900', letterSpacing: '4px', textAlign: 'center' }}>ESPERANDO CONEXIONES...</div>
                ) : (
                  Object.values(players).map((p: any, i) => (
                    <div key={i} style={{ background: 'black', border: '4px solid #E91E63', padding: '15px 20px', color: '#E91E63', fontWeight: '900', letterSpacing: '4px', fontSize: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>#{p.name}</span>
                      <span style={{ fontSize: '10px', color: '#666', border: '2px solid #333', padding: '4px 8px' }}>{p.gender}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* PANEL DE CONTROL (MAESTRO) */}
      {isPanelVisible && (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'black', padding: '20px', color: 'white', border: '4px solid #E91E63', boxShadow: '8px 8px 0px #220000', width: 'auto', minWidth: '260px' }}>
          
          <h2 style={{ margin: '0 0 5px 0', color: '#E91E63', fontSize: '18px', letterSpacing: '3px', fontWeight: '900' }}>PANEL DE CONTROL</h2>
          <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '9px', letterSpacing: '2px', fontWeight: 'bold' }}>ACCESO RESTRINGIDO - FRONTMAN</p>

          {gameStatus === "GAME_OVER" && (
            <div style={{ borderLeft: `6px solid ${hasWinner ? '#14B8A6' : '#E91E63'}`, paddingLeft: '10px', marginBottom: '20px' }}>
              <h3 style={{ color: hasWinner ? '#14B8A6' : '#E91E63', margin: 0, fontSize: '13px', letterSpacing: '1px', fontWeight: '900' }}>
                {hasWinner ? "NIVEL COMPLETADO" : "ELIMINACIÓN TOTAL"}
              </h3>
            </div>
          )}
          
          {gameStatus === "LOBBY" ? (
            <button onClick={startGame} style={{ padding: '12px 20px', width: '100%', cursor: 'pointer', background: '#E91E63', color: 'black', border: '4px solid #E91E63', fontWeight: '900', letterSpacing: '2px', fontSize: '14px', textTransform: 'uppercase', boxShadow: '6px 6px 0px #220000' }}>
              INICIAR JUEGO
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={restartMatch} style={{ padding: '10px 15px', cursor: 'pointer', background: 'transparent', color: '#14B8A6', border: '4px solid #14B8A6', fontWeight: '900', letterSpacing: '1px', fontSize: '11px', textTransform: 'uppercase', transition: 'all 0.1s', boxShadow: '4px 4px 0px #0a221f' }}>
                NUEVA RONDA
              </button>
              <button onClick={returnToQr} style={{ padding: '10px 15px', cursor: 'pointer', background: 'transparent', color: '#E91E63', border: '4px solid #E91E63', fontWeight: '900', letterSpacing: '1px', fontSize: '11px', textTransform: 'uppercase', transition: 'all 0.1s', boxShadow: '4px 4px 0px #220000' }}>
                VOLVER AL LOBBY
              </button>
            </div>
          )}

          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '4px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#888', letterSpacing: '1px', fontWeight: '900' }}>SUJETOS ACTIVOS:</span>
            <span style={{ fontSize: '20px', color: '#14B8A6', fontWeight: '900', textShadow: '2px 2px 0px #0a221f' }}>{Object.keys(players).length}</span>
          </div>
        </div>
      )}

      {/* OVERLAYS DE ACCIÓN A PRUEBA DE COLISIONES */}
      {gameStatus === "STARTING" && countdown !== null && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#E91E63', fontSize: '200px', fontWeight: '900', textShadow: '15px 15px 0px #220000', animation: 'pulse 1s infinite' }}>
          {countdown}
        </div>
      )}
      
      {/* Alertas dinámicas con Key para reiniciar animación */}
      {gameStatus === "PLAYING" && countdown === null && (
        <>
          {lightColor === "GREEN" && (
            <div key="green" style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#14B8A6', fontSize: '100px', fontWeight: '900', letterSpacing: '10px', textShadow: '10px 10px 0px #0a221f', whiteSpace: 'nowrap', animation: 'fadeOut 2s forwards' }}>
              LUZ VERDE
            </div>
          )}
          {lightColor === "RED" && (
            <div key="red" style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, color: '#E91E63', fontSize: '100px', fontWeight: '900', letterSpacing: '10px', textShadow: '10px 10px 0px #220000', whiteSpace: 'nowrap', animation: 'fadeOut 2s forwards' }}>
              LUZ ROJA
            </div>
          )}
        </>
      )}
      
      {gameStatus === "GAME_OVER" && winner && (
        <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, textAlign: 'center', animation: 'winnerPop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', whiteSpace: 'nowrap' }}>
          <h1 style={{ fontSize: '80px', margin: 0, color: '#14B8A6', textShadow: '10px 10px 0px #0a221f', fontWeight: '900', letterSpacing: '15px' }}>
            ¡GANADOR!
          </h1>
          <div style={{ display: 'inline-block', marginTop: '20px', border: '8px solid #14B8A6', padding: '15px 50px', backgroundColor: 'black', boxShadow: '15px 15px 0px #0a221f' }}>
            <h2 style={{ fontSize: '40px', margin: 0, color: 'white', letterSpacing: '8px', fontWeight: '900', textShadow: '4px 4px 0px #333' }}>
              JUGADOR #{winner.name}
            </h2>
          </div>
        </div>
      )}

      {/* RENDERIZADO 3D */}
      <Canvas camera={{ position: [0, 8, -20], fov: 60 }} shadows dpr={[1, 2]}>
        <Sky sunPosition={[50, 20, -20]} turbidity={0.3} rayleigh={0.5} />
        <SoftShadows size={12} samples={10} focus={0.5} />

        <Suspense fallback={null}>  
          <CameraRig players={players} />
          
          <hemisphereLight args={['#ffffff', '#d4a373', 0.6]} />
          <ambientLight intensity={0.4} />        
          <directionalLight 
            position={[50, 50, -30]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize-width={512} 
            shadow-mapSize-height={512} 
            shadow-camera-far={200}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={120}
            shadow-camera-bottom={-20}
            shadow-bias={-0.0005}
          />

          <DaylightArena />

          <group position={[-8, 2, 105]} castShadow receiveShadow>
            <mesh castShadow receiveShadow><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" roughness={0.7} /></mesh>
            <mesh position={[0, 1, -1.01]}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial color="#111" /></mesh>
            <mesh position={[0, 1, -1.02]}><torusGeometry args={[0.3, 0.06, 16, 32]} /><meshBasicMaterial color="black" /></mesh>
          </group>
          <group position={[8, 2, 105]} castShadow receiveShadow>
            <mesh castShadow receiveShadow><boxGeometry args={[2, 4, 2]} /><meshStandardMaterial color="#E91E63" roughness={0.7} /></mesh>
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
          @keyframes blinkL {
          0%, 49% { background: #14B8A6; color: black; }
          50%, 100% { background: transparent; color: #14B8A6; }
        }
        @keyframes blinkR {
          0%, 49% { background: transparent; color: #14B8A6; }
          50%, 100% { background: #14B8A6; color: black; }
        }
        @keyframes balance {
          0% { left: 0%; }
          50% { left: 85%; }
          100% { left: 0%; }
        }
      `}</style>
    </div>
  );
}

export default App;