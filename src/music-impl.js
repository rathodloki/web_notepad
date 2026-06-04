// music-impl.js — Manage streaming audio from FreeCodeCamp Code Radio and Synthwave stations
import { showStatus } from './status-bar.js';
import { notifyStateChange } from './music-manager.js';

export const STATIONS = [
    {
        name: "Code Radio (freeCodeCamp)",
        url: "https://coderadio-admin-v2.freecodecamp.org/listen/coderadio/radio.mp3"
    },
    {
        name: "Nightride FM (Synthwave)",
        url: "https://stream.nightride.fm/nightride.mp3"
    },
    {
        name: "Chillsynth (Nightride)",
        url: "https://stream.nightride.fm/chillsynth.mp3"
    },
    {
        name: "Darksynth (Nightride)",
        url: "https://stream.nightride.fm/darksynth.mp3"
    },
    {
        name: "Datawave (Nightride)",
        url: "https://stream.nightride.fm/datawave.mp3"
    },
    {
        name: "Vaporwaves [SomaFM]",
        url: "https://ice2.somafm.com/vaporwaves-128-mp3"
    },
    {
        name: "Groove Salad [SomaFM]",
        url: "https://ice2.somafm.com/groovesalad-128-mp3"
    },
    {
        name: "DEF CON Radio [SomaFM]",
        url: "https://ice2.somafm.com/defcon-128-mp3"
    },
    {
        name: "Digitalis [SomaFM]",
        url: "https://ice2.somafm.com/digitalis-128-mp3"
    },
    {
        name: "Drone Zone [SomaFM]",
        url: "https://ice2.somafm.com/dronezone-128-mp3"
    },
    {
        name: "Deep Space One [SomaFM]",
        url: "https://ice2.somafm.com/deepspaceone-128-mp3"
    },
    {
        name: "Space Station Soma [SomaFM]",
        url: "https://ice2.somafm.com/spacestation-128-mp3"
    },
    {
        name: "Lofi Girl",
        url: "https://play.streamafrica.net/lofiradio"
    },
    {
        name: "Box Lofi Radio",
        url: "https://streaming.radio.co/s97781c7e4/listen"
    },
    {
        name: "Chillhop Radio",
        url: "https://stream.zeno.fm/f3wvbbqmdg8uv"
    },
    {
        name: "DI.FM - Synthwave",
        url: "https://prem4.di.fm/synthwave_hi"
    },
    {
        name: "DI.FM - Chillstep",
        url: "https://prem4.di.fm/chillstep_hi"
    },
    {
        name: "DI.FM - Space Dreams",
        url: "https://prem4.di.fm/spacedreams_hi"
    },
    {
        name: "DI.FM - LoFi Hip Hop",
        url: "https://prem4.di.fm/lofihophip_hi"
    }
];

export let audio = null;
export let currentStationIndex = 0;
export let isPlaying = false;
export let currentVolume = parseFloat(localStorage.getItem('lightpad_music_volume') ?? '0.7');
export let isMuted = false;
export let preMuteVolume = currentVolume;

let audioCtx = null;
let source = null;
export let analyser = null;
export let dataArray = null;

export let musicHistory = [];
export let musicFavorites = [];

let silenceStartTime = null;
let isFallbackMode = false;
let nowPlayingInterval = null;
export let currentSongMetadata = null;



export function loadStorage() {
    try {
        musicHistory = JSON.parse(localStorage.getItem('lightpad_music_history') || '[]');
        musicFavorites = JSON.parse(localStorage.getItem('lightpad_music_favorites') || '[]');
    } catch (e) {
        console.error("Failed to load music storage:", e);
    }
}

function saveStorage() {
    try {
        localStorage.setItem('lightpad_music_history', JSON.stringify(musicHistory));
        localStorage.setItem('lightpad_music_favorites', JSON.stringify(musicFavorites));
    } catch (e) {
        console.error("Failed to save music storage:", e);
    }
}

function getItemKey(item) {
    if (!item) return '';
    return item.type === 'song' ? `${item.title} - ${item.artist}` : (item.name || item.title || '');
}

export function isFavorited(item) {
    if (!item) return false;
    const key = getItemKey(item);
    return musicFavorites.some(fav => getItemKey(fav) === key);
}

export function toggleFavorite(item) {
    if (!item) return;
    loadStorage();
    const key = getItemKey(item);
    const index = musicFavorites.findIndex(fav => getItemKey(fav) === key);
    if (index > -1) {
        musicFavorites.splice(index, 1);
        showStatus("Removed from Favorites");
    } else {
        musicFavorites.unshift(item);
        if (musicFavorites.length > 50) musicFavorites.pop();
        showStatus("Added to Favorites");
    }
    saveStorage();
    notifyStateChange();
}

function addToHistory(item) {
    if (!item) return;
    loadStorage();
    const key = getItemKey(item);
    musicHistory = musicHistory.filter(h => getItemKey(h) !== key);
    musicHistory.unshift(item);
    if (musicHistory.length > 20) {
        musicHistory.pop();
    }
    saveStorage();
}

