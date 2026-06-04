// game.js - Mini Retro Space Shooter Game for LightPad
import { getMusicReactionData } from './music-manager.js';
import { state } from './state.js';
import { getFilename } from './utils.js';
import {
    initBossSystem, initBossSystemFromCheckpoint, checkBossThreshold, updateBossSystem,
    renderBossSystem, handleBossBulletHit, isBossPhaseActive, shouldPauseSpawning,
    getBossState, getBoss, getCheckpoint, clearCheckpoints, applyCheckpointToPlayer,
    getMaxComboBonus, consumeBossDeathReward, fastForwardBossTimers, getBossProgress,
    getScoreAtLastBossDefeat, getPointsNeededForBoss
} from './boss.js';

let canvas = null;
let ctx = null;
let animationFrameId = null;
let bgImage = null;
let visualizerBars = null;
let spriteCache = null;

// Game states
const STATE_IDLE = 'IDLE';
const STATE_RUNNING = 'RUNNING';
const STATE_PAUSED = 'PAUSED';
const STATE_GAMEOVER = 'GAMEOVER';
let gameState = STATE_IDLE;

// Spaceship variables
const player = {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    vx: 0,
    vy: 0,
    speed: 0.65,
    friction: 0.86,
    maxSpeed: 6.8,
    energy: 100,
    maxEnergy: 100,
    damageFlash: 0,
    shootCooldown: 0,
    shieldTime: 0,
    weaponUpgradeTime: 0,
    slowMotionTime: 0,
    magnetTime: 0,
    overchargeTime: 0,
    controlScrambleTime: 0,
    supportDroneTime: 0, // kept as backup if needed, but drones array is source of truth
    drones: [],
    permaWeaponType: null
};

// Controls tracking
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    ' ': false
};

// Game entities
let bugs = [];
let fragments = [];
let particles = [];
let stars = [];
let bullets = [];
let enemyProjectiles = [];
let bgSymbols = [];
let powerups = [];

// Game stats
let score = 0;
let highscore = 0;
let combo = 1.0;
let timeElapsed = 0;
let lastSpawnTime = 0;
let lastFragmentSpawnTime = 0;
let lastPowerUpSpawnTime = 0;
let gameStartTime = 0;
let lastPhysicsTime = 0;
let droneShootCooldown = 0;

// Threat Director / DDA variables
let closeCalls = 0;
let lastDamageTime = 0;
let directorIntensity = 1.0;
let threatLevel = 'COLD';
let flowState = 'ZEN';
let sniperBeams = [];

// Screen shake
let shakeTime = 0;
let shakeIntensity = 0;

// Mouse glow
let mousePos = { x: -1000, y: -1000 };
let mouseGlowActive = false;

// Procedural Audio (Web Audio API)
let audioCtx = null;
let musicInterval = null;
let musicEnabled = true;
let audioUnlocked = false;

// -------------------------------------------------------------
// SPRITE DEFINITIONS (Pixel matrices)
// Color map representations: 
// 0 = transparent, 1 = primary, 2 = secondary, 3 = tertiary
// -------------------------------------------------------------

const PLAYER_SHIP_SPRITE = [
    [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,2,1,1,2,1,0,0,0,0,0],
    [0,0,0,0,0,1,2,1,1,2,1,0,0,0,0,0],
    [0,0,0,0,1,2,2,0,0,2,2,1,0,0,0,0],
    [0,0,0,0,1,2,0,0,0,0,2,1,0,0,0,0],
    [0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0],
    [0,0,1,2,2,1,1,1,1,1,1,2,2,1,0,0],
    [0,0,1,2,1,1,0,0,0,0,1,1,2,1,0,0],
    [0,1,2,2,1,0,0,3,3,0,0,1,2,2,1,0],
    [0,1,2,1,0,0,3,3,3,3,0,0,1,2,1,0],
    [1,2,2,1,0,0,3,3,3,3,0,0,1,2,2,1],
    [1,2,1,0,0,0,0,0,0,0,0,0,0,1,2,1],
    [1,2,0,0,0,0,0,0,0,0,0,0,0,0,2,1],
    [1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];

const BUG_SPRITE = [
    [0,0,1,0,0,0,1,0,0],
    [0,1,0,1,0,1,0,1,0],
    [0,1,1,1,1,1,1,1,0],
    [1,0,1,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,1],
    [0,0,1,1,1,1,1,0,0],
    [0,1,0,0,0,0,0,1,0],
    [1,0,0,0,0,0,0,0,1]
];

const BUG_SPRITE_FLAP = [
    [0,0,1,0,0,0,1,0,0],
    [0,1,0,1,0,1,0,1,0],
    [0,1,1,1,1,1,1,1,0],
    [1,0,1,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,1],
    [0,0,1,1,1,1,1,0,0],
    [1,0,0,0,0,0,0,0,1],
    [0,1,0,0,0,0,0,1,0]
];

const VIRUS_SPRITE = [
    [0,0,0,1,1,1,0,0,0],
    [0,1,1,0,0,0,1,1,0],
    [0,1,0,0,2,0,0,1,0],
    [1,0,0,2,2,2,0,0,1],
    [1,0,2,2,1,2,2,0,1],
    [1,0,0,2,2,2,0,0,1],
    [0,1,0,0,2,0,0,1,0],
    [0,1,1,0,0,0,1,1,0],
    [0,0,0,1,1,1,0,0,0]
];

const DRONE_SPRITE = [
    [1,0,0,0,0,0,0,0,0,0,1],
    [1,1,0,0,2,2,2,0,0,1,1],
    [0,1,1,2,2,1,2,2,1,1,0],
    [0,0,1,2,1,1,1,2,1,0,0],
    [0,0,1,1,1,1,1,1,1,0,0],
    [0,1,1,0,3,0,3,0,1,1,0],
    [1,1,0,0,0,0,0,0,0,1,1],
    [1,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,1]
];

const SWARM_SPRITE = [
    [0,0,1,0,0],
    [0,1,2,1,0],
    [1,2,2,2,1],
    [0,1,2,1,0],
    [0,0,1,0,0]
];

const PHANTOM_SPRITE = [
    [0,0,0,1,0,0,0],
    [0,0,1,2,1,0,0],
    [0,1,1,2,1,1,0],
    [0,1,0,2,0,1,0],
    [1,1,0,2,0,1,1],
    [1,0,0,0,0,0,1]
];

const GUARDIAN_SPRITE = [
    [1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,1],
    [1,2,3,3,1,3,3,2,1],
    [1,2,1,1,1,1,1,2,1],
    [0,1,2,2,2,2,2,1,0],
    [0,0,1,1,1,1,1,0,0]
];

const BOMBER_SPRITE = [
    [0,0,1,1,1,0,0],
    [0,1,2,3,2,1,0],
    [1,2,3,1,3,2,1],
    [1,3,1,1,1,3,1],
    [1,2,3,1,3,2,1],
    [0,1,2,3,2,1,0],
    [0,0,1,1,1,0,0]
];

const MINE_SPRITE = [
    [0,1,0,1,0],
    [1,2,2,2,1],
    [0,2,3,2,0],
    [1,2,2,2,1],
    [0,1,0,1,0]
];

const SNIPER_SPRITE = [
    [0,0,0,1,1,0,0,0],
    [0,0,1,3,3,1,0,0],
    [0,0,1,2,2,1,0,0],
    [0,1,1,2,2,1,1,0],
    [1,1,2,2,2,2,1,1],
    [1,0,1,2,2,1,0,1],
    [1,0,1,2,2,1,0,1],
    [0,0,1,1,1,1,0,0]
];

const CARRIER_SPRITE = [
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,3,3,1,1,0,0,0,0],
    [0,0,0,1,1,2,2,2,2,1,1,0,0,0],
    [0,0,1,1,1,2,1,1,2,1,1,1,0,0],
    [0,1,1,2,2,2,2,2,2,2,2,1,1,0],
    [1,1,2,2,1,1,1,1,1,1,2,2,1,1],
    [1,2,2,1,1,3,3,3,3,1,1,2,2,1],
    [1,1,1,0,0,1,1,1,1,0,0,1,1,1]
];

const SHIELD_POWERUP_SPRITE = [
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,0,1,2,2,2,2,2,1,0,0],
    [0,1,2,2,2,2,2,2,2,1,0],
    [1,2,2,1,1,2,1,1,2,2,1],
    [1,2,2,1,0,2,0,1,2,2,1],
    [1,2,2,2,1,2,1,2,2,2,1],
    [0,1,2,2,2,1,2,2,2,1,0],
    [0,0,1,2,2,2,2,2,1,0,0],
    [0,0,0,1,2,2,2,1,0,0,0],
    [0,0,0,0,1,2,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0]
];

const WEAPONS_POWERUP_SPRITE = [
    [0,1,0,0,0,0,0,0,0,1,0],
    [0,1,1,0,0,0,0,0,1,1,0],
    [1,2,1,0,0,0,0,0,1,2,1],
    [1,2,1,0,1,1,1,0,1,2,1],
    [1,2,1,1,2,2,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,1],
    [0,1,1,2,2,1,2,2,1,1,0],
    [0,0,1,2,2,1,2,2,1,0,0],
    [0,0,1,2,2,1,2,2,1,0,0],
    [0,0,0,1,1,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0]
];

const EMP_POWERUP_SPRITE = [
    [0,0,0,0,0,0,0,0,3,3,0],
    [0,0,0,0,0,0,0,3,0,0,0],
    [0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,2,2,1,1,0,0],
    [0,0,1,2,2,2,2,2,2,1,0],
    [0,1,2,2,1,2,1,2,2,2,1],
    [0,1,2,2,1,2,1,2,2,2,1],
    [0,1,2,2,2,2,2,2,2,2,1],
    [0,0,1,2,2,2,2,2,2,1,0],
    [0,0,0,1,1,2,2,1,1,0,0],
    [0,0,0,0,0,1,1,0,0,0,0]
];

const SLOWMO_POWERUP_SPRITE = [
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,1],
    [0,1,2,2,2,2,2,2,2,1,0],
    [0,0,1,2,2,2,2,2,1,0,0],
    [0,0,0,1,2,2,2,1,0,0,0],
    [0,0,0,0,1,2,1,0,0,0,0],
    [0,0,0,1,2,2,2,1,0,0,0],
    [0,0,1,2,2,2,2,2,1,0,0],
    [0,0,1,2,2,2,2,2,1,0,0],
    [1,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,1,1,1,1,1,1,1,1]
];

const MAGNET_POWERUP_SPRITE = [
    [0,0,2,2,2,0,2,2,2,0,0],
    [0,2,1,1,1,0,1,1,1,2,0],
    [0,2,1,1,1,0,1,1,1,2,0],
    [0,2,1,1,0,0,0,1,1,2,0],
    [2,1,1,0,0,0,0,0,1,1,2],
    [2,1,1,0,0,0,0,0,1,1,2],
    [2,1,1,0,0,0,0,0,1,1,2],
    [0,2,1,1,0,0,0,1,1,2,0],
    [0,0,2,1,1,1,1,1,2,0,0],
    [0,0,0,2,2,2,2,2,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0]
];

const OVERCHARGE_POWERUP_SPRITE = [
    [0,0,0,0,0,2,2,0,0,0,0],
    [0,0,0,0,2,2,1,0,0,0,0],
    [0,0,0,2,2,1,1,0,0,0,0],
    [0,0,2,2,1,0,0,0,0,0,0],
    [0,2,2,1,1,1,2,2,0,0,0],
    [0,2,1,1,1,2,2,1,0,0,0],
    [0,0,0,0,2,2,1,1,2,0,0],
    [0,0,0,0,0,2,1,1,1,2,0],
    [0,0,0,0,0,0,2,1,1,2,0],
    [0,0,0,0,0,0,0,2,2,2,0],
    [0,0,0,0,0,0,0,0,2,0,0]
];

const DRONE_POWERUP_SPRITE = [
    [0,0,1,0,0,0,0,0,1,0,0],
    [0,1,2,1,0,0,0,1,2,1,0],
    [1,2,2,2,1,0,1,2,2,2,1],
    [0,1,2,1,1,1,1,1,2,1,0],
    [0,0,1,2,2,1,2,2,1,0,0],
    [0,0,1,2,1,3,1,2,1,0,0],
    [0,0,1,2,2,1,2,2,1,0,0],
    [0,1,2,1,1,1,1,1,2,1,0],
    [1,2,2,2,1,0,1,2,2,2,1],
    [0,1,2,1,0,0,0,1,2,1,0],
    [0,0,1,0,0,0,0,0,1,0,0]
];

const SUPPORT_DRONE_SPRITE = [
    [0,0,1,1,0,0],
    [0,1,2,2,1,0],
    [1,2,3,3,2,1],
    [0,1,2,2,1,0],
    [0,0,1,1,0,0]
];

const PERMAWEAPON_POWERUP_SPRITE = [
    [0,0,1,1,0,0,0,1,1,0,0],
    [0,0,1,1,0,0,0,1,1,0,0],
    [0,0,1,2,1,0,1,2,1,0,0],
    [0,0,1,2,1,1,1,2,1,0,0],
    [0,1,1,2,2,2,2,2,1,1,0],
    [1,2,2,2,2,3,2,2,2,2,1],
    [1,2,1,2,2,2,2,2,1,2,1],
    [0,1,0,1,1,2,1,1,0,1,0],
    [0,0,0,0,1,2,1,0,0,0,0],
    [0,0,0,0,1,2,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0]
];

const FRAGMENT_SYMBOLS = ['{}', '</>', ';', '[]', '()', '=>', '++', '01', '&&', '||'];

// Reward collectible pixel art sprites (distinct from all enemy sprites)
const GEM_SPRITE = [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,2,2,1,0,0,0],
    [0,0,1,2,3,3,2,1,0,0],
    [0,1,2,3,3,3,3,2,1,0],
    [1,2,3,3,2,2,3,3,2,1],
    [1,2,3,2,2,2,2,3,2,1],
    [0,1,2,3,2,2,3,2,1,0],
    [0,0,1,2,3,3,2,1,0,0],
    [0,0,0,1,2,2,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0]
];

const STAR_SPRITE = [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,2,2,1,0,0,0],
    [0,0,0,1,2,2,1,0,0,0],
    [1,1,1,2,3,3,2,1,1,1],
    [1,2,2,3,3,3,3,2,2,1],
    [0,1,2,3,3,3,3,2,1,0],
    [0,0,1,2,3,3,2,1,0,0],
    [0,1,2,3,2,2,3,2,1,0],
    [1,2,3,2,0,0,2,3,2,1],
    [1,1,1,0,0,0,0,1,1,1]
];

const COIN_SPRITE = [
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,2,2,2,2,2,2,1,0],
    [1,2,2,3,3,3,3,2,2,1],
    [1,2,3,2,3,3,2,3,2,1],
    [1,2,3,3,2,2,3,3,2,1],
    [1,2,3,3,2,2,3,3,2,1],
    [1,2,3,2,3,3,2,3,2,1],
    [1,2,2,3,3,3,3,2,2,1],
    [0,1,2,2,2,2,2,2,1,0],
    [0,0,1,1,1,1,1,1,0,0]
];

const HEART_SPRITE = [
    [0,0,1,1,0,0,1,1,0,0],
    [0,1,2,2,1,1,2,2,1,0],
    [1,2,3,3,2,2,3,3,2,1],
    [1,2,3,3,3,3,3,3,2,1],
    [1,2,3,3,3,3,3,3,2,1],
    [0,1,2,3,3,3,3,2,1,0],
    [0,0,1,2,3,3,2,1,0,0],
    [0,0,0,1,2,2,1,0,0,0],
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0]
];

// -------------------------------------------------------------
// EVENT HANDLERS
// -------------------------------------------------------------

function handleKeyDown(e) {
    if (!state.isArcadeModeEnabled) return;
    const isMovementKey = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ' '].includes(e.key);
    
    if (gameState === STATE_RUNNING) {
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            e.stopPropagation();
            togglePause();
        } else if (isMovementKey) {
            keys[e.key] = true;
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (gameState === STATE_IDLE && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        startGameFresh();
    } else if (gameState === STATE_GAMEOVER) {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Enter' && getCheckpoint()) {
                startGameFromCheckpoint();
            } else {
                startGameFresh();
            }
        }
    } else if (gameState === STATE_PAUSED && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
    }
}

function handleKeyUp(e) {
    if (!state.isArcadeModeEnabled) return;
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ' '].includes(e.key)) {
        keys[e.key] = false;
        e.preventDefault();
        e.stopPropagation();
    }
}

function handleMouseMove(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
    mouseGlowActive = true;
}

