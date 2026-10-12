// host-screen/src/utils/SoundEngine.ts

class SoundEngine {
  private sounds: Record<string, HTMLAudioElement> = {};
  private isMuted: boolean = false;

  constructor() {
    // 1. Precarga de todos los audios en memoria
    this.sounds = {
      bgLobby: new Audio('/sounds/bg_lobby.mp3'),
      greenLight: new Audio('/sounds/green_light.mp3'),
      redLight: new Audio('/sounds/red_light.mp3'),
      scanning: new Audio('/sounds/scanning.mp3'),
      gunshot: new Audio('/sounds/gunshot.mp3'),
      win: new Audio('/sounds/win.mp3'),
      click: new Audio('/sounds/click.mp3'),
      countdown: new Audio('/sounds/countdown.mp3'), 
      join: new Audio('/sounds/join.mp3'),
    };

    // Solo el lobby se repite en bucle
    this.sounds.bgLobby.loop = true;
    this.sounds.bgLobby.volume = 0.4; 

    // Voces y escaneo se reproducen una sola vez por cambio
    this.sounds.greenLight.loop = false;
    this.sounds.greenLight.volume = 1.0;
    
    this.sounds.redLight.loop = false;
    this.sounds.redLight.volume = 1.0;

    this.sounds.scanning.loop = false;
    this.sounds.scanning.volume = 0.6;

    this.sounds.countdown.loop = false;
    this.sounds.countdown.volume = 0.8;

    this.sounds.join.loop = false;
    this.sounds.join.volume = 0.7;
  }

  // Activar o desactivar el audio maestro
  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAll();
    }
  }

  // Reproducir un sonido (con opción a reiniciarlo si ya estaba sonando)
  public play(name: keyof typeof this.sounds, forceRestart: boolean = false) {
    if (this.isMuted || !this.sounds[name]) return;

    if (forceRestart) {
      this.sounds[name].currentTime = 0;
    }
    
    // El .catch evita errores feos en consola si el navegador bloquea el autoplay
    this.sounds[name].play().catch(e => console.warn(`Navegador bloqueó el audio ${name}:`, e));
  }

  // Detener un sonido específico
  public stop(name: keyof typeof this.sounds) {
    if (this.sounds[name]) {
      this.sounds[name].pause();
      this.sounds[name].currentTime = 0;
    }
  }

  // Botón de pánico: detener todo
  public stopAll() {
    Object.values(this.sounds).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
}

// Exportamos una única instancia (Singleton) para toda la aplicación
export const audio = new SoundEngine();