function initAudio() {
    if (audio) return;
    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.volume = isMuted ? 0 : currentVolume;

    audio.addEventListener('error', (e) => {
        console.error("Audio stream error:", e);
        showStatus("Music stream error. Try next station.");
        setPlayingState(false);
    });

    audio.addEventListener('stalled', () => {
        console.warn("Audio stream stalled. Buffering...");
    });
}

function setupAnalyser() {
    if (analyser) return;
    if (!audio) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
    } catch (err) {
        console.error("Failed to setup Web Audio API analyser:", err);
    }
}

function ensureAudioReady() {
    initAudio();
    setupAnalyser();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function makeStationMetadata(index) {
    return {
        type: 'station',
        name: STATIONS[index].name,
        url: STATIONS[index].url
    };
}

async function fetchCodeRadioMetadata() {
    if (currentStationIndex !== 0 || !isPlaying) return;
    try {
        const res = await fetch("https://coderadio-admin-v2.freecodecamp.org/api/live/nowplaying/coderadio");
        if (!res.ok || currentStationIndex !== 0 || !isPlaying) return;
        const data = await res.json();
        const song = data?.now_playing?.song;
        if (!song?.title) return;
        const newMetadata = {
            type: "song",
            title: song.title,
            artist: song.artist || "Unknown Artist",
            station: "Code Radio (freeCodeCamp)",
            url: STATIONS[0].url
        };
        if (!currentSongMetadata || getItemKey(currentSongMetadata) !== getItemKey(newMetadata)) {
            currentSongMetadata = newMetadata;
            addToHistory(currentSongMetadata);
            notifyStateChange();
        }
    } catch (e) {
        console.error("Failed to fetch Code Radio metadata:", e);
    }
}

function startMetadataPolling() {
    stopMetadataPolling();
    if (currentStationIndex !== 0 || !isPlaying) return;
    if (!currentSongMetadata || currentSongMetadata.url !== STATIONS[0].url) {
        currentSongMetadata = makeStationMetadata(0);
        notifyStateChange();
    }
    fetchCodeRadioMetadata();
    nowPlayingInterval = setInterval(fetchCodeRadioMetadata, 15000);
}

function stopMetadataPolling() {
    if (nowPlayingInterval) {
        clearInterval(nowPlayingInterval);
        nowPlayingInterval = null;
    }
}

function setPlayingState(play) {
    isPlaying = play;
    if (!isPlaying) {
        stopMetadataPolling();
        currentSongMetadata = null;
        notifyStateChange();
        return;
    }
    if (currentStationIndex === 0) {
        startMetadataPolling();
    } else {
        stopMetadataPolling();
        currentSongMetadata = makeStationMetadata(currentStationIndex);
        addToHistory(currentSongMetadata);
    }
    notifyStateChange();
}

function switchStation(stationIndex, statusPrefix, onSuccess) {
    currentStationIndex = stationIndex;
    audio.pause();
    audio.src = STATIONS[currentStationIndex].url;
    audio.load();
    audio.play()
        .then(() => {
            setPlayingState(true);
            if (onSuccess) onSuccess();
            showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
        })
        .catch(err => {
            console.error(`${statusPrefix}:`, err);
            showStatus("Error loading stream");
            setPlayingState(false);
        });
}

export function playItem(item) {
    ensureAudioReady();

    const stationIndex = STATIONS.findIndex(s => s.url === item.url);
    if (stationIndex === -1) {
        showStatus("Station URL not found");
        return;
    }

    switchStation(stationIndex, "Failed to play item", () => {
        currentSongMetadata = item.type === 'song'
            ? item
            : makeStationMetadata(currentStationIndex);
        addToHistory(currentSongMetadata);
        notifyStateChange();
    });
}

export function togglePlay() {
    ensureAudioReady();

    if (isPlaying) {
        audio.pause();
        setPlayingState(false);
        showStatus("Music Paused");
        return;
    }

    if (!audio.src) {
        audio.src = STATIONS[currentStationIndex].url;
    }
    audio.play()
        .then(() => {
            setPlayingState(true);
            showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
        })
        .catch(err => {
            console.error("Failed to play audio:", err);
            showStatus("Error: Could not start audio stream");
            setPlayingState(false);
        });
}

function pickRandomIndex() {
    if (STATIONS.length <= 1) return 0;
    let next;
    do {
        next = Math.floor(Math.random() * STATIONS.length);
    } while (next === currentStationIndex);
    return next;
}

export function playRandomStation() {
    ensureAudioReady();
    switchStation(pickRandomIndex(), "Failed to play random station");
}

export function playNextStation() {
    playRandomStation();
}

export function playPreviousStation() {
    playRandomStation();
}

export { getMusicReactionData } from "./music-reaction.js";

export function setVolume(val) {
    currentVolume = Math.max(0, Math.min(1, val));
    isMuted = false;
    if (audio) {
        audio.volume = currentVolume;
    }
    localStorage.setItem('lightpad_music_volume', String(currentVolume));
    notifyStateChange();
}

export function toggleMute() {
    if (isMuted) {
        isMuted = false;
        if (audio) audio.volume = currentVolume;
    } else {
        preMuteVolume = currentVolume;
        isMuted = true;
        if (audio) audio.volume = 0;
    }
    notifyStateChange();
}
