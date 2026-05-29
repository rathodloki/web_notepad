// music-manager.js — Manage streaming audio from FreeCodeCamp Code Radio and Synthwave stations
import { showStatus } from './status-bar.js';

const STATIONS = [
    // Already Working
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

    // SomaFM
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

    // LoFi
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

    // DI.FM
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
        url: "https://prem4.di.fm/lofihiphop_hi"
    }
];

export let audio = null;
let currentStationIndex = 0;
export let isPlaying = false;
let currentVolume = parseFloat(localStorage.getItem('lightpad_music_volume') ?? '0.7');
let isMuted = false;
let preMuteVolume = currentVolume;

// Web Audio API variables for frequency analysis
let audioCtx = null;
let source = null;
let analyser = null;
let dataArray = null;

// Favorites & History state (stubbed/deactivated)
let musicHistory = [];
let musicFavorites = [];

// Watchdog silence detector variables
let silenceStartTime = null;
let isFallbackMode = false;
let nowPlayingInterval = null;
let currentSongMetadata = null;

function loadStorage() {
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

function isFavorited(item) {
    if (!item) return false;
    const key = getItemKey(item);
    return musicFavorites.some(fav => getItemKey(fav) === key);
}

function toggleFavorite(item) {
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
    updateFavoriteIconUI();
}

function addToHistory(item) {
    if (!item) return;
    loadStorage();
    const key = getItemKey(item);
    // Remove duplicate to bring to top of list
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
    // Enable CORS to allow Web Audio API AnalyserNode to inspect the stream frequencies
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

async function fetchCodeRadioMetadata() {
    if (currentStationIndex !== 0 || !isPlaying) return;
    try {
        const res = await fetch("https://coderadio-admin-v2.freecodecamp.org/api/live/nowplaying/coderadio");
        if (res.ok && currentStationIndex === 0 && isPlaying) {
            const data = await res.json();
            const song = data?.now_playing?.song;
            if (song && song.title) {
                const newMetadata = {
                    type: "song",
                    title: song.title,
                    artist: song.artist || "Unknown Artist",
                    station: "Code Radio (freeCodeCamp)",
                    url: STATIONS[0].url
                };
                if (!currentSongMetadata || getItemKey(currentSongMetadata) !== getItemKey(newMetadata)) {
                    currentSongMetadata = newMetadata;
                    updateMusicFooterUI();
                    addToHistory(currentSongMetadata);
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch Code Radio metadata:", e);
    }
}

function startMetadataPolling() {
    stopMetadataPolling();
    if (currentStationIndex === 0 && isPlaying) {
        if (!currentSongMetadata || currentSongMetadata.url !== STATIONS[0].url) {
            currentSongMetadata = {
                type: 'station',
                name: STATIONS[0].name,
                url: STATIONS[0].url
            };
            updateMusicFooterUI();
        }
        fetchCodeRadioMetadata();
        nowPlayingInterval = setInterval(fetchCodeRadioMetadata, 15000);
    }
}

function stopMetadataPolling() {
    if (nowPlayingInterval) {
        clearInterval(nowPlayingInterval);
        nowPlayingInterval = null;
    }
}

function setPlayingState(play) {
    isPlaying = play;
    const playBtn = document.getElementById('btn-music-play');
    const playFooterBtn = document.getElementById('btn-music-play-footer');

    // Sync the game's bottom-left HUD music icon state
    const gameMusicIcon = document.getElementById('game-music-icon');
    if (gameMusicIcon) {
        if (isPlaying) {
            gameMusicIcon.classList.remove('muted');
        } else {
            gameMusicIcon.classList.add('muted');
        }
    }

    // Sync marquee state class
    const musicInfo = document.getElementById('status-music-info');
    if (musicInfo) {
        if (isPlaying) {
            musicInfo.classList.add('playing');
        } else {
            musicInfo.classList.remove('playing');
        }
    }

    if (isPlaying) {
        if (currentStationIndex === 0) {
            startMetadataPolling();
        } else {
            stopMetadataPolling();
            currentSongMetadata = {
                type: 'station',
                name: STATIONS[currentStationIndex].name,
                url: STATIONS[currentStationIndex].url
            };
            updateMusicFooterUI();
            addToHistory(currentSongMetadata);
        }
    } else {
        stopMetadataPolling();
        currentSongMetadata = null;
        const titleEl = document.getElementById('status-music-title');
        if (titleEl) {
            titleEl.textContent = "Music Off";
        }
    }

    // Sync toolbar play button
    if (playBtn) {
        const playIcon = playBtn.querySelector('.play-icon');
        const pauseIcon = playBtn.querySelector('.pause-icon');
        if (isPlaying) {
            playBtn.classList.add('active');
            playBtn.title = "Pause Music";
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        } else {
            playBtn.classList.remove('active');
            playBtn.title = "Play Music";
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
    }

    // Sync footer play button
    if (playFooterBtn) {
        const playIconFooter = playFooterBtn.querySelector('.play-icon');
        const pauseIconFooter = playFooterBtn.querySelector('.pause-icon');
        if (isPlaying) {
            playFooterBtn.classList.add('active');
            playFooterBtn.title = "Pause Music";
            if (playIconFooter) playIconFooter.style.display = 'none';
            if (pauseIconFooter) pauseIconFooter.style.display = 'block';
        } else {
            playFooterBtn.classList.remove('active');
            playFooterBtn.title = "Play Music";
            if (playIconFooter) playIconFooter.style.display = 'block';
            if (pauseIconFooter) pauseIconFooter.style.display = 'none';
        }
    }
}

function updateMusicFooterUI() {
    const titleEl = document.getElementById('status-music-title');
    if (!titleEl) return;

    if (currentSongMetadata) {
        if (currentSongMetadata.type === 'song') {
            titleEl.textContent = `${currentSongMetadata.artist} - ${currentSongMetadata.title}`;
        } else {
            titleEl.textContent = `${currentSongMetadata.name}`;
        }
    } else {
        titleEl.textContent = `${STATIONS[currentStationIndex].name}`;
    }

    updateFavoriteIconUI();
}

function updateFavoriteIconUI() {
    const heartIcon = document.getElementById('music-heart-icon');
    const favBtn = document.getElementById('btn-music-fav');
    if (!heartIcon || !favBtn) return;

    const item = currentSongMetadata || {
        type: 'station',
        name: STATIONS[currentStationIndex].name,
        url: STATIONS[currentStationIndex].url
    };

    const isFav = isFavorited(item);
    if (isFav) {
        heartIcon.setAttribute('fill', '#ef4444');
        heartIcon.style.color = '#ef4444';
        favBtn.title = "Remove from Favorites";
        heartIcon.style.filter = "drop-shadow(0 0 3px rgba(239, 68, 68, 0.6))";
    } else {
        heartIcon.setAttribute('fill', 'none');
        heartIcon.style.color = 'var(--text-secondary)';
        favBtn.title = "Add to Favorites";
        heartIcon.style.filter = "none";
    }
}

function populateMusicMenu() {
    const stationsContainer = document.getElementById('music-menu-stations');
    if (!stationsContainer) return;

    stationsContainer.innerHTML = '';
    
    STATIONS.forEach((station, index) => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.fontSize = '12px';
        div.style.padding = '6px 12px';

        const labelSpan = document.createElement('span');
        labelSpan.style.overflow = 'hidden';
        labelSpan.style.textOverflow = 'ellipsis';
        labelSpan.style.whiteSpace = 'nowrap';
        labelSpan.textContent = station.name;
        
        const isActive = (currentStationIndex === index && isPlaying);
        if (isActive) {
            div.style.fontWeight = 'bold';
            div.style.color = 'var(--accent, #60a5fa)';
            div.style.background = 'rgba(255, 255, 255, 0.04)';
        }
        
        div.appendChild(labelSpan);

        if (isActive) {
            const statusIndicator = document.createElement('span');
            statusIndicator.style.fontSize = '10px';
            statusIndicator.style.color = 'var(--accent, #60a5fa)';
            statusIndicator.style.display = 'flex';
            statusIndicator.style.alignItems = 'center';
            statusIndicator.innerHTML = `
                <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            div.appendChild(statusIndicator);
        }

        div.addEventListener('click', (e) => {
            e.stopPropagation();
            playItem({
                type: 'station',
                name: station.name,
                url: station.url
            });
            const menu = document.getElementById('music-context-menu');
            if (menu) menu.style.display = 'none';
        });
        stationsContainer.appendChild(div);
    });
}

function showMusicContextMenu(e) {
    const menu = document.getElementById('music-context-menu');
    if (!menu) return;

    if (menu.style.display === 'flex') {
        menu.style.display = 'none';
        return;
    }

    loadStorage();
    populateMusicMenu();

    menu.style.display = 'flex';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const menuRect = menu.getBoundingClientRect();
    let left = e.clientX;
    let top = e.clientY - menuRect.height - 4; // Display above click

    if (left + menuRect.width > window.innerWidth) {
        left = window.innerWidth - menuRect.width - 10;
    }
    if (left < 10) left = 10;

    if (top < 10) {
        // If it goes above window top, show it below
        top = e.clientY + 10;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

export function playItem(item) {
    initAudio();
    setupAnalyser();

    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Find the station index by url
    const stationIndex = STATIONS.findIndex(s => s.url === item.url);
    if (stationIndex > -1) {
        currentStationIndex = stationIndex;
        audio.pause();
        audio.src = STATIONS[currentStationIndex].url;
        audio.load();

        audio.play()
            .then(() => {
                setPlayingState(true);
                if (item.type === 'song') {
                    currentSongMetadata = item;
                    updateMusicFooterUI();
                    addToHistory(item);
                } else {
                    currentSongMetadata = {
                        type: 'station',
                        name: STATIONS[currentStationIndex].name,
                        url: STATIONS[currentStationIndex].url
                    };
                    updateMusicFooterUI();
                    addToHistory(currentSongMetadata);
                }
                showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
            })
            .catch(err => {
                console.error("Failed to play item:", err);
                showStatus("Error playing stream");
                setPlayingState(false);
            });
    } else {
        showStatus("Station URL not found");
    }
}

export function togglePlay() {
    initAudio();
    setupAnalyser();

    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (isPlaying) {
        audio.pause();
        setPlayingState(false);
        showStatus("Music Paused");
    } else {
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
}

export function playRandomStation() {
    initAudio();
    setupAnalyser();

    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Choose a random station index different from current one if possible
    let nextIndex = currentStationIndex;
    if (STATIONS.length > 1) {
        do {
            nextIndex = Math.floor(Math.random() * STATIONS.length);
        } while (nextIndex === currentStationIndex);
    } else {
        nextIndex = 0;
    }

    currentStationIndex = nextIndex;

    // Stop current stream, switch source, and play
    audio.pause();
    audio.src = STATIONS[currentStationIndex].url;
    audio.load();

    audio.play()
        .then(() => {
            setPlayingState(true);
            showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
        })
        .catch(err => {
            console.error("Failed to play random station:", err);
            showStatus("Error loading stream. Retrying next...");
            setPlayingState(false);
        });
}

export function playNextStation() {
    playRandomStation();
}

export function playPreviousStation() {
    playRandomStation();
}

export function getMusicReactionData() {
    // Basic pulse for when music is paused
    const idlePulse = 0.05 + Math.sin(Date.now() / 450) * 0.03;

    if (!isPlaying) {
        silenceStartTime = null;
        isFallbackMode = false;
        return {
            isPlaying: false,
            volume: 0,
            bass: idlePulse,
            mid: idlePulse,
            treble: idlePulse,
            bands: [idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse]
        };
    }

    // Watchdog silence checking (auto-switches radio if silent for 30s, or 10s on subsequent failures)
    if (isPlaying && !isMuted && currentVolume > 0) {
        let isSilent = true;
        if (analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray);
            let checkSum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                checkSum += dataArray[i];
            }
            if (checkSum > 8) { // threshold for active audio
                isSilent = false;
            }
        } else {
            if (audio && !audio.paused && audio.readyState >= 2) {
                isSilent = false;
            }
        }

        if (isSilent) {
            if (!silenceStartTime) {
                silenceStartTime = Date.now();
            }
            const silenceElapsed = Date.now() - silenceStartTime;
            const threshold = isFallbackMode ? 10000 : 30000;
            if (silenceElapsed >= threshold) {
                console.warn(`Watchdog: Silence detected for ${silenceElapsed}ms. Switching station.`);
                silenceStartTime = Date.now();
                isFallbackMode = true;
                playRandomStation();
            }
        } else {
            silenceStartTime = null;
            isFallbackMode = false;
        }
    } else {
        silenceStartTime = null;
        isFallbackMode = false;
    }

    let hasRealData = false;
    let sum = 0;

    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const len = dataArray.length;
        for (let i = 0; i < len; i++) {
            sum += dataArray[i];
        }
        if (sum > 0) {
            hasRealData = true;
        }
    }

    if (hasRealData) {
        let bassSum = 0;
        let midSum = 0;
        let trebleSum = 0;

        const len = dataArray.length;
        const bassEnd = Math.floor(len * 0.1) || 1;
        const midEnd = Math.floor(len * 0.6);

        const bands = [];
        const bandSize = Math.floor(len / 8) || 1;
        for (let b = 0; b < 8; b++) {
            let bSum = 0;
            const start = b * bandSize;
            const end = start + bandSize;
            for (let i = start; i < end; i++) {
                bSum += dataArray[i] / 255;
            }
            bands.push(bSum / bandSize);
        }

        for (let i = 0; i < len; i++) {
            const val = dataArray[i] / 255;
            sum += val;
            if (i < bassEnd) {
                bassSum += val;
            } else if (i < midEnd) {
                midSum += val;
            } else {
                trebleSum += val;
            }
        }

        const volume = sum / len;
        const bass = bassSum / bassEnd;
        const mid = midSum / (midEnd - bassEnd);
        const treble = trebleSum / (len - midEnd);

        return {
            isPlaying: true,
            volume,
            bass: Math.pow(bass, 1.25), // emphasize bass rhythm
            mid,
            treble,
            bands
        };
    } else {
        // Fallback procedural beat generator (~125 BPM / 480ms interval)
        const bpmInterval = 480;
        const elapsed = Date.now() % bpmInterval;
        // Exponential decay curve for snappy drum hits
        const beatPulse = Math.pow(Math.max(0, 1.0 - elapsed / bpmInterval), 2.5);

        const volume = 0.15 + beatPulse * 0.45;
        const bass = beatPulse;
        const mid = 0.1 + beatPulse * 0.3;
        const treble = 0.05 + beatPulse * 0.2;

        // Generate simulated visualizer equalizer bands
        const bands = [];
        for (let b = 0; b < 8; b++) {
            const phase = b * 0.4;
            const wave = 0.12 + Math.abs(Math.sin(Date.now() / 280 + phase)) * 0.25;
            const val = wave + beatPulse * 0.6;
            bands.push(Math.max(0.05, Math.min(1.0, val)));
        }

        return {
            isPlaying: true,
            volume,
            bass,
            mid,
            treble,
            bands
        };
    }
}

function updateVolumeUI() {
    const slider = document.getElementById('music-volume-slider');
    const iconOn = document.getElementById('volume-icon-on');
    const iconMuted = document.getElementById('volume-icon-muted');
    const muteBtn = document.getElementById('btn-music-mute');

    if (slider) {
        const displayVal = isMuted ? 0 : Math.round(currentVolume * 100);
        slider.value = displayVal;
        slider.style.setProperty('--volume-pct', `${displayVal}%`);
    }

    if (iconOn && iconMuted && muteBtn) {
        if (isMuted || currentVolume === 0) {
            iconOn.style.display = 'none';
            iconMuted.style.display = 'block';
            muteBtn.title = 'Unmute';
        } else {
            iconOn.style.display = 'block';
            iconMuted.style.display = 'none';
            muteBtn.title = 'Mute';
        }
    }
}

function setVolume(val) {
    currentVolume = Math.max(0, Math.min(1, val));
    if (audio) {
        audio.volume = isMuted ? 0 : currentVolume;
    }
    localStorage.setItem('lightpad_music_volume', String(currentVolume));
    updateVolumeUI();
}

function toggleMute() {
    if (isMuted) {
        isMuted = false;
        if (audio) audio.volume = currentVolume;
    } else {
        preMuteVolume = currentVolume;
        isMuted = true;
        if (audio) audio.volume = 0;
    }
    updateVolumeUI();
}

export function setupMusicPlayer() {
    const playBtn = document.getElementById('btn-music-play');
    const nextBtn = document.getElementById('btn-music-next');

    if (playBtn && !playBtn.dataset.listenerAdded) {
        playBtn.addEventListener('click', togglePlay);
        playBtn.dataset.listenerAdded = 'true';
    }
    if (nextBtn && !nextBtn.dataset.listenerAdded) {
        nextBtn.addEventListener('click', playRandomStation);
        nextBtn.dataset.listenerAdded = 'true';
    }

    // Load initial storage data
    loadStorage();

    // Wire up footer controls
    const playFooterBtn = document.getElementById('btn-music-play-footer');
    const prevFooterBtn = document.getElementById('btn-music-prev-footer');
    const nextFooterBtn = document.getElementById('btn-music-next-footer');

    if (playFooterBtn && !playFooterBtn.dataset.listenerAdded) {
        playFooterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });
        playFooterBtn.dataset.listenerAdded = 'true';
    }
    if (prevFooterBtn && !prevFooterBtn.dataset.listenerAdded) {
        prevFooterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playPreviousStation();
        });
        prevFooterBtn.dataset.listenerAdded = 'true';
    }
    if (nextFooterBtn && !nextFooterBtn.dataset.listenerAdded) {
        nextFooterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playNextStation();
        });
        nextFooterBtn.dataset.listenerAdded = 'true';
    }

    // Wire up volume slider & mute button
    const volumeSlider = document.getElementById('music-volume-slider');
    const muteBtn = document.getElementById('btn-music-mute');

    if (volumeSlider && !volumeSlider.dataset.listenerAdded) {
        // Initialize slider to saved volume
        volumeSlider.value = Math.round(currentVolume * 100);
        volumeSlider.style.setProperty('--volume-pct', `${Math.round(currentVolume * 100)}%`);

        volumeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            isMuted = false;
            setVolume(parseInt(e.target.value, 10) / 100);
        });
        volumeSlider.addEventListener('click', (e) => e.stopPropagation());
        volumeSlider.addEventListener('mousedown', (e) => e.stopPropagation());
        volumeSlider.dataset.listenerAdded = 'true';
    }
    if (muteBtn && !muteBtn.dataset.listenerAdded) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMute();
        });
        muteBtn.dataset.listenerAdded = 'true';
    }

    // Set initial volume icon state
    updateVolumeUI();

    // Wire up footer status container click/contextmenu and heart favorite button
    const musicContainer = document.getElementById('status-music-container');
    if (musicContainer && !musicContainer.dataset.listenerAdded) {
        musicContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Left click on music info span should show all stations popup
        const musicInfo = document.getElementById('status-music-info');
        if (musicInfo) {
            musicInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                showMusicContextMenu(e);
            });
        }

        musicContainer.dataset.listenerAdded = 'true';
    }

    const favBtn = document.getElementById('btn-music-fav');
    if (favBtn && !favBtn.dataset.listenerAdded) {
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            let item = currentSongMetadata;
            if (!item) {
                item = {
                    type: 'station',
                    name: STATIONS[currentStationIndex].name,
                    url: STATIONS[currentStationIndex].url
                };
            }
            toggleFavorite(item);
        });
        favBtn.dataset.listenerAdded = 'true';
    }
}
