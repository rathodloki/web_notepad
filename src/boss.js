// boss.js — Boss System for LightPad Retro Space Shooter
// Manages boss encounters, recovery station, checkpoints, and procedural boss generation.
// NO AUDIO — the game uses a streaming radio for music, no Web Audio for bosses.

// =============================================================
// SECTION 1: CONSTANTS & CONFIG
// =============================================================

const SCRIPTED_THRESHOLDS = [1000, 2250, 4450];
const BOSS_NAMES = ['SENTINEL MK-I', 'VOIDREAPER', 'OMEGA NEXUS'];
const WARNING_RANGE = 200; // Points before threshold to start warning
const CHECKPOINT_KEY = 'lightpad_game_checkpoint';

const RECOVERY_TRANSITION_TIME = 120; // ~2s at 60fps
const RECOVERY_DOCKING_TIME = 240;    // ~4s
const BOSS_ENTRY_TIME = 120;          // ~2s
const BOSS_VICTORY_TIME = 180;        // ~3s

// =============================================================
// SECTION 2: STATE VARIABLES
// =============================================================

let boss = null;
let bossState = 'NONE'; // NONE | WARNING | RECOVERY | ENTERING | ACTIVE | DEFEATED

let currentBossLevel = 0;
let bossesDefeated = [];
let recoveryTimer = 0;
let recoveryPhase = 0; // 0=transition, 1=docking
let warningAlpha = 0;
let victoryTimer = 0;
let bossDeathReward = null;
let maxComboBonus = 0;
let bossSpriteCache = {};
let recoveryHealProgress = 0;
let recoveryDronesAttached = 0;
let bossEntryY = 0;
let lastBossThreshold = 4450;
let scoreAtLastBossDefeat = 0;
let timeSinceLastBoss = 0;

// =============================================================
// SECTION 3: BOSS SPRITE DEFINITIONS (Hand-crafted pixel art)
// =============================================================

