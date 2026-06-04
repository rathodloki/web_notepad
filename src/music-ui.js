import { showStatus } from './status-bar.js';
import {
    isPlaying,
    isMuted,
    currentVolume,
    currentStationIndex,
    currentSongMetadata,
    STATIONS,
    togglePlay,
    playRandomStation,
    playPreviousStation,
    playNextStation,
    playItem,
    toggleFavorite,
    setVolume,
    toggleMute,
    isFavorited,
    loadStorage,
    registerStateListener
} from './music-manager.js';

const NUM_COLORS = 10;

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

    if (!iconOn || !iconMuted || !muteBtn) return;
    const muted = isMuted || currentVolume === 0;
    iconOn.style.display = muted ? 'none' : 'block';
    iconMuted.style.display = muted ? 'block' : 'none';
    muteBtn.title = muted ? 'Unmute' : 'Mute';
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
    heartIcon.setAttribute('fill', isFav ? '#ef4444' : 'none');
    heartIcon.style.color = isFav ? '#ef4444' : 'var(--text-secondary)';
    favBtn.title = isFav ? "Remove from Favorites" : "Add to Favorites";
    heartIcon.style.filter = isFav ? "drop-shadow(0 0 3px rgba(239, 68, 68, 0.6))" : "none";
}

function getDisplayTitle() {
    if (!currentSongMetadata) return STATIONS[currentStationIndex].name;
    return currentSongMetadata.type === 'song'
        ? `${currentSongMetadata.artist} - ${currentSongMetadata.title}`
        : currentSongMetadata.name;
}

function updateMusicFooterUI() {
    const titleEl = document.getElementById('status-music-title');
    if (!titleEl) return;
    titleEl.textContent = getDisplayTitle();
    updateFavoriteIconUI();
}

function syncHUDAndMarqueeState(play) {
    const gameMusicIcon = document.getElementById('game-music-icon');
    if (gameMusicIcon) {
        gameMusicIcon.classList.toggle('muted', !play);
    }

    const musicInfo = document.getElementById('status-music-info');
    if (musicInfo) {
        musicInfo.classList.toggle('playing', play);
    }
}

function syncButtonState(btnId, play) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const playIcon = btn.querySelector('.play-icon');
    const pauseIcon = btn.querySelector('.pause-icon');
    btn.classList.toggle('active', play);
    btn.title = play ? "Pause Music" : "Play Music";
    if (playIcon) playIcon.style.display = play ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = play ? 'block' : 'none';
}

function createStationItem(station, index) {
    const div = document.createElement('div');
    div.className = 'menu-item';
    Object.assign(div.style, {
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 12px'
    });

    const labelSpan = document.createElement('span');
    Object.assign(labelSpan.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    labelSpan.textContent = station.name;
    div.appendChild(labelSpan);

    const isActive = (currentStationIndex === index && isPlaying);
    if (isActive) {
        Object.assign(div.style, {
            fontWeight: 'bold', color: 'var(--accent, #60a5fa)',
            background: 'rgba(255, 255, 255, 0.04)'
        });
        const indicator = document.createElement('span');
        Object.assign(indicator.style, {
            fontSize: '10px', color: 'var(--accent, #60a5fa)',
            display: 'flex', alignItems: 'center'
        });
        indicator.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        div.appendChild(indicator);
    }

    div.addEventListener('click', (e) => {
        e.stopPropagation();
        playItem({ type: 'station', name: station.name, url: station.url });
        const menu = document.getElementById('music-context-menu');
        if (menu) menu.style.display = 'none';
    });
    return div;
}

function populateMusicMenu() {
    const stationsContainer = document.getElementById('music-menu-stations');
    if (!stationsContainer) return;

    stationsContainer.innerHTML = '';
    STATIONS.forEach((station, index) => {
        stationsContainer.appendChild(createStationItem(station, index));
    });
}

function positionMenu(menu, e) {
    menu.style.left = '0px';
    menu.style.top = '0px';

    const menuRect = menu.getBoundingClientRect();
    let left = Math.max(10, Math.min(e.clientX, window.innerWidth - menuRect.width - 10));
    let top = e.clientY - menuRect.height - 4;
    if (top < 10) top = e.clientY + 10;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
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
    positionMenu(menu, e);
}

function wireToolbarControls() {
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
}

function wireFooterControls() {
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
}

function wireVolumeControls() {
    const volumeSlider = document.getElementById('music-volume-slider');
    const muteBtn = document.getElementById('btn-music-mute');

    if (volumeSlider && !volumeSlider.dataset.listenerAdded) {
        volumeSlider.value = Math.round(currentVolume * 100);
        volumeSlider.style.setProperty('--volume-pct', `${Math.round(currentVolume * 100)}%`);

        volumeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
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
}

function wireContainerAndFavControls() {
    const musicContainer = document.getElementById('status-music-container');
    if (musicContainer && !musicContainer.dataset.listenerAdded) {
        musicContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

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

export function setupMusicPlayer() {
    wireToolbarControls();
    loadStorage();
    wireFooterControls();
    wireVolumeControls();
    updateVolumeUI();
    wireContainerAndFavControls();
    
    // Register UI update listeners to reflect state changes
    registerStateListener(() => {
        updateVolumeUI();
        updateMusicFooterUI();
        updateFavoriteIconUI();
        syncHUDAndMarqueeState(isPlaying);
        syncButtonState('btn-music-play', isPlaying);
        syncButtonState('btn-music-play-footer', isPlaying);
    });
}
