// music-manager.js — Manage streaming audio from FreeCodeCamp Code Radio and Synthwave stations
import { showStatus } from './status-bar.js';

const STATIONS = [
    { name: "Code Radio (freeCodeCamp)", url: "https://coderadio-admin-v2.freecodecamp.org/listen/coderadio/radio.mp3" },
    { name: "Nightride FM (Synthwave)", url: "https://stream.nightride.fm/nightride.mp3" },
    { name: "Chillsynth (Nightride)", url: "https://stream.nightride.fm/chillsynth.mp3" },
    { name: "Darksynth (Nightride)", url: "https://stream.nightride.fm/darksynth.mp3" },
    { name: "Datawave (Nightride)", url: "https://stream.nightride.fm/datawave.mp3" }
];

export let audio = null;
let currentStationIndex = 0;
let isPlaying = false;

// Web Audio API variables for frequency analysis
let audioCtx = null;
let source = null;
let analyser = null;
let dataArray = null;

// Favorites & History state
let musicHistory = [];
let musicFavorites = [];
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
            titleEl.textContent = `Playing: ${currentSongMetadata.artist} - ${currentSongMetadata.title}`;
        } else {
            titleEl.textContent = `Playing: ${currentSongMetadata.name}`;
        }
    } else {
        titleEl.textContent = `Playing: ${STATIONS[currentStationIndex].name}`;
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
    const favContainer = document.getElementById('music-menu-favorites');
    const historyContainer = document.getElementById('music-menu-history');
    if (!favContainer || !historyContainer) return;
    
    favContainer.innerHTML = '';
    if (musicFavorites.length === 0) {
        favContainer.innerHTML = '<div class="menu-item" style="color: var(--text-muted); cursor: default; font-style: italic; font-size: 11px; padding: 6px 12px;">No favorites yet</div>';
    } else {
        musicFavorites.forEach(item => {
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
            labelSpan.textContent = item.type === 'song' ? `${item.artist} - ${item.title}` : item.name;
            div.appendChild(labelSpan);
            
            if (item.type === 'song') {
                const badge = document.createElement('span');
                badge.style.fontSize = '9px';
                badge.style.color = 'var(--text-muted)';
                badge.style.background = 'rgba(255,255,255,0.04)';
                badge.style.padding = '1px 3px';
                badge.style.borderRadius = '2px';
                badge.style.flexShrink = '0';
                badge.textContent = 'Radio';
                div.appendChild(badge);
            }
            
            div.addEventListener('click', () => {
                playItem(item);
                const menu = document.getElementById('music-context-menu');
                if (menu) menu.style.display = 'none';
            });
            favContainer.appendChild(div);
        });
    }
    
    historyContainer.innerHTML = '';
    if (musicHistory.length === 0) {
        historyContainer.innerHTML = '<div class="menu-item" style="color: var(--text-muted); cursor: default; font-style: italic; font-size: 11px; padding: 6px 12px;">No history yet</div>';
    } else {
        musicHistory.forEach(item => {
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
            labelSpan.textContent = item.type === 'song' ? `${item.artist} - ${item.title}` : item.name;
            div.appendChild(labelSpan);
            
            div.addEventListener('click', () => {
                playItem(item);
                const menu = document.getElementById('music-context-menu');
                if (menu) menu.style.display = 'none';
            });
            historyContainer.appendChild(div);
        });
    }
}

function showMusicContextMenu(e) {
    loadStorage();
    populateMusicMenu();
    
    const menu = document.getElementById('music-context-menu');
    if (!menu) return;
    
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
    initAudio();
    setupAnalyser();
    
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    currentStationIndex = (currentStationIndex + 1) % STATIONS.length;
    
    audio.pause();
    audio.src = STATIONS[currentStationIndex].url;
    audio.load();
    
    audio.play()
        .then(() => {
            setPlayingState(true);
            showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
        })
        .catch(err => {
            console.error("Failed to play next station:", err);
            showStatus("Error loading stream.");
            setPlayingState(false);
        });
}

export function playPreviousStation() {
    initAudio();
    setupAnalyser();
    
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    currentStationIndex = (currentStationIndex - 1 + STATIONS.length) % STATIONS.length;
    
    audio.pause();
    audio.src = STATIONS[currentStationIndex].url;
    audio.load();
    
    audio.play()
        .then(() => {
            setPlayingState(true);
            showStatus(`Playing: ${STATIONS[currentStationIndex].name}`);
        })
        .catch(err => {
            console.error("Failed to play previous station:", err);
            showStatus("Error loading stream.");
            setPlayingState(false);
        });
}

export function getMusicReactionData() {
    // Basic pulse for when music is paused
    const idlePulse = 0.05 + Math.sin(Date.now() / 450) * 0.03;

    if (!isPlaying) {
        return {
            isPlaying: false,
            volume: 0,
            bass: idlePulse,
            mid: idlePulse,
            treble: idlePulse,
            bands: [idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse, idlePulse]
        };
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

    // Wire up footer status container click/contextmenu and heart favorite button
    const musicContainer = document.getElementById('status-music-container');
    if (musicContainer && !musicContainer.dataset.listenerAdded) {
        musicContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMusicContextMenu(e);
        });
        
        // Also support click on the music info span to toggle play/pause
        const musicInfo = document.getElementById('status-music-info');
        if (musicInfo) {
            musicInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlay();
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