// SENTINEL MK-I: Armored battleship drone (20×16)
// 0=transparent, 1=white edge, 2=cyan body, 3=blue accent
const BOSS1_SPRITE = [
    [0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,2,3,3,3,3,2,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,2,3,3,2,2,3,3,2,1,0,0,0,0,0],
    [0,0,0,0,1,2,2,3,2,2,2,2,3,2,2,1,0,0,0,0],
    [0,0,1,1,2,2,1,1,2,3,3,2,1,1,2,2,1,1,0,0],
    [0,1,2,2,2,1,0,1,3,3,3,3,1,0,1,2,2,2,1,0],
    [1,2,2,2,1,0,0,1,2,3,3,2,1,0,0,1,2,2,2,1],
    [1,2,3,1,0,0,1,2,2,2,2,2,2,1,0,0,1,3,2,1],
    [1,2,2,1,0,1,2,3,2,2,2,2,3,2,1,0,1,2,2,1],
    [0,1,2,1,1,2,2,3,3,2,2,3,3,2,2,1,1,2,1,0],
    [0,0,1,2,2,2,1,2,3,3,3,3,2,1,2,2,2,1,0,0],
    [0,0,0,1,2,1,0,1,2,2,2,2,1,0,1,2,1,0,0,0],
    [0,0,0,0,1,0,0,0,1,3,3,1,0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,1,2,2,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
];

// VOIDREAPER: Ghostly phantom entity (24×18)
// 0=transparent, 1=white eyes, 2=magenta body, 3=purple tendrils
const BOSS2_SPRITE = [
    [0,0,0,0,0,0,0,0,0,3,3,0,0,3,3,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,3,2,2,3,3,2,2,3,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,3,2,2,2,2,2,2,2,2,3,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,3,2,2,1,2,2,2,2,1,2,2,3,0,0,0,0,0,0],
    [0,0,0,0,0,3,2,2,1,1,2,2,2,2,1,1,2,2,3,0,0,0,0,0],
    [0,0,0,0,3,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,0,0,0,0],
    [0,0,0,3,2,2,2,2,2,3,2,2,2,2,3,2,2,2,2,2,3,0,0,0],
    [0,0,3,2,2,2,2,3,3,3,2,2,2,2,3,3,3,2,2,2,2,3,0,0],
    [0,3,2,2,2,3,3,0,0,3,2,2,2,2,3,0,0,3,3,2,2,2,3,0],
    [3,2,2,2,3,0,0,0,0,0,2,2,2,2,0,0,0,0,0,3,2,2,2,3],
    [3,2,2,3,0,0,0,0,0,0,3,2,2,3,0,0,0,0,0,0,3,2,2,3],
    [0,3,2,3,0,0,0,0,0,3,2,2,2,2,3,0,0,0,0,0,3,2,3,0],
    [0,0,3,2,3,0,0,0,3,2,2,3,3,2,2,3,0,0,0,3,2,3,0,0],
    [0,0,0,3,2,3,0,3,2,2,3,0,0,3,2,2,3,0,3,2,3,0,0,0],
    [0,0,0,0,3,2,3,2,2,3,0,0,0,0,3,2,2,3,2,3,0,0,0,0],
    [0,0,0,0,0,3,3,2,3,0,0,0,0,0,0,3,2,3,3,0,0,0,0,0],
    [0,0,0,0,0,0,3,3,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0],
];

// OMEGA NEXUS: Geometric fortress (28×20)
// 0=transparent, 1=white edge, 2=red hull, 3=gold core, 4=dark red depth
const BOSS3_SPRITE = [
    [0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,1,1,2,2,3,3,2,2,1,1,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,1,2,2,2,3,3,3,3,2,2,2,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,2,2,4,2,3,1,1,3,2,4,2,2,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,2,2,4,4,2,3,3,3,3,2,4,4,2,2,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,2,2,4,4,2,2,2,3,3,2,2,2,4,4,2,2,1,1,0,0,0,0],
    [0,0,0,1,2,2,2,4,4,2,2,1,2,3,3,2,1,2,2,4,4,2,2,2,1,0,0,0],
    [0,0,1,2,2,4,4,4,2,2,1,0,1,3,3,1,0,1,2,2,4,4,4,2,2,1,0,0],
    [0,1,2,2,4,4,2,2,2,1,0,0,1,3,3,1,0,0,1,2,2,2,4,4,2,2,1,0],
    [1,2,2,4,4,2,2,1,1,0,0,1,3,3,3,3,1,0,0,1,1,2,2,4,4,2,2,1],
    [1,2,2,4,4,2,2,1,1,0,0,1,3,3,3,3,1,0,0,1,1,2,2,4,4,2,2,1],
    [0,1,2,2,4,4,2,2,2,1,0,0,1,3,3,1,0,0,1,2,2,2,4,4,2,2,1,0],
    [0,0,1,2,2,4,4,4,2,2,1,0,1,3,3,1,0,1,2,2,4,4,4,2,2,1,0,0],
    [0,0,0,1,2,2,2,4,4,2,2,1,2,3,3,2,1,2,2,4,4,2,2,2,1,0,0,0],
    [0,0,0,0,1,1,2,2,4,4,2,2,2,3,3,2,2,2,4,4,2,2,1,1,0,0,0,0],
    [0,0,0,0,0,0,1,2,2,4,4,2,3,3,3,3,2,4,4,2,2,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,1,2,2,4,2,3,1,1,3,2,4,2,2,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,1,2,2,2,3,3,3,3,2,2,2,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,1,1,2,2,3,3,2,2,1,1,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
];

// Shield segment sprite for Omega Nexus (6×6)
const SHIELD_SEG_SPRITE = [
    [0,1,1,1,1,0],
    [1,2,2,2,2,1],
    [1,2,3,3,2,1],
    [1,2,3,3,2,1],
    [1,2,2,2,2,1],
    [0,1,1,1,1,0],
];

// =============================================================
// SECTION 4: PROCEDURAL SPRITE GENERATOR
// =============================================================

function seededRNG(seed) {
    let s = Math.abs(seed) || 1;
    return function() {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
    };
}

// Procedural body templates removed in favor of vector drawing

const PROC_PALETTES = [
    { 1:'#ffffff', 2:'#ff3366', 3:'#ff99bb', 4:'#880033' },
    { 1:'#ffffff', 2:'#00ff88', 3:'#88ffcc', 4:'#005533' },
    { 1:'#ffffff', 2:'#ff8800', 3:'#ffcc66', 4:'#663300' },
    { 1:'#ffffff', 2:'#aa44ff', 3:'#dd99ff', 4:'#440066' },
    { 1:'#ffffff', 2:'#ff0044', 3:'#ff6688', 4:'#660022' },
    { 1:'#ffffff', 2:'#00ccff', 3:'#66ddff', 4:'#003366' },
    { 1:'#ffffff', 2:'#ffdd00', 3:'#ffee88', 4:'#664400' },
    { 1:'#ffffff', 2:'#ff44aa', 3:'#ff88cc', 4:'#660044' },
];

const PROC_PREFIXES = ['ZERO','VOID','DARK','IRON','NOVA','DREAD','HYPER','CHAOS'];
const PROC_SUFFIXES = ['CORE','MIND','BANE','FURY','KING','LORD','WYRM','STAR'];

function toRoman(num) {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let r = '';
    for (let i = 0; i < vals.length; i++) {
        while (num >= vals[i]) { r += syms[i]; num -= vals[i]; }
    }
    return r;
}

// Procedural matrix generators removed in favor of vector drawing

function getProceduralBossName(level) {
    const p = PROC_PREFIXES[level % PROC_PREFIXES.length];
    const s = PROC_SUFFIXES[(level * 3) % PROC_SUFFIXES.length];
    return `${p} ${s} ${toRoman(level)}`;
}

// =============================================================
// SECTION 5: SPRITE CACHE (offscreen canvas rendering)
// =============================================================

// Sprite rendering cache removed in favor of vector drawing

// =============================================================
// SECTION 6: BOSS FACTORY
// =============================================================

function createScriptedBoss(level, canvasW, canvasH) {
    const defs = {
        1: {
            name: BOSS_NAMES[0],
            sprite: BOSS1_SPRITE,
            pixelSize: 4.0,
            colorMap: { 1:'#ffffff', 2:'#00f0ff', 3:'#3b82f6' },
            glowColor: 'rgba(0, 240, 255, 0.7)',
            color: '#00f0ff',
            width: 110, height: 120,
            maxHealth: 45,
            enterY: 115,
            movePattern: 'patrol',
            moveSpeed: 1.2,
            phaseThresholds: [0.66, 0.33],
            attacks: {
                pulse_volley: { cooldown: 0, maxCooldown: 120, chargeTime: 30, type: 'basic' },
                magnetic_pulse: { cooldown: 150, maxCooldown: 240, chargeTime: 40, activeTime: 90, type: 'unique', phase: 1 },
                rapid_burst: { cooldown: 200, maxCooldown: 180, chargeTime: 20, type: 'basic', phase: 2 },
                ion_cascade: { cooldown: 300, maxCooldown: 360, chargeTime: 90, activeTime: 120, type: 'main', phase: 3 }
            }
        },
        2: {
            name: BOSS_NAMES[1],
            sprite: BOSS2_SPRITE,
            pixelSize: 4.0,
            colorMap: { 1:'#ffffff', 2:'#ff79c6', 3:'#bd93f9' },
            glowColor: 'rgba(255, 121, 198, 0.7)',
            color: '#ff79c6',
            width: 140, height: 110,
            maxHealth: 80,
            enterY: 125,
            movePattern: 'teleport',
            moveSpeed: 0,
            teleportTimer: 0,
            teleportCooldown: 180,
            positions: [],
            phaseThresholds: [0.66, 0.33],
            attacks: {
                shadow_bolts: { cooldown: 0, maxCooldown: 150, chargeTime: 25, type: 'basic' },
                void_gravity_well: { cooldown: 180, maxCooldown: 240, chargeTime: 40, activeTime: 180, type: 'unique', phase: 1 },
                void_rift: { cooldown: 250, maxCooldown: 300, chargeTime: 40, type: 'unique', phase: 2 },
                phase_dash: { cooldown: 350, maxCooldown: 400, chargeTime: 90, activeTime: 60, type: 'unique', phase: 2 },
                abyssal_storm: { cooldown: 400, maxCooldown: 350, chargeTime: 60, type: 'main', phase: 3 }
            }
        },
        3: {
            name: BOSS_NAMES[2],
            sprite: BOSS3_SPRITE,
            pixelSize: 4.0,
            colorMap: { 1:'#ffffff', 2:'#ff5555', 3:'#ffd700', 4:'#8b0000' },
            glowColor: 'rgba(255, 85, 85, 0.7)',
            color: '#ff5555',
            width: 170, height: 120,
            maxHealth: 140,
            enterY: 135,
            movePattern: 'stationary',
            moveSpeed: 0,
            rotAngle: 0,
            phaseThresholds: [0.75, 0.50, 0.25],
            shields: [
                { angle: 0, health: 5, maxHealth: 5 },
                { angle: Math.PI/2, health: 5, maxHealth: 5 },
                { angle: Math.PI, health: 5, maxHealth: 5 },
                { angle: 3*Math.PI/2, health: 5, maxHealth: 5 }
            ],
            shieldRadius: 85,
            shieldRotSpeed: 0.012,
            attacks: {
                tri_burst: { cooldown: 0, maxCooldown: 100, chargeTime: 15, type: 'basic' },
                shield_overdrive: { cooldown: 120, maxCooldown: 240, chargeTime: 40, activeTime: 120, type: 'unique', phase: 1 },
                seeker_mines: { cooldown: 150, maxCooldown: 250, chargeTime: 30, type: 'basic', phase: 1 },
                turret_lock: { cooldown: 200, maxCooldown: 200, chargeTime: 40, type: 'basic', phase: 2 },
                nova_barrage: { cooldown: 300, maxCooldown: 300, chargeTime: 120, type: 'main', phase: 2 },
                beam_sweep: { cooldown: 400, maxCooldown: 400, chargeTime: 60, activeTime: 240, type: 'main', phase: 3 },
                omega_purge: { cooldown: 500, maxCooldown: 99999, chargeTime: 180, type: 'masterstroke', phase: 4, used: false }
            }
        }
    };

    const def = defs[level];

    const b = {
        name: def.name,
        level,
        x: canvasW / 2,
        y: -def.height,
        width: def.width,
        height: def.height,
        vx: def.moveSpeed,
        vy: 0,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        phase: 1,
        phaseThresholds: def.phaseThresholds,
        currentAttack: null,
        attacks: JSON.parse(JSON.stringify(def.attacks)),
        sprite: def.sprite,
        spriteImg: null,
        pixelSize: def.pixelSize,
        colorMap: { ...def.colorMap },
        color: def.color,
        glowColor: def.glowColor,
        hitFlash: 0,
        enterY: def.enterY,
        movePattern: def.movePattern,
        moveSpeed: def.moveSpeed,
        shields: def.shields ? JSON.parse(JSON.stringify(def.shields)) : null,
        shieldRadius: def.shieldRadius || 0,
        shieldRotSpeed: def.shieldRotSpeed || 0,
        rotAngle: def.rotAngle || 0,
        teleportTimer: def.teleportTimer || 0,
        teleportCooldown: def.teleportCooldown || 180,
        afterimages: [],
        activeBeams: [],
        dashDir: 0,
        dashActive: false,
    };

    // Setup teleport positions for Voidreaper
    if (def.movePattern === 'teleport') {
        b.positions = [
            { x: canvasW * 0.25, y: 125 },
            { x: canvasW * 0.5, y: 105 },
            { x: canvasW * 0.75, y: 125 }
        ];
        b.currentPosIdx = 1;
    }

    return b;
}

function createProceduralBoss(level, canvasW, canvasH) {
    const hp = 140 + (level - 3) * 60;
    const palette = PROC_PALETTES[level % PROC_PALETTES.length];
    const name = getProceduralBossName(level);
    
    // Scale boss dimensions dynamically according to level
    const scaleFactor = 1.0 + (level - 3) * 0.08;
    const w = Math.round(110 * scaleFactor);
    const h = Math.round(90 * scaleFactor);

    const numPhases = Math.min(4, 2 + Math.floor((level - 3) / 2));
    const thresholds = [];
    for (let i = 1; i < numPhases; i++) {
        thresholds.push(1.0 - (i / numPhases));
    }

    // Build attack pool
    const attackDefs = buildProceduralAttacks(level);

    const movePatterns = ['patrol', 'teleport', 'patrol', 'stationary'];
    const movePattern = movePatterns[level % movePatterns.length];

    const b = {
        name,
        level,
        x: canvasW / 2,
        y: -h,
        width: w,
        height: h,
        vx: movePattern === 'patrol' ? (1.0 + (level - 3) * 0.15) : 0,
        vy: 0,
        health: hp,
        maxHealth: hp,
        phase: 1,
        phaseThresholds: thresholds,
        currentAttack: null,
        attacks: attackDefs,
        sprite: null,
        spriteImg: null,
        pixelSize: 4.0,
        colorMap: { ...palette },
        color: palette[2],
        glowColor: `${palette[2]}99`,
        hitFlash: 0,
        enterY: 125,
        movePattern,
        moveSpeed: movePattern === 'patrol' ? (1.0 + (level - 3) * 0.15) : 0,
        shields: null,
        shieldRadius: 0,
        shieldRotSpeed: 0,
        rotAngle: 0,
        teleportTimer: 0,
        teleportCooldown: Math.max(100, 180 - (level - 3) * 10),
        afterimages: [],
        activeBeams: [],
        dashDir: 0,
        dashActive: false,
    };

    if (movePattern === 'teleport') {
        b.positions = [
            { x: canvasW * 0.2, y: 120 },
            { x: canvasW * 0.5, y: 105 },
            { x: canvasW * 0.8, y: 120 }
        ];
        b.currentPosIdx = 1;
    }

    return b;
}

function buildProceduralAttacks(level) {
    const numAttacks = Math.min(8, 3 + Math.floor((level - 3) * 0.5));
    const pool = [
        { key:'spread_volley', maxCooldown:100, chargeTime:20, type:'basic' },
        { key:'homing_bolts', maxCooldown:160, chargeTime:30, type:'basic' },
        { key:'mine_deploy', maxCooldown:220, chargeTime:25, type:'basic' },
        { key:'nova_ring', maxCooldown:280, chargeTime:80, type:'main' },
        { key:'turret_lock', maxCooldown:180, chargeTime:35, type:'basic' },
        { key:'spiral_storm', maxCooldown:320, chargeTime:70, type:'main' },
        { key:'beam_sweep', maxCooldown:380, chargeTime:60, activeTime:200, type:'main' },
        { key:'summon_minions', maxCooldown:350, chargeTime:50, type:'unique' },
    ];

    const rng = seededRNG(level * 1337);
    const selected = {};
    const shuffled = pool.sort(() => rng() - 0.5);
    let phaseAssign = 1;
    for (let i = 0; i < numAttacks && i < shuffled.length; i++) {
        const a = shuffled[i];
        const speedMul = Math.max(0.5, 1.0 - (level - 4) * 0.05);
        selected[a.key] = {
            cooldown: i * 80,
            maxCooldown: Math.floor(a.maxCooldown * speedMul),
            chargeTime: a.chargeTime,
            activeTime: a.activeTime || 0,
            type: a.type,
            phase: phaseAssign
        };
        if (i > 1 && i % 2 === 0) phaseAssign = Math.min(4, phaseAssign + 1);
    }
    return selected;
}

// =============================================================
// SECTION 7: ATTACK HELPERS
// =============================================================

function fireSpread(b, gCtx, count, speed) {
    const ep = gCtx.enemyProjectiles;
    const startAngle = Math.PI / 2 - (count - 1) * 0.12;
    for (let i = 0; i < count; i++) {
        const angle = startAngle + i * 0.24;
        ep.push({
            x: b.x, y: b.y + b.height / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: b.color,
            bossLevel: b.level,
            type: 'boss_bullet'
        });
    }
}

function fireAimed(b, gCtx, count, speed) {
    const ep = gCtx.enemyProjectiles;
    const dx = gCtx.player.x - b.x;
    const dy = gCtx.player.y - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < count; i++) {
        ep.push({
            x: b.x + (Math.random() - 0.5) * 16,
            y: b.y + b.height / 2,
            vx: (dx / dist) * speed + (Math.random() - 0.5) * 0.6,
            vy: (dy / dist) * speed + (Math.random() - 0.5) * 0.6,
            color: b.color,
            bossLevel: b.level,
            type: 'boss_bullet'
        });
    }
}

function fireRing(b, gCtx, count, speed) {
    const ep = gCtx.enemyProjectiles;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        ep.push({
            x: b.x, y: b.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: b.color,
            bossLevel: b.level,
            type: 'boss_bullet'
        });
    }
}

function fireHoming(b, gCtx, count, speed, lifetime) {
    const ep = gCtx.enemyProjectiles;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 0.5;
        ep.push({
            x: b.x + offset * 20, y: b.y + b.height / 2,
            vx: offset * 1.5,
            vy: speed * 0.7,
            color: b.color,
            homing: true,
            lifetime: lifetime || 180,
            bossLevel: b.level,
            type: 'boss_bullet'
        });
    }
}

function fireSpiral(b, gCtx, arms, bulletsPerArm, speed) {
    const ep = gCtx.enemyProjectiles;
    const baseAngle = Date.now() / 500;
    for (let a = 0; a < arms; a++) {
        for (let i = 0; i < bulletsPerArm; i++) {
            const angle = baseAngle + (Math.PI * 2 / arms) * a + i * 0.35;
            const s = speed * (0.6 + i * 0.15);
            ep.push({
                x: b.x, y: b.y,
                vx: Math.cos(angle) * s,
                vy: Math.sin(angle) * s,
                color: b.color,
                bossLevel: b.level,
                type: 'boss_bullet'
            });
        }
    }
}