function handleMouseLeave() {
    mouseGlowActive = false;
}

function resetPlayer() {
    player.x = canvas.width / 2;
    player.y = canvas.height * 0.75;
    player.vx = 0;
    player.vy = 0;
    player.energy = player.maxEnergy;
    player.damageFlash = 0;
    player.shootCooldown = 0;
    player.shieldTime = 0;
    player.weaponUpgradeTime = 0;
    player.slowMotionTime = 0;
    player.magnetTime = 0;
    player.overchargeTime = 0;
    player.controlScrambleTime = 0;
    player.drones = [];
    player.permaWeaponType = null;
}

function getDroneRect(idx) {
    let xOffset = 0;
    let yOffset = -35;
    if (idx === 1) { xOffset = -22; yOffset = -28; }
    else if (idx === 2) { xOffset = 22; yOffset = -28; }
    return { x: player.x + xOffset, y: player.y + yOffset, width: 22, height: 20 };
}

function handleDroneHit(drone, idx, droneRect, hitSound, particleCount, shakePower, shakeTime, x, y, color) {
    playSound(hitSound);
    createParticleBurst(x, y, color, particleCount);
    shakeScreen(shakePower, shakeTime);

    drone.health--;
    if (drone.health <= 0) {
        player.drones.splice(idx, 1);
        playSound('gameover');
        particles.push({
            type: 'text',
            x: droneRect.x,
            y: droneRect.y,
            text: '-DRONE DESTROYED-',
            color: '#ff5555',
            vx: 0,
            vy: -0.85,
            alpha: 1.0,
            decay: 0.015
        });
    } else {
        particles.push({
            type: 'text',
            x: droneRect.x,
            y: droneRect.y - 12,
            text: `DRONE SHIELD: ${drone.health}`,
            color: '#50fa7b',
            vx: 0,
            vy: -0.85,
            alpha: 1.0,
            decay: 0.02
        });
    }
}

// -------------------------------------------------------------
// SOUND AND MUSIC SYSTEM (Web Audio API)
// -------------------------------------------------------------

function initAudio() {
    if (audioCtx) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        audioUnlocked = true;
    } catch (err) {
        console.error("Web Audio API not supported:", err);
    }
}

function playSound(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'collect') {
            // Retro synth arpeggio (C5 -> E5 -> G5)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.07); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.14); // G5
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.start(now);
            osc.stop(now + 0.28);
        } else if (type === 'hit') {
            // Detune hit synth sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.linearRampToValueAtTime(30, now + 0.12);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'laser') {
            // Quick laser sweep
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'drone_fire') {
            // Enemy drone laser chirp
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.linearRampToValueAtTime(120, now + 0.1);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'explosion') {
            // Heavy retro explosion (sawtooth sweep + low rumble)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(15, now + 0.32);
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            osc.start(now);
            osc.stop(now + 0.32);
            
            const rumble = audioCtx.createOscillator();
            const rumbleGain = audioCtx.createGain();
            rumble.type = 'sine';
            rumble.frequency.setValueAtTime(90, now);
            rumble.frequency.linearRampToValueAtTime(10, now + 0.38);
            rumble.connect(rumbleGain);
            rumbleGain.connect(audioCtx.destination);
            rumbleGain.gain.setValueAtTime(0.35, now);
            rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            rumble.start(now);
            rumble.stop(now + 0.38);
        } else if (type === 'gameover') {
            // Sad descending chord arpeggio
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.setValueAtTime(165, now + 0.15);
            osc.frequency.setValueAtTime(110, now + 0.3);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.85);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
            osc.start(now);
            osc.stop(now + 0.85);
        } else if (type === 'magnet') {
            // Rising sci-fi magnetic charge sound
            osc.type = 'sine';
            osc.frequency.setValueAtTime(261.63, now);
            osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.35);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
            
            const vibrato = audioCtx.createOscillator();
            const vibratoGain = audioCtx.createGain();
            vibrato.type = 'triangle';
            vibrato.frequency.setValueAtTime(90, now);
            vibrato.frequency.linearRampToValueAtTime(280, now + 0.35);
            vibrato.connect(vibratoGain);
            vibratoGain.connect(audioCtx.destination);
            vibratoGain.gain.setValueAtTime(0.08, now);
            vibratoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            vibrato.start(now);
            vibrato.stop(now + 0.35);
        } else if (type === 'overcharge') {
            // High-power electric overcharge audio surge
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.45);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
            
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(153, now);
            osc2.frequency.exponentialRampToValueAtTime(908, now + 0.45);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            gain2.gain.setValueAtTime(0.12, now);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc2.start(now);
            osc2.stop(now + 0.45);
        }
    } catch (e) {
        console.warn("Sound play failed", e);
    }
}

// Synthwave procedural baseline & melody sequencer (disabled in favor of streaming player)
function startProceduralMusic() {
    return;
}

function stopProceduralMusic() {
    if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
}

function toggleMusic() {
    import('./music-manager.js').then(m => m.togglePlay());
}

// -------------------------------------------------------------
// DRAW HELPERS
// -------------------------------------------------------------

function drawPixelSprite(sprite, sx, sy, pixelSize, color, glowColor) {
    ctx.save();
    if (glowColor) {
        ctx.shadowBlur = 4;
        ctx.shadowColor = glowColor;
    }
    ctx.fillStyle = color;

    const rows = sprite.length;
    const cols = sprite[0].length;
    const offsetX = - (cols * pixelSize) / 2;
    const offsetY = - (rows * pixelSize) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (sprite[r][c] > 0) {
                ctx.fillRect(
                    sx + offsetX + c * pixelSize,
                    sy + offsetY + r * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }
        }
    }
    ctx.restore();
}

function drawMultiPixelSprite(sprite, sx, sy, pixelSize, colorMap, glowColor) {
    ctx.save();
    if (glowColor) {
        ctx.shadowBlur = 4;
        ctx.shadowColor = glowColor;
    }
    const rows = sprite.length;
    const cols = sprite[0].length;
    const offsetX = - (cols * pixelSize) / 2;
    const offsetY = - (rows * pixelSize) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = sprite[r][c];
            if (val > 0 && colorMap[val]) {
                ctx.fillStyle = colorMap[val];
                ctx.fillRect(
                    sx + offsetX + c * pixelSize,
                    sy + offsetY + r * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }
        }
    }
    ctx.restore();
}

function renderToOffscreenCanvas(sprite, width, height, pixelSize, colorMap, color, glowColor) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d');
    
    offCtx.save();
    if (glowColor) {
        offCtx.shadowBlur = 4;
        offCtx.shadowColor = glowColor;
    }
    
    const rows = sprite.length;
    const cols = sprite[0].length;
    const centerX = width / 2;
    const centerY = height / 2;
    const offsetX = - (cols * pixelSize) / 2;
    const offsetY = - (rows * pixelSize) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = sprite[r][c];
            if (val > 0) {
                if (colorMap && colorMap[val]) {
                    offCtx.fillStyle = colorMap[val];
                } else {
                    offCtx.fillStyle = color;
                }
                offCtx.fillRect(
                    centerX + offsetX + c * pixelSize,
                    centerY + offsetY + r * pixelSize,
                    pixelSize,
                    pixelSize
                );
            }
        }
    }
    offCtx.restore();
    return offCanvas;
}

function initSpriteCache() {
    if (spriteCache) return;
    spriteCache = {
        playerNormal: renderToOffscreenCanvas(PLAYER_SHIP_SPRITE, 48, 48, 2.0, {
            1: '#ffffff',
            2: '#00f0ff',
            3: '#3b82f6'
        }, null, '#00f0ff'),
        
        playerDamaged: renderToOffscreenCanvas(PLAYER_SHIP_SPRITE, 48, 48, 2.0, {
            1: '#ffffff',
            2: '#ff3366',
            3: '#ff0000'
        }, null, '#ff0033'),
        
        bugFlap1: renderToOffscreenCanvas(BUG_SPRITE, 32, 32, 2.2, null, '#ff5555', 'rgba(255, 85, 85, 0.7)'),
        bugFlap2: renderToOffscreenCanvas(BUG_SPRITE_FLAP, 32, 32, 2.2, null, '#ff5555', 'rgba(255, 85, 85, 0.7)'),
        
        orb: renderToOffscreenCanvas(VIRUS_SPRITE, 32, 32, 2.4, {
            1: '#ffffff',
            2: '#50fa7b'
        }, '#50fa7b', 'rgba(80, 250, 123, 0.7)'),
        
        swarm: renderToOffscreenCanvas(SWARM_SPRITE, 24, 24, 2.0, {
            1: '#ffffff',
            2: '#ffb86c'
        }, '#ffb86c', 'rgba(255, 184, 108, 0.7)'),
        
        drone: renderToOffscreenCanvas(DRONE_SPRITE, 36, 36, 2.6, {
            1: '#ffffff',
            2: '#8be9fd',
            3: '#bd93f9'
        }, '#8be9fd', 'rgba(139, 233, 253, 0.7)'),
        
        supportDrone: renderToOffscreenCanvas(SUPPORT_DRONE_SPRITE, 24, 24, 2.0, {
            1: '#ffffff',
            2: '#50fa7b',
            3: '#ffb86c'
        }, '#50fa7b', 'rgba(80, 250, 123, 0.7)'),
        
        phantom: renderToOffscreenCanvas(PHANTOM_SPRITE, 32, 32, 2.4, {
            1: '#ffffff',
            2: '#ff79c6'
        }, '#ff79c6', 'rgba(255, 121, 198, 0.7)'),

        guardian: renderToOffscreenCanvas(GUARDIAN_SPRITE, 36, 36, 2.4, {
            1: '#ffffff',
            2: '#f1fa8c',
            3: '#ffb86c'
        }, '#f1fa8c', 'rgba(241, 250, 140, 0.7)'),

        bomber: renderToOffscreenCanvas(BOMBER_SPRITE, 32, 32, 2.4, {
            1: '#ffffff',
            2: '#ff5555',
            3: '#ffb86c'
        }, '#ff5555', 'rgba(255, 85, 85, 0.7)'),

        mine: renderToOffscreenCanvas(MINE_SPRITE, 16, 16, 2.0, {
            1: '#ff5555',
            2: '#ffb86c',
            3: '#ffffff'
        }, '#ff5555', 'rgba(255, 85, 85, 0.7)'),

        sniper: renderToOffscreenCanvas(SNIPER_SPRITE, 32, 32, 2.4, {
            1: '#ffffff',
            2: '#50fa7b',
            3: '#8be9fd'
        }, '#50fa7b', 'rgba(80, 250, 123, 0.7)'),

        carrier: renderToOffscreenCanvas(CARRIER_SPRITE, 56, 40, 2.4, {
            1: '#ffffff',
            2: '#bd93f9',
            3: '#ff79c6'
        }, '#bd93f9', 'rgba(189, 147, 249, 0.7)'),

        // Reward collectible sprites (gold/green palette — never used by enemies)
        gem: renderToOffscreenCanvas(GEM_SPRITE, 28, 28, 2.0, {
            1: '#ffffff',
            2: '#00f0ff',
            3: '#50e6ff'
        }, null, 'rgba(0, 240, 255, 0.8)'),

        star: renderToOffscreenCanvas(STAR_SPRITE, 28, 28, 2.0, {
            1: '#ffffff',
            2: '#ffd700',
            3: '#fff44f'
        }, null, 'rgba(255, 215, 0, 0.8)'),

        coin: renderToOffscreenCanvas(COIN_SPRITE, 28, 28, 2.0, {
            1: '#ffffff',
            2: '#ffd700',
            3: '#50fa7b'
        }, null, 'rgba(255, 215, 0, 0.8)'),

        heart: renderToOffscreenCanvas(HEART_SPRITE, 28, 28, 2.0, {
            1: '#ffffff',
            2: '#ff79c6',
            3: '#ff99d6'
        }, null, 'rgba(255, 121, 198, 0.8)')
    };
}

function drawWireframeCube(cx, cy, size, angleX, angleY) {
    const vertices = [
        {x: -1, y: -1, z: -1}, {x: 1, y: -1, z: -1}, {x: 1, y: 1, z: -1}, {x: -1, y: 1, z: -1},
        {x: -1, y: -1, z: 1},  {x: 1, y: -1, z: 1},  {x: 1, y: 1, z: 1},  {x: -1, y: 1, z: 1}
    ];

    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // Back face
        [4, 5], [5, 6], [6, 7], [7, 4], // Front face
        [0, 4], [1, 5], [2, 6], [3, 7]  // Side connecting lines
    ];

    const projected = vertices.map(v => {
        // Rotate X axis
        let y1 = v.y * Math.cos(angleX) - v.z * Math.sin(angleX);
        let z1 = v.y * Math.sin(angleX) + v.z * Math.cos(angleX);
        // Rotate Y axis
        let x2 = v.x * Math.cos(angleY) + z1 * Math.sin(angleY);
        
        return {
            x: cx + x2 * (size / 2),
            y: cy + y1 * (size / 2)
        };
    });

    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#bd93f9';
    ctx.strokeStyle = '#bd93f9';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    edges.forEach(([u, v]) => {
        ctx.moveTo(projected[u].x, projected[u].y);
        ctx.lineTo(projected[v].x, projected[v].y);
    });
    ctx.stroke();
    ctx.restore();
}

