import { useState, useRef, useEffect } from 'react';
import { Client, Room } from 'colyseus.js';

const isLocal = window.location.hostname === "localhost" || window.location.hostname.startsWith("192.168.") || window.location.hostname.startsWith("10.");
const BACKEND_URL = isLocal 
  ? `http://${window.location.hostname}:2567` 
  : "https://squid-web-elqu.onrender.com"; // CAMBIAR

const WS_URL = BACKEND_URL.replace(/^http/, 'ws');
const client = new Client(WS_URL);

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerGender, setPlayerGender] = useState<'M'|'F'>('M');
  const [isAlive, setIsAlive] = useState(true);
  
  const [gameStatus, setGameStatus] = useState('LOBBY'); 
  const [lightColor, setLightColor] = useState('RED');

  const [expectedLeg, setExpectedLeg] = useState<'L' | 'R'>('L');
  const [isStumbled, setIsStumbled] = useState(false); 
  
  const [isHoldingBreath, setIsHoldingBreath] = useState(false);
  const [tensionPoint, setTensionPoint] = useState(0); 
  const [showWarning, setShowWarning] = useState(false); 
  
  const touchStartX = useRef(0);
  const currentDrag = useRef(0); 
  
  const outCenterTimer = useRef(0); 
  const isWarningRef = useRef(false); 

  // Blindaje de Input
  const handleNumberInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, ''); 
    if (rawValue.length > 3) return; 
    if (rawValue === '') {
      setPlayerName('');
      return;
    }
    const num = parseInt(rawValue, 10);
    if (num > 456) return;
    setPlayerName(rawValue);
  };

  const formatNumberOnBlur = () => {
    if (playerName) {
      const num = parseInt(playerName, 10);
      if (num === 0) setPlayerName('001'); 
      else setPlayerName(num.toString().padStart(3, '0'));
    }
  };

  useEffect(() => {
    let reactionTimeout: number;

    if (lightColor === 'RED' && isAlive && !isHoldingBreath && gameStatus === 'PLAYING') {
      reactionTimeout = window.setTimeout(() => {
        setIsAlive(false); 
        room?.send("PLAYER_DIED");
      }, 1000);
    }

    return () => clearTimeout(reactionTimeout);
  }, [lightColor, isHoldingBreath, isAlive, gameStatus, room]);

  useEffect(() => {
    let interval: number;
 
    if (lightColor === 'RED' && isHoldingBreath && gameStatus === 'PLAYING') {
      interval = window.setInterval(() => {
        setTensionPoint((prev) => {
          const randomJitter = (Math.random() - 0.5) * 15; 
          const playerForce = currentDrag.current * 0.1; 
          const nextPoint = prev + randomJitter - playerForce;

          if (nextPoint > 100 || nextPoint < -100) {
            setIsAlive(false); 
            room?.send("PLAYER_DIED");
            return nextPoint;
          }

          const isOut = nextPoint < -25 || nextPoint > 25;
          
          if (isOut) {
            outCenterTimer.current += 50; 
            if (outCenterTimer.current >= 3000) {
              setIsAlive(false);
              room?.send("PLAYER_DIED");
              return nextPoint;
            }
          } else {
            outCenterTimer.current = 0;
          }

          if (isOut !== isWarningRef.current) {
            isWarningRef.current = isOut;
            setShowWarning(isOut);
          }

          return nextPoint;
        });
      }, 50);
    } else {
      setTensionPoint(0);
      currentDrag.current = 0;
      outCenterTimer.current = 0;
      setShowWarning(false);
      isWarningRef.current = false;
    }

    return () => clearInterval(interval);
  }, [lightColor, isHoldingBreath, gameStatus, room]);

  const wakeLockRef = useRef<any>(null);
  const enterFullScreen = async () => {
    if (!document.fullscreenElement) {
      const doc = document.documentElement as any;
      if (doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
      else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen(); 
      else if (doc.msRequestFullscreen) doc.msRequestFullscreen(); 
    }

    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock activado: Pantalla encendida permanente.');
        
        document.addEventListener('visibilitychange', async () => {
          if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          }
        });
      }
    } catch (err) {
      console.error(`Wake Lock error: ${err}`);
    }
  };

  useEffect(() => {
    if (lightColor === 'GREEN') {
      setIsHoldingBreath(false);     
      setTensionPoint(0);            
      currentDrag.current = 0;       
      outCenterTimer.current = 0;    
      setShowWarning(false);         
    }
  }, [lightColor]);

  const joinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    enterFullScreen();

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get('room');

      if (!roomId) {
        throw new Error("ACCESO DENEGADO: Debes escanear el Código QR de una pantalla Host.");
      }

      const response = await fetch(`${BACKEND_URL}/matchmake/joinById/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, gender: playerGender })
      });

      if (!response.ok) throw new Error("El servidor rechazó la conexión a la sala privada.");

      let data = await response.json();
      if (!data.room) {
        data = { 
          sessionId: data.sessionId, 
          room: { name: data.name, roomId: data.roomId, processId: data.processId } 
        };
      }

      const newRoom = await client.consumeSeatReservation(data);
      setRoom(newRoom);

      newRoom.onStateChange((state) => {
        setGameStatus(state.status);
        setLightColor(state.light);

        const me = state.players.get(newRoom.sessionId);
        if (me) {
          setIsAlive(me.isAlive);         
          if (!me.isAlive) {
            setGameStatus("ELIMINATED");
          } else if (state.status === "LOBBY") {
            setExpectedLeg('L');
            setIsStumbled(false);
          }
        }
      });

      newRoom.onLeave(() => {
        setGameStatus("DISCONNECTED");

        if (wakeLockRef.current !== null) {
          wakeLockRef.current.release().catch(console.error);
          wakeLockRef.current = null;
        }
      });

    } catch (error: any) {
      console.error("Error al conectar:", error);
      alert(error.message || "Error desconocido al conectar.");
    }
  };

  const handleStep = (leg: 'L' | 'R') => {
    if (!isAlive || isStumbled || gameStatus !== 'PLAYING') return;

    if (lightColor === 'RED') {
      setIsAlive(false);
      room?.send("PLAYER_DIED"); 
      return; 
    }

    if (leg === expectedLeg) {
      setExpectedLeg(leg === 'L' ? 'R' : 'L');
      room?.send("STEP"); 
    } else {
      setIsStumbled(true);
      setTimeout(() => setIsStumbled(false), 1000);
    }
  };

  const handleHoldStart = (e: React.PointerEvent) => {
    if (lightColor === 'RED' && gameStatus === 'PLAYING') {
      setIsHoldingBreath(true);
      touchStartX.current = e.clientX;
      currentDrag.current = 0;
    }
  };

  const handleHoldMove = (e: React.PointerEvent) => {
    if (isHoldingBreath) {
      currentDrag.current = e.clientX - touchStartX.current;
    }
  };

  const handleHoldEnd = () => {
    setIsHoldingBreath(false);
    currentDrag.current = 0;
    outCenterTimer.current = 0;
    if (lightColor === 'RED' && gameStatus === 'PLAYING') {
      setIsAlive(false); 
      room?.send("PLAYER_DIED");
    }
  };

  // ================= PANTALLA DE INGRESO =================
  if (!room) {
    const isValidPlayer = playerName.trim().length > 0;
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#050505] p-6 text-white font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none flex flex-col justify-between">
          <div className="w-full h-1 bg-[#E91E63]"></div>
          <div className="w-full h-1 bg-[#E91E63]"></div>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-[#E91E63] mb-2 tracking-[0.3em] text-center drop-shadow-[0_0_15px_rgba(233,30,99,0.5)]">
          SQUID <br/> <span className="text-white">GAME</span>
        </h1>
        
        <h2 className="text-lg font-bold text-white tracking-[0.2em] mb-4 text-center">
          LUZ <span className="text-[#E91E63]">ROJA</span> <span className="text-[#333] mx-1">|</span> LUZ <span className="text-[#14B8A6]">VERDE</span>
        </h2>
        
        <p className="text-[#666] tracking-widest text-xs mb-8">REGISTRO DE JUGADOR</p>

        <form onSubmit={joinGame} className="w-full max-w-sm bg-black p-8 border-4 border-[#222] relative z-10 shadow-[8px_8px_0px_#000000]">
          
          <label className="block text-[#E91E63] text-[10px] font-black mb-3 tracking-[0.3em] text-center uppercase">
            Numero asignado
          </label>
          
          <div className="relative mb-8">
            <span className="absolute left-0 top-1/2 transform -translate-y-1/2 text-2xl text-[#E91E63] font-black">#</span>
            <input 
              type="number" 
              value={playerName} 
              onChange={handleNumberInput}
              onBlur={formatNumberOnBlur}
              className="w-full pl-8 pr-4 py-2 bg-transparent border-b-4 border-[#333] text-white font-black text-5xl text-center focus:outline-none focus:border-[#E91E63] transition-colors tracking-widest rounded-none" 
              placeholder="000" 
            />
          </div>
          
          <label className="block text-[#E91E63] text-[10px] font-black mb-4 tracking-[0.3em] text-center uppercase">
            Selección de avatar
          </label>
          
          <div className="flex gap-4 mb-10">
            <button 
              type="button" 
              onClick={() => setPlayerGender('M')} 
              className={`flex-1 py-5 font-black border-4 transition-all flex justify-center items-center rounded-none ${
                playerGender === 'M' 
                  ? 'border-[#14B8A6] bg-[#14B8A6]/10 text-[#14B8A6] shadow-[4px_4px_0px_#14B8A6]' 
                  : 'border-[#222] text-[#444] bg-transparent'
              }`}
            >
              <div className="w-6 h-6 border-4 border-current"></div>
            </button>
            <button 
              type="button" 
              onClick={() => setPlayerGender('F')} 
              className={`flex-1 py-5 font-black border-4 transition-all flex justify-center items-center rounded-none ${
                playerGender === 'F' 
                  ? 'border-[#E91E63] bg-[#14B8A6]/10 text-[#E91E63] shadow-[4px_4px_0px_#E91E63]' 
                  : 'border-[#222] text-[#444] bg-transparent'
              }`}
            >
              <div className="w-6 h-6 border-4 border-current rounded-full"></div>
            </button>
          </div>

          <button 
            type="submit" 
            disabled={!isValidPlayer} 
            className={`w-full py-5 text-sm font-black tracking-[0.3em] transition-all uppercase rounded-none border-4
              ${isValidPlayer 
                ? 'bg-[#E91E63] border-[#E91E63] text-black hover:bg-transparent hover:text-[#E91E63] shadow-[4px_4px_0px_#E91E63] hover:shadow-[0px_0px_0px_#E91E63] hover:translate-y-1 hover:translate-x-1 cursor-pointer' 
                : 'bg-transparent border-[#222] text-[#333] cursor-not-allowed'
              }`}
          >
            CONFIRMAR
          </button>
        </form>
      </div>
    );
  }

  // ================= PANTALLA DE ELIMINADO =================
  if (gameStatus === "ELIMINATED" || !isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black p-6 text-center relative overflow-hidden">
        
        <div className="w-24 h-24 border-8 border-[#E91E63] mb-8 relative flex items-center justify-center shadow-[8px_8px_0px_#E91E63] z-10 bg-transparent rounded-full">
          <div className="w-20 h-2 bg-[#E91E63] absolute transform -rotate-45"></div>
        </div>
        
        <h1 className="text-5xl font-black text-[#E91E63] mb-8 tracking-[0.2em] relative z-10 drop-shadow-[6px_6px_0px_#220000]">
          ELIMINADO
        </h1>
        
        <div className="px-8 py-4 bg-transparent border-4 border-[#333] text-[#666] font-black text-xs tracking-[0.2em] uppercase relative z-10">
          ESPERANDO AL HOST...
        </div>
      </div>
    );
  }

  // ================= PANTALLA DE VICTORIA =================
  if (isAlive && gameStatus === "GAME_OVER") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black p-6 text-center relative overflow-hidden">
        
        <div className="w-24 h-24 border-8 border-[#14B8A6] mb-8 relative flex items-center justify-center shadow-[8px_8px_0px_#14B8A6] z-10 bg-transparent transform rotate-45">
          <div className="w-full h-full border-8 border-black bg-transparent"></div>
        </div>

        <h1 className="text-6xl font-black text-white mb-2 relative z-10 tracking-widest drop-shadow-[6px_6px_0px_#14B8A6]">
          GANASTE
        </h1>
        <p className="text-[#14B8A6] text-sm font-black mb-10 tracking-[0.3em] relative z-10 drop-shadow-[2px_2px_0px_#0a221f]">
          NIVEL COMPLETADO
        </p>

        <div className="px-8 py-4 bg-transparent border-4 border-[#333] text-[#666] font-black text-xs tracking-[0.2em] uppercase relative z-10">
          ESPERANDO AL HOST...
        </div>
      </div>
    );
  }

  // ================= PANTALLA DE DESCONEXIÓN =================
  if (gameStatus === "DISCONNECTED") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#050505] p-6 text-center relative overflow-hidden font-sans">
        
        <div className="w-24 h-24 border-8 border-[#E91E63] mb-8 relative flex items-center justify-center shadow-[8px_8px_0px_#220000] z-10 bg-transparent rounded-full animate-pulse">
          <div className="w-20 h-2 bg-[#E91E63] absolute transform -rotate-45"></div>
          <div className="w-20 h-2 bg-[#E91E63] absolute transform rotate-45"></div>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-black text-[#E91E63] mb-4 tracking-[0.2em] relative z-10 drop-shadow-[4px_4px_0px_#220000]">
          CONEXIÓN PERDIDA
        </h1>
        
        <p className="text-[#666] text-xs font-bold mb-10 tracking-[0.2em] uppercase relative z-10 max-w-xs leading-relaxed">
          EL SERVIDOR CERRÓ LA SALA O LA SEÑAL FUE INTERRUMPIDA.
        </p>

        <button onClick={() => window.location.reload()} className="px-8 py-4 bg-transparent border-4 border-[#E91E63] text-[#E91E63] font-black text-xs tracking-[0.2em] uppercase transition-all relative z-10 shadow-[6px_6px_0px_#220000] hover:shadow-[0px_0px_0px_#220000] hover:translate-y-1 hover:translate-x-1 hover:bg-[#E91E63] hover:text-black">
          RECARGAR SISTEMA
        </button>
      </div>
    );
  }

  // ================= GAMEPAD UI =================
  return (
    <>
      <div id="portrait-warning" className="fixed inset-0 bg-[#050505] z-50 flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 border-[6px] border-[#E91E63] rounded-sm mb-6 animate-[spin_3s_ease-in-out_infinite] shadow-[0_0_20px_rgba(233,30,99,0.5)]"></div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-widest">GIRA EL DISPOSITIVO</h2>
        <p className="text-[#666] tracking-widest text-xs">REQUISITO OBLIGATORIO PARA JUGAR</p>
      </div>

      <div id="game-ui" onPointerDown={enterFullScreen} className="flex flex-col h-screen bg-[#050505] relative overflow-hidden font-sans select-none">
        <div className={`absolute inset-0 pointer-events-none transition-all duration-300 z-0 ${
          lightColor === 'GREEN' ? 'shadow-[inset_0_0_80px_rgba(20,184,166,0.15)]' : 
          lightColor === 'RED' ? 'shadow-[inset_0_0_120px_rgba(233,30,99,0.2)]' : ''
        }`}></div>

        <div className="absolute top-0 left-0 w-full p-2 flex justify-between items-center border-b border-[#222] bg-[#0a0a0a]/90 z-20 pointer-events-none shadow-[0_5px_20px_rgba(0,0,0,0.8)]">
          <span className="font-black text-[#E91E63] ml-4 tracking-[0.2em] text-lg">#{playerName}</span>
          
          <span className={`text-sm font-black mr-4 tracking-[0.2em] uppercase transition-colors ${
            gameStatus === 'PLAYING' 
              ? (lightColor === 'GREEN' ? 'text-[#14B8A6]' : 'text-[#E91E63] animate-pulse') 
              : 'text-[#666]'
          }`}>
            {gameStatus === 'LOBBY' && 'ESPERANDO...'}
            {gameStatus === 'STARTING' && 'PREPARANDO'}
            {gameStatus === 'PLAYING' && (lightColor === 'GREEN' ? 'AVANZA' : 'DETENIDO')}
          </span>
          
          {gameStatus === 'STARTING' && (
          <div className="fixed top-0 left-0 w-screen h-screen z-9999 bg-[#050505]/95 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-16 h-16 border-4 border-[#14B8A6] rounded-full animate-ping mb-8"></div>
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-[0.3em] drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
              ATENCIÓN
            </h1>
            <p className="text-[#14B8A6] mt-4 font-bold text-sm tracking-widest">EL JUEGO VA A COMENZAR</p>
          </div>
          )}
        </div>

        <div className="flex-1 flex w-full relative z-10">
          <div 
            onPointerDown={() => handleStep('L')}
            className={`flex-1 border-r border-[#111] flex flex-col items-center justify-center transition-all cursor-pointer touch-none relative
              ${isStumbled ? 'bg-[#110000] grayscale opacity-50' : ''}
              ${lightColor === 'GREEN' && expectedLeg === 'L' && !isStumbled && gameStatus === 'PLAYING' ? 'bg-[#14B8A6]/10 shadow-[inset_0_0_50px_rgba(20,184,166,0.1)]' : 'bg-transparent'}
            `}
          >
            {lightColor === 'RED' && expectedLeg === 'L' && gameStatus === 'PLAYING' && (
              <span className="absolute top-1/4 text-[#14B8A6]/40 text-xs font-bold tracking-[0.2em] animate-pulse border border-[#14B8A6]/20 px-3 py-1 bg-black/50">PREPARAR</span>
            )}
            <span className={`text-8xl font-black transition-all duration-200 ${
              expectedLeg === 'L' && gameStatus === 'PLAYING'
                ? (lightColor === 'GREEN' ? 'text-[#14B8A6] scale-110 drop-shadow-[0_0_20px_rgba(20,184,166,0.6)]' : 'text-[#333]') 
                : 'text-[#111]'
            }`}>L</span>
          </div>

          {/* SENSOR CENTRAL DE EQUILIBRIO */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 w-48 h-48">
            <div 
              onPointerDown={handleHoldStart}
              onPointerMove={handleHoldMove}
              onPointerUp={handleHoldEnd}
              onPointerLeave={handleHoldEnd}
              className={`w-full h-full rounded-full flex flex-col items-center justify-center border-4 transition-all touch-none relative bg-[#050505]
                ${lightColor === 'RED' && gameStatus === 'PLAYING' 
                  ? 'border-[#E91E63] shadow-[0_0_30px_rgba(233,30,99,0.3),inset_0_0_15px_rgba(233,30,99,0.2)]' 
                  : 'border-[#111] scale-75 opacity-30 pointer-events-none'}
              `}
            >
              {lightColor === 'RED' && gameStatus === 'PLAYING' ? (
                <>
                  <div className="absolute inset-0 rounded-full border border-[#E91E63]/20 animate-ping pointer-events-none"></div>
                  
                  {showWarning && (
                    <span className="absolute -top-10 text-[10px] font-black text-[#E91E63] animate-bounce text-center w-full pointer-events-none drop-shadow-[0_0_5px_rgba(233,30,99,0.8)] bg-black px-2 py-1 border border-[#E91E63]">
                      ¡RIESGO DE MOVIMIENTO!
                    </span>
                  )}
                  
                  <span className="text-[9px] font-bold text-[#E91E63]/70 mb-3 pointer-events-none tracking-widest text-center px-4 leading-tight">
                    MANTÉN PRESIONADO<br/>Y NO TE MUEVAS
                  </span>
                  
                  {/* Barra mecánica del sensor */}
                  <div className="w-28 h-4 bg-[#0a0a0a] rounded-sm relative overflow-hidden pointer-events-none border border-[#333]">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-full bg-[#14B8A6]/20"></div>
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-[#14B8A6]/50"></div>
                    <div 
                      className={`absolute top-0 w-1.5 h-full transition-transform duration-75 shadow-[0_0_5px_rgba(255,255,255,0.5)] ${showWarning ? 'bg-[#E91E63]' : 'bg-white'}`}
                      style={{ left: `calc(50% + ${tensionPoint / 2}%)`, transform: 'translateX(-50%)' }}
                    ></div>
                  </div>
                </>
              ) : (
                <span className="text-[#333] font-black tracking-widest text-xs">SENSOR</span>
              )}
            </div>
          </div>

          {/* BOTÓN DERECHO */}
          <div 
            onPointerDown={() => handleStep('R')}
            className={`flex-1 border-l border-[#111] flex flex-col items-center justify-center transition-all cursor-pointer touch-none relative
              ${isStumbled ? 'bg-[#110000] grayscale opacity-50' : ''}
              ${lightColor === 'GREEN' && expectedLeg === 'R' && !isStumbled && gameStatus === 'PLAYING' ? 'bg-[#14B8A6]/10 shadow-[inset_0_0_50px_rgba(20,184,166,0.1)]' : 'bg-transparent'}
            `}
          >
            {lightColor === 'RED' && expectedLeg === 'R' && gameStatus === 'PLAYING' && (
              <span className="absolute top-1/4 text-[#14B8A6]/40 text-xs font-bold tracking-[0.2em] animate-pulse border border-[#14B8A6]/20 px-3 py-1 bg-black/50">PREPARAR</span>
            )}
            <span className={`text-8xl font-black transition-all duration-200 ${
              expectedLeg === 'R' && gameStatus === 'PLAYING'
                ? (lightColor === 'GREEN' ? 'text-[#14B8A6] scale-110 drop-shadow-[0_0_20px_rgba(20,184,166,0.6)]' : 'text-[#333]') 
                : 'text-[#111]'
            }`}>R</span>
          </div>
        </div>

        {isStumbled && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none bg-[#E91E63]/10 backdrop-grayscale">
            <span className="text-4xl font-black text-[#E91E63] rotate-[-5deg] tracking-[0.2em] drop-shadow-[0_0_15px_rgba(233,30,99,0.8)] border-4 border-[#E91E63] p-4">TROPIEZO</span>
          </div>
        )}
      </div>
    </>
  );
}

export default App;