function deployMines(b, gCtx, count) {
    const bugs = gCtx.bugs;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
        bugs.push({
            type: 'mine',
            x: b.x + Math.cos(angle) * 30,
            y: b.y + Math.sin(angle) * 30 + 20,
            width: 14, height: 14,
            vy: 0.3 + Math.random() * 0.3,
            vx: Math.cos(angle) * 0.5,
            health: 1, damage: 16,
            color: '#ff5555',
            glow: 'rgba(255, 85, 85, 0.7)',
            hitFlash: 0, scoreValue: 5,
            blinkTime: 0
        });
    }
}

function spawnMinions(b, gCtx, count) {
    const bugs = gCtx.bugs;
    for (let i = 0; i < Math.min(count, 6); i++) {
        bugs.push({
            type: 'swarm',
            x: b.x + (i - count/2) * 18,
            y: b.y + b.height / 2 + 10,
            width: 14, height: 14,
            vy: 2.5 + Math.random(),
            vx: (Math.random() - 0.5) * 1.5,
            health: 1, damage: 10,
            color: b.color,
            glow: b.glowColor,
            hitFlash: 0, scoreValue: 15
        });
    }
}

// =============================================================
// SECTION 8: BOSS AI UPDATE
// =============================================================

function getPhaseFromHealth(b) {
    const ratio = b.health / b.maxHealth;
    let phase = 1;
    for (let i = 0; i < b.phaseThresholds.length; i++) {
        if (ratio <= b.phaseThresholds[i]) phase = i + 2;
    }
    return phase;
}

function updateBossMovement(b, dt, gCtx) {
    if (b.movePattern === 'patrol') {
        b.x += b.vx * dt;
        const margin = b.width / 2 + 20;
        if (b.x < margin) { b.x = margin; b.vx = Math.abs(b.vx); }
        if (b.x > gCtx.canvas.width - margin) { b.x = gCtx.canvas.width - margin; b.vx = -Math.abs(b.vx); }
    } else if (b.movePattern === 'teleport' && b.positions) {
        b.teleportTimer -= dt;
        if (b.teleportTimer <= 0) {
            // Teleport to next position
            let nextIdx = (b.currentPosIdx + 1) % b.positions.length;
            if (Math.random() > 0.5) nextIdx = Math.floor(Math.random() * b.positions.length);
            b.currentPosIdx = nextIdx;
            const target = b.positions[nextIdx];
            // Spawn particles at old position
            gCtx.createParticleBurst(b.x, b.y, b.color, 12);
            b.x = target.x;
            b.y = target.y;
            gCtx.createParticleBurst(b.x, b.y, b.color, 12);
            b.teleportTimer = b.teleportCooldown;
        }
    } else if (b.movePattern === 'stationary') {
        b.rotAngle += (b.shieldRotSpeed || 0.005) * dt;
    }

    // Phase dash movement (Voidreaper)
    if (b.dashActive) {
        b.x += b.dashDir * 8 * dt;
        if (b.x < -50 || b.x > gCtx.canvas.width + 50) {
            b.dashActive = false;
            b.x = gCtx.canvas.width / 2;
            b.y = b.enterY;
        }
    }
}

function updateBossAttacks(b, dt, gCtx) {
    // Tick all attack cooldowns
    for (const [name, atk] of Object.entries(b.attacks)) {
        if (atk.cooldown > 0) atk.cooldown -= dt;
    }

    // If currently executing an attack
    if (b.currentAttack) {
        const ca = b.currentAttack;
        ca.timer -= dt;

        if (ca.state === 'charge') {
            // Convergence particles flowing into boss core
            if (Math.random() > 0.35) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 40;
                const px = b.x + Math.cos(angle) * dist;
                const py = b.y + Math.sin(angle) * dist;
                gCtx.createParticleBurst(px, py, b.color, 1);
            }
            if (ca.timer <= 0) {
                // Execute the attack
                executeAttack(b, ca.name, gCtx);
                if (ca.activeTime) {
                    ca.state = 'active';
                    ca.timer = ca.activeTime;
                } else {
                    b.attacks[ca.name].cooldown = b.attacks[ca.name].maxCooldown;
                    b.currentAttack = null;
                }
            }
        } else if (ca.state === 'active') {
            updateActiveAttack(b, ca, dt, gCtx);
            if (ca.timer <= 0) {
                b.attacks[ca.name].cooldown = b.attacks[ca.name].maxCooldown;
                b.currentAttack = null;
                b.activeBeams = [];
            }
        }
        return;
    }

    // Select a new attack
    const available = [];
    for (const [name, atk] of Object.entries(b.attacks)) {
        const requiredPhase = atk.phase || 1;
        if (atk.cooldown <= 0 && b.phase >= requiredPhase) {
            if (atk.used) continue;
            available.push({ name, priority: atk.type === 'masterstroke' ? 10 : (atk.type === 'main' ? 5 : 1) });
        }
    }

    if (available.length === 0) return;

    // Sort by priority, pick highest
    available.sort((a, c) => c.priority - a.priority);
    // Weighted random: main/masterstroke attacks get priority but basics still fire
    let pick;
    if (available[0].priority >= 5 && Math.random() > 0.4) {
        pick = available[0];
    } else {
        pick = available[Math.floor(Math.random() * available.length)];
    }

    const atk = b.attacks[pick.name];
    b.currentAttack = {
        name: pick.name,
        state: 'charge',
        timer: atk.chargeTime,
        activeTime: atk.activeTime || 0
    };
}

function executeAttack(b, name, gCtx) {
    const level = b.level;
    const scaledCount = Math.min(12, 3 + level);

    switch (name) {
        case 'pulse_volley':
            fireSpread(b, gCtx, 3 + Math.floor(b.phase * 0.5), 4.0);
            break;
        case 'magnetic_pulse':
            b.activeBeams = [{ type: 'magnetic_pulse', radius: 0, maxRadius: 280, expandSpeed: 3.2, hitPlayer: false, timer: 90 }];
            break;
        case 'rapid_burst':
            fireAimed(b, gCtx, 5 + b.phase, 5.5);
            break;
        case 'ion_cascade':
            b.activeBeams = [{ x: 0, sweepDir: 1, width: 20, damage: 0.6, timer: 120 }];
            break;
        case 'shadow_bolts':
            fireHoming(b, gCtx, 2, 3.5, 180);
            break;
        case 'void_gravity_well':
            b.activeBeams = [{ type: 'gravity_well', x: gCtx.canvas.width / 2, y: gCtx.canvas.height / 2, radius: 120, pullForce: 0.22, timer: 180 }];
            break;
        case 'void_rift':
            spawnMinions(b, gCtx, Math.min(4, 2 + Math.floor((b.phase - 1) * 0.5)));
            gCtx.createParticleBurst(b.x, b.y, '#bd93f9', 15);
            break;
        case 'phase_dash':
            b.dashActive = true;
            b.dashDir = gCtx.player.x > b.x ? 1 : -1;
            break;
        case 'abyssal_storm':
            fireSpiral(b, gCtx, 4, 4, 3.5);
            break;
        case 'tri_burst':
            for (let v = 0; v < 3; v++) {
                setTimeout(() => { if (boss) fireSpread(b, gCtx, 5, 4.5); }, v * 150);
            }
            break;
        case 'shield_overdrive':
            b.activeBeams = [{ type: 'shield_overdrive', regenRate: 0.03, timer: 120 }];
            if (b.shields) {
                b.shields.forEach(shield => {
                    const angle = shield.angle + b.rotAngle;
                    const sx = b.x + Math.cos(angle) * b.shieldRadius;
                    const sy = b.y + Math.sin(angle) * b.shieldRadius;
                    gCtx.createParticleBurst(sx, sy, '#ffd700', 12);
                });
            }
            break;
        case 'seeker_mines':
            deployMines(b, gCtx, 3 + Math.floor(b.phase * 0.5));
            break;
        case 'turret_lock':
            fireAimed(b, gCtx, 8 + level, 6.0);
            break;
        case 'nova_barrage':
            fireRing(b, gCtx, 24 + level * 2, 3.2);
            gCtx.shakeScreen(3, 300);
            break;
        case 'beam_sweep':
            b.activeBeams = [
                { angle: 0, rotSpeed: 0.018, width: 14, damage: 0.8, timer: 240 },
                { angle: Math.PI, rotSpeed: 0.018, width: 14, damage: 0.8, timer: 240 }
            ];
            break;
        case 'omega_purge':
            b.activeBeams = [];
            // Create grid of laser lines with 2 safe zones
            const safeX1 = gCtx.canvas.width * 0.25;
            const safeX2 = gCtx.canvas.width * 0.75;
            for (let i = 0; i < 6; i++) {
                const lx = (gCtx.canvas.width / 7) * (i + 1);
                if (Math.abs(lx - safeX1) > 40 && Math.abs(lx - safeX2) > 40) {
                    b.activeBeams.push({ x: lx, isVertical: true, width: 22, damage: 1.5, timer: 180 });
                }
            }
            b.attacks.omega_purge.used = true;
            gCtx.shakeScreen(5, 600);
            gCtx.triggerScreenGlitch();
            break;
        // Procedural attacks
        case 'spread_volley':
            fireSpread(b, gCtx, scaledCount, 4.2);
            break;
        case 'homing_bolts':
            fireHoming(b, gCtx, Math.min(4, 2 + Math.floor(level / 2)), 3.5, 150 + level * 20);
            break;
        case 'mine_deploy':
            deployMines(b, gCtx, Math.min(5, 2 + Math.floor(level / 2)));
            break;
        case 'nova_ring':
            fireRing(b, gCtx, 16 + level * 2, 3.0);
            gCtx.shakeScreen(2.5, 200);
            break;
        case 'spiral_storm':
            fireSpiral(b, gCtx, 2 + Math.floor(level / 3), 3, 3.0);
            break;
        case 'summon_minions':
            spawnMinions(b, gCtx, Math.min(6, 2 + Math.floor(level / 2)));
            break;
    }
}

