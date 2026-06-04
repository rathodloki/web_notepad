import {
    isPlaying,
    isMuted,
    currentVolume,
    analyser,
    dataArray,
    audio,
    playRandomStation
} from './music-impl.js';

let silenceStartTime = null;
let isFallbackMode = false;

function getIdleReaction() {
    const idlePulse = 0.05 + Math.sin(Date.now() / 450) * 0.03;
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

function detectSilence() {
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let checkSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            checkSum += dataArray[i];
        }
        return checkSum <= 8;
    }
    // No analyser: assume not silent when audio is actively streaming
    return !(audio && !audio.paused && audio.readyState >= 2);
}

function updateSilenceWatchdog() {
    if (!isPlaying || isMuted || currentVolume <= 0) {
        silenceStartTime = null;
        isFallbackMode = false;
        return;
    }

    if (!detectSilence()) {
        silenceStartTime = null;
        isFallbackMode = false;
        return;
    }

    if (!silenceStartTime) {
        silenceStartTime = Date.now();
    }
    const threshold = isFallbackMode ? 10000 : 30000;
    if (Date.now() - silenceStartTime >= threshold) {
        console.warn(`Watchdog: Silence detected for ${Date.now() - silenceStartTime}ms. Switching station.`);
        silenceStartTime = Date.now();
        isFallbackMode = true;
        playRandomStation();
    }
}

function getRealAudioReaction() {
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

    let sum = 0;
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
        bass: Math.pow(bass, 1.25),
        mid,
        treble,
        bands
    };
}

function getProceduralAudioReaction() {
    const bpmInterval = 480;
    const elapsed = Date.now() % bpmInterval;
    const beatPulse = Math.pow(Math.max(0, 1.0 - elapsed / bpmInterval), 2.5);

    const volume = 0.15 + beatPulse * 0.45;
    const bass = beatPulse;
    const mid = 0.1 + beatPulse * 0.3;
    const treble = 0.05 + beatPulse * 0.2;

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

export function getMusicReactionData() {
    if (!isPlaying) {
        return getIdleReaction();
    }

    updateSilenceWatchdog();

    let hasRealData = false;
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        if (sum > 0) {
            hasRealData = true;
        }
    }

    if (hasRealData) {
        return getRealAudioReaction();
    } else {
        return getProceduralAudioReaction();
    }
}
