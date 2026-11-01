const HOVER_SOUND_URL = 'assets/sounds/button-hover.ogg';
const HOVER_VOLUME = 0.2;

let hoverSound: HTMLAudioElement | undefined;

export function playHoverSound(): void {
  hoverSound ??= Object.assign(new Audio(HOVER_SOUND_URL), { volume: HOVER_VOLUME });
  hoverSound.currentTime = 0;
  // Browsers refuse to play audio before the first user gesture; a silent hover is fine then.
  hoverSound.play().catch(() => {});
}