function drawSpaceship(x, y) {
    ctx.save();
    
    // Glitch position shift on damage
    let drawX = x;
    let drawY = y;
    const isDamaged = player.damageFlash > 0;
    if (isDamaged) {
        player.damageFlash--;
        drawX += (Math.random() - 0.5) * 4.5;
        drawY += (Math.random() - 0.5) * 4.5;
    }

    // Renders the pre-rendered color-mapped ship directly from cache
    const img = isDamaged ? spriteCache.playerDamaged : spriteCache.playerNormal;
    ctx.drawImage(img, drawX - img.width / 2, drawY - img.height / 2);

    // Dynamic dual exhaust engine thruster flames
    const isMoving = keys.w || keys.ArrowUp;
    const isOvercharged = player.overchargeTime > 0;
    let flameHeight = isMoving ? 15 + Math.random() * 9 : 5 + Math.random() * 5;
    if (isOvercharged) flameHeight *= 1.8;
    const flameColor = isOvercharged ? '#ff5500' : (isMoving ? '#ff007f' : '#ff79c6');
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = flameColor;
    ctx.fillStyle = flameColor;

    // Line up flames with thruster nozzle positions on the matrix (offsets: -3px, +3px)
    const leftEngineX = drawX - 3;
    const rightEngineX = drawX + 3;
    const engineY = drawY + 13;

    ctx.beginPath();
    ctx.moveTo(leftEngineX - 2, engineY);
    ctx.lineTo(leftEngineX, engineY + flameHeight);
    ctx.lineTo(leftEngineX + 2, engineY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(rightEngineX - 2, engineY);
    ctx.lineTo(rightEngineX, engineY + flameHeight);
    ctx.lineTo(rightEngineX + 2, engineY);
    ctx.closePath();
    ctx.fill();

    // Draw pulsating shield bubble
    if (player.shieldTime > 0) {
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00f0ff';
        ctx.beginPath();
        const pulseRadius = 24 + Math.sin(Date.now() / 110) * 2;
        ctx.arc(drawX, drawY, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(drawX, drawY, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw scrambled controls indicator
    if (player.controlScrambleTime > 0) {
        ctx.save();
        ctx.strokeStyle = '#bd93f9';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#bd93f9';
        ctx.setLineDash([4, 2]);
        
        ctx.beginPath();
        const scrambleRadius = 20 + Math.sin(Date.now() / 50) * 3;
        ctx.arc(drawX, drawY, scrambleRadius, Date.now() / 150, Date.now() / 150 + Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(189, 147, 249, 0.05)';
        ctx.beginPath();
        ctx.arc(drawX, drawY, scrambleRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = "bold 8px 'Geist Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillText('⚠', drawX, drawY - scrambleRadius - 2);
        ctx.restore();
    }
    ctx.restore();
}

function drawHolographicGrid(time, reaction) {
    ctx.save();
    const horizon = canvas.height * 0.42;
    const gridHeight = canvas.height - horizon;
    
    // Grid speed accelerates slightly with bass beats
    const bassFactor = reaction ? reaction.bass : 0;
    const speed = 0.06 + bassFactor * 0.08;
    const offset = (time * speed) % 35;

    // 1. Perspective Horizontal Lines flowing down
    for (let y = 0; y < gridHeight; y += 35) {
        const ly = horizon + ((y + offset) % gridHeight);
        const ratio = (ly - horizon) / gridHeight;
        
        // Pulse opacity and line thickness with bass beats
        const maxOpacity = 0.12 + bassFactor * 0.18; // clear visible pulse
        ctx.strokeStyle = `rgba(0, 240, 255, ${ratio * maxOpacity})`;
        ctx.lineWidth = (1.0 + ratio * 0.8) * (1.0 + bassFactor * 0.5);
        
        ctx.beginPath();
        ctx.moveTo(-20, ly);
        ctx.lineTo(canvas.width + 20, ly);
        ctx.stroke();
    }

    // 2. Converging Perspective Vertical Lines
    const centerX = canvas.width / 2;
    const numLines = 14;
    for (let i = -numLines; i <= numLines; i++) {
        const verticalOpacity = 0.045 + bassFactor * 0.055;
        ctx.strokeStyle = `rgba(0, 240, 255, ${verticalOpacity})`;
        ctx.lineWidth = 1.0 * (1.0 + bassFactor * 0.35);
        ctx.beginPath();
        ctx.moveTo(centerX, horizon);
        const bx = centerX + (i * (canvas.width / 7.5));
        ctx.lineTo(bx, canvas.height + 20);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFragment(frag) {
    ctx.save();

    // Gentle vertical bobbing (unique to collectibles — enemies never bob)
    const bobOffset = Math.sin(Date.now() / 400 + (frag.bobPhase || 0)) * 4;
    const drawY = frag.y + bobOffset;

    // 1. Outer pulsing golden ring (universal collectible indicator)
    const ringRadius = 16 + Math.sin(Date.now() / 300 + (frag.bobPhase || 0)) * 3;
    const ringAlpha = 0.35 + Math.sin(Date.now() / 250) * 0.15;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(frag.x, drawY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 2. Orbiting sparkle dots (2 tiny white/gold dots circling the fragment)
    const sparkleTime = Date.now() / 600 + (frag.bobPhase || 0);
    for (let s = 0; s < 2; s++) {
        const angle = sparkleTime + s * Math.PI;
        const sparkleR = 12 + Math.sin(Date.now() / 350) * 2;
        const sx = frag.x + Math.cos(angle) * sparkleR;
        const sy = drawY + Math.sin(angle) * sparkleR;
        ctx.save();
        ctx.fillStyle = s === 0 ? '#ffd700' : '#ffffff';
        ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200 + s) * 0.3;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 3. Draw the pixel art reward sprite
    ctx.translate(frag.x, drawY);
    ctx.scale(frag.pulseScale, frag.pulseScale);

    let spriteImg = null;
    if (frag.type === 'crystal') spriteImg = spriteCache.gem;
    else if (frag.type === 'shard') spriteImg = spriteCache.star;
    else if (frag.type === 'cube') spriteImg = spriteCache.coin;
    else if (frag.type === 'orb') spriteImg = spriteCache.heart;

    if (spriteImg) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = frag.glow;
        ctx.drawImage(spriteImg, -spriteImg.width / 2, -spriteImg.height / 2);
    }

    ctx.restore();
}

// -------------------------------------------------------------
// GAME INITIALIZATION & RESET
// -------------------------------------------------------------

function populateConsoleRecents() {
    const listContainer = document.getElementById('console-recents-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const recents = state.fileHistory.slice(0, 4);
    if (recents.length === 0) {
        listContainer.innerHTML = '<div class="console-no-recents">No recent files</div>';
        return;
    }

    recents.forEach(path => {
        const item = document.createElement('div');
        item.className = 'console-recent-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'recent-name';
        nameSpan.textContent = getFilename(path);

        const pathSpan = document.createElement('span');
        pathSpan.className = 'recent-path';
        pathSpan.textContent = path;
        pathSpan.title = path;

        item.appendChild(nameSpan);
        item.appendChild(pathSpan);

        item.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { openFileFromHistory } = await import('./file-io.js');
            await openFileFromHistory(path);
        };

        listContainer.appendChild(item);
    });
}

export function initGame() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    initSpriteCache();
    visualizerBars = document.querySelectorAll('.v-bar');

    if (!bgImage) {
        bgImage = new Image();
        bgImage.src = 'game-bg.webp';
    }
    resizeCanvas();

    // Wire up Console action buttons
    const btnNew = document.getElementById('console-btn-new');
    if (btnNew) {
        btnNew.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { createNewTab } = await import('./editor-manager.js');
            await createNewTab();
        };
    }

    const btnOpen = document.getElementById('console-btn-open');
    if (btnOpen) {
        btnOpen.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { openFile } = await import('./file-io.js');
            await openFile();
        };
    }

    const btnUrl = document.getElementById('console-btn-url');
    if (btnUrl) {
        btnUrl.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const modal = document.getElementById('open-url-modal');
            if (modal) {
                modal.style.display = 'flex';
                const input = document.getElementById('open-url-input');
                if (input) input.focus();
            }
        };
    }

    const btnSession = document.getElementById('console-btn-session');
    if (btnSession) {
        btnSession.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { loadExplicitSession } = await import('./session-manager.js');
            await loadExplicitSession();
        };
    }

    const btnPlay = document.getElementById('console-btn-play-game');
    if (btnPlay) {
        btnPlay.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (getCheckpoint()) {
                startGameFromCheckpoint();
            } else {
                startGameFresh();
            }
        };
    }

    if (window.__lightpadHarness) {
        window.__lightpadHarness.game = {
            getState: () => gameState,
            setState: (val) => { gameState = val; },
            getPlayer: () => player,
            getScore: () => score,
            setScore: (val) => { score = val; updateScoreUI(); },
            getBoss: () => getBoss(),
            getBossState: () => getBossState(),
            spawnBoss: (level) => {
                score = getScoreAtLastBossDefeat() + getPointsNeededForBoss(level);
                updateScoreUI();
                checkBossThreshold(score, getGameContext());
            },
            triggerShake: (intensity, duration) => shakeScreen(intensity, duration),
            getBugs: () => bugs,
            getBullets: () => bullets,
            getProjectiles: () => enemyProjectiles,
            killBoss: () => {
                const b = getBoss();
                if (b) {
                    b.health = 0;
                }
            },
            fastForwardTimers: () => fastForwardBossTimers(),
            startGameFresh,
            startGameFromCheckpoint
        };
    }

    // Populate recents
    populateConsoleRecents();

    // Reset controls
    Object.keys(keys).forEach(k => keys[k] = false);

    // Dynamic visibility based on setting
    const crt = document.querySelector('.game-crt-overlay');
    const hudPanels = document.querySelectorAll('.game-hud-panel');
    const arcadeStarter = document.getElementById('console-arcade-starter');
    const tagline = document.getElementById('console-tagline');

    if (!state.isArcadeModeEnabled) {
        // Arcade disabled layout
        if (canvas) canvas.style.display = 'none';
        if (crt) crt.style.display = 'none';
        hudPanels.forEach(p => p.style.display = 'none');
        if (arcadeStarter) arcadeStarter.style.display = 'none';
        if (tagline) tagline.textContent = 'No files open — start coding to begin';

        // Clear any animation frame and stop loop
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        return;
    }

    // Arcade enabled layout
    if (canvas) canvas.style.display = 'block';
    if (crt) crt.style.display = 'block';
    hudPanels.forEach(p => p.style.display = 'block');
    if (arcadeStarter) arcadeStarter.style.display = 'block';
    if (tagline) tagline.textContent = 'No files open — start coding or play while idle';

    // Initial positioning
    resetPlayer();

    // Load stats
    score = 0;
    combo = 1.0;
    highscore = parseInt(localStorage.getItem('lightpad_game_highscore') || '0', 10);
    updateScoreUI();

    gameState = STATE_IDLE;
    showScreen(STATE_IDLE);
    initBossSystem();

    // Reset game entities
    bugs = [];
    fragments = [];
    particles = [];
    bullets = [];
    enemyProjectiles = [];
    powerups = [];
    generateStars();
    generateBgSymbols();

    // Setup visualizer panel
    const musicPanel = document.getElementById('game-music-panel');
    if (musicPanel && !musicPanel.dataset.listenerAdded) {
        musicPanel.addEventListener('click', toggleMusic);
        musicPanel.dataset.listenerAdded = 'true';
    }

    // Set muted class based on current state
    const musicIcon = document.getElementById('game-music-icon');
    if (musicIcon) {
        if (musicEnabled) musicIcon.classList.remove('muted');
        else musicIcon.classList.add('muted');
    }

    // Wire global input listeners
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    window.removeEventListener('resize', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);

    // Start render loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
}

export function stopGame() {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
    }
    window.removeEventListener('resize', resizeCanvas);

    stopProceduralMusic();

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Clear entities and free memory
    bugs = [];
    fragments = [];
    particles = [];
    bullets = [];
    enemyProjectiles = [];
    powerups = [];
    stars = [];
    bgSymbols = [];
}

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    if (player.x > canvas.width) player.x = canvas.width / 2;
    if (player.y > canvas.height) player.y = canvas.height * 0.75;
}

function generateStars() {
    stars = [];
    const count = Math.min(100, Math.floor((canvas.width * canvas.height) / 4500));
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.6 + 0.4,
            speed: Math.random() * 0.75 + 0.1,
            alpha: Math.random() * 0.7 + 0.3
        });
    }
}

function generateBgSymbols() {
    bgSymbols = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
        bgSymbols.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            char: FRAGMENT_SYMBOLS[Math.floor(Math.random() * FRAGMENT_SYMBOLS.length)],
            size: Math.random() * 10 + 9,
            speed: Math.random() * 0.35 + 0.15,
            alpha: Math.random() * 0.12 + 0.03,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.015
        });
    }
}

function updateScoreUI() {
    const scoreVal = document.getElementById('game-score');
    const hsVal = document.getElementById('game-highscore');
    const comboVal = document.getElementById('game-combo');

    if (scoreVal) scoreVal.textContent = String(score).padStart(6, '0');
    if (hsVal) hsVal.textContent = String(highscore).padStart(6, '0');
    if (comboVal) comboVal.textContent = `x${combo.toFixed(1)}`;

    const segments = document.querySelectorAll('.energy-segment');
    const activeCount = Math.ceil((player.energy / player.maxEnergy) * segments.length);
    segments.forEach((seg, idx) => {
        if (idx < activeCount) seg.classList.add('active');
        else seg.classList.remove('active');
    });

    const bossLabel = document.getElementById('hud-boss-progress-label');
    const bossVal = document.getElementById('hud-boss-progress-value');
    const bossBar = document.getElementById('hud-boss-progress-bar');
    if (bossLabel && bossVal) {
        const progress = getBossProgress(score, player, combo, closeCalls);
        let color = '#00d2ff';
        let shadow = 'rgba(0, 210, 255, 0.3)';
        let label = 'BOSS SIGNAL';
        let value = `${progress.percent}%`;

        if (progress.bossState === 'ACTIVE') {
            label = 'BOSS ENGAGED';
            value = 'ACTIVE';
            color = '#ff5555';
            shadow = 'rgba(255, 85, 85, 0.6)';
        } else if (progress.bossState === 'WARNING') {
            label = 'BOSS DETECTED';
            value = 'WARNING';
            color = '#ffb86c';
            shadow = 'rgba(255, 184, 108, 0.6)';
        } else if (progress.bossState === 'RECOVERY') {
            label = 'BOSS SIGNAL';
            value = 'RECOVERY';
            color = '#8be9fd';
            shadow = 'rgba(139, 233, 253, 0.6)';
        } else if (progress.bossState === 'ENTERING') {
            label = 'BOSS SIGNAL';
            value = 'ENTERING';
            color = '#f1fa8c';
            shadow = 'rgba(241, 250, 140, 0.6)';
        } else if (progress.bossState === 'DEFEATED') {
            label = 'BOSS SIGNAL';
            value = 'CLEARED';
            color = '#ffd700';
            shadow = 'rgba(255, 215, 0, 0.6)';
        }

        bossLabel.textContent = label;
        bossVal.textContent = value;
        bossVal.style.color = color;
        bossVal.style.textShadow = `0 0 4px ${shadow}`;

        if (bossBar) {
            bossBar.style.width = `${progress.percent}%`;
            bossBar.style.backgroundColor = color;
            bossBar.style.boxShadow = `0 0 6px ${shadow}`;
        }
    }
}

function renderGameOverScreen(checkpoint) {
    const finalScoreVal = document.getElementById('game-final-score');
    if (finalScoreVal) finalScoreVal.textContent = String(score).padStart(6, '0');

    const instructions = document.getElementById('game-over-instructions');
    const cpInfo = document.getElementById('game-checkpoint-info');

    if (!checkpoint) {
        if (instructions) {
            instructions.textContent = 'PRESS ENTER TO REBOOT';
        }
        if (cpInfo) {
            cpInfo.style.display = 'none';
        }
        return;
    }

    if (instructions) {
        instructions.innerHTML = `PRESS <span style="color:#00f0ff">ENTER</span> TO REBOOT FROM CHECKPOINT<br>PRESS <span style="color:#ff5555">ESC</span> TO REBOOT SYSTEM (NEW GAME)`;
    }
    if (cpInfo) {
        cpInfo.style.display = 'block';
        const cpLevel = document.getElementById('game-checkpoint-level');
        const cpScore = document.getElementById('game-checkpoint-score');
        if (cpLevel) cpLevel.textContent = String(checkpoint.bossLevel);
        if (cpScore) cpScore.textContent = String(checkpoint.score).padStart(6, '0');
    }
}

function showScreen(state) {
    const overlay = document.getElementById('game-screen-overlay');
    const idleScreen = document.getElementById('game-screen-idle');
    const pauseScreen = document.getElementById('game-screen-paused');
    const overScreen = document.getElementById('game-screen-over');

    if (!overlay) return;

    overlay.style.display = (state === STATE_RUNNING) ? 'none' : 'flex';
    idleScreen.style.display = (state === STATE_IDLE) ? 'block' : 'none';
    pauseScreen.style.display = (state === STATE_PAUSED) ? 'block' : 'none';
    overScreen.style.display = (state === STATE_GAMEOVER) ? 'block' : 'none';

    if (state === STATE_GAMEOVER) {
        renderGameOverScreen(getCheckpoint());
    }
}

function getGameContext() {
    return {
        bugs,
        enemyProjectiles,
        player,
        canvas,
        ctx,
        get score() { return score; },
        set score(val) { score = val; },
        get combo() { return combo; },
        get closeCalls() { return closeCalls; },
        createParticleBurst,
        shakeScreen,
        triggerScreenGlitch,
        isColliding,
        spawnEnergyFragment,
        updateScoreUI
    };
}

function startGameFromCheckpoint() {
    const cp = getCheckpoint();
    if (cp) {
        initBossSystemFromCheckpoint(cp.bossLevel, cp.score);
        startGame();
        score = cp.score;
        applyCheckpointToPlayer(player, cp.bossLevel);
        updateScoreUI();
    } else {
        startGameFresh();
    }
}

function startGameFresh() {
    clearCheckpoints();
    initBossSystem();
    startGame();
}

function startGame() {
    gameState = STATE_RUNNING;
    showScreen(STATE_RUNNING);

    resetPlayer();

    score = 0;
    combo = 1.0;
    timeElapsed = 0;
    gameStartTime = Date.now();
    lastSpawnTime = Date.now();
    lastFragmentSpawnTime = Date.now();
    lastPowerUpSpawnTime = Date.now();
    lastPhysicsTime = performance.now();

    bugs = [];
    fragments = [];
    particles = [];
    bullets = [];
    enemyProjectiles = [];
    sniperBeams = [];

    // Reset Director variables
    closeCalls = 0;
    lastDamageTime = 0;
    directorIntensity = 1.0;
    threatLevel = 'COLD';
    flowState = 'ZEN';

    updateScoreUI();
    
    // Auto-play streaming music player when game starts
    import('./music-manager.js').then(m => {
        if (!m.isPlaying) {
            m.togglePlay();
        }
    });
}

function togglePause() {
    if (gameState === STATE_RUNNING) {
        gameState = STATE_PAUSED;
        showScreen(STATE_PAUSED);
        stopProceduralMusic();
    } else if (gameState === STATE_PAUSED) {
        gameState = STATE_RUNNING;
        showScreen(STATE_RUNNING);
        lastPhysicsTime = performance.now();
        if (musicEnabled) startProceduralMusic();
    }
}

function gameOver() {
    gameState = STATE_GAMEOVER;
    showScreen(STATE_GAMEOVER);
    playSound('gameover');
    stopProceduralMusic();

    if (score > highscore) {
        highscore = score;
        localStorage.setItem('lightpad_game_highscore', String(highscore));
    }
    updateScoreUI();

    // Gameover visual spark explosions
    createParticleBurst(player.x, player.y, '#ff0055', 30);
    createParticleBurst(player.x, player.y, '#00f0ff', 25);
    createParticleBurst(player.x, player.y, '#ffffff', 15);
    shakeScreen(15, 600);
    triggerScreenGlitch();
}

