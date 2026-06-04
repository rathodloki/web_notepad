export {
    STATIONS,
    audio,
    currentStationIndex,
    isPlaying,
    currentVolume,
    isMuted,
    preMuteVolume,
    musicHistory,
    musicFavorites,
    currentSongMetadata,
    loadStorage,
    isFavorited,
    toggleFavorite,
    playItem,
    togglePlay,
    playNextStation,
    playPreviousStation,
    playRandomStation,
    getMusicReactionData,
    setVolume,
    toggleMute
} from './music-impl.js';

let stateListener = null;

export function registerStateListener(callback) {
    stateListener = callback;
}

export function notifyStateChange() {
    if (stateListener) stateListener();
}

export { setupMusicPlayer } from './music-ui.js';