function updateActiveAttack(b, ca, dt, gCtx) {
    // Update active beams
    for (let i = b.activeBeams.length - 1; i >= 0; i--) {
        const beam = b.activeBeams[i];
        beam.timer -= dt;

        if (beam.type === 'magnetic_pulse') {
            beam.radius += beam.expandSpeed * dt;
            const dist = Math.hypot(gCtx.player.x - b.x, gCtx.player.y - b.y);
            if (!beam.hitPlayer && Math.abs(dist - beam.radius) < 16) {
                if (gCtx.player.shieldTime <= 0) {
                    gCtx.player.controlScrambleTime = 120;
                    gCtx.player.damageFlash = 3;
                    gCtx.shakeScreen(2, 200);
                    gCtx.createParticleBurst(gCtx.player.x, gCtx.player.y, '#bd93f9', 12);
                    beam.hitPlayer = true;
                }
            }
        } else if (beam.type === 'gravity_well') {
            const dx = beam.x - gCtx.player.x;
            const dy = beam.y - gCtx.player.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            // Screen-wide attraction pull that sucks the ship in from anywhere!
            const baseForce = 0.12; // Baseline attraction pull
            const proximityForce = Math.max(0, 1.0 - dist / 500); // Pull gets stronger closer to center
            const force = (baseForce + proximityForce * 1.25) * beam.pullForce * dt;
            
            gCtx.player.vx += (dx / dist) * force;
            gCtx.player.vy += (dy / dist) * force;
            
            if (Math.random() > 0.5) {
                const angle = Math.random() * Math.PI * 2;
                const pDist = 40 + Math.random() * 80;
                gCtx.createParticleBurst(beam.x + Math.cos(angle) * pDist, beam.y + Math.sin(angle) * pDist, '#bd93f9', 1);
            }
        } else if (beam.type === 'shield_overdrive') {
            if (b.shields) {
                b.shields.forEach(shield => {
                    if (shield.health <= 0) {
                        shield.health = 1;
                        const angle = shield.angle + b.rotAngle;
                        const sx = b.x + Math.cos(angle) * b.shieldRadius;
                        const sy = b.y + Math.sin(angle) * b.shieldRadius;
                        gCtx.createParticleBurst(sx, sy, '#ffd700', 6);
                    }
                    if (shield.health < shield.maxHealth) {
                        shield.health = Math.min(shield.maxHealth, shield.health + beam.regenRate * dt);
                    }
                    if (Math.random() > 0.75) {
                        const angle = shield.angle + b.rotAngle + (Math.random() - 0.5) * 0.3;
                        const sx = b.x + Math.cos(angle) * b.shieldRadius;
                        const sy = b.y + Math.sin(angle) * b.shieldRadius;
                        gCtx.createParticleBurst(sx, sy, '#ffffff', 1);
                    }
                });
            }
        } else if (beam.sweepDir !== undefined) {
            // Horizontal sweeping beam (Ion Cascade)
            beam.x += beam.sweepDir * 3.5 * dt;
            if (beam.x > gCtx.canvas.width) beam.sweepDir = -1;
            if (beam.x < 0) beam.sweepDir = 1;

            // Check player collision
            if (Math.abs(gCtx.player.x - beam.x) < beam.width / 2 + 12) {
                if (gCtx.player.shieldTime <= 0) {
                    gCtx.player.energy -= beam.damage * dt;
                    gCtx.player.damageFlash = 3;
                    if (gCtx.player.energy <= 0) {
                        gCtx.player.energy = 0;
                    }
                }
            }
        } else if (beam.angle !== undefined) {
            // Rotating beam (Beam Sweep)
            beam.angle += beam.rotSpeed * dt;

            // Check player collision with rotating beam line
            const beamEndX = b.x + Math.cos(beam.angle) * 500;
            const beamEndY = b.y + Math.sin(beam.angle) * 500;
            const dx = gCtx.player.x - b.x;
            const dy = gCtx.player.y - b.y;
            const beamDx = beamEndX - b.x;
            const beamDy = beamEndY - b.y;
            const beamLen = Math.hypot(beamDx, beamDy);
            const crossProduct = Math.abs(dx * beamDy - dy * beamDx) / beamLen;

            if (crossProduct < beam.width / 2 + 10 && Math.hypot(dx, dy) < beamLen) {
                if (gCtx.player.shieldTime <= 0) {
                    gCtx.player.energy -= beam.damage * dt;
                    gCtx.player.damageFlash = 3;
                    if (gCtx.player.energy <= 0) gCtx.player.energy = 0;
                }
            }
        } else if (beam.isVertical) {
            // Vertical laser lines (Omega Purge)
            if (Math.abs(gCtx.player.x - beam.x) < beam.width / 2 + 10) {
                if (gCtx.player.shieldTime <= 0) {
                    gCtx.player.energy -= beam.damage * dt;
                    gCtx.player.damageFlash = 3;
                    if (gCtx.player.energy <= 0) gCtx.player.energy = 0;
                }
            }
        }

        if (beam.timer <= 0) {
            b.activeBeams.splice(i, 1);
        }
    }
}

// =============================================================
// SECTION 9: RECOVERY STATION
// =============================================================

function startRecovery(level) {
    bossState = 'RECOVERY';
    recoveryPhase = 0; // transition
    recoveryTimer = RECOVERY_TRANSITION_TIME;
    recoveryHealProgress = 0;
    recoveryDronesAttached = 0;
    currentBossLevel = level;
}

function updateRecovery(dt, gCtx) {
    recoveryTimer -= dt;

    if (recoveryPhase === 0) {
        // Transition: enemies fly off screen
        for (const bug of gCtx.bugs) {
            bug.vy = Math.abs(bug.vy) * 5 + 10;
        }
        gCtx.enemyProjectiles.length = 0;

        if (recoveryTimer <= 0) {
            recoveryPhase = 1;
            recoveryTimer = RECOVERY_DOCKING_TIME;
            gCtx.bugs.length = 0;
        }
    } else if (recoveryPhase === 1) {
        // Docking: auto-pilot ship to center, heal, equip
        const player = gCtx.player;
        const targetX = gCtx.canvas.width / 2;
        const targetY = gCtx.canvas.height * 0.65;

        // Smooth lerp to center
        player.x += (targetX - player.x) * 0.05 * dt;
        player.y += (targetY - player.y) * 0.05 * dt;
        player.vx = 0;
        player.vy = 0;

        // Heal to 80% over the docking period
        const targetHealth = player.maxEnergy * 0.8;
        const healProgress = 1.0 - (recoveryTimer / RECOVERY_DOCKING_TIME);
        recoveryHealProgress = healProgress;
        if (player.energy < targetHealth) {
            player.energy = Math.min(targetHealth, player.energy + (targetHealth - player.energy) * 0.03 * dt);
        }

        // Attach drones progressively
        const level = currentBossLevel;
        const dronesNeeded = level >= 2 ? 3 : 2;
        const attachTime = RECOVERY_DOCKING_TIME * 0.5;
        const elapsed = RECOVERY_DOCKING_TIME - recoveryTimer;

        if (elapsed > attachTime * 0.3 && player.drones.length < Math.min(1, dronesNeeded)) {
            player.drones.push({ health: 3 });
            recoveryDronesAttached = 1;
            gCtx.createParticleBurst(player.x, player.y - 35, '#50fa7b', 10);
        }
        if (elapsed > attachTime * 0.6 && player.drones.length < Math.min(2, dronesNeeded)) {
            player.drones.push({ health: 3 });
            recoveryDronesAttached = 2;
            gCtx.createParticleBurst(player.x - 22, player.y - 28, '#50fa7b', 10);
        }
        if (dronesNeeded >= 3 && elapsed > attachTime * 0.9 && player.drones.length < 3) {
            player.drones.push({ health: 3 });
            recoveryDronesAttached = 3;
            gCtx.createParticleBurst(player.x + 22, player.y - 28, '#50fa7b', 10);
        }

        // Guarantee perma weapon
        if (elapsed > attachTime * 0.7 && !player.permaWeaponType) {
            const weapons = ['CANNONS', 'PLASMA', 'SPREAD', 'MISSILE', 'BEAM'];
            player.permaWeaponType = weapons[Math.floor(Math.random() * weapons.length)];
            gCtx.createParticleBurst(player.x, player.y, '#ffea00', 14);
        }

        // Boss 2+: give shield
        if (level >= 2 && elapsed > attachTime * 0.5 && player.shieldTime <= 0) {
            player.shieldTime = 480;
        }

        // Boss 3+: give overcharge and weapon upgrade
        if (level >= 3) {
            if (elapsed > attachTime * 0.6 && player.overchargeTime <= 0) {
                player.overchargeTime = 360;
            }
            if (elapsed > attachTime * 0.8 && player.weaponUpgradeTime <= 0) {
                player.weaponUpgradeTime = 480;
            }
        }

        gCtx.updateScoreUI();

        if (recoveryTimer <= 0) {
            // Transition to boss entry
            bossState = 'ENTERING';
            recoveryTimer = BOSS_ENTRY_TIME;

            // Create the boss
            if (currentBossLevel <= 3) {
                boss = createScriptedBoss(currentBossLevel, gCtx.canvas.width, gCtx.canvas.height);
            } else {
                boss = createProceduralBoss(currentBossLevel, gCtx.canvas.width, gCtx.canvas.height);
            }
            bossEntryY = boss.enterY;
        }
    }
}

// =============================================================
// SECTION 10: BOSS RENDERING
// =============================================================

// =============================================================
// SECTION 10: PROCEDURAL VECTOR RENDERING
// =============================================================