// -------------------------------------------------------------
// PHYSICS & COLLISION ENGINE & PARTICLE ENGINE
// -------------------------------------------------------------

function spawnParticle(type, x, y, color, extra = {}) {
    if (particles.length >= 200) return;
    if (type === 'spark') {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3.8 + 1.2;
        particles.push({
            type: 'spark',
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 2.5 + 0.8,
            color,
            alpha: 1.0,
            decay: Math.random() * 0.045 + 0.02
        });
    } else if (type === 'smoke') {
        particles.push({
            type: 'smoke',
            x,
            y,
            vx: (Math.random() - 0.5) * 0.6,
            vy: -Math.random() * 0.8 - 0.3,
            size: Math.random() * 3 + 2,
            maxSize: Math.random() * 10 + 6,
            color,
            alpha: 0.5,
            decay: Math.random() * 0.016 + 0.007
        });
    } else if (type === 'trail') {
        particles.push({
            type: 'trail',
            x,
            y,
            vx: (Math.random() - 0.5) * 0.4,
            vy: extra.vy || 0.5,
            size: Math.random() * 1.8 + 0.8,
            color,
            alpha: 0.75,
            decay: Math.random() * 0.07 + 0.04
        });
    }
}

function createParticleBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
        spawnParticle('spark', x, y, color);
    }
    const smokeCount = Math.floor(count / 4);
    for (let i = 0; i < smokeCount; i++) {
        spawnParticle('smoke', x, y, color);
    }
}

function shakeScreen(intensity, duration) {
    shakeIntensity = intensity;
    shakeTime = duration;
}

function triggerScreenGlitch() {
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
        canvas.classList.remove('screen-glitch-active');
        void canvas.offsetWidth; // Force Reflow
        canvas.classList.add('screen-glitch-active');
        setTimeout(() => {
            canvas.classList.remove('screen-glitch-active');
        }, 360);
    }
}

function triggerCloseCall(x, y) {
    closeCalls++;
    const bonus = Math.round(50 * combo);
    score += bonus;
    updateScoreUI();
    
    // Spawn floating text particle
    particles.push({
        type: 'text',
        x: player.x,
        y: player.y - 20,
        text: `CLOSE CALL! +${bonus}`,
        color: '#00f0ff',
        vx: (Math.random() - 0.5) * 0.5,
        vy: -1.5,
        alpha: 1.0,
        decay: 0.025
    });
    
    playSound('collect');
}

function isColliding(rect1, rect2) {
    return rect1.x - rect1.width/2 < rect2.x + rect2.width/2 &&
           rect1.x + rect1.width/2 > rect2.x - rect2.width/2 &&
           rect1.y - rect1.height/2 < rect2.y + rect2.height/2 &&
           rect1.y + rect1.height/2 > rect2.y - rect2.height/2;
}

function spawnEnergyFragment(x, y) {
    if (fragments.length >= 20) return;
    const types = ['crystal', 'shard', 'cube', 'orb'];
    const type = types[Math.floor(Math.random() * types.length)];

    // Gold/green/cyan reward palette — clearly distinct from red/orange enemy palette
    let color = '#00f0ff';
    let glow = 'rgba(0, 240, 255, 0.6)';
    
    if (type === 'shard') {
        color = '#ffd700'; // gold star
        glow = 'rgba(255, 215, 0, 0.6)';
    } else if (type === 'cube') {
        color = '#ffd700'; // gold coin
        glow = 'rgba(255, 215, 0, 0.6)';
    } else if (type === 'orb') {
        color = '#ff79c6'; // pink heart
        glow = 'rgba(255, 121, 198, 0.6)';
    }
    
    fragments.push({
        type,
        x,
        y,
        width: 18,
        height: 18,
        vy: Math.random() * 0.8 + 1.6,
        vx: (Math.random() - 0.5) * 0.7,
        color,
        glow,
        rot: Math.random() * Math.PI,
        rotSpeed: Math.random() * 0.04 + 0.015,
        pulseScale: 1.0,
        pulseSpeed: Math.random() * 0.05 + 0.035,
        bobPhase: Math.random() * Math.PI * 2
    });
}

function spawnPowerUp(x, y, type = null) {
    if (powerups.length >= 5) return;
    const types = ['SHIELD', 'WEAPONS', 'EMP', 'SLOWMO', 'MAGNET', 'OVERCHARGE', 'DRONE', 'PERMAWEAPON'];
    const pType = type || types[Math.floor(Math.random() * types.length)];
    
    let color = '#00f0ff';
    let label = 'S';
    let glow = 'rgba(0, 240, 255, 0.6)';
    let subType = null;

    if (pType === 'WEAPONS') {
        color = '#ff00ff';
        label = 'W';
        glow = 'rgba(255, 0, 255, 0.6)';
    } else if (pType === 'EMP') {
        color = '#ffb86c';
        label = 'B';
        glow = 'rgba(255, 184, 108, 0.6)';
    } else if (pType === 'SLOWMO') {
        color = '#bd93f9';
        label = 'T';
        glow = 'rgba(189, 147, 249, 0.6)';
    } else if (pType === 'MAGNET') {
        color = '#ffea00';
        label = 'M';
        glow = 'rgba(255, 234, 0, 0.6)';
    } else if (pType === 'OVERCHARGE') {
        color = '#ff5555';
        label = 'O';
        glow = 'rgba(255, 85, 85, 0.6)';
    } else if (pType === 'DRONE') {
        color = '#50fa7b';
        label = 'D';
        glow = 'rgba(80, 250, 123, 0.6)';
    } else if (pType === 'PERMAWEAPON') {
        const weapons = ['CANNONS', 'PLASMA', 'SPREAD', 'MISSILE', 'BEAM'];
        const available = weapons.filter(w => w !== player.permaWeaponType);
        subType = available[Math.floor(Math.random() * available.length)];
        
        if (subType === 'CANNONS') {
            color = '#ff00aa';
            label = 'C';
            glow = 'rgba(255, 0, 170, 0.6)';
        } else if (subType === 'PLASMA') {
            color = '#50fa7b';
            label = 'P';
            glow = 'rgba(80, 250, 123, 0.6)';
        } else if (subType === 'SPREAD') {
            color = '#ffea00';
            label = 'Y';
            glow = 'rgba(255, 234, 0, 0.6)';
        } else if (subType === 'MISSILE') {
            color = '#8be9fd';
            label = 'R';
            glow = 'rgba(139, 233, 253, 0.6)';
        } else if (subType === 'BEAM') {
            color = '#ffffff';
            label = 'L';
            glow = 'rgba(255, 255, 255, 0.6)';
        }
    }

    powerups.push({
        type: pType,
        subType,
        x,
        y,
        width: 20,
        height: 20,
        vy: Math.random() * 0.4 + 1.3,
        vx: (Math.random() - 0.5) * 0.5,
        color,
        glow,
        label,
        rot: Math.random() * Math.PI,
        rotSpeed: Math.random() * 0.03 + 0.01,
        pulseScale: 1.0,
        pulseSpeed: Math.random() * 0.04 + 0.02
    });
}

function applyPowerUp(pup) {
    const type = pup.type;
    const subType = pup.subType;
    let textLabel = '';
    let textColor = '#ffffff';

    if (type === 'SHIELD') {
        player.shieldTime = 480; // 8 seconds
        textLabel = '+SHIELD ACTIVE+';
        textColor = '#00f0ff';
        playSound('collect');
    } else if (type === 'WEAPONS') {
        player.weaponUpgradeTime = 480; // 8 seconds
        textLabel = '+HYPER BLASTER+';
        textColor = '#ff00ff';
        playSound('collect');
    } else if (type === 'SLOWMO') {
        player.slowMotionTime = 360; // 6 seconds
        textLabel = '+TIME WARP ACTIVE+';
        textColor = '#bd93f9';
        playSound('collect');
    } else if (type === 'EMP') {
        textLabel = '💥 EMP SHOCKWAVE 💥';
        textColor = '#ffb86c';
        triggerEMPEffect();
    } else if (type === 'MAGNET') {
        player.magnetTime = 480; // 8 seconds
        textLabel = '+MEGA MAGNET+';
        textColor = '#ffea00';
        playSound('magnet');
    } else if (type === 'OVERCHARGE') {
        player.overchargeTime = 360; // 6 seconds
        textLabel = '+SYSTEM OVERCHARGE+';
        textColor = '#ff5555';
        playSound('overcharge');
    } else if (type === 'DRONE') {
        if (player.drones.length < 3) {
            player.drones.push({ health: 3 });
            textLabel = '+SUPPORT DRONE RECRUITED+';
        } else {
            player.drones.forEach(d => d.health = 3);
            textLabel = '+DRONES RECHARGED+';
        }
        textColor = '#50fa7b';
        playSound('collect');
    } else if (type === 'PERMAWEAPON') {
        player.permaWeaponType = subType;
        if (subType === 'CANNONS') {
            textLabel = '+WING CANNONS ATTACHED+';
            textColor = '#ff00aa';
        } else if (subType === 'PLASMA') {
            textLabel = '+PLASMA ORBS ATTACHED+';
            textColor = '#50fa7b';
        } else if (subType === 'SPREAD') {
            textLabel = '+SPREAD SHOT ATTACHED+';
            textColor = '#ffea00';
        } else if (subType === 'MISSILE') {
            textLabel = '+HOMING MISSILES ATTACHED+';
            textColor = '#8be9fd';
        } else if (subType === 'BEAM') {
            textLabel = '+RAIL BEAM ATTACHED+';
            textColor = '#ffffff';
        }
        playSound('overcharge');
    }

    // Spawn text popup particle floating up from the ship
    particles.push({
        type: 'text',
        x: player.x,
        y: player.y - 25,
        text: textLabel,
        color: textColor,
        vx: 0,
        vy: -0.85,
        alpha: 1.0,
        decay: 0.015
    });
}

function triggerEMPEffect() {
    playSound('explosion');
    shakeScreen(12, 450);
    triggerScreenGlitch();

    // Spawn a shockwave particle ring
    particles.push({
        type: 'shockwave',
        x: player.x,
        y: player.y,
        size: 15,
        maxSize: Math.max(canvas ? canvas.width : 1000, canvas ? canvas.height : 1000) * 0.95,
        color: '#ffb86c',
        alpha: 1.0,
        decay: 0.02
    });

    // Clear 50% of onscreen enemies
    if (bugs.length > 0) {
        const countToKill = Math.ceil(bugs.length * 0.5);
        for (let k = 0; k < countToKill; k++) {
            if (bugs.length === 0) break;
            const targetIdx = Math.floor(Math.random() * bugs.length);
            const bug = bugs[targetIdx];

            createParticleBurst(bug.x, bug.y, bug.color, 15);
            const points = Math.round(bug.scoreValue * combo);
            score += points;

            bugs.splice(targetIdx, 1);
        }
        updateScoreUI();
    }
}

// -------------------------------------------------------------
// GAME LOOP
// -------------------------------------------------------------

function gameLoop() {
    if (!canvas || !ctx) return;
    if (!state.isArcadeModeEnabled) return;

    // Clear the canvas to prevent smearing at the boundaries
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    animationFrameId = requestAnimationFrame(gameLoop);

    const reaction = getMusicReactionData();

    const now = performance.now();
    let dt = (now - lastPhysicsTime) / 16.67;
    if (dt > 4.0) dt = 4.0;
    if (dt < 0.1) dt = 0.1;
    lastPhysicsTime = now;

    // Apply Screen Shake Camera transform
    ctx.save();
    if (shakeTime > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeTime -= 16.67 * dt;
    }

    // Draw deep-space radial gradient background (underlay fallback)
    const activeBoss = getBoss();
    const bgGrad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width
    );
    if (activeBoss) {
        bgGrad.addColorStop(0, '#2b1405'); // deep dark orange/amber center
        bgGrad.addColorStop(1, '#080402'); // extremely dark brown edge
    } else {
        bgGrad.addColorStop(0, '#0a0d16');
        bgGrad.addColorStop(1, '#050508');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

    // Draw WebP background cover image defensively
    if (bgImage && bgImage.complete && bgImage.naturalWidth !== 0) {
        try {
            ctx.save();
            const imgRatio = bgImage.width / bgImage.height;
            const canvasRatio = canvas.width / canvas.height;
            let sWidth = bgImage.width;
            let sHeight = bgImage.height;
            let sx = 0;
            let sy = 0;

            if (canvasRatio > imgRatio) {
                sHeight = bgImage.width / canvasRatio;
                sy = (bgImage.height - sHeight) / 2;
            } else {
                sWidth = bgImage.height * canvasRatio;
                sx = (bgImage.width - sWidth) / 2;
            }
            ctx.drawImage(bgImage, sx, sy, sWidth, sHeight, -20, -20, canvas.width + 40, canvas.height + 40);
            
            // Draw a semi-transparent dark overlay to reduce visual dominance/brightness
            ctx.save();
            ctx.fillStyle = activeBoss ? 'rgba(15, 10, 5, 0.45)' : 'rgba(5, 5, 8, 0.45)';
            ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
            ctx.restore();
            
            // Draw warm orange tint if boss is active
            if (activeBoss) {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 100, 0, 0.12)'; // warm amber overlay
                ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
                ctx.restore();
            }
            
            // Draw a subtle music-reactive color overlay (tints the background to the beat)
            if (reaction && (reaction.isPlaying || reaction.volume > 0.01)) {
                ctx.save();
                if (activeBoss) {
                    ctx.fillStyle = `rgba(255, 120, 0, ${reaction.bass * 0.08})`; // reactive orange/amber tint
                } else {
                    ctx.fillStyle = `rgba(255, 0, 127, ${reaction.bass * 0.065})`; // soft neon pink tint (max 6.5% opacity)
                }
                ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
                ctx.restore();
            }
            
            ctx.restore();
        } catch (err) {
            console.error("Failed to draw background image:", err);
        }
    }


    // Render nebula fog
    ctx.save();
    const timeSeed = Date.now() / 8000;
    const nebX = canvas.width / 2 + Math.cos(timeSeed) * (canvas.width * 0.15);
    const nebY = canvas.height * 0.4 + Math.sin(timeSeed * 0.8) * (canvas.height * 0.1);
    
    // Scale nebula size and intensity with bass hits
    const nebulaRadius = 280 + reaction.bass * 120;
    const nebGrad = ctx.createRadialGradient(nebX, nebY, 10, nebX, nebY, nebulaRadius);
    
    const baseOpacity = 0.045 + reaction.bass * 0.055; // up to 0.10 (clearly visible but dim)
    const midOpacity = 0.03 + reaction.mid * 0.04;
    
    // Smooth color morphing on bass hits: shifts from neon blue to neon pink/magenta (or orange if boss active)
    let r, g, b;
    if (activeBoss) {
        r = 255;
        g = Math.round(90 + reaction.bass * 60); // 90 -> 150 (amber/orange range)
        b = 0;
    } else {
        r = Math.round(59 + reaction.bass * 196);   // 59 -> 255
        g = Math.round(130 - reaction.bass * 130);  // 130 -> 0
        b = Math.round(246 - reaction.bass * 119);  // 246 -> 127
    }
    
    nebGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseOpacity})`);
    nebGrad.addColorStop(0.5, `rgba(189, 147, 249, ${midOpacity})`);
    nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebGrad;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    ctx.restore();

    // Render stars with parallax (drift slightly faster on bass beats)
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.save();
        ctx.globalAlpha = star.alpha;
        if (gameState === STATE_RUNNING) {
            const driftSpeed = star.speed * (1.0 + (combo - 1) * 0.22) * (1.0 + reaction.bass * 0.4);
            star.y += driftSpeed * dt;
            if (star.y > canvas.height) {
                star.y = 0;
                star.x = Math.random() * canvas.width;
            }
        }
        ctx.fillRect(star.x, star.y, star.size, star.size);
        ctx.restore();
    });

    // Render background symbols (brighten and scale with mid-range frequencies)
    bgSymbols.forEach(sym => {
        ctx.save();
        const midFactor = reaction.mid;
        const scaleFactor = 1.0 + midFactor * 0.15;
        
        ctx.globalAlpha = sym.alpha * (1.0 + midFactor * 1.5);
        ctx.fillStyle = '#3b82f6';
        ctx.font = `${sym.size * scaleFactor}px 'Geist Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (gameState === STATE_RUNNING) {
            sym.y += sym.speed * (1.0 + (combo - 1) * 0.18) * dt;
            sym.rot += sym.rotSpeed * dt;
            if (sym.y > canvas.height + 25) {
                sym.y = -25;
                sym.x = Math.random() * canvas.width;
            }
        }
        
        ctx.translate(sym.x, sym.y);
        ctx.rotate(sym.rot);
        ctx.fillText(sym.char, 0, 0);
        ctx.restore();
    });

    // Draw Tron-style parallax holographic grid at bottom
    drawHolographicGrid(Date.now(), reaction);

    if (gameState === STATE_RUNNING) {
        updateGame(dt);
    } else if (gameState === STATE_IDLE) {
        player.x = canvas.width / 2 + Math.sin(Date.now() / 750) * 12;
        player.y = canvas.height * 0.72 + Math.cos(Date.now() / 550) * 6;
    }

    // Render Entities
    renderEntities();

    // Render Mouse glow
    if (mouseGlowActive) {
        ctx.save();
        const radGrd = ctx.createRadialGradient(
            mousePos.x, mousePos.y, 0,
            mousePos.x, mousePos.y, 90
        );
        radGrd.addColorStop(0, 'rgba(0, 240, 255, 0.045)');
        radGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrd;
        ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
        ctx.restore();
    }

    ctx.restore(); // Restore shake camera
    tickVisualizer();
}

function updateGame(dt) {
    timeElapsed = Date.now() - gameStartTime;

    const gCtx = getGameContext();
    checkBossThreshold(score, gCtx);
    updateBossSystem(dt, gCtx);

    const reward = consumeBossDeathReward();
    if (reward) {
        score += reward.score;
        updateScoreUI();
    }

    // DDA director intensity calculation
    const scoreBase = Math.floor(score / 500);
    
    // Health factors: low health drops difficulty, full health boosts it
    let healthFactor = 0.0;
    if (player.energy < 40) {
        healthFactor = -0.45;
    } else if (player.energy > 80) {
        healthFactor = 0.25;
    }

    // Combo multiplier factor
    const comboFactor = (combo - 1.0) * 0.15;

    // Close calls factor
    const closeCallsFactor = Math.min(1.2, closeCalls * 0.04);

    // Time since last damage factor
    const timeSinceLastHit = Date.now() - lastDamageTime;
    let safetyFactor = 0;
    if (lastDamageTime > 0) {
        if (timeSinceLastHit > 15000) {
            safetyFactor = Math.min(0.6, (timeSinceLastHit - 15000) / 10000);
        } else if (timeSinceLastHit < 6000) {
            safetyFactor = -0.45;
        }
    }

    // Combine into final director intensity
    directorIntensity = 1.0 + scoreBase * 0.9 + healthFactor + comboFactor + closeCallsFactor + safetyFactor;
    directorIntensity = Math.max(0.7, Math.min(5.5, directorIntensity));

    // Determine threat level string
    let newThreatLevel = 'COLD';
    if (directorIntensity <= 1.5) {
        newThreatLevel = 'COLD';
    } else if (directorIntensity <= 2.5) {
        newThreatLevel = 'STABLE';
    } else if (directorIntensity <= 3.5) {
        newThreatLevel = 'HAZARD';
    } else if (directorIntensity <= 4.5) {
        newThreatLevel = 'OVERLOAD';
    } else {
        newThreatLevel = 'APOCALYPSE';
    }

    // Determine flow state string
    const excitement = (combo - 1.0) + (closeCalls * 0.15);
    let newFlowState = 'ZEN';
    if (excitement < 0.25) {
        newFlowState = 'ZEN';
    } else if (excitement < 0.85) {
        newFlowState = 'FOCUS';
    } else if (excitement < 1.95) {
        newFlowState = 'ADRENALINE';
    } else {
        newFlowState = 'FLOW OVERDRIVE';
    }

    if (newThreatLevel !== threatLevel || newFlowState !== flowState) {
        threatLevel = newThreatLevel;
        flowState = newFlowState;
        updateScoreUI();
    }

    // Decrement active power-up timers
    if (player.shieldTime > 0) player.shieldTime = Math.max(0, player.shieldTime - dt);
    if (player.weaponUpgradeTime > 0) player.weaponUpgradeTime = Math.max(0, player.weaponUpgradeTime - dt);
    if (player.slowMotionTime > 0) player.slowMotionTime = Math.max(0, player.slowMotionTime - dt);
    if (player.magnetTime > 0) player.magnetTime = Math.max(0, player.magnetTime - dt);
    if (player.overchargeTime > 0) player.overchargeTime = Math.max(0, player.overchargeTime - dt);
    if (player.controlScrambleTime > 0) player.controlScrambleTime = Math.max(0, player.controlScrambleTime - dt);

    // Energy regeneration during overcharge
    if (player.overchargeTime > 0) {
        player.energy = Math.min(player.maxEnergy, player.energy + 0.08 * dt);
    }

    // 1. Move Player
    let dx = 0;
    let dy = 0;
    const isOvercharged = player.overchargeTime > 0;
    const currentSpeed = isOvercharged ? 0.9 : player.speed;
    const currentMaxSpeed = isOvercharged ? 9.5 : player.maxSpeed;

    const isScrambled = player.controlScrambleTime > 0;
    const moveMult = isScrambled ? -1 : 1;

    if (keys.w || keys.ArrowUp) dy -= currentSpeed * moveMult;
    if (keys.s || keys.ArrowDown) dy += currentSpeed * moveMult;
    if (keys.a || keys.ArrowLeft) dx -= currentSpeed * moveMult;
    if (keys.d || keys.ArrowRight) dx += currentSpeed * moveMult;

    player.vx += dx * dt;
    player.vy += dy * dt;
    player.vx *= Math.pow(player.friction, dt);
    player.vy *= Math.pow(player.friction, dt);

    const speedVal = Math.hypot(player.vx, player.vy);
    if (speedVal > currentMaxSpeed) {
        player.vx = (player.vx / speedVal) * currentMaxSpeed;
        player.vy = (player.vy / speedVal) * currentMaxSpeed;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Boundary constraints
    const margin = 16;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > canvas.width - margin) { player.x = canvas.width - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > canvas.height - margin) { player.y = canvas.height - margin; player.vy = 0; }

    // Thruster trail particles
    if (Math.random() > (isOvercharged ? 0.15 : 0.4)) {
        const trailColor = isOvercharged ? '#ff5500' : (Math.random() > 0.4 ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 127, 0.65)');
        const particleVy = isOvercharged ? Math.random() * 4 + 2.5 : Math.random() * 2 + 1.2;
        spawnParticle('trail', player.x - 3 + (Math.random() - 0.5) * 2, player.y + 11, trailColor, { vy: particleVy });
        spawnParticle('trail', player.x + 3 + (Math.random() - 0.5) * 2, player.y + 11, trailColor, { vy: particleVy });
    }

    // Close Call Dodge Detection
    bugs.forEach(bug => {
        if (bug.type !== 'cube_shard' && bug.type !== 'mine') {
            const dist = Math.hypot(bug.x - player.x, bug.y - player.y);
            if (dist > 22 && dist < 42 && !bug.closeCallChecked) {
                bug.closeCallChecked = true;
                triggerCloseCall(bug.x, bug.y);
            }
        }
    });

    enemyProjectiles.forEach(ep => {
        const dist = Math.hypot(ep.x - player.x, ep.y - player.y);
        if (dist > 14 && dist < 32 && !ep.closeCallChecked) {
            ep.closeCallChecked = true;
            triggerCloseCall(ep.x, ep.y);
        }
    });

    // 2. Weapon Laser Fire System
    if (player.shootCooldown > 0) {
        player.shootCooldown -= dt;
    } else {
        const isUpgraded = player.weaponUpgradeTime > 0;
        let didFire = false;
        if (isOvercharged) {
            // Overcharged high-speed plasma double bolts (piercing)
            if (bullets.length < 90) {
                bullets.push({ x: player.x - 7, y: player.y - 10, vx: -0.7, vy: -15.5, color: '#ff3300', pierce: 3 });
                bullets.push({ x: player.x + 7, y: player.y - 10, vx: 0.7, vy: -15.5, color: '#ff3300', pierce: 3 });
                playSound('laser');
                didFire = true;
            }
            player.shootCooldown = keys[' '] ? 5 : 8; // Ultra fast firing rates
        } else if (keys[' ']) {
            // Manual spacebar fire
            if (isUpgraded) {
                // 5-way spread lasers when upgraded
                if (bullets.length < 80) {
                    bullets.push({ x: player.x - 11, y: player.y - 4, vx: -3.5, vy: -12.5, color: '#ff00ff' });
                    bullets.push({ x: player.x - 6, y: player.y - 8, vx: -1.5, vy: -13.5, color: '#ff00ff' });
                    bullets.push({ x: player.x, y: player.y - 12, vx: 0, vy: -14.5, color: '#ff00ff' });
                    bullets.push({ x: player.x + 6, y: player.y - 8, vx: 1.5, vy: -13.5, color: '#ff00ff' });
                    bullets.push({ x: player.x + 11, y: player.y - 4, vx: 3.5, vy: -12.5, color: '#ff00ff' });
                    playSound('laser');
                    didFire = true;
                }
                player.shootCooldown = 9; // Ultra fast fire rate
            } else {
                // Heavy dual-lasers from wingtips
                if (bullets.length < 50) {
                    bullets.push({ x: player.x - 11, y: player.y - 4, vx: 0, vy: -12.5, color: '#00f0ff' });
                    bullets.push({ x: player.x + 11, y: player.y - 4, vx: 0, vy: -12.5, color: '#00f0ff' });
                    playSound('laser');
                    didFire = true;
                }
                player.shootCooldown = 13; // Faster fire rate
            }
        } else {
            // Auto-fire
            if (isUpgraded) {
                // Triple lasers when upgraded
                if (bullets.length < 60) {
                    bullets.push({ x: player.x - 11, y: player.y - 4, vx: -1.8, vy: -12.5, color: '#ff00ff' });
                    bullets.push({ x: player.x, y: player.y - 12, vx: 0, vy: -13.5, color: '#ff00ff' });
                    bullets.push({ x: player.x + 11, y: player.y - 4, vx: 1.8, vy: -12.5, color: '#ff00ff' });
                    playSound('laser');
                    didFire = true;
                }
                player.shootCooldown = 13;
            } else {
                // Single center light-laser
                if (bullets.length < 50) {
                    bullets.push({ x: player.x, y: player.y - 12, vx: 0, vy: -12.5, color: '#00f0ff' });
                    playSound('laser');
                    didFire = true;
                }
                player.shootCooldown = 19;
            }
        }

        // Shoot extra wing blasters if permanent weapon is attached!
        if (didFire && player.permaWeaponType) {
            const wt = player.permaWeaponType;
            if (wt === 'CANNONS') {
                bullets.push({ x: player.x - 18, y: player.y, vx: 0, vy: -13.0, color: '#ff00aa' });
                bullets.push({ x: player.x + 18, y: player.y, vx: 0, vy: -13.0, color: '#ff00aa' });
            } else if (wt === 'PLASMA') {
                bullets.push({ x: player.x - 18, y: player.y, vx: 0, vy: -7.5, color: '#50fa7b', pierce: 2, plasma: true });
                bullets.push({ x: player.x + 18, y: player.y, vx: 0, vy: -7.5, color: '#50fa7b', pierce: 2, plasma: true });
            } else if (wt === 'SPREAD') {
                bullets.push({ x: player.x - 18, y: player.y, vx: -3.2, vy: -11.0, color: '#ffea00' });
                bullets.push({ x: player.x + 18, y: player.y, vx: 3.2, vy: -11.0, color: '#ffea00' });
            } else if (wt === 'MISSILE') {
                bullets.push({ x: player.x - 18, y: player.y, vx: -1.0, vy: -9.0, color: '#8be9fd', homing: true });
                bullets.push({ x: player.x + 18, y: player.y, vx: 1.0, vy: -9.0, color: '#8be9fd', homing: true });
            } else if (wt === 'BEAM') {
                bullets.push({ x: player.x - 18, y: player.y, vx: 0, vy: -17.5, color: '#ffffff', rail: true });
                bullets.push({ x: player.x + 18, y: player.y, vx: 0, vy: -17.5, color: '#ffffff', rail: true });
            }
        }
    }

    // Support Drones update & fire behavior
    if (player.drones.length > 0) {
        if (droneShootCooldown > 0) {
            droneShootCooldown -= dt;
        } else {
            let firedAny = false;
            player.drones.forEach((drone, idx) => {
                let xOffset = 0;
                let yOffset = -35;
                if (idx === 1) { xOffset = -22; yOffset = -28; }
                else if (idx === 2) { xOffset = 22; yOffset = -28; }

                const droneX = player.x + xOffset;
                const droneY = player.y + yOffset;

                // Find closest bug
                let closestBug = null;
                let minDist = 380;
                for (let b of bugs) {
                    const d = Math.hypot(b.x - droneX, b.y - droneY);
                    if (d < minDist) {
                        minDist = d;
                        closestBug = b;
                    }
                }

                if (closestBug && bullets.length < 90) {
                    const dx = closestBug.x - droneX;
                    const dy = closestBug.y - droneY;
                    const dist = Math.hypot(dx, dy);
                    const bVx = (dx / dist) * 11.5;
                    const bVy = (dy / dist) * 11.5;
                    bullets.push({
                        x: droneX,
                        y: droneY,
                        vx: bVx,
                        vy: bVy,
                        color: '#50fa7b'
                    });
                    firedAny = true;
                    createParticleBurst(droneX, droneY, '#50fa7b', 4);
                }
            });

            if (firedAny) {
                playSound('drone_fire');
                droneShootCooldown = 28; // shared fire rate cooldown
            }
        }
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        
        if (b.homing) {
            // Find closest bug
            let closestBug = null;
            let minDist = 999999;
            for (let bug of bugs) {
                const d = Math.hypot(bug.x - b.x, bug.y - b.y);
                if (d < minDist) {
                    minDist = d;
                    closestBug = bug;
                }
            }
            
            if (closestBug) {
                const dx = closestBug.x - b.x;
                const dy = closestBug.y - b.y;
                const dist = Math.hypot(dx, dy);
                
                const speed = 12.0;
                const targetVx = (dx / dist) * speed;
                const targetVy = (dy / dist) * speed;
                
                const steerStrength = 0.16 * dt;
                b.vx = b.vx + (targetVx - b.vx) * steerStrength;
                b.vy = b.vy + (targetVy - b.vy) * steerStrength;
            } else {
                const targetVx = 0;
                const targetVy = -12.0;
                const steerStrength = 0.1 * dt;
                b.vx = b.vx + (targetVx - b.vx) * steerStrength;
                b.vy = b.vy + (targetVy - b.vy) * steerStrength;
            }
            
            if (Math.random() > 0.6) {
                spawnParticle('trail', b.x, b.y + 4, '#8be9fd', { vy: Math.random() * 0.5 + 0.5 });
            }
        }
        
        if (b.vx) b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -15 || b.x < -15 || b.x > (canvas ? canvas.width + 15 : 2000)) {
            bullets.splice(i, 1);
        }
    }

    // 3. Spawning System (Scales up over time and DDA intensity)
    const elapsedSecs = timeElapsed / 1000;
    const bugSpawnDelay = Math.max(220, 1800 - directorIntensity * 320);
    const speedMultiplier = Math.min(2.8, 0.75 + directorIntensity * 0.28);

    if (!shouldPauseSpawning() && Date.now() - lastSpawnTime > bugSpawnDelay && bugs.length < 40) {
        const r = Math.random();
        let enemyType = 'bug';

        // Select type from pool based on Threat Level
        let pool = ['bug'];
        if (threatLevel === 'COLD') {
            pool = ['bug', 'bug', 'swarm'];
        } else if (threatLevel === 'STABLE') {
            pool = ['bug', 'swarm', 'cube', 'orb', 'drone', 'bomber'];
        } else if (threatLevel === 'HAZARD') {
            pool = ['swarm', 'cube', 'orb', 'drone', 'bomber', 'guardian', 'sniper'];
        } else if (threatLevel === 'OVERLOAD') {
            pool = ['cube', 'drone', 'bomber', 'guardian', 'sniper', 'phantom', 'phantom'];
        } else {
            // APOCALYPSE: dangerous pool and Hive Carrier bosses
            pool = ['bomber', 'guardian', 'sniper', 'phantom', 'carrier', 'carrier'];
        }

        enemyType = pool[Math.floor(Math.random() * pool.length)];

        // Enforce maximum 1 Carrier active at once
        if (enemyType === 'carrier') {
            const hasCarrier = bugs.some(b => b.type === 'carrier');
            if (hasCarrier) {
                enemyType = Math.random() > 0.5 ? 'sniper' : 'phantom';
            }
        }

        // Enforce maximum Snipers based on Threat Level (Cap to: 1 on easy, 3 on moderate, 5 on difficult)
        if (enemyType === 'sniper') {
            const activeSnipersCount = bugs.filter(b => b.type === 'sniper').length;
            let sniperCap = 3;
            if (threatLevel === 'COLD') sniperCap = 1;
            else if (threatLevel === 'STABLE' || threatLevel === 'HAZARD') sniperCap = 3;
            else sniperCap = 5;

            if (activeSnipersCount >= sniperCap) {
                enemyType = (threatLevel === 'COLD') ? 'bug' : (Math.random() > 0.6 ? 'bug' : 'phantom');
            }
        }

        const difficultyHealthMult = 1.0 + (directorIntensity - 1.0) * 0.12;

        if (enemyType === 'swarm') {
            const count = 3 + Math.floor(Math.random() * 2);
            const startX = Math.random() * (canvas.width - 100) + 50;
            const dirX = Math.random() > 0.5 ? 1.4 : -1.4;
            for (let k = 0; k < count; k++) {
                bugs.push({
                    type: 'swarm',
                    x: startX + k * 14,
                    y: -20 - k * 14,
                    width: 14,
                    height: 14,
                    vy: (Math.random() * 0.8 + 3.2) * speedMultiplier,
                    vx: dirX,
                    health: 1,
                    damage: 10,
                    color: '#ffb86c', // Orange
                    glow: 'rgba(255, 184, 108, 0.7)',
                    hitFlash: 0,
                    scoreValue: 15
                });
            }
        } else if (enemyType === 'drone') {
            bugs.push({
                type: 'drone',
                x: Math.random() * (canvas.width - 40) + 20,
                y: -30,
                width: 32,
                height: 24,
                vy: 1.8 * speedMultiplier,
                vx: Math.random() > 0.5 ? 1.2 : -1.2,
                targetY: Math.random() * (canvas.height * 0.3) + 40,
                hovering: false,
                shootCooldown: Math.random() * 60 + 40,
                health: Math.floor(2 * difficultyHealthMult),
                damage: 15,
                color: '#8be9fd', // Cyan
                glow: 'rgba(139, 233, 253, 0.7)',
                hitFlash: 0,
                scoreValue: 25
            });
        } else if (enemyType === 'orb') {
            bugs.push({
                type: 'orb',
                x: Math.random() * (canvas.width - 40) + 20,
                y: -30,
                width: 24,
                height: 24,
                vy: 1.4 * speedMultiplier,
                vx: 0,
                pulseTime: Math.random() * 100,
                chargeTimer: 110,
                health: Math.floor(2 * difficultyHealthMult),
                damage: 18,
                color: '#50fa7b', // Green
                glow: 'rgba(80, 250, 123, 0.7)',
                hitFlash: 0,
                scoreValue: 20
            });
        } else if (enemyType === 'cube') {
            bugs.push({
                type: 'cube',
                x: Math.random() * (canvas.width - 60) + 30,
                y: -30,
                width: 26,
                height: 26,
                vy: 0.9 * speedMultiplier,
                vx: (Math.random() - 0.5) * 0.8,
                rotX: Math.random() * Math.PI,
                rotY: Math.random() * Math.PI,
                rotSpeedX: Math.random() * 0.02 + 0.015,
                rotSpeedY: Math.random() * 0.02 + 0.015,
                health: Math.floor(3 * difficultyHealthMult),
                damage: 25,
                color: '#bd93f9', // Purple
                glow: 'rgba(189, 147, 249, 0.7)',
                hitFlash: 0,
                scoreValue: 30
            });
        } else if (enemyType === 'phantom') {
            bugs.push({
                type: 'phantom',
                x: Math.random() * (canvas.width - 40) + 20,
                y: -30,
                width: 28,
                height: 24,
                vy: 1.6 * speedMultiplier,
                vx: (Math.random() - 0.5) * 1.5,
                health: Math.floor(3 * difficultyHealthMult),
                damage: 15,
                color: '#ff79c6', // Pink
                glow: 'rgba(255, 121, 198, 0.7)',
                hitFlash: 0,
                scoreValue: 40,
                cloakTimer: 80 + Math.random() * 60,
                cloaked: false,
                alpha: 1.0
            });
        } else if (enemyType === 'guardian') {
            bugs.push({
                type: 'guardian',
                x: Math.random() * (canvas.width - 60) + 30,
                y: -30,
                width: 36,
                height: 32,
                vy: 0.9 * speedMultiplier,
                vx: (Math.random() - 0.5) * 0.6,
                health: Math.floor(4 * difficultyHealthMult),
                shieldHealth: Math.floor(5 * (1.0 + (directorIntensity - 1.0) * 0.15)),
                maxShieldHealth: Math.floor(5 * (1.0 + (directorIntensity - 1.0) * 0.15)),
                damage: 20,
                color: '#f1fa8c', // Yellow
                glow: 'rgba(241, 250, 140, 0.7)',
                hitFlash: 0,
                scoreValue: 50
            });
        } else if (enemyType === 'bomber') {
            bugs.push({
                type: 'bomber',
                x: Math.random() * (canvas.width - 50) + 25,
                y: -30,
                width: 30,
                height: 30,
                vy: 0.7 * speedMultiplier,
                vx: (Math.random() - 0.5) * 0.8,
                health: Math.floor(4 * difficultyHealthMult),
                damage: 22,
                color: '#ff5555', // Red
                glow: 'rgba(255, 85, 85, 0.7)',
                hitFlash: 0,
                scoreValue: 45,
                mineCooldown: 120 + Math.random() * 100
            });
        } else if (enemyType === 'sniper') {
            bugs.push({
                type: 'sniper',
                x: Math.random() * (canvas.width - 40) + 20,
                y: -30,
                width: 28,
                height: 32,
                vy: 2.0 * speedMultiplier,
                vx: 0,
                targetY: Math.random() * (canvas.height * 0.22) + 40,
                hovering: false,
                aimTimer: 0,
                chargeTimer: 0,
                laserActive: false,
                health: Math.floor(3 * difficultyHealthMult),
                damage: 25,
                color: '#50fa7b', // Green
                glow: 'rgba(80, 250, 123, 0.7)',
                hitFlash: 0,
                scoreValue: 60
            });
        } else if (enemyType === 'carrier') {
            bugs.push({
                type: 'carrier',
                x: canvas.width / 2,
                y: -50,
                width: 64,
                height: 44,
                vy: 0.8,
                vx: 1.1,
                targetY: 60 + Math.random() * 40,
                hovering: false,
                spawnCooldown: 200,
                health: Math.floor(18 * (1.0 + (directorIntensity - 1.0) * 0.15)),
                maxHealth: Math.floor(18 * (1.0 + (directorIntensity - 1.0) * 0.15)),
                damage: 35,
                color: '#bd93f9', // Purple
                glow: 'rgba(189, 147, 249, 0.7)',
                hitFlash: 0,
                scoreValue: 150
            });
        } else {
            // Standard Glitch Bug
            bugs.push({
                type: 'bug',
                x: Math.random() * (canvas.width - 40) + 20,
                y: -20,
                width: 22,
                height: 20,
                vy: (Math.random() * 1.5 + 2.0) * speedMultiplier,
                vx: (Math.random() - 0.5) * 1.4,
                health: Math.floor(1 * difficultyHealthMult) || 1,
                damage: 12,
                color: '#ff5555', // Red
                glow: 'rgba(255, 85, 85, 0.7)',
                hitFlash: 0,
                scoreValue: 10
            });
        }

        lastSpawnTime = Date.now();
    }

    // Periodic energy fragments
    const fragmentSpawnDelay = Math.max(1200, 2400 - elapsedSecs * 15);
    if (!shouldPauseSpawning() && Date.now() - lastFragmentSpawnTime > fragmentSpawnDelay) {
        spawnEnergyFragment(Math.random() * (canvas.width - 60) + 30, -20);
        lastFragmentSpawnTime = Date.now();
    }

    // Periodic power-ups spawning (every 16-22 seconds)
    const powerUpSpawnDelay = 16000 + Math.random() * 6000;
    if (!shouldPauseSpawning() && Date.now() - lastPowerUpSpawnTime > powerUpSpawnDelay && powerups.length < 2) {
        spawnPowerUp(Math.random() * (canvas.width - 60) + 30, -20);
        lastPowerUpSpawnTime = Date.now();
    }

    // 4. Update Bullets vs Enemies Collision
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletDestroyed = false;

        if (isBossPhaseActive()) {
            const hitResult = handleBossBulletHit(bullet, getGameContext());
            if (hitResult.hit) {
                if (hitResult.bulletDestroyed) {
                    bullets.splice(i, 1);
                    continue;
                }
            }
        }

        for (let j = bugs.length - 1; j >= 0; j--) {
            const bug = bugs[j];

            if (isColliding({ x: bullet.x, y: bullet.y, width: 8, height: 16 }, bug)) {
                // Guardian front shield check
                if (bug.type === 'guardian' && bug.shieldHealth > 0) {
                    bug.shieldHealth--;
                    bug.hitFlash = 3;
                    playSound('hit');
                    createParticleBurst(bullet.x, bullet.y, '#f1fa8c', 5);
                    
                    bulletDestroyed = true;
                    if (bullet.pierce) {
                        bullet.pierce--;
                        if (bullet.pierce > 0) {
                            bulletDestroyed = false; // pierce handles extra damage
                            bug.shieldHealth--;
                        }
                    }
                    
                    if (bug.shieldHealth <= 0) {
                        playSound('explosion');
                        createParticleBurst(bug.x, bug.y, '#f1fa8c', 14);
                        shakeScreen(4, 150);
                    }
                    
                    if (bulletDestroyed) {
                        break;
                    }
                }

                bug.health--;
                if (bullet.pierce) {
                    bug.health--; // Extra damage for overcharged piercing shots
                }
                bug.hitFlash = 3;
                playSound('hit');
                createParticleBurst(bullet.x, bullet.y, bullet.color || '#00f0ff', 5);

                if (bullet.pierce) {
                    bullet.pierce--;
                    if (bullet.pierce <= 0) {
                        bulletDestroyed = true;
                    }
                } else {
                    bulletDestroyed = true;
                }

                if (bug.health <= 0) {
                    playSound('explosion');
                    createParticleBurst(bug.x, bug.y, bug.color, 18);
                    shakeScreen(bug.type === 'cube' || bug.type === 'carrier' ? 10 : 5, 200);

                    // Split Cube Shards
                    if (bug.type === 'cube') {
                        for (let k = 0; k < 3; k++) {
                            if (bugs.length >= 40) break;
                            const angle = (Math.PI * 2 / 3) * k + Math.random() * 0.5;
                            bugs.push({
                                type: 'cube_shard',
                                x: bug.x,
                                y: bug.y,
                                width: 10,
                                height: 10,
                                vy: Math.sin(angle) * 3.5 + 1.2,
                                vx: Math.cos(angle) * 3.5,
                                health: 1,
                                damage: 8,
                                color: '#bd93f9',
                                glow: 'rgba(189, 147, 249, 0.6)',
                                hitFlash: 0,
                                scoreValue: 5
                            });
                        }
                    }

                    // Bomber Death Projectile Ring Burst
                    if (bug.type === 'bomber') {
                        for (let k = 0; k < 8; k++) {
                            const angle = (Math.PI * 2 / 8) * k;
                            enemyProjectiles.push({
                                x: bug.x,
                                y: bug.y,
                                vx: Math.cos(angle) * 4.2,
                                vy: Math.sin(angle) * 4.2,
                                color: '#ff5555'
                            });
                        }
                    }

                    // Carrier death rewards
                    if (bug.type === 'carrier') {
                        spawnEnergyFragment(bug.x - 16, bug.y);
                        spawnEnergyFragment(bug.x + 16, bug.y);
                    }

                    // Score calculation
                    const points = Math.round(bug.scoreValue * combo);
                    score += points;
                    updateScoreUI();

                    // Drop fragment (25% chance, 100% for carrier)
                    if (Math.random() < 0.25 || bug.type === 'carrier') {
                        spawnEnergyFragment(bug.x, bug.y);
                    }

                    // Drop powerup (6% chance normally, 18% for elites, 100% for carrier)
                    const isElite = ['drone', 'cube', 'bomber', 'guardian', 'phantom', 'sniper'].includes(bug.type);
                    const powerUpDropChance = bug.type === 'carrier' ? 1.0 : (isElite ? 0.18 : 0.06);
                    if (Math.random() < powerUpDropChance) {
                        spawnPowerUp(bug.x, bug.y);
                    }

                    bugs.splice(j, 1);
                }
                break;
            }
        }

        if (bulletDestroyed) {
            bullets.splice(i, 1);
        }
    }

    // 5. Update Enemies
    const enemyDt = player.slowMotionTime > 0 ? dt * 0.42 : dt;
    for (let i = bugs.length - 1; i >= 0; i--) {
        const bug = bugs[i];

        if (bug.type === 'drone') {
            if (!bug.hovering && bug.y >= bug.targetY) {
                bug.hovering = true;
                bug.vy = 0;
            }

            if (bug.hovering) {
                bug.x += bug.vx * enemyDt;
                if (bug.x < 30 || bug.x > canvas.width - 30) {
                     bug.vx *= -1;
                }

                bug.shootCooldown -= enemyDt;
                if (bug.shootCooldown <= 0) {
                    if (enemyProjectiles.length < 80) {
                        enemyProjectiles.push({
                            x: bug.x,
                            y: bug.y + 12,
                            vy: 4.8,
                            color: '#ff55ff'
                        });
                        playSound('drone_fire');
                    }
                    bug.shootCooldown = 90 + Math.random() * 70;
                }
            } else {
                bug.y += bug.vy * enemyDt;
            }
        } else if (bug.type === 'orb') {
            bug.pulseTime += 0.14 * enemyDt;
            bug.chargeTimer -= enemyDt;

            if (bug.chargeTimer <= 0) {
                const dx = player.x - bug.x;
                bug.vx = Math.sign(dx) * 2.8;
                bug.vy = 5.6;
                bug.chargeTimer = 110 + Math.random() * 60;
            } else {
                bug.y += bug.vy * enemyDt;
                bug.x += Math.sin(bug.pulseTime) * 0.7 * enemyDt;
            }
        } else if (bug.type === 'phantom') {
            // Phantom cloaking and teleporting behavior
            bug.cloakTimer -= enemyDt;
            if (bug.cloakTimer <= 0) {
                bug.cloaked = !bug.cloaked;
                bug.cloakTimer = 90 + Math.random() * 70;
                if (bug.cloaked) {
                    // Teleport horizontally to confuse the player!
                    bug.x = Math.random() * (canvas.width - 60) + 30;
                    createParticleBurst(bug.x, bug.y, '#ff79c6', 8);
                }
            }

            if (bug.cloaked) {
                bug.alpha = Math.max(0.18, bug.alpha - 0.08 * enemyDt);
                bug.y += bug.vy * 0.42 * enemyDt; // Move slower while cloaked
            } else {
                bug.alpha = Math.min(1.0, bug.alpha + 0.08 * enemyDt);
                bug.y += bug.vy * enemyDt;
                
                // Shoot dual shots when fully visible
                if (!bug.shootCooldown) bug.shootCooldown = 10;
                bug.shootCooldown -= enemyDt;
                if (bug.shootCooldown <= 0) {
                    if (enemyProjectiles.length < 80) {
                        enemyProjectiles.push({ x: bug.x - 6, y: bug.y + 10, vy: 5.2, color: '#ff79c6' });
                        enemyProjectiles.push({ x: bug.x + 6, y: bug.y + 10, vy: 5.2, color: '#ff79c6' });
                        playSound('drone_fire');
                    }
                    bug.shootCooldown = 65 + Math.random() * 35;
                }
            }
            bug.x += bug.vx * enemyDt;
            if (bug.x < 20 || bug.x > canvas.width - 20) {
                bug.vx *= -1;
            }
        } else if (bug.type === 'guardian') {
            // Guardian slow movement and shield facing
            bug.y += bug.vy * enemyDt;
            bug.x += bug.vx * enemyDt;
            if (bug.x < 30 || bug.x > canvas.width - 30) {
                bug.vx *= -1;
            }
        } else if (bug.type === 'bomber') {
            // Bomber slow descent, drops proximity mines
            bug.y += bug.vy * enemyDt;
            bug.x += bug.vx * enemyDt;
            if (bug.x < 30 || bug.x > canvas.width - 30) {
                bug.vx *= -1;
            }

            bug.mineCooldown -= enemyDt;
            if (bug.mineCooldown <= 0 && bugs.length < 40) {
                bugs.push({
                    type: 'mine',
                    x: bug.x,
                    y: bug.y + 14,
                    width: 14,
                    height: 14,
                    vy: 0.22,
                    vx: 0,
                    health: 1,
                    damage: 16,
                    color: '#ff5555',
                    glow: 'rgba(255, 85, 85, 0.7)',
                    hitFlash: 0,
                    scoreValue: 5,
                    blinkTime: 0
                });
                bug.mineCooldown = 160 + Math.random() * 120;
            }
        } else if (bug.type === 'mine') {
            // Proximity mine drifts down, blinks, explodes
            bug.y += bug.vy * enemyDt;
            bug.blinkTime = (bug.blinkTime || 0) + 0.12 * enemyDt;
        } else if (bug.type === 'sniper') {
            // Sniper movement to target height, lock on, charge and fire
            if (!bug.hovering && bug.y >= bug.targetY) {
                bug.hovering = true;
                bug.vy = 0;
            }

            if (bug.hovering) {
                bug.chargeTimer = (bug.chargeTimer || 0) + enemyDt;
                
                if (bug.chargeTimer < 90) {
                    // Lock-on/Aiming phase: tracks player horizontally
                    const dx = player.x - bug.x;
                    bug.x += Math.sign(dx) * Math.min(2.0, Math.abs(dx) * 0.06) * enemyDt;
                    bug.laserActive = false;
                } else if (bug.chargeTimer >= 90 && bug.chargeTimer < 140) {
                    // Firing phase: lock position, activate laser beam
                    bug.laserActive = true;
                    
                    // Check laser beam player collision
                    if (Math.abs(player.x - bug.x) < 18 && player.y > bug.y) {
                        if (player.shieldTime > 0) {
                            if (Math.random() > 0.8) createParticleBurst(player.x, player.y, '#50fa7b', 3);
                        } else {
                            player.energy -= 0.8 * enemyDt;
                            lastDamageTime = Date.now();
                            player.damageFlash = 2;
                            if (Math.random() > 0.8) {
                                playSound('hit');
                                shakeScreen(3, 80);
                            }
                            if (player.energy <= 0) {
                                player.energy = 0;
                                gameOver();
                            }
                        }
                    }
                } else if (bug.chargeTimer >= 140 && bug.chargeTimer < 230) {
                    // Cooldown phase
                    bug.laserActive = false;
                } else {
                    // Reset cycle
                    bug.chargeTimer = 0;
                }
            } else {
                bug.y += bug.vy * enemyDt;
            }
        } else if (bug.type === 'carrier') {
            // Carrier spawner moves horizontally at top
            if (!bug.hovering && bug.y >= bug.targetY) {
                bug.hovering = true;
                bug.vy = 0;
            }

            if (bug.hovering) {
                bug.x += bug.vx * enemyDt;
                if (bug.x < 50 || bug.x > canvas.width - 50) {
                    bug.vx *= -1;
                }

                // Spawn Swarmers
                bug.spawnCooldown -= enemyDt;
                if (bug.spawnCooldown <= 0 && bugs.length < 35) {
                    for (let k = 0; k < 3; k++) {
                        bugs.push({
                            type: 'swarm',
                            x: bug.x + (k - 1) * 20,
                            y: bug.y + 12,
                            width: 14,
                            height: 14,
                            vy: 2.8,
                            vx: (k - 1) * 0.9,
                            health: 1,
                            damage: 10,
                            color: '#ffb86c',
                            glow: 'rgba(255, 184, 108, 0.7)',
                            hitFlash: 0,
                            scoreValue: 15
                        });
                    }
                    bug.spawnCooldown = 240 + Math.random() * 80;
                }

                // Shoot standard projectiles
                if (!bug.shootCooldown) bug.shootCooldown = 60;
                bug.shootCooldown -= enemyDt;
                if (bug.shootCooldown <= 0) {
                    if (enemyProjectiles.length < 80) {
                        enemyProjectiles.push({
                            x: bug.x,
                            y: bug.y + 20,
                            vy: 4.4,
                            color: '#bd93f9'
                        });
                        playSound('drone_fire');
                    }
                    bug.shootCooldown = 90 + Math.random() * 60;
                }
            } else {
                bug.y += bug.vy * enemyDt;
            }
        } else {
            bug.y += bug.vy * enemyDt;
            bug.x += bug.vx * enemyDt;

            if (bug.x < 15 || bug.x > canvas.width - 15) {
                bug.vx *= -1;
            }
        }

        // Out of screen (bottom, top, or sides)
        if (bug.y > canvas.height + 25 || bug.y < -100 || bug.x < -100 || bug.x > canvas.width + 100) {
            bugs.splice(i, 1);
            continue;
        }

        // Support Drone firewall collision check
        let droneCollided = false;
        for (let idx = 0; idx < player.drones.length; idx++) {
            const drone = player.drones[idx];
            const droneRect = getDroneRect(idx);
            if (isColliding(droneRect, bug)) {
                handleDroneHit(drone, idx, droneRect, 'explosion', 16, 4, 150, bug.x, bug.y, bug.color);
                const points = Math.round(bug.scoreValue * combo);
                score += points;
                updateScoreUI();

                bugs.splice(i, 1);
                droneCollided = true;
                break;
            }
        }
        if (droneCollided) continue;

        // Player Collision check
        if (isColliding(player, bug)) {
            if (player.shieldTime > 0) {
                playSound('explosion');
                createParticleBurst(bug.x, bug.y, bug.color, 16);
                shakeScreen(4, 150);
                const points = Math.round(bug.scoreValue * combo);
                score += points;
                updateScoreUI();
                bugs.splice(i, 1);
                continue;
            }

            player.energy -= bug.damage;
            lastDamageTime = Date.now();
            player.damageFlash = 10; // flash player
            playSound('hit');
            createParticleBurst(bug.x, bug.y, bug.color, 16);
            shakeScreen(9, 260);
            triggerScreenGlitch();

            combo = 1.0;
            updateScoreUI();

            bugs.splice(i, 1);

            if (player.energy <= 0) {
                player.energy = 0;
                gameOver();
            }
            continue;
        }
    }

    // 6. Update Enemy Projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const ep = enemyProjectiles[i];

        if (ep.homing) {
            ep.lifetime = (ep.lifetime || 180) - enemyDt;
            if (ep.lifetime <= 0) {
                enemyProjectiles.splice(i, 1);
                continue;
            }
            const dx = player.x - ep.x;
            const dy = player.y - ep.y;
            const dist = Math.hypot(dx, dy) || 1;
            const speed = Math.hypot(ep.vx || 0, ep.vy);
            const targetVx = (dx / dist) * speed;
            const targetVy = (dy / dist) * speed;
            ep.vx = (ep.vx || 0) + (targetVx - (ep.vx || 0)) * 0.05 * enemyDt;
            ep.vy = ep.vy + (targetVy - ep.vy) * 0.05 * enemyDt;
        }

        if (ep.vx) ep.x += ep.vx * enemyDt;
        ep.y += ep.vy * enemyDt;

        if (ep.y > canvas.height + 15 || ep.y < -15 || ep.x < -15 || ep.x > canvas.width + 15) {
            enemyProjectiles.splice(i, 1);
            continue;
        }

        // Support Drone firewall projectile check
        let droneCollided = false;
        for (let idx = 0; idx < player.drones.length; idx++) {
            const drone = player.drones[idx];
            const droneRect = getDroneRect(idx);
            if (isColliding(droneRect, { x: ep.x, y: ep.y, width: 8, height: 8 })) {
                handleDroneHit(drone, idx, droneRect, 'hit', 8, 3, 100, ep.x, ep.y, ep.color);
                enemyProjectiles.splice(i, 1);
                droneCollided = true;
                break;
            }
        }
        if (droneCollided) continue;

        if (isColliding(player, { x: ep.x, y: ep.y, width: 8, height: 8 })) {
            if (player.shieldTime > 0) {
                createParticleBurst(ep.x, ep.y, ep.color, 8);
                playSound('hit');
                enemyProjectiles.splice(i, 1);
                continue;
            }

            player.energy -= 12;
            lastDamageTime = Date.now();
            player.damageFlash = 10;
            playSound('hit');
            createParticleBurst(ep.x, ep.y, ep.color, 8);
            shakeScreen(6, 200);
            triggerScreenGlitch();

            combo = 1.0;
            updateScoreUI();

            enemyProjectiles.splice(i, 1);

            if (player.energy <= 0) {
                player.energy = 0;
                gameOver();
            }
            continue;
        }
    }

    // 7. Update Collectibles
    for (let i = fragments.length - 1; i >= 0; i--) {
        const frag = fragments[i];

        if (player.magnetTime > 0) {
            const dx = player.x - frag.x;
            const dy = player.y - frag.y;
            const dist = Math.hypot(dx, dy);
            
            // Mega Magnet attracts from anywhere on the screen!
            const force = 0.58;
            frag.vx += (dx / Math.max(1, dist)) * force * dt;
            frag.vy += (dy / Math.max(1, dist)) * force * dt;
            
            const fSpeed = Math.hypot(frag.vx, frag.vy);
            if (fSpeed > 9.5) {
                frag.vx = (frag.vx / fSpeed) * 9.5;
                frag.vy = (frag.vy / fSpeed) * 9.5;
            }
        }

        frag.y += frag.vy * dt;
        frag.x += frag.vx * dt;
        frag.rot += frag.rotSpeed * dt;
        frag.pulseScale = 1.0 + Math.sin(Date.now() * frag.pulseSpeed) * 0.14;

        if (frag.x < 15 || frag.x > canvas.width - 15) {
            frag.vx *= -1;
        }

        // Gold/white sparkle trail unique to collectibles (enemies never emit gold trails)
        if (Math.random() > 0.65) {
            const sparkColor = Math.random() > 0.5 ? '#ffd700' : '#ffffff';
            spawnParticle('trail', frag.x + (Math.random() - 0.5) * 6, frag.y + 6, sparkColor, { vy: Math.random() * 0.5 + 0.3 });
        }

        if (frag.y > canvas.height + 25) {
            fragments.splice(i, 1);
            if (combo > 1.0) {
                combo = 1.0;
                updateScoreUI();
            }
            continue;
        }

        if (isColliding(player, frag)) {
            playSound('collect');
            createParticleBurst(frag.x, frag.y, '#ffd700', 14);
            createParticleBurst(frag.x, frag.y, '#ffffff', 8);

            const pointsGained = Math.round(20 * combo);
            score += pointsGained;

            player.energy = Math.min(player.maxEnergy, player.energy + 8);
            combo = Math.min(5.0 + getMaxComboBonus(), combo + 0.1);

            updateScoreUI();
            fragments.splice(i, 1);
            continue;
        }
    }

    // 7.5. Update Power-ups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const pup = powerups[i];
        pup.y += pup.vy * dt;
        
        // Floating sinusoidal horizontal drift (distinguishes it from straight-flying enemies)
        pup.x += (pup.vx + Math.sin(Date.now() / 220 + i) * 0.82) * dt;
        
        pup.rot += pup.rotSpeed * dt;
        pup.pulseScale = 1.0 + Math.sin(Date.now() * pup.pulseSpeed) * 0.12;

        if (pup.x < 15 || pup.x > canvas.width - 15) {
            pup.vx *= -1;
        }

        if (pup.y > canvas.height + 25) {
            powerups.splice(i, 1);
            continue;
        }

        // Spawn trailing sparkles to highlight it's a positive collectible (boosted frequency)
        if (Math.random() > 0.55) {
            const trailColor = Math.random() > 0.4 ? '#ffd700' : pup.color;
            spawnParticle('trail', pup.x + (Math.random() - 0.5) * 8, pup.y + 5, trailColor, { vy: Math.random() * 0.5 + 0.4 });
        }

        if (isColliding(player, pup)) {
            applyPowerUp(pup);
            powerups.splice(i, 1);
            continue;
        }
    }

    // 8. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        
        if (p.type === 'smoke') {
            p.size = Math.min(p.maxSize, p.size + 0.22 * dt);
        } else if (p.type === 'shockwave') {
            p.size += 8.2 * dt;
        }
        
        p.alpha -= p.decay * dt;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawPowerUp(pup) {
    ctx.save();
    ctx.translate(pup.x, pup.y);

    // 0. Floating "▼" chevron indicator above the power-up (no enemy has this)
    ctx.save();
    const chevronBob = Math.sin(Date.now() / 280) * 3;
    ctx.fillStyle = '#ffd700';
    ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffd700';
    ctx.font = "bold 10px 'Geist Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', 0, -22 + chevronBob);
    ctx.restore();
    
    // 1. Outer rotating glowing hexagon (primary ring)
    ctx.save();
    ctx.rotate(pup.rot);
    ctx.shadowBlur = 15;
    ctx.shadowColor = pup.glow;
    ctx.strokeStyle = pup.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let s = 0; s < 6; s++) {
        const angle = (Math.PI / 3) * s;
        const radius = 13.5 * pup.pulseScale;
        const hx = Math.cos(angle) * radius;
        const hy = Math.sin(angle) * radius;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 2. Secondary outer ring spinning in opposite direction (double-ring effect)
    ctx.save();
    ctx.rotate(-pup.rot * 0.7);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
    ctx.beginPath();
    for (let s = 0; s < 6; s++) {
        const angle = (Math.PI / 3) * s + Math.PI / 6;
        const radius = 17.5 * pup.pulseScale;
        const hx = Math.cos(angle) * radius;
        const hy = Math.sin(angle) * radius;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 3. Fill background circle
    ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 11 * pup.pulseScale, 0, Math.PI * 2);
    ctx.fill();

    // 4. Select the pixel sprite
    let sprite = SHIELD_POWERUP_SPRITE;
    if (pup.type === 'WEAPONS') sprite = WEAPONS_POWERUP_SPRITE;
    else if (pup.type === 'EMP') sprite = EMP_POWERUP_SPRITE;
    else if (pup.type === 'SLOWMO') sprite = SLOWMO_POWERUP_SPRITE;
    else if (pup.type === 'MAGNET') sprite = MAGNET_POWERUP_SPRITE;
    else if (pup.type === 'OVERCHARGE') sprite = OVERCHARGE_POWERUP_SPRITE;
    else if (pup.type === 'DRONE') sprite = DRONE_POWERUP_SPRITE;
    else if (pup.type === 'PERMAWEAPON') sprite = PERMAWEAPON_POWERUP_SPRITE;

    // 5. Draw the pixel art sprite (upscaled)
    const colorMap = {
        1: '#ffffff',
        2: pup.color,
        3: '#ffea00'
    };
    drawMultiPixelSprite(sprite, 0, 0, 1.45 * pup.pulseScale, colorMap, pup.glow);
    
    ctx.restore();
}

