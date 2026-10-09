import { useState, useRef, useEffect } from 'react';
import { Client, Room } from 'colyseus.js';

const client = new Client(`ws://192.168.1.6:2567`);

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState('');
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

  const enterFullScreen = () => {
    const doc = document.documentElement as any;
    if (doc.requestFullscreen) doc.requestFullscreen();
    else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen(); 
    else if (doc.msRequestFullscreen) doc.msRequestFullscreen(); 
  };

  const joinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    enterFullScreen();

    try {
      // 1. Saltamos a Vite y hacemos la petición cruda al servidor
      const response = await fetch(`http://192.168.1.6:2567/matchmake/joinOrCreate/squid_room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName })
      });
      
      if (response.status === 423 || response.status === 409) {
        throw new Error("La partida ya está en curso, espera a que termine.");
      }
      if (!response.ok) throw new Error("El servidor rechazó la conexión");
      
      let data = await response.json();

      // 2. Le damos a la librería exactamente la estructura que exige para no estallar
      if (!data.room) {
        data = {
          sessionId: data.sessionId,
          room: {
            name: data.name,
            roomId: data.roomId,
            processId: data.processId
          }
        };
      }

      // 3. Forzamos la entrada con los datos formateados
      const newRoom = await client.consumeSeatReservation(data);
      setRoom(newRoom);
      
      newRoom.onStateChange((state) => {
        setGameStatus(state.status);
        setLightColor(state.light);

        // Detectar si MI jugador específicamente murió para trancar mi pantalla
        const me = state.players.get(data.sessionId);
        if (me && !me.isAlive) {
          setGameStatus("ELIMINATED");
        }
      });
    } catch (error) {
      console.error("Error al conectar:", error);
      alert("No se pudo conectar al servidor. Verifica estar en la misma red Wi-Fi y que el host esté encendido.");
    }
  };

  const leaveGame = () => {
    if (room) {
      room.leave(); // Cierra la conexión del socket
    }
    setRoom(null);
    setGameStatus("LOBBY");
    // Si tienes un estado para ocultar el formulario (ej. setIsConnected), devuélvelo a false aquí
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

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 p-6">
        <h1 className="text-4xl font-bold text-green-500 mb-8 tracking-widest text-center">LUZ ROJA<br/><span className="text-red-500">LUZ VERDE</span></h1>
        <form onSubmit={joinGame} className="w-full max-w-sm bg-neutral-800 p-6 rounded-xl shadow-lg border border-neutral-700">
          <input type="text" maxLength={12} value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600 rounded-lg text-white font-bold text-center focus:outline-none focus:border-green-500 mb-6 uppercase" placeholder="EJ: JUGADOR 456" />
          <button type="submit" disabled={!playerName.trim()} className="w-full py-4 bg-green-600 text-white font-bold rounded-lg transition-colors">ENTRAR</button>
        </form>
      </div>
    );
  }

  if (!isAlive) {
    return (
      <div className="eliminated-screen">
        <h1>HAS SIDO ELIMINADO</h1>
        <button onClick={leaveGame} className="btn-volver">Volver al Inicio</button>
      </div>
    );
  }

  return (
    <>
      <div id="portrait-warning" className="fixed inset-0 bg-black z-50 flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 border-4 border-white rounded-xl mb-6 animate-[spin_2s_ease-in-out_infinite]"></div>
        <h2 className="text-2xl font-bold text-white mb-2">Gira tu teléfono</h2>
        <p className="text-gray-400">Este juego solo funciona en modo horizontal.</p>
      </div>

      <div id="game-ui" className={`flex flex-col h-screen transition-colors duration-500 ${lightColor === 'GREEN' ? 'bg-green-900' : 'bg-red-950'}`}>
        
        <div className="absolute top-0 left-0 w-full p-2 flex justify-between items-center bg-black/40 z-20 pointer-events-none">
          <span className="font-bold text-white/80 ml-4">{playerName.toUpperCase()}</span>
          <span className="text-sm font-bold text-white/80 mr-4 tracking-widest">
            {gameStatus === 'LOBBY' ? 'ESPERANDO...' : (lightColor === 'GREEN' ? 'CORRE' : '¡NO TE MUEVAS!')}
          </span>
        </div>

        <div className="flex-1 flex w-full relative">
          <div 
            onPointerDown={() => handleStep('L')}
            className={`flex-1 border-r border-black/30 flex items-center justify-center transition-all cursor-pointer touch-none select-none
              ${expectedLeg === 'L' && !isStumbled && gameStatus === 'PLAYING' ? 'bg-green-600 shadow-[inset_0_0_50px_rgba(34,197,94,0.5)]' : 'bg-white/5'}
              ${isStumbled ? 'bg-red-800/50 grayscale' : ''}
            `}
          >
            <span className={`text-7xl font-black select-none ${expectedLeg === 'L' ? 'text-white/80 scale-110' : 'text-white/10'}`}>L</span>
          </div>

          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 w-48 h-48">
            <div 
              onPointerDown={handleHoldStart}
              onPointerMove={handleHoldMove}
              onPointerUp={handleHoldEnd}
              onPointerLeave={handleHoldEnd}
              className={`w-full h-full rounded-full flex flex-col items-center justify-center border-4 transition-all touch-none select-none relative
                ${lightColor === 'RED' && gameStatus === 'PLAYING' ? 'border-red-500 bg-red-900 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'border-neutral-600 bg-neutral-800/80 scale-75 opacity-50 pointer-events-none'}
              `}
            >
              {lightColor === 'RED' && gameStatus === 'PLAYING' ? (
                <>
                  {showWarning && (
                    <span className="absolute -top-10 text-sm font-black text-red-400 animate-bounce text-center w-64 pointer-events-none drop-shadow-md bg-black/50 px-2 py-1 rounded">
                      ¡MANTENTE EN EL CENTRO!
                    </span>
                  )}
                  
                  <span className="text-xs font-bold text-red-300 mb-2 pointer-events-none">MANTÉN Y EQUILIBRA</span>
                  
                  <div className="w-32 h-4 bg-black rounded-full relative overflow-hidden pointer-events-none border border-red-950">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1/4 h-full bg-green-500/50"></div>
                    <div 
                      className={`absolute top-0 w-2 h-full transition-transform duration-75 ${showWarning ? 'bg-red-500' : 'bg-white'}`}
                      style={{ left: `calc(50% + ${tensionPoint / 2}%)`, transform: 'translateX(-50%)' }}
                    ></div>
                  </div>
                </>
              ) : (
                <span className="text-neutral-500 font-bold">ZONA SEGURA</span>
              )}
            </div>
          </div>

          <div 
            onPointerDown={() => handleStep('R')}
            className={`flex-1 border-l border-black/30 flex items-center justify-center transition-all cursor-pointer touch-none select-none
              ${expectedLeg === 'R' && !isStumbled && gameStatus === 'PLAYING' ? 'bg-green-600 shadow-[inset_0_0_50px_rgba(34,197,94,0.5)]' : 'bg-white/5'}
              ${isStumbled ? 'bg-red-800/50 grayscale' : ''}
            `}
          >
            <span className={`text-7xl font-black select-none ${expectedLeg === 'R' ? 'text-white/80 scale-110' : 'text-white/10'}`}>R</span>
          </div>
        </div>

        {isStumbled && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none bg-red-500/20">
            <span className="text-6xl font-black text-red-500 rotate-[-10deg] drop-shadow-lg">¡TROPEZASTE!</span>
          </div>
        )}
      </div>
    </>
  );
}

export default App;