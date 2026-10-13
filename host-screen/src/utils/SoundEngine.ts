class SoundEngine {
  private sounds: Record<string, HTMLAudioElement> = {};
  private baseVolumes: Record<string, number> = {};
  private fadeIntervals: Record<string, number> = {}; 
  private isMuted: boolean = false;

  constructor() {
    // Precarga de todos los audios en memoria
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

    Object.keys(this.sounds).forEach(key => {
      this.baseVolumes[key] = this.sounds[key].volume;
    });
  }

  // Activar o desactivar el audio maestro
  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAll();
    }
  }

  // Reproducir un sonido 
  public play(name: keyof typeof this.sounds, forceRestart: boolean = false) {
    if (this.isMuted || !this.sounds[name]) return;

    if (this.fadeIntervals[name]) {
      clearInterval(this.fadeIntervals[name]);
      delete this.fadeIntervals[name];
    }
    this.sounds[name].volume = this.baseVolumes[name];

    if (forceRestart) {
      this.sounds[name].currentTime = 0;
    }
    this.sounds[name].play().catch(e => console.warn(`Navegador bloqueó el audio ${name}:`, e));
  }

  // Detener un sonido con fade-out
  public stop(name: keyof typeof this.sounds, fadeDuration: number = 1000) {
    const sound = this.sounds[name];
    if (!sound) return;

    if (this.fadeIntervals[name]) clearInterval(this.fadeIntervals[name]);

    if (fadeDuration <= 0 || sound.paused || sound.volume === 0) {
      sound.pause();
      sound.currentTime = 0;
      sound.volume = this.baseVolumes[name];
      return;
    }

    const steps = 20; 
    const stepTime = fadeDuration / steps;
    const volumeStep = sound.volume / steps;
    let currentStep = 0;

    this.fadeIntervals[name] = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        clearInterval(this.fadeIntervals[name]);
        delete this.fadeIntervals[name];
        sound.pause();
        sound.currentTime = 0;
        sound.volume = this.baseVolumes[name]; 
      } else {
        sound.volume = Math.max(0, sound.volume - volumeStep);
      }
    }, stepTime);
  }

  // Botón de pánico: detener todo inmediatamente
  public stopAll() {
    Object.keys(this.sounds).forEach(key => {
      if (this.fadeIntervals[key]) {
        clearInterval(this.fadeIntervals[key]);
        delete this.fadeIntervals[key];
      }
      const audioElement = this.sounds[key];
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.volume = this.baseVolumes[key] || 1;
    });
  }
}

export const audio = new SoundEngine();