function renderEntities() {
    // 1. Draw Exhaust/Trail Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.alpha;
        
        if (p.type === 'smoke') {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.type === 'shockwave') {
            ctx.save();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3.5;
            ctx.shadowBlur = 15;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (p.type === 'text') {
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.font = "bold 11px 'Geist Mono', 'Courier New', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    });
    ctx.globalAlpha = 1.0; // Reset global alpha

    // 2. Draw Player Laser Bullets (Batched or Custom)
    bullets.forEach(b => {
        if (b.plasma) {
            ctx.save();
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (b.homing) {
            ctx.save();
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = b.color;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y - 7);
            ctx.lineTo(b.x + 3.5, b.y);
            ctx.lineTo(b.x, b.y + 7);
            ctx.lineTo(b.x - 3.5, b.y);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y - 4);
            ctx.lineTo(b.x + 1.5, b.y);
            ctx.lineTo(b.x, b.y + 4);
            ctx.lineTo(b.x - 1.5, b.y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (b.rail) {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffffff';
            ctx.fillRect(b.x - 2, b.y - 10, 4, 20);
            ctx.restore();
        } else {
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x - 3, b.y - 7, 6, 14);
        }
    });
    ctx.fillStyle = '#ffffff';
    bullets.forEach(b => {
        if (!b.plasma && !b.homing && !b.rail) {
            ctx.fillRect(b.x - 1, b.y - 5, 2, 10);
        }
    });

    // 3. Draw Enemy Projectiles (Batched)
    enemyProjectiles.forEach(ep => {
        if (ep.type === 'boss_bullet') {
            ctx.save();
            ctx.fillStyle = ep.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = ep.color;
            
            ctx.beginPath();
            if (ep.bossLevel === 1) {
                // Sentinel twin cyan electric ring / disc
                ctx.arc(ep.x, ep.y, 6 + Math.sin(Date.now() / 80) * 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            } else if (ep.bossLevel === 2) {
                // Voidreaper ghostly magenta flare ball with smaller tail
                ctx.arc(ep.x, ep.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(ep.x - (ep.vx || 0) * 1.5, ep.y - ep.vy * 1.5, 2.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (ep.bossLevel === 3) {
                // Omega Nexus heavy red fire sphere with gold core
                ctx.arc(ep.x, ep.y, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(ep.x, ep.y, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Procedural boss custom colored energy ball
                ctx.arc(ep.x, ep.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(ep.x, ep.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else {
            ctx.fillStyle = ep.color;
            ctx.fillRect(ep.x - 4, ep.y - 4, 8, 8);
        }
    });

    ctx.fillStyle = '#ffffff';
    enemyProjectiles.forEach(ep => {
        if (ep.type !== 'boss_bullet') {
            ctx.fillRect(ep.x - 1.5, ep.y - 1.5, 3, 3);
        }
    });

    // 4. Draw Spaceship
    drawSpaceship(player.x, player.y);

    // 4.5. Draw friendly Support Drones (Firewall Shield in front of player)
    if (player.drones.length > 0) {
        player.drones.forEach((drone, idx) => {
            let xOffset = 0;
            let yOffset = -35;
            if (idx === 1) { xOffset = -22; yOffset = -28; }
            else if (idx === 2) { xOffset = 22; yOffset = -28; }

            const droneX = player.x + xOffset;
            const droneY = player.y + yOffset;

            ctx.save();
            ctx.strokeStyle = 'rgba(80, 250, 123, 0.4)';
            ctx.lineWidth = 1.0;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(player.x, player.y - 12);
            ctx.lineTo(droneX, droneY + 6);
            ctx.stroke();
            ctx.setLineDash([]);

            const img = spriteCache.supportDrone;
            ctx.drawImage(img, droneX - img.width / 2, droneY - img.height / 2);

            // Draw health indicators (3 ticks) above drone
            const tickW = 6;
            const tickH = 3;
            const startX = droneX - 10;
            const tickY = droneY - 14;

            for (let h = 0; h < 3; h++) {
                ctx.fillStyle = h < drone.health ? '#50fa7b' : '#333333';
                ctx.fillRect(startX + h * 7, tickY, tickW, tickH);
            }
            ctx.restore();
        });
    }

    // 4.7. Draw Permanent Wing Weapons if active
    if (player.permaWeaponType) {
        const wt = player.permaWeaponType;
        ctx.save();
        
        let color = '#ff00aa';
        if (wt === 'PLASMA') color = '#50fa7b';
        else if (wt === 'SPREAD') color = '#ffea00';
        else if (wt === 'MISSILE') color = '#8be9fd';
        else if (wt === 'BEAM') color = '#ffffff';

        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;

        if (wt === 'CANNONS') {
            // Left Wing Cannon barrels
            ctx.fillRect(player.x - 20, player.y - 6, 4, 12);
            ctx.strokeRect(player.x - 20, player.y - 6, 4, 12);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(player.x - 19, player.y - 10, 2, 4);

            // Right Wing Cannon barrels
            ctx.fillStyle = color;
            ctx.fillRect(player.x + 16, player.y - 6, 4, 12);
            ctx.strokeRect(player.x + 16, player.y - 6, 4, 12);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(player.x + 17, player.y - 10, 2, 4);
        } else if (wt === 'PLASMA') {
            // Round green plasma generators
            ctx.beginPath();
            ctx.arc(player.x - 18, player.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(player.x + 18, player.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner white glow dots
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(player.x - 18, player.y, 2, 0, Math.PI * 2);
            ctx.arc(player.x + 18, player.y, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (wt === 'SPREAD') {
            // Angled yellow wings spread outward
            ctx.beginPath();
            ctx.moveTo(player.x - 16, player.y + 4);
            ctx.lineTo(player.x - 23, player.y - 4);
            ctx.lineTo(player.x - 20, player.y - 7);
            ctx.lineTo(player.x - 14, player.y + 1);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(player.x + 16, player.y + 4);
            ctx.lineTo(player.x + 23, player.y - 4);
            ctx.lineTo(player.x + 20, player.y - 7);
            ctx.lineTo(player.x + 14, player.y + 1);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (wt === 'MISSILE') {
            // Rocket pods (horizontal rectangles with tiny red missile tips)
            ctx.fillRect(player.x - 21, player.y - 4, 6, 10);
            ctx.strokeRect(player.x - 21, player.y - 4, 6, 10);
            ctx.fillRect(player.x + 15, player.y - 4, 6, 10);
            ctx.strokeRect(player.x + 15, player.y - 4, 6, 10);

            ctx.fillStyle = '#ff3300';
            ctx.fillRect(player.x - 20, player.y - 7, 4, 3);
            ctx.fillRect(player.x + 16, player.y - 7, 4, 3);
        } else if (wt === 'BEAM') {
            // Long white railgun barrels extending forward
            ctx.fillRect(player.x - 19, player.y - 15, 3, 20);
            ctx.strokeRect(player.x - 19, player.y - 15, 3, 20);
            ctx.fillRect(player.x + 16, player.y - 15, 3, 20);
            ctx.strokeRect(player.x + 16, player.y - 15, 3, 20);
        }
        ctx.restore();
    }

    // 5. Draw Enemies
    bugs.forEach(bug => {
        const isHitFlashing = bug.hitFlash > 0;
        bug.hitFlash = Math.max(0, bug.hitFlash - 1);
        
        let color = bug.color;
        let glow = bug.glow;
        
        if (isHitFlashing) {
            color = '#ffffff';
            glow = '#ffffff';
        }
        
        if (bug.type === 'cube') {
            bug.rotX += bug.rotSpeedX;
            bug.rotY += bug.rotSpeedY;
            drawWireframeCube(bug.x, bug.y, bug.width, bug.rotX, bug.rotY);
        } else if (bug.type === 'bug') {
            if (isHitFlashing) {
                const flap = Math.sin(Date.now() / 110) > 0;
                const sprite = flap ? BUG_SPRITE : BUG_SPRITE_FLAP;
                drawPixelSprite(sprite, bug.x, bug.y, 2.2, color, glow);
            } else {
                const flap = Math.sin(Date.now() / 110) > 0;
                const img = flap ? spriteCache.bugFlap1 : spriteCache.bugFlap2;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }
        } else if (bug.type === 'orb') {
            if (isHitFlashing) {
                const pulse = 1.0 + Math.sin(Date.now() / 130) * 0.15;
                ctx.save();
                ctx.translate(bug.x, bug.y);
                ctx.scale(pulse, pulse);
                drawPixelSprite(VIRUS_SPRITE, 0, 0, 2.4, color, glow);
                ctx.restore();
            } else {
                const pulse = 1.0 + Math.sin(Date.now() / 130) * 0.15;
                const img = spriteCache.orb;
                ctx.save();
                ctx.translate(bug.x, bug.y);
                ctx.scale(pulse, pulse);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                ctx.restore();
            }
        } else if (bug.type === 'swarm') {
            if (isHitFlashing) {
                drawPixelSprite(SWARM_SPRITE, bug.x, bug.y, 2.0, color, glow);
            } else {
                const img = spriteCache.swarm;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }
        } else if (bug.type === 'drone') {
            if (isHitFlashing) {
                drawPixelSprite(DRONE_SPRITE, bug.x, bug.y, 2.6, color, glow);
            } else {
                const img = spriteCache.drone;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }
        } else if (bug.type === 'phantom') {
            if (isHitFlashing) {
                drawPixelSprite(PHANTOM_SPRITE, bug.x, bug.y, 2.4, color, glow);
            } else {
                const img = spriteCache.phantom;
                ctx.save();
                ctx.globalAlpha = bug.alpha;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
                ctx.restore();
            }
        } else if (bug.type === 'guardian') {
            if (isHitFlashing) {
                drawPixelSprite(GUARDIAN_SPRITE, bug.x, bug.y, 2.4, color, glow);
            } else {
                const img = spriteCache.guardian;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
                
                // Draw energy shield arc in front (pointing downwards)
                if (bug.shieldHealth > 0) {
                    ctx.save();
                    ctx.strokeStyle = '#f1fa8c';
                    ctx.lineWidth = 2.5;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#f1fa8c';
                    ctx.beginPath();
                    ctx.arc(bug.x, bug.y + 4, bug.width / 2 + 3, 0, Math.PI);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        } else if (bug.type === 'bomber') {
            if (isHitFlashing) {
                drawPixelSprite(BOMBER_SPRITE, bug.x, bug.y, 2.4, color, glow);
            } else {
                const img = spriteCache.bomber;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }
        } else if (bug.type === 'mine') {
            const isBlinking = Math.sin(bug.blinkTime * 1.5) > 0;
            ctx.save();
            if (isBlinking) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff5555';
            }
            const img = spriteCache.mine;
            ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            ctx.restore();
        } else if (bug.type === 'sniper') {
            if (isHitFlashing) {
                drawPixelSprite(SNIPER_SPRITE, bug.x, bug.y, 2.4, color, glow);
            } else {
                const img = spriteCache.sniper;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }

            // Draw Aim Warning line or Laser Beam
            if (bug.hovering) {
                if (bug.laserActive) {
                    // Draw thick laser beam
                    ctx.save();
                    // Clip to prevent bottom border artifacts from shadowBlur
                    ctx.beginPath();
                    ctx.rect(0, 0, canvas.width, canvas.height - 10);
                    ctx.clip();

                    ctx.strokeStyle = '#50fa7b';
                    ctx.lineWidth = 10 + Math.sin(Date.now() / 20) * 3;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#50fa7b';
                    ctx.beginPath();
                    ctx.moveTo(bug.x, bug.y + 14);
                    ctx.lineTo(bug.x, canvas.height - 12);
                    ctx.stroke();

                    // White core
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.moveTo(bug.x, bug.y + 14);
                    ctx.lineTo(bug.x, canvas.height - 12);
                    ctx.stroke();
                    ctx.restore();
                } else if (bug.chargeTimer < 90) {
                    // Draw warning aim line
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 85, 85, 0.45)';
                    ctx.lineWidth = 1.0;
                    ctx.setLineDash([2, 4]);
                    ctx.beginPath();
                    ctx.moveTo(bug.x, bug.y + 12);
                    ctx.lineTo(bug.x, canvas.height - 12);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        } else if (bug.type === 'carrier') {
            if (isHitFlashing) {
                drawPixelSprite(CARRIER_SPRITE, bug.x, bug.y, 2.4, color, glow);
            } else {
                const img = spriteCache.carrier;
                ctx.drawImage(img, bug.x - img.width / 2, bug.y - img.height / 2);
            }

            // Draw boss health bar
            ctx.save();
            const barW = 44;
            const barH = 3;
            const bx = bug.x - barW / 2;
            const by = bug.y - 24;
            ctx.fillStyle = 'rgba(10, 10, 15, 0.7)';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = '#bd93f9';
            ctx.fillRect(bx, by, (bug.health / bug.maxHealth) * barW, barH);
            ctx.restore();
        } else if (bug.type === 'cube_shard') {
            ctx.save();
            ctx.translate(bug.x, bug.y);
            ctx.rotate(Date.now() / 80);
            ctx.shadowBlur = 4;
            ctx.shadowColor = glow;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.6;
            ctx.strokeRect(-4, -4, 8, 8);
            ctx.restore();
        }
    });

    // 6. Draw Collectibles
    fragments.forEach(frag => {
        drawFragment(frag);
    });

    // 6.5. Draw Power-ups
    powerups.forEach(pup => {
        drawPowerUp(pup);
    });

    // 6.7. Draw Active Power-ups HUD indicators (at the bottom-middle)
    if (gameState === STATE_RUNNING) {
        const activePups = [];
        if (player.shieldTime > 0) activePups.push({ label: 'SHIELD', time: player.shieldTime, max: 480, color: '#00f0ff' });
        if (player.weaponUpgradeTime > 0) activePups.push({ label: 'HYPER BLASTER', time: player.weaponUpgradeTime, max: 480, color: '#ff00ff' });
        if (player.slowMotionTime > 0) activePups.push({ label: 'TIME WARP', time: player.slowMotionTime, max: 360, color: '#bd93f9' });
        if (player.magnetTime > 0) activePups.push({ label: 'COIN MAGNET', time: player.magnetTime, max: 480, color: '#ffea00' });
        if (player.overchargeTime > 0) activePups.push({ label: 'OVERCHARGE', time: player.overchargeTime, max: 360, color: '#ff5555' });
        
        if (player.drones.length > 0) {
            const sumHealth = player.drones.reduce((acc, d) => acc + d.health, 0);
            const maxHealth = player.drones.length * 3;
            activePups.push({ 
                label: 'FIREWALL DRONES', 
                time: sumHealth, 
                max: maxHealth, 
                color: '#50fa7b', 
                isDrones: true,
                count: player.drones.length 
            });
        }
        
        if (player.permaWeaponType) {
            let labelText = 'WING CANNONS';
            let color = '#ff00aa';
            if (player.permaWeaponType === 'PLASMA') { labelText = 'PLASMA ORBS'; color = '#50fa7b'; }
            else if (player.permaWeaponType === 'SPREAD') { labelText = 'SPREAD SHOT'; color = '#ffea00'; }
            else if (player.permaWeaponType === 'MISSILE') { labelText = 'HOMING MISSILES'; color = '#8be9fd'; }
            else if (player.permaWeaponType === 'BEAM') { labelText = 'RAIL BEAM'; color = '#ffffff'; }

            activePups.push({ label: labelText, time: 1, max: 1, color: color, isPermanent: true });
        }

        if (activePups.length > 0) {
            ctx.save();
            const barW = 140;
            const barH = 10;
            const startX = canvas.width / 2 - barW / 2;
            let currentY = canvas.height - 85 - (activePups.length * 15);
            
            activePups.forEach(pup => {
                // Background shadow container
                ctx.fillStyle = 'rgba(10, 10, 15, 0.7)';
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(startX, currentY, barW, barH, 4);
                } else {
                    ctx.rect(startX, currentY, barW, barH);
                }
                ctx.fill();
                ctx.stroke();
                
                // Active fill bar
                const fillWidth = Math.max(0, Math.min(barW - 2, (pup.time / pup.max) * (barW - 2)));
                ctx.fillStyle = pup.color;
                ctx.shadowBlur = 8;
                ctx.shadowColor = pup.color;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(startX + 1, currentY + 1, fillWidth, barH - 2, 3);
                } else {
                    ctx.rect(startX + 1, currentY + 1, fillWidth, barH - 2);
                }
                ctx.fill();
                
                // Text label
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                ctx.font = "900 7.5px 'Geist Mono', monospace";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                if (pup.isDrones) {
                    ctx.fillText(`${pup.label} : ${pup.count} DRONE(S) (${pup.time} STRIKES)`, canvas.width / 2, currentY + barH / 2);
                } else if (pup.isPermanent) {
                    ctx.fillText(`${pup.label} : PERMANENT`, canvas.width / 2, currentY + barH / 2);
                } else {
                    ctx.fillText(`${pup.label} : ${Math.ceil(pup.time / 60)}s`, canvas.width / 2, currentY + barH / 2);
                }
                
                currentY += 14;
            });
            ctx.restore();
        }
    }

    renderBossSystem(getGameContext());
}

// -------------------------------------------------------------
// MUSIC VISUALIZER EFFECT (SIMULATED OR AUDIO SYNCD)
// -------------------------------------------------------------

function tickVisualizer() {
    if (!visualizerBars || !visualizerBars.length) {
        visualizerBars = document.querySelectorAll('.v-bar');
        if (!visualizerBars || !visualizerBars.length) return;
    }

    const reaction = getMusicReactionData();
    const hasActiveMusic = reaction && (reaction.isPlaying || (reaction.volume > 0.01));

    visualizerBars.forEach((bar, idx) => {
        let targetHeight = 3;

        if (hasActiveMusic) {
            // Use the real frequency band value!
            const bandVal = reaction.bands[idx] || 0;
            // Map 0-1 to 2px - 16px range
            targetHeight = 2 + bandVal * 15;
        } else {
            // Idle simulated pulse
            const timeSeed = Date.now() / 350;
            const waveVal = Math.sin(timeSeed + idx * 0.5);
            targetHeight = 2 + Math.abs(waveVal) * 4;
        }

        if (targetHeight < 2) targetHeight = 2;
        if (targetHeight > 16) targetHeight = 16;

        bar.style.height = `${targetHeight}px`;
    });
}