function setShadow(ctx, color, blur, isAfterimage) {
    if (isAfterimage) {
        ctx.shadowBlur = 0;
        return;
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
}

function drawBoss1Vector(ctx, w, h, b, getColor, isAfterimage) {
    const isCharging = b.currentAttack && b.currentAttack.state === 'charge';
    const isFiring = b.currentAttack && b.currentAttack.state === 'active';
    const time = Date.now();

    // 1. Thrusters (rear, -Y)
    const thrusterCycle = Math.sin(time / 60);
    const thrusterLength = h * 0.3 * (1.0 + thrusterCycle * 0.15) * (isCharging ? 1.5 : (isFiring ? 2.0 : 1.0));
    
    ctx.save();
    ctx.fillStyle = getColor('#00f0ff');
    setShadow(ctx, '#00f0ff', 15, isAfterimage);
    
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.3);
    ctx.lineTo(-w * 0.25, -h * 0.3 - thrusterLength);
    ctx.lineTo(-w * 0.15, -h * 0.3);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(w * 0.2, -h * 0.3);
    ctx.lineTo(w * 0.15, -h * 0.3 - thrusterLength);
    ctx.lineTo(w * 0.25, -h * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = getColor('#ffffff');
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.3);
    ctx.lineTo(-w * 0.22, -h * 0.3 - thrusterLength * 0.6);
    ctx.lineTo(-w * 0.18, -h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.2, -h * 0.3);
    ctx.lineTo(w * 0.18, -h * 0.3 - thrusterLength * 0.6);
    ctx.lineTo(w * 0.22, -h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2. Wings
    let wingSpread = 0;
    if (isCharging) wingSpread = Math.sin(time / 80) * 0.08;
    else if (b.vx !== 0) wingSpread = -b.vx * 0.04;

    for (let side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.translate(-w * 0.15, 0);
        ctx.rotate(wingSpread);

        // Wing base plate (Dark metallic blue)
        ctx.fillStyle = getColor('#1e3b8a');
        ctx.strokeStyle = getColor('#00f0ff');
        ctx.lineWidth = 2.5;
        setShadow(ctx, '#00f0ff', 8, isAfterimage);
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.1);
        ctx.lineTo(-w * 0.38, -h * 0.05);
        ctx.lineTo(-w * 0.3, h * 0.3);
        ctx.lineTo(0, h * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner panel details (Glowing cyan)
        ctx.fillStyle = getColor('#3b82f6');
        ctx.beginPath();
        ctx.moveTo(-w * 0.08, 0);
        ctx.lineTo(-w * 0.3, h * 0.02);
        ctx.lineTo(-w * 0.25, h * 0.2);
        ctx.lineTo(-w * 0.08, h * 0.1);
        ctx.closePath();
        ctx.fill();

        // Wing armor plates overlays (Dark slate)
        ctx.fillStyle = getColor('#334155');
        ctx.beginPath();
        ctx.moveTo(-w * 0.1, -h * 0.05);
        ctx.lineTo(-w * 0.25, -h * 0.02);
        ctx.lineTo(-w * 0.2, h * 0.1);
        ctx.lineTo(-w * 0.1, h * 0.05);
        ctx.closePath();
        ctx.fill();

        // Forward heavy gun barrels
        ctx.fillStyle = getColor('#475569');
        ctx.strokeStyle = getColor('#00f0ff');
        ctx.lineWidth = 1.2;
        ctx.fillRect(-w * 0.25, h * 0.1, w * 0.04, h * 0.18);
        ctx.strokeRect(-w * 0.25, h * 0.1, w * 0.04, h * 0.18);

        // Blinking beacon warning lights on wingtips
        const beaconPulse = Math.sin(time / 150) > 0;
        if (beaconPulse) {
            ctx.fillStyle = '#ff5555';
            ctx.beginPath();
            ctx.arc(-w * 0.38, -h * 0.05, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // 3. Central Hull
    ctx.save();
    ctx.fillStyle = getColor('#0f172a');
    ctx.strokeStyle = getColor('#3b82f6');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.35);
    ctx.lineTo(w * 0.18, -h * 0.15);
    ctx.lineTo(w * 0.18, h * 0.18);
    ctx.lineTo(0, h * 0.42);
    ctx.lineTo(-w * 0.18, h * 0.18);
    ctx.lineTo(-w * 0.18, -h * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Multi-layered cockpit shield panel
    ctx.fillStyle = getColor('#1e293b');
    ctx.strokeStyle = getColor('#00f0ff');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.22);
    ctx.lineTo(w * 0.12, -h * 0.08);
    ctx.lineTo(w * 0.12, h * 0.12);
    ctx.lineTo(0, h * 0.24);
    ctx.lineTo(-w * 0.12, h * 0.12);
    ctx.lineTo(-w * 0.12, -h * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Core Reactor details
    const corePulse = isCharging ? (1.2 + Math.sin(time / 60) * 0.2) : 1.0;
    const coreRad = w * 0.07 * corePulse;
    ctx.fillStyle = getColor(isCharging ? '#ff5555' : (isFiring ? '#ffffff' : '#00f0ff'));
    setShadow(ctx, isCharging ? '#ff5555' : '#00f0ff', isCharging ? 20 : 10, isAfterimage);
    ctx.beginPath();
    ctx.arc(0, h * 0.08, coreRad, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = getColor('rgba(59, 130, 246, 0.4)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h * 0.05);
    ctx.lineTo(w * 0.1, -h * 0.05);
    ctx.moveTo(-w * 0.12, h * 0.02);
    ctx.lineTo(w * 0.12, h * 0.02);
    ctx.stroke();
    ctx.restore();
}

function drawBoss2Vector(ctx, w, h, b, getColor, isAfterimage) {
    const isCharging = b.currentAttack && b.currentAttack.state === 'charge';
    const time = Date.now();
    const wingFlap = Math.sin(time / 220) * 0.1;

    // 1. Orbiting void energy shards (swirling crystals)
    for (let i = 0; i < 4; i++) {
        const angle = (time / 350) + (Math.PI / 2) * i;
        const sx = Math.cos(angle) * w * 0.38;
        const sy = Math.sin(angle) * h * 0.28;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle + Math.PI/4);
        ctx.fillStyle = getColor('#bd93f9');
        ctx.strokeStyle = getColor('#ff79c6');
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // 2. Accretion Disk / Void Core
    ctx.save();
    setShadow(ctx, '#ff79c6', 20, isAfterimage);
    
    for (let r = 0; r < 3; r++) {
        ctx.save();
        ctx.rotate(time / 300 * (r % 2 === 0 ? 1 : -1) + r * Math.PI / 3);
        ctx.strokeStyle = getColor(r === 0 ? 'rgba(255, 121, 198, 0.5)' : 'rgba(189, 147, 249, 0.3)');
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.15 + r * 6, w * 0.06, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Singularity center
    ctx.fillStyle = '#050508';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Curved containment ribs shielding the core
    ctx.save();
    ctx.strokeStyle = getColor('#44475a');
    ctx.lineWidth = 2.0;
    for (let r = 0; r < 4; r++) {
        const angle = (Math.PI / 2) * r + Math.sin(time / 500) * 0.1;
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.14, -Math.PI / 5, Math.PI / 5);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    // 4. Appendages & Tendrils
    for (let side of [-1, 1]) {
        ctx.save();
        ctx.scale(side, 1);
        ctx.translate(-w * 0.12, 0);
        ctx.rotate(wingFlap);

        // Dark tendril body
        ctx.fillStyle = getColor('#282a36');
        ctx.strokeStyle = getColor('#bd93f9');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-w * 0.1, -h * 0.1, -w * 0.2, h * 0.1, -w * 0.22, h * 0.35);
        ctx.lineTo(-w * 0.16, h * 0.32);
        ctx.bezierCurveTo(-w * 0.15, h * 0.1, -w * 0.08, -h * 0.05, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Spectral glow overlays
        ctx.fillStyle = getColor('rgba(255, 121, 198, 0.85)');
        setShadow(ctx, '#ff79c6', 10, isAfterimage);
        ctx.beginPath();
        ctx.moveTo(-w * 0.22, h * 0.35);
        ctx.bezierCurveTo(-w * 0.38, h * 0.15, -w * 0.36, -h * 0.2, -w * 0.1, -h * 0.35);
        ctx.bezierCurveTo(-w * 0.24, -h * 0.2, -w * 0.28, 0, -w * 0.16, h * 0.32);
        ctx.closePath();
        ctx.fill();

        // Waving secondary ribbon
        ctx.fillStyle = getColor('rgba(189, 147, 249, 0.45)');
        ctx.beginPath();
        ctx.moveTo(-w * 0.16, h * 0.32);
        ctx.bezierCurveTo(-w * 0.3, h * 0.22, -w * 0.34, h * 0.05, -w * 0.2, -h * 0.15);
        ctx.bezierCurveTo(-w * 0.24, -h * 0.05, -w * 0.24, h * 0.12, -w * 0.12, h * 0.26);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // 5. Menacing Eyes & Crown plates
    ctx.save();
    // Cyber head plate
    ctx.fillStyle = getColor('#1b1e2e');
    ctx.strokeStyle = getColor('#bd93f9');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.02);
    ctx.lineTo(w * 0.08, h * 0.08);
    ctx.lineTo(w * 0.05, h * 0.16);
    ctx.lineTo(0, h * 0.2);
    ctx.lineTo(-w * 0.05, h * 0.16);
    ctx.lineTo(-w * 0.08, h * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = getColor('#ffffff');
    setShadow(ctx, '#ff5555', 8, isAfterimage);
    
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, h * 0.08);
    ctx.lineTo(-w * 0.015, h * 0.11);
    ctx.lineTo(-w * 0.06, h * 0.13);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.08);
    ctx.lineTo(w * 0.015, h * 0.11);
    ctx.lineTo(w * 0.06, h * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Ghostly spark emissions
    if (Math.random() > 0.45) {
        ctx.save();
        ctx.fillStyle = getColor('rgba(189, 147, 249, 0.55)');
        ctx.beginPath();
        ctx.arc((Math.random() - 0.5) * w * 0.25, -h * 0.28, 2.5 + Math.random() * 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawBoss3Vector(ctx, w, h, b, getColor, isAfterimage) {
    const isCharging = b.currentAttack && b.currentAttack.state === 'charge';
    const isFiring = b.currentAttack && b.currentAttack.state === 'active';
    const time = Date.now();

    // 1. Inner Plasma Cooling Vents
    const ventPulse = 0.5 + Math.sin(time / 180) * 0.5;
    ctx.save();
    ctx.fillStyle = getColor(`rgba(255, 85, 85, ${0.15 + ventPulse * 0.35})`);
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Main Octagonal Armor Hull
    ctx.save();
    ctx.fillStyle = getColor('#280505');
    ctx.strokeStyle = getColor('#ff5555');
    ctx.lineWidth = 3;
    setShadow(ctx, '#ff5555', 10, isAfterimage);

    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i + Math.sin(time / 2000) * 0.02;
        const rx = w * 0.45 * Math.cos(angle);
        const ry = h * 0.45 * Math.sin(angle);
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hull mechanical crossbars
    ctx.strokeStyle = getColor('rgba(255, 85, 85, 0.35)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i + Math.sin(time / 2000) * 0.02;
        ctx.moveTo(0, 0);
        ctx.lineTo(w * 0.45 * Math.cos(angle), h * 0.45 * Math.sin(angle));
    }
    ctx.stroke();
    ctx.restore();

    // 3. Heavy Shield Nodes & Weapon Emplacement Cannons
    for (let i = 0; i < 8; i++) {
        if (i % 2 === 0) continue;
        const angle = (Math.PI / 4) * i;
        ctx.save();
        ctx.rotate(angle);
        
        ctx.fillStyle = getColor('#450a0a');
        ctx.strokeStyle = getColor('#ff5555');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w * 0.34, -h * 0.08);
        ctx.lineTo(w * 0.46, 0);
        ctx.lineTo(w * 0.34, h * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = getColor('#ffd700');
        ctx.beginPath();
        ctx.arc(w * 0.4, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 4. Rotating Turret Pods
    const rotSpeed = time / 1000;
    const turretRadius = w * 0.32;
    for (let i = 0; i < 4; i++) {
        const angle = rotSpeed + (Math.PI / 2) * i;
        const tx = Math.cos(angle) * turretRadius;
        const ty = Math.sin(angle) * turretRadius;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(angle + Math.PI / 2);

        ctx.fillStyle = getColor('#4c0505');
        ctx.strokeStyle = getColor('#ffd700');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = getColor('#111111');
        ctx.fillRect(-w * 0.015, -w * 0.12, w * 0.03, w * 0.06);

        if (isFiring) {
            ctx.fillStyle = getColor('#ffffff');
            setShadow(ctx, '#ffd700', 8, isAfterimage);
            ctx.beginPath();
            ctx.arc(0, -w * 0.12, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 5. Central Reactor Cell & Golden Shield Rings
    ctx.save();
    const corePulse = 1.0 + Math.sin(time / 150) * 0.08 * (isCharging ? 2.5 : 1.0);
    const coreRadius = w * 0.16 * corePulse;

    ctx.strokeStyle = getColor('rgba(255, 215, 0, 0.7)');
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.22, rotSpeed * 1.5, rotSpeed * 1.5 + Math.PI * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.22, rotSpeed * 1.5 + Math.PI, rotSpeed * 1.5 + Math.PI * 1.7);
    ctx.stroke();

    ctx.fillStyle = getColor(isCharging ? '#ffffff' : '#ffd700');
    ctx.strokeStyle = getColor('#ff5555');
    ctx.lineWidth = 2;
    setShadow(ctx, isCharging ? '#ffffff' : '#ffd700', isCharging ? 20 : 18, isAfterimage);

    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

function drawProceduralBossVector(ctx, w, h, b, getColor, isAfterimage) {
    const level = b.level;
    const time = Date.now();
    const isCharging = b.currentAttack && b.currentAttack.state === 'charge';
    const isFiring = b.currentAttack && b.currentAttack.state === 'active';

    const sides = 3 + (level % 5);
    const wingPairs = 1 + (level % 3);
    
    const primaryColor = b.colorMap[2] || '#ff0055';
    const secondaryColor = b.colorMap[3] || '#ffffff';
    const shadowColor = b.colorMap[4] || '#330011';

    // 1. Thrusters
    ctx.save();
    ctx.fillStyle = getColor(primaryColor);
    setShadow(ctx, primaryColor, 12, isAfterimage);
    const flameH = h * 0.3 * (1.0 + Math.sin(time / 50) * 0.12) * (isCharging ? 1.4 : 1.0);
    
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, -h * 0.25);
    ctx.lineTo(-w * 0.18, -h * 0.25 - flameH);
    ctx.lineTo(-w * 0.12, -h * 0.25);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w * 0.15, -h * 0.25);
    ctx.lineTo(w * 0.12, -h * 0.25 - flameH);
    ctx.lineTo(w * 0.18, -h * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2. Wings
    const wingRotation = Math.sin(time / 200) * 0.08;
    for (let wing = 0; wing < wingPairs; wing++) {
        const wingOffset = wing * 12;
        const wingLength = w * (0.35 - wing * 0.06);
        const wingHeight = h * (0.15 + wing * 0.05);

        for (let side of [-1, 1]) {
            ctx.save();
            ctx.scale(side, 1);
            ctx.translate(-w * 0.1, wingOffset - h * 0.05);
            ctx.rotate(wingRotation * (wing % 2 === 0 ? 1 : -1));

            ctx.fillStyle = getColor(shadowColor);
            ctx.strokeStyle = getColor(primaryColor);
            ctx.lineWidth = 2;
            setShadow(ctx, primaryColor, 6, isAfterimage);

            ctx.beginPath();
            ctx.moveTo(0, -wingHeight * 0.5);
            ctx.lineTo(-wingLength, -wingHeight * 0.2);
            ctx.lineTo(-wingLength * 0.8, wingHeight * 0.5);
            ctx.lineTo(0, wingHeight * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = getColor(secondaryColor);
            ctx.beginPath();
            ctx.moveTo(-wingLength, -wingHeight * 0.2);
            ctx.lineTo(-wingLength * 0.85, wingHeight * 0.1);
            ctx.lineTo(-wingLength * 0.6, -wingHeight * 0.1);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    // 3. Central Hull
    ctx.save();
    ctx.fillStyle = getColor(shadowColor);
    ctx.strokeStyle = getColor(secondaryColor);
    ctx.lineWidth = 2.5;
    setShadow(ctx, secondaryColor, 8, isAfterimage);

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 / sides) * i + Math.PI / 2;
        const rx = w * 0.22 * Math.cos(angle);
        const ry = h * 0.22 * Math.sin(angle);
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 4. Central Reactor
    ctx.save();
    const corePulse = 1.0 + Math.sin(time / 180) * 0.12 * (isCharging ? 2.0 : 1.0);
    const coreRadius = w * 0.08 * corePulse;
    
    ctx.fillStyle = getColor(isCharging ? '#ffffff' : primaryColor);
    setShadow(ctx, primaryColor, 15, isAfterimage);
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawBossModel(ctx, b, w, h, isAfterimage) {
    ctx.save();
    const isHit = b.hitFlash > 0;
    const getColor = (defaultColor) => isHit ? '#ffffff' : defaultColor;

    // Phase 3 Voidreaper glitching visual slice
    const isGlitched = b.level === 2 && (isHit || b.phase === 3 || b.teleportTimer < 20);
    if (isGlitched && Math.random() > 0.4) {
        // Glitch slice
        const bands = 5;
        const bandH = h / bands;
        for (let i = 0; i < bands; i++) {
            ctx.save();
            const shiftX = (Math.random() - 0.5) * 8;
            const topY = -h / 2 + i * bandH;
            
            // Clip to current horizontal slice band
            ctx.beginPath();
            ctx.rect(-w / 2 - 10, topY, w + 20, bandH);
            ctx.clip();
            
            ctx.translate(shiftX, 0);
            
            if (b.level === 1) drawBoss1Vector(ctx, w, h, b, getColor, isAfterimage);
            else if (b.level === 2) drawBoss2Vector(ctx, w, h, b, getColor, isAfterimage);
            else if (b.level === 3) drawBoss3Vector(ctx, w, h, b, getColor, isAfterimage);
            else drawProceduralBossVector(ctx, w, h, b, getColor, isAfterimage);
            
            ctx.restore();
        }
    } else {
        if (b.level === 1) drawBoss1Vector(ctx, w, h, b, getColor, isAfterimage);
        else if (b.level === 2) drawBoss2Vector(ctx, w, h, b, getColor, isAfterimage);
        else if (b.level === 3) drawBoss3Vector(ctx, w, h, b, getColor, isAfterimage);
        else drawProceduralBossVector(ctx, w, h, b, getColor, isAfterimage);
    }
    ctx.restore();
}

function drawBossSprite(ctx, b) {
    ctx.save();
    if (b.hitFlash > 0) {
        b.hitFlash--;
        ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 30) * 0.3;
    }

    // Glow aura
    const pulseRadius = Math.max(b.width, b.height) / 2 + 8 + Math.sin(Date.now() / 300) * 4;
    ctx.save();
    const auraGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, pulseRadius);
    auraGrad.addColorStop(0, b.glowColor);
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(b.x - pulseRadius, b.y - pulseRadius, pulseRadius * 2, pulseRadius * 2);
    ctx.restore();

    // Breathing scale animation
    const pulseScale = 1.0 + Math.sin(Date.now() / 450) * 0.03;
    const dw = b.width * pulseScale;
    const dh = b.height * pulseScale;

    // Wobble/Float offset for Voidreaper
    let drawX = b.x;
    let drawY = b.y;
    if (b.level === 2) {
        drawX += Math.cos(Date.now() / 500) * 4;
        drawY += Math.sin(Date.now() / 250) * 5;
    }

    ctx.save();
    ctx.translate(drawX, drawY);

    // Rotation/tilt offset
    if (b.level === 1) {
        ctx.rotate(b.vx * 0.08); // banking tilt based on horizontal movement
    } else if (b.level === 3) {
        ctx.rotate(Math.sin(Date.now() / 1500) * 0.06);
    }

    // Draw procedural vector mesh model
    drawBossModel(ctx, b, dw, dh, false);

    // Phase damage cracks (visual overlay)
    if (b.phase >= 3) {
        ctx.save();
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ff3333';
        const rng = seededRNG(b.level * 42);
        for (let i = 0; i < b.phase * 2; i++) {
            const cx = (rng() - 0.5) * b.width * 0.7;
            const cy = (rng() - 0.5) * b.height * 0.7;
            ctx.beginPath();
            ctx.moveTo(cx - 4, cy - 4);
            ctx.lineTo(cx + rng() * 8, cy + rng() * 8);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Orbiting particles
    ctx.save();
    const pCount = 4 + b.phase;
    for (let i = 0; i < pCount; i++) {
        const angle = Date.now() / 800 + (Math.PI * 2 / pCount) * i;
        const radius = Math.max(b.width, b.height) / 2 + 12;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : b.color;
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 200 + i) * 0.3;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();
}

function drawBossShields(ctx, b) {
    if (!b.shields) return;
    ctx.save();
    for (const shield of b.shields) {
        if (shield.health <= 0) continue;
        const angle = shield.angle + b.rotAngle;
        const sx = b.x + Math.cos(angle) * b.shieldRadius;
        const sy = b.y + Math.sin(angle) * b.shieldRadius;

        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffd700';
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.stroke();

        // Health indicator
        ctx.fillStyle = `rgba(255, 215, 0, ${0.3 + (shield.health / shield.maxHealth) * 0.4})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}

function drawMagneticPulseBeam(ctx, b, beam) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1.0 - (beam.radius / beam.maxRadius));
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3.5 + Math.sin(Date.now() / 20) * 1.5;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, beam.radius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, beam.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawGravityWellBeam(ctx, beam) {
    const time = Date.now();
    ctx.save();
    ctx.translate(beam.x, beam.y);
    
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, beam.radius + Math.sin(time / 100) * 10);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.3, 'rgba(189, 147, 249, 0.8)');
    grad.addColorStop(0.7, 'rgba(255, 121, 198, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, beam.radius + 20, 0, Math.PI * 2);
    ctx.fill();

    for (let r = 0; r < 3; r++) {
        ctx.save();
        ctx.rotate(time / 200 * (r % 2 === 0 ? 1 : -1) + r * Math.PI / 3);
        ctx.strokeStyle = r === 0 ? '#ff79c6' : '#bd93f9';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = r === 0 ? '#ff79c6' : '#bd93f9';
        ctx.beginPath();
        ctx.ellipse(0, 0, 30 + r * 15, 12 + r * 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    ctx.fillStyle = '#0a0a0f';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#000000';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawShieldOverdriveBeam(ctx, b) {
    const time = Date.now();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 2 + Math.sin(time / 50) * 1;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffd700';
    ctx.setLineDash([4, 4]);
    
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.shieldRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    if (b.shields) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([]);
        for (const shield of b.shields) {
            if (shield.health <= 0) continue;
            const angle = shield.angle + b.rotAngle;
            const sx = b.x + Math.cos(angle) * b.shieldRadius;
            const sy = b.y + Math.sin(angle) * b.shieldRadius;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(sx, sy);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawSweepLaserBeam(ctx, b, beam, canvas) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = beam.width + Math.sin(Date.now() / 20) * 4;
    ctx.shadowBlur = 20;
    ctx.shadowColor = b.color;
    ctx.beginPath();
    ctx.moveTo(beam.x, b.y + b.height / 2);
    ctx.lineTo(beam.x, canvas.height - 12);
    ctx.stroke();
    // White core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(beam.x, b.y + b.height / 2);
    ctx.lineTo(beam.x, canvas.height - 12);
    ctx.stroke();
}

function drawRotatingLaserBeam(ctx, b, beam) {
    const endX = b.x + Math.cos(beam.angle) * 600;
    const endY = b.y + Math.sin(beam.angle) * 600;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = beam.width + Math.sin(Date.now() / 20) * 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = b.color;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

function drawVerticalLaserBeam(ctx, beam, canvas) {
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = beam.width + Math.sin(Date.now() / 15) * 6;
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ff3333';
    ctx.beginPath();
    ctx.moveTo(beam.x, 0);
    ctx.lineTo(beam.x, canvas.height - 12);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(beam.x, 0);
    ctx.lineTo(beam.x, canvas.height - 12);
    ctx.stroke();
}

function drawBossBeams(ctx, b, canvas) {
    ctx.save();
    // Clip to prevent bottom border artifacts from shadowBlur
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height - 10);
    ctx.clip();

    for (const beam of b.activeBeams) {
        ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 25) * 0.3;

        if (beam.type === 'magnetic_pulse') {
            drawMagneticPulseBeam(ctx, b, beam);
        } else if (beam.type === 'gravity_well') {
            drawGravityWellBeam(ctx, beam);
        } else if (beam.type === 'shield_overdrive') {
            drawShieldOverdriveBeam(ctx, b);
        } else if (beam.sweepDir !== undefined) {
            drawSweepLaserBeam(ctx, b, beam, canvas);
        } else if (beam.angle !== undefined) {
            drawRotatingLaserBeam(ctx, b, beam);
        } else if (beam.isVertical) {
            drawVerticalLaserBeam(ctx, beam, canvas);
        }
    }
    ctx.restore();
}

function drawBossHealthBar(ctx, b, canvas) {
    ctx.save();
    const barW = canvas.width * 0.55;
    const barH = 8;
    const bx = (canvas.width - barW) / 2;
    const by = canvas.height - 24;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, barH, 4);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillRect(bx, by, barW, barH);
        ctx.strokeRect(bx, by, barW, barH);
    }

    // Health fill
    const fillW = Math.max(0, (b.health / b.maxHealth) * (barW - 2));
    ctx.fillStyle = b.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = b.color;
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + 1, fillW, barH - 2, 3);
        ctx.fill();
    } else {
        ctx.fillRect(bx + 1, by + 1, fillW, barH - 2);
    }

    // Phase markers
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    for (const t of b.phaseThresholds) {
        const mx = bx + t * barW;
        ctx.beginPath();
        ctx.moveTo(mx, by);
        ctx.lineTo(mx, by + barH);
        ctx.stroke();
    }

    // Boss name
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 10px 'Geist Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowBlur = 6;
    ctx.shadowColor = b.color;
    ctx.fillText(b.name, canvas.width / 2, by - 2);

    // Phase indicator
    ctx.font = "700 7px 'Geist Mono', monospace";
    ctx.fillStyle = b.color;
    ctx.textAlign = 'right';
    ctx.fillText(`PHASE ${b.phase}`, bx + barW, by - 2);

    ctx.restore();
}

function drawWarning(ctx, canvas) {
    ctx.save();
    warningAlpha = 0.5 + Math.sin(Date.now() / 150) * 0.5;
    ctx.globalAlpha = warningAlpha;

    // Pulsing border
    ctx.strokeStyle = '#ff5555';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff5555';
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Warning text
    ctx.fillStyle = '#ff5555';
    ctx.font = "bold 14px 'Geist Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff5555';
    ctx.fillText('⚠ BOSS INCOMING ⚠', canvas.width / 2, canvas.height * 0.15);

    ctx.restore();
}

function drawRecoveryStation(ctx, canvas, player) {
    ctx.save();
    const time = Date.now();

    // Holographic hexagonal rings
    for (let ring = 0; ring < 3; ring++) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(time / (600 + ring * 200) * (ring % 2 === 0 ? 1 : -1));

        const radius = 40 + ring * 18;
        const alpha = 0.25 + Math.sin(time / 300 + ring) * 0.15;
        ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const hx = Math.cos(angle) * radius;
            const hy = Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    // Energy particles flowing in
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
        const angle = (time / 500 + (Math.PI * 2 / particleCount) * i) % (Math.PI * 2);
        const flowRadius = 80 - (time / 50 + i * 20) % 60;
        if (flowRadius < 10) continue;
        const px = player.x + Math.cos(angle) * flowRadius;
        const py = player.y + Math.sin(angle) * flowRadius;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.4 + Math.sin(time / 200 + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Status text
    ctx.fillStyle = '#00f0ff';
    ctx.font = "bold 11px 'Geist Mono', monospace";
    ctx.textAlign = 'center';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f0ff';

    if (recoveryPhase === 0) {
        ctx.fillText('⚠ RECOVERY STATION INCOMING ⚠', canvas.width / 2, canvas.height * 0.2);
    } else {
        const phase = recoveryHealProgress;
        let text = 'SYSTEMS RECHARGING...';
        if (phase > 0.3) text = 'DRONES DEPLOYING...';
        if (phase > 0.6) text = 'WEAPONS ONLINE...';
        if (phase > 0.85) text = 'READY FOR COMBAT';
        ctx.fillText(text, canvas.width / 2, canvas.height * 0.2);

        // Progress bar
        const pbW = 200;
        const pbH = 6;
        const pbX = (canvas.width - pbW) / 2;
        const pbY = canvas.height * 0.2 + 16;
        ctx.fillStyle = 'rgba(10,10,15,0.7)';
        ctx.fillRect(pbX, pbY, pbW, pbH);
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(pbX, pbY, pbW * phase, pbH);
    }

    ctx.restore();
}

function drawBossEntry(ctx, canvas) {
    ctx.save();

    // Screen darkening overlay
    const progress = 1.0 - (recoveryTimer / BOSS_ENTRY_TIME);
    ctx.fillStyle = `rgba(0, 0, 0, ${progress * 0.25})`;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

    // Boss name slide-in
    if (boss) {
        const slideY = -30 + progress * 60;
        ctx.fillStyle = boss.color;
        ctx.font = "bold 16px 'Geist Mono', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 15;
        ctx.shadowColor = boss.color;
        ctx.globalAlpha = Math.min(1.0, progress * 2);
        ctx.fillText(boss.name, canvas.width / 2, slideY);

        ctx.font = "700 9px 'Geist Mono', monospace";
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.min(1.0, Math.max(0, (progress - 0.4) * 3));
        ctx.fillText(`BOSS LEVEL ${boss.level}`, canvas.width / 2, slideY + 18);
    }

    ctx.restore();
}

function drawDefeatedEffect(ctx, canvas) {
    ctx.save();
    const progress = 1.0 - (victoryTimer / BOSS_VICTORY_TIME);

    // Flash effect
    if (progress < 0.15) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - progress / 0.15) * 0.6})`;
        ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    }

    // Victory text
    ctx.fillStyle = '#ffd700';
    ctx.font = "bold 18px 'Geist Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffd700';
    ctx.globalAlpha = Math.min(1.0, progress * 3);

    const textY = canvas.height * 0.35 + Math.sin(progress * Math.PI) * -20;
    ctx.fillText('BOSS DEFEATED', canvas.width / 2, textY);

    if (bossDeathReward) {
        ctx.font = "bold 12px 'Geist Mono', monospace";
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`+${bossDeathReward.score} BONUS`, canvas.width / 2, textY + 26);
        ctx.font = "700 9px 'Geist Mono', monospace";
        ctx.fillStyle = '#50fa7b';
        ctx.fillText('COMBO CAP INCREASED +1.0', canvas.width / 2, textY + 42);
    }

    ctx.restore();
}

// Charge warning indicator (visual telegraph for current attack)
function drawChargeWarning(ctx, b, canvas) {
    if (!b.currentAttack || b.currentAttack.state !== 'charge') return;
    const ca = b.currentAttack;
    const atk = b.attacks[ca.name];
    if (!atk) return;

    const progress = 1.0 - (ca.timer / atk.chargeTime);

    ctx.save();
    // Pulsing glow around boss
    const glowAlpha = progress * 0.4;
    const glowRadius = Math.max(b.width, b.height) / 2 + 20 + progress * 15;
    ctx.strokeStyle = `rgba(255, 255, 255, ${glowAlpha})`;
    ctx.lineWidth = 2 + progress * 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, glowRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Attack name text
    if (progress > 0.3) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.7, (progress - 0.3) * 2)})`;
        ctx.font = "bold 8px 'Geist Mono', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(ca.name.replace(/_/g, ' ').toUpperCase(), b.x, b.y + b.height / 2 + 20);
    }
    ctx.restore();
}

// =============================================================
// SECTION 11: CHECKPOINT SYSTEM
// =============================================================

export function getCheckpoint() {
    try {
        const data = localStorage.getItem(CHECKPOINT_KEY);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

function saveCheckpoint(score, bossLevel) {
    const cp = {
        score,
        bossLevel,
        comboCapBonus: bossLevel * 1.0,
        timestamp: Date.now()
    };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
}

export function clearCheckpoints() {
    localStorage.removeItem(CHECKPOINT_KEY);
}

export function applyCheckpointToPlayer(player, bossLevel) {
    if (bossLevel >= 1) {
        player.drones = [{ health: 3 }, { health: 3 }];
        if (!player.permaWeaponType) {
            player.permaWeaponType = 'CANNONS';
        }
    }
    if (bossLevel >= 2) {
        player.drones = [{ health: 3 }, { health: 3 }, { health: 3 }];
        player.shieldTime = 480;
    }
    if (bossLevel >= 3) {
        player.drones = [{ health: 3 }, { health: 3 }, { health: 3 }];
        player.shieldTime = 480;
        player.overchargeTime = 360;
        player.weaponUpgradeTime = 480;
    }
}

// =============================================================
// SECTION 12: PUBLIC API
// =============================================================

export function initBossSystem() {
    boss = null;
    bossState = 'NONE';
    currentBossLevel = 0;
    bossesDefeated = [];
    recoveryTimer = 0;
    recoveryPhase = 0;
    warningAlpha = 0;
    victoryTimer = 0;
    bossDeathReward = null;
    maxComboBonus = 0;
    scoreAtLastBossDefeat = 0;
    timeSinceLastBoss = 0;
    lastBossThreshold = SCRIPTED_THRESHOLDS[SCRIPTED_THRESHOLDS.length - 1];
}

export function initBossSystemFromCheckpoint(checkpointBossLevel, checkpointScore) {
    initBossSystem();
    for (let i = 1; i <= checkpointBossLevel; i++) {
        bossesDefeated.push(i);
    }
    currentBossLevel = checkpointBossLevel;
    maxComboBonus = checkpointBossLevel * 1.0;
    scoreAtLastBossDefeat = checkpointScore !== undefined ? checkpointScore : 0;
    timeSinceLastBoss = 0;

    // Recalculate last threshold for procedural bosses
    if (checkpointBossLevel >= 3) {
        let threshold = SCRIPTED_THRESHOLDS[2];
        for (let i = 4; i <= checkpointBossLevel; i++) {
            threshold = Math.floor(threshold * 1.35 + 500);
        }
        lastBossThreshold = threshold;
    }
}

export function isBossPhaseActive() {
    return bossState !== 'NONE';
}

export function shouldPauseSpawning() {
    return bossState !== 'NONE' && bossState !== 'WARNING';
}

export function getBossState() {
    return bossState;
}

export function getBoss() {
    return boss;
}

export function getMaxComboBonus() {
    return maxComboBonus;
}

export function consumeBossDeathReward() {
    const r = bossDeathReward;
    bossDeathReward = null;
    return r;
}

export function checkBossThreshold(score, gCtx) {
    if (bossState !== 'NONE' && bossState !== 'WARNING') return;

    const progress = getBossProgress(score, gCtx.player, gCtx.combo, gCtx.closeCalls);

    // WARNING state: progress is at least 90%
    if (bossState === 'NONE' && progress.percent >= 90) {
        bossState = 'WARNING';
        return;
    }

    // RECOVERY state: progress reaches 100%
    if (progress.percent >= 100) {
        startRecovery(progress.nextLevel);
        return;
    }
}

export function updateBossSystem(dt, gCtx) {
    if (bossState === 'NONE' || bossState === 'WARNING') {
        timeSinceLastBoss += (dt * 16.67) / 1000;
        return;
    }

    if (bossState === 'RECOVERY') {
        updateRecovery(dt, gCtx);
        return;
    }

    if (bossState === 'ENTERING') {
        recoveryTimer -= dt;
        if (boss) {
            // Descend boss to enter position
            const progress = 1.0 - (recoveryTimer / BOSS_ENTRY_TIME);
            boss.y = -boss.height + (boss.enterY + boss.height) * Math.min(1.0, progress);
        }
        if (recoveryTimer <= 0) {
            bossState = 'ACTIVE';
            if (boss) boss.y = boss.enterY;
        }
        return;
    }

    if (bossState === 'ACTIVE' && boss) {
        // Update phase
        const newPhase = getPhaseFromHealth(boss);
        if (newPhase > boss.phase) {
            boss.phase = newPhase;
            gCtx.createParticleBurst(boss.x, boss.y, boss.color, 20);
            gCtx.shakeScreen(4, 400);
            gCtx.triggerScreenGlitch();
        }

        updateBossMovement(boss, dt, gCtx);
        updateBossAttacks(boss, dt, gCtx);

        // Engine thruster spark/smoke particles
        if (Math.random() > 0.45) {
            if (boss.level === 1) {
                gCtx.createParticleBurst(boss.x - 24, boss.y - boss.height / 2, '#00f0ff', 1);
                gCtx.createParticleBurst(boss.x + 24, boss.y - boss.height / 2, '#00f0ff', 1);
            } else if (boss.level === 2) {
                gCtx.createParticleBurst(boss.x + (Math.random() - 0.5) * 32, boss.y + (Math.random() - 0.5) * 16, '#bd93f9', 1);
            } else if (boss.level === 3) {
                gCtx.createParticleBurst(boss.x + (Math.random() - 0.5) * 20, boss.y + (Math.random() - 0.5) * 20, '#ffd700', 1);
            } else {
                gCtx.createParticleBurst(boss.x, boss.y - boss.height / 2, boss.color, 1);
            }
        }

        // Update shields (Boss 3)
        if (boss.shields) {
            for (const s of boss.shields) {
                s.angle += boss.shieldRotSpeed * dt;
            }
        }

        // Afterimage trail (Voidreaper)
        if (boss.level === 2 || boss.movePattern === 'teleport') {
            boss.afterimages.push({ x: boss.x, y: boss.y, alpha: 0.3 });
            if (boss.afterimages.length > 5) boss.afterimages.shift();
            for (const ai of boss.afterimages) {
                ai.alpha *= 0.92;
            }
        }

        // Check if boss died
        if (boss.health <= 0) {
            bossDeath(gCtx);
        }
        return;
    }

    if (bossState === 'DEFEATED') {
        victoryTimer -= dt;
        if (victoryTimer <= 0) {
            bossState = 'NONE';
            boss = null;
        }
        return;
    }
}

function bossDeath(gCtx) {
    bossState = 'DEFEATED';
    victoryTimer = BOSS_VICTORY_TIME;

    // Massive explosion
    for (let i = 0; i < 6; i++) {
        const ox = (Math.random() - 0.5) * boss.width;
        const oy = (Math.random() - 0.5) * boss.height;
        gCtx.createParticleBurst(boss.x + ox, boss.y + oy, boss.color, 20);
        gCtx.createParticleBurst(boss.x + ox, boss.y + oy, '#ffffff', 10);
    }
    gCtx.shakeScreen(6, 800);
    gCtx.triggerScreenGlitch();

    // Score bonus
    const scoreBonus = boss.level * 500;
    bossDeathReward = { score: scoreBonus, comboCapIncrease: 1.0 };
    maxComboBonus += 1.0;

    // Track defeated
    bossesDefeated.push(currentBossLevel);
    
    // Update dynamic progression references
    scoreAtLastBossDefeat = gCtx.score + scoreBonus;
    timeSinceLastBoss = 0;

    if (currentBossLevel <= 3) {
        lastBossThreshold = SCRIPTED_THRESHOLDS[currentBossLevel - 1];
    } else {
        lastBossThreshold = Math.floor(lastBossThreshold * 1.35 + 500);
    }

    // Save checkpoint
    saveCheckpoint(gCtx.score + scoreBonus, currentBossLevel);

    // Drop rewards
    for (let i = 0; i < 4; i++) {
        gCtx.spawnEnergyFragment(
            boss.x + (Math.random() - 0.5) * 40,
            boss.y + (Math.random() - 0.5) * 30
        );
    }
}

export function handleBossBulletHit(bullet, gCtx) {
    if (!boss || bossState !== 'ACTIVE') return { hit: false, bulletDestroyed: false };

    // Check shield collision first (Boss 3)
    if (boss.shields) {
        for (const shield of boss.shields) {
            if (shield.health <= 0) continue;
            const angle = shield.angle + boss.rotAngle;
            const sx = boss.x + Math.cos(angle) * boss.shieldRadius;
            const sy = boss.y + Math.sin(angle) * boss.shieldRadius;

            if (Math.hypot(bullet.x - sx, bullet.y - sy) < 16) {
                shield.health--;
                gCtx.createParticleBurst(bullet.x, bullet.y, '#ffd700', 6);
                if (shield.health <= 0) {
                    gCtx.createParticleBurst(sx, sy, '#ffd700', 15);
                    gCtx.shakeScreen(2, 200);
                }
                return { hit: true, bulletDestroyed: true };
            }
        }
    }

    // Check boss body collision
    const bossRect = { x: boss.x, y: boss.y, width: boss.width * 0.75, height: boss.height * 0.75 };
    const bulletRect = { x: bullet.x, y: bullet.y, width: 8, height: 16 };

    if (gCtx.isColliding(bossRect, bulletRect)) {
        let damage = 1;
        if (bullet.pierce) damage = 2;

        boss.health -= damage;
        boss.hitFlash = 4;
        gCtx.createParticleBurst(bullet.x, bullet.y, boss.color, 5);

        let bulletDestroyed = true;
        if (bullet.pierce) {
            bullet.pierce--;
            if (bullet.pierce > 0) bulletDestroyed = false;
        }

        return { hit: true, bulletDestroyed };
    }

    return { hit: false, bulletDestroyed: false };
}

export function renderBossSystem(gCtx) {
    const { ctx, canvas, player } = gCtx;

    if (bossState === 'WARNING') {
        drawWarning(ctx, canvas);
        return;
    }

    if (bossState === 'RECOVERY') {
        drawRecoveryStation(ctx, canvas, player);
        return;
    }

    if (bossState === 'ENTERING') {
        drawBossEntry(ctx, canvas);
        if (boss) {
            drawBossSprite(ctx, boss);
        }
        return;
    }

    if ((bossState === 'ACTIVE' || bossState === 'DEFEATED') && boss) {
        // Afterimages (only when active)
        if (bossState === 'ACTIVE' && boss.afterimages.length > 0) {
            for (const ai of boss.afterimages) {
                if (ai.alpha < 0.05) continue;
                ctx.save();
                ctx.globalAlpha = ai.alpha;
                ctx.translate(ai.x, ai.y);
                if (boss.level === 1) {
                    ctx.rotate(boss.vx * 0.08);
                } else if (boss.level === 3) {
                    ctx.rotate(Math.sin(Date.now() / 1500) * 0.06);
                }
                drawBossModel(ctx, boss, boss.width, boss.height, true);
                ctx.restore();
            }
        }

        drawBossSprite(ctx, boss);

        if (bossState === 'ACTIVE') {
            drawBossShields(ctx, boss);
            drawBossBeams(ctx, boss, canvas);
            drawChargeWarning(ctx, boss, canvas);
            drawBossHealthBar(ctx, boss, canvas);
        }
    }

    if (bossState === 'DEFEATED') {
        drawDefeatedEffect(ctx, canvas);
    }
}

export function fastForwardBossTimers() {
    if (recoveryTimer > 1) recoveryTimer = 1;
    if (victoryTimer > 1) victoryTimer = 1;
}

export function getPointsNeededForBoss(level) {
    if (level === 1) return 2000;
    if (level === 2) return 3800;
    if (level === 3) return 6000;
    return 6000 + (level - 3) * 3000;
}

export function getScoreAtLastBossDefeat() {
    return scoreAtLastBossDefeat;
}

function getSurvivalTimeLimit(level) {
    if (level === 1) return 150;
    if (level === 2) return 200;
    if (level === 3) return 250;
    return 250 + (level - 3) * 60;
}

export function getBossProgress(currentScore, player, combo, closeCalls) {
    if (bossState !== 'NONE' && bossState !== 'WARNING') {
        return {
            percent: 100,
            pointsNeeded: 0,
            progressScore: 0,
            nextLevel: currentBossLevel || 1,
            bossState
        };
    }

    // Find next boss level
    let nextLevel = -1;
    for (let i = 0; i < SCRIPTED_THRESHOLDS.length; i++) {
        const level = i + 1;
        if (!bossesDefeated.includes(level)) {
            nextLevel = level;
            break;
        }
    }
    if (nextLevel === -1) {
        nextLevel = bossesDefeated.length + 1;
    }

    const basePoints = getPointsNeededForBoss(nextLevel);
    const timeLimit = getSurvivalTimeLimit(nextLevel);

    // 1. Health Modifier: energy low -> need more points (max +40%)
    let healthMod = 0;
    if (player && player.maxEnergy) {
        healthMod = (1.0 - (player.energy / player.maxEnergy)) * 0.4;
    }

    // 2. Skill Modifier: high combo, close calls -> need fewer points (max -25%)
    let skillMod = 0;
    if (combo !== undefined && closeCalls !== undefined) {
        skillMod = Math.min(0.25, (combo - 1.0) * 0.05 + closeCalls * 0.02);
    }

    // 3. Time Decay: decay factor drops down to 0.4 as timeSinceLastBoss approaches timeLimit
    const timeRatio = Math.min(1.0, timeSinceLastBoss / timeLimit);
    const decayFactor = 1.0 - timeRatio * 0.6; // decays from 1.0 down to 0.4

    // Calculate final dynamic points needed
    const dynamicPoints = Math.max(100, Math.floor(basePoints * (1.0 + healthMod - skillMod) * decayFactor));

    const progressScore = Math.max(0, currentScore - scoreAtLastBossDefeat);
    const percent = Math.min(100, Math.floor((progressScore / dynamicPoints) * 100));

    return {
        percent,
        pointsNeeded: dynamicPoints,
        progressScore,
        nextLevel,
        bossState
    };
}
