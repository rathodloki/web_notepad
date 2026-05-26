// game.js - Mini Retro Space Shooter Game for LightPad

let canvas = null;
let ctx = null;
let animationFrameId = null;
let bgImage = null;

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
    shootCooldown: 0
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

// Game stats
let score = 0;
let highscore = 0;
let combo = 1.0;
let timeElapsed = 0;
let lastSpawnTime = 0;
let lastFragmentSpawnTime = 0;
let gameStartTime = 0;

// Screen shake
let shakeTime = 0;
let shakeIntensity = 0;

// Mouse glow
let mousePos = { x: -1000, y: -1000 };
let mouseGlowActive = false;

// Procedural Audio (Web Audio API)
let audioCtx = null;
let musicInterval = null;
let musicEnabled = false;
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

const FRAGMENT_SYMBOLS = ['{}', '</>', ';', '[]', '()', '=>', '++', '01', '&&', '||'];

// -------------------------------------------------------------
// EVENT HANDLERS
// -------------------------------------------------------------

function handleKeyDown(e) {
    if (gameState === STATE_RUNNING) {
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            e.stopPropagation();
            togglePause();
            return;
        }
        if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', ' '].includes(e.key)) {
            keys[e.key] = true;
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (gameState === STATE_IDLE || gameState === STATE_GAMEOVER) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            startGame();
        }
    } else if (gameState === STATE_PAUSED) {
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            e.stopPropagation();
            togglePause();
        }
    }
}

function handleKeyUp(e) {
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
    if (!audioCtx || !musicEnabled) return;
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
        }
    } catch (e) {
        console.warn("Sound play failed", e);
    }
}

// Synthwave procedural baseline & melody sequencer
function startProceduralMusic() {
    if (!audioCtx) return;
    stopProceduralMusic();

    let step = 0;
    // Cyberpunk progression: Am (A2), C (C3), G (G2), F (F2)
    const chords = [
        [110.00, 165.00], // A2, E3
        [130.81, 196.00], // C3, G3
        [98.00, 146.83],  // G2, D3
        [87.31, 130.81]   // F2, C3
    ];

    musicInterval = setInterval(() => {
        if (!musicEnabled || gameState !== STATE_RUNNING) return;
        try {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const chordIndex = Math.floor(step / 8) % chords.length;
            const isSubBeat = step % 2 !== 0;
            const freq = chords[chordIndex][isSubBeat ? 1 : 0];

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            // Add slight vibrato/pitch LFO
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.frequency.value = 6;
            lfoGain.gain.value = 3;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);

            lfo.start();
            osc.start();
            lfo.stop(audioCtx.currentTime + 0.25);
            osc.stop(audioCtx.currentTime + 0.25);

            // Subtle Pentatonic Lead Melody overlay on steps
            if (step % 4 === 0) {
                const leadOsc = audioCtx.createOscillator();
                const leadGain = audioCtx.createGain();
                leadOsc.type = 'sine';

                const melodyProgression = [
                    [440.00, 523.25, 587.33, 659.25], // Am: A4, C5, D5, E5
                    [523.25, 587.33, 659.25, 783.99], // C: C5, D5, E5, G5
                    [392.00, 440.00, 493.88, 587.33], // G: G4, A4, B4, D5
                    [349.23, 440.00, 523.25, 698.46]  // F: F4, A4, C5, F5
                ];
                const notes = melodyProgression[chordIndex];
                const leadFreq = notes[Math.floor(Math.random() * notes.length)];

                leadOsc.frequency.setValueAtTime(leadFreq, audioCtx.currentTime);
                leadOsc.connect(leadGain);
                leadGain.connect(audioCtx.destination);
                leadGain.gain.setValueAtTime(0.035, audioCtx.currentTime);
                leadGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.42);

                leadOsc.start();
                leadOsc.stop(audioCtx.currentTime + 0.45);
            }

            step++;
        } catch (e) {
            console.error("Music scheduler error", e);
        }
    }, 180); // Snappy tempo (~166 BPM)
}

function stopProceduralMusic() {
    if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
}

function toggleMusic() {
    initAudio();
    musicEnabled = !musicEnabled;

    const musicIcon = document.getElementById('game-music-icon');
    if (musicIcon) {
        if (musicEnabled) {
            musicIcon.classList.remove('muted');
            if (gameState === STATE_RUNNING) {
                startProceduralMusic();
            }
        } else {
            musicIcon.classList.add('muted');
            stopProceduralMusic();
        }
    }
}

// -------------------------------------------------------------
// DRAW HELPERS
// -------------------------------------------------------------

function drawPixelSprite(sprite, sx, sy, pixelSize, color, glowColor) {
    ctx.save();
    if (glowColor) {
        ctx.shadowBlur = 10;
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
        ctx.shadowBlur = 12;
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
    ctx.shadowBlur = 12;
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

    const colorMap = isDamaged ? {
        1: '#ffffff',
        2: '#ff3366',
        3: '#ff0000'
    } : {
        1: '#ffffff',
        2: '#00f0ff',
        3: '#3b82f6'
    };
    
    const glowColor = isDamaged ? '#ff0033' : '#00f0ff';

    // Renders the color-mapped 16x16 pixel ship at scale 2.0 (32x32 bounding box)
    drawMultiPixelSprite(PLAYER_SHIP_SPRITE, drawX, drawY, 2.0, colorMap, glowColor);

    // Dynamic dual exhaust engine thruster flames
    const isMoving = keys.w || keys.ArrowUp;
    const flameHeight = isMoving ? 15 + Math.random() * 9 : 5 + Math.random() * 5;
    const flameColor = isMoving ? '#ff007f' : '#ff79c6';
    
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

    ctx.restore();
}

function drawHolographicGrid(time) {
    ctx.save();
    const horizon = canvas.height * 0.42;
    const gridHeight = canvas.height - horizon;
    const speed = 0.06;
    const offset = (time * speed) % 35;

    // 1. Perspective Horizontal Lines flowing down
    for (let y = 0; y < gridHeight; y += 35) {
        const ly = horizon + ((y + offset) % gridHeight);
        const ratio = (ly - horizon) / gridHeight;
        ctx.strokeStyle = `rgba(0, 240, 255, ${ratio * 0.12})`;
        ctx.lineWidth = 1.0 + ratio * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(canvas.width, ly);
        ctx.stroke();
    }

    // 2. Converging Perspective Vertical Lines
    const centerX = canvas.width / 2;
    const numLines = 14;
    for (let i = -numLines; i <= numLines; i++) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.045)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(centerX, horizon);
        const bx = centerX + (i * (canvas.width / 7.5));
        ctx.lineTo(bx, canvas.height);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFragment(frag) {
    ctx.save();
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rot);
    ctx.scale(frag.pulseScale, frag.pulseScale);
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = frag.glow;
    ctx.fillStyle = frag.color;
    ctx.strokeStyle = frag.color;
    ctx.lineWidth = 1.5;
    
    if (frag.type === 'crystal') {
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (frag.type === 'shard') {
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(4, 7);
        ctx.lineTo(-4, 7);
        ctx.closePath();
        ctx.fill();
    } else if (frag.type === 'cube') {
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#060609';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('[]', 0, 0);
    } else if (frag.type === 'orb') {
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// -------------------------------------------------------------
// GAME INITIALIZATION & RESET
// -------------------------------------------------------------

export function initGame() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    if (!bgImage) {
        bgImage = new Image();
        bgImage.src = 'game-bg.webp';
    }
    resizeCanvas();

    // Reset controls
    Object.keys(keys).forEach(k => keys[k] = false);

    // Initial positioning
    player.x = canvas.width / 2;
    player.y = canvas.height * 0.75;
    player.vx = 0;
    player.vy = 0;
    player.energy = player.maxEnergy;
    player.damageFlash = 0;
    player.shootCooldown = 0;

    // Load stats
    score = 0;
    combo = 1.0;
    highscore = parseInt(localStorage.getItem('lightpad_game_highscore') || '0', 10);
    updateScoreUI();

    gameState = STATE_IDLE;
    showScreen(STATE_IDLE);

    // Reset game entities
    bugs = [];
    fragments = [];
    particles = [];
    bullets = [];
    enemyProjectiles = [];
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
        const finalScoreVal = document.getElementById('game-final-score');
        if (finalScoreVal) finalScoreVal.textContent = String(score).padStart(6, '0');
    }
}

function startGame() {
    gameState = STATE_RUNNING;
    showScreen(STATE_RUNNING);

    player.x = canvas.width / 2;
    player.y = canvas.height * 0.75;
    player.vx = 0;
    player.vy = 0;
    player.energy = player.maxEnergy;
    player.damageFlash = 0;
    player.shootCooldown = 0;

    score = 0;
    combo = 1.0;
    timeElapsed = 0;
    gameStartTime = Date.now();
    lastSpawnTime = Date.now();
    lastFragmentSpawnTime = Date.now();

    bugs = [];
    fragments = [];
    particles = [];
    bullets = [];
    enemyProjectiles = [];

    updateScoreUI();
    if (musicEnabled) {
        startProceduralMusic();
    }
}

function togglePause() {
    if (gameState === STATE_RUNNING) {
        gameState = STATE_PAUSED;
        showScreen(STATE_PAUSED);
        stopProceduralMusic();
    } else if (gameState === STATE_PAUSED) {
        gameState = STATE_RUNNING;
        showScreen(STATE_RUNNING);
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
    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        emptyState.classList.remove('screen-glitch-active');
        void emptyState.offsetWidth; // Force Reflow
        emptyState.classList.add('screen-glitch-active');
        setTimeout(() => {
            emptyState.classList.remove('screen-glitch-active');
        }, 360);
    }
}

function isColliding(rect1, rect2) {
    return rect1.x - rect1.width/2 < rect2.x + rect2.width/2 &&
           rect1.x + rect1.width/2 > rect2.x - rect2.width/2 &&
           rect1.y - rect1.height/2 < rect2.y + rect2.height/2 &&
           rect1.y + rect1.height/2 > rect2.y - rect2.height/2;
}

function spawnEnergyFragment(x, y) {
    const types = ['crystal', 'shard', 'cube', 'orb'];
    const type = types[Math.floor(Math.random() * types.length)];
    let color = '#00f0ff';
    let glow = 'rgba(0, 240, 255, 0.6)';
    
    if (type === 'shard') {
        color = '#bd93f9'; // purple
        glow = 'rgba(189, 147, 249, 0.6)';
    } else if (type === 'cube') {
        color = '#50fa7b'; // green
        glow = 'rgba(80, 250, 123, 0.6)';
    } else if (type === 'orb') {
        color = '#ff55ff'; // pink
        glow = 'rgba(255, 85, 255, 0.6)';
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
        pulseSpeed: Math.random() * 0.05 + 0.035
    });
}

// -------------------------------------------------------------
// GAME LOOP
// -------------------------------------------------------------

function gameLoop() {
    if (!canvas || !ctx) return;

    animationFrameId = requestAnimationFrame(gameLoop);

    // Apply Screen Shake Camera transform
    ctx.save();
    if (shakeTime > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeTime -= 16.67;
    }

    // Draw deep-space radial gradient background (underlay fallback)
    const bgGrad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width
    );
    bgGrad.addColorStop(0, '#0a0d16');
    bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
            ctx.drawImage(bgImage, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
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
    const nebGrad = ctx.createRadialGradient(nebX, nebY, 10, nebX, nebY, 280);
    nebGrad.addColorStop(0, 'rgba(59, 130, 246, 0.045)');
    nebGrad.addColorStop(0.5, 'rgba(189, 147, 249, 0.03)');
    nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Render stars with parallax
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.save();
        ctx.globalAlpha = star.alpha;
        if (gameState === STATE_RUNNING) {
            star.y += star.speed * (1.0 + (combo - 1) * 0.22);
            if (star.y > canvas.height) {
                star.y = 0;
                star.x = Math.random() * canvas.width;
            }
        }
        ctx.fillRect(star.x, star.y, star.size, star.size);
        ctx.restore();
    });

    // Render background symbols
    bgSymbols.forEach(sym => {
        ctx.save();
        ctx.globalAlpha = sym.alpha;
        ctx.fillStyle = '#3b82f6';
        ctx.font = `${sym.size}px 'Geist Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (gameState === STATE_RUNNING) {
            sym.y += sym.speed * (1.0 + (combo - 1) * 0.18);
            sym.rot += sym.rotSpeed;
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
    drawHolographicGrid(Date.now());

    if (gameState === STATE_RUNNING) {
        updateGame();
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
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    ctx.restore(); // Restore shake camera
    tickVisualizer();
}

function updateGame() {
    timeElapsed = Date.now() - gameStartTime;

    // 1. Move Player
    let dx = 0;
    let dy = 0;

    if (keys.w || keys.ArrowUp) dy -= player.speed;
    if (keys.s || keys.ArrowDown) dy += player.speed;
    if (keys.a || keys.ArrowLeft) dx -= player.speed;
    if (keys.d || keys.ArrowRight) dx += player.speed;

    player.vx += dx;
    player.vy += dy;
    player.vx *= player.friction;
    player.vy *= player.friction;

    const speedVal = Math.hypot(player.vx, player.vy);
    if (speedVal > player.maxSpeed) {
        player.vx = (player.vx / speedVal) * player.maxSpeed;
        player.vy = (player.vy / speedVal) * player.maxSpeed;
    }

    player.x += player.vx;
    player.y += player.vy;

    // Boundary constraints
    const margin = 16;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > canvas.width - margin) { player.x = canvas.width - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > canvas.height - margin) { player.y = canvas.height - margin; player.vy = 0; }

    // Thruster trail particles
    if (Math.random() > 0.4) {
        const trailColor = Math.random() > 0.4 ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 0, 127, 0.65)';
        spawnParticle('trail', player.x - 3 + (Math.random() - 0.5) * 2, player.y + 11, trailColor, { vy: Math.random() * 2 + 1.2 });
        spawnParticle('trail', player.x + 3 + (Math.random() - 0.5) * 2, player.y + 11, trailColor, { vy: Math.random() * 2 + 1.2 });
    }

    // 2. Weapon Laser Fire System
    if (player.shootCooldown > 0) {
        player.shootCooldown--;
    } else {
        if (keys[' ']) {
            // Manual spacebar fire: heavy dual-lasers from wingtips
            bullets.push({ x: player.x - 11, y: player.y - 4, vy: -12.5, color: '#00f0ff' });
            bullets.push({ x: player.x + 11, y: player.y - 4, vy: -12.5, color: '#00f0ff' });
            playSound('laser');
            player.shootCooldown = 13; // Faster fire rate
        } else {
            // Auto-fire: single center light-laser
            bullets.push({ x: player.x, y: player.y - 12, vy: -12.5, color: '#00f0ff' });
            playSound('laser');
            player.shootCooldown = 19;
        }
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.y += b.vy;
        if (b.y < -15) {
            bullets.splice(i, 1);
        }
    }

    // 3. Spawning System (Scales up over time)
    const elapsedSecs = timeElapsed / 1000;
    const bugSpawnDelay = Math.max(380, 1500 - elapsedSecs * 25);
    const speedMultiplier = Math.min(2.5, 1.0 + elapsedSecs * 0.015);

    if (Date.now() - lastSpawnTime > bugSpawnDelay) {
        const r = Math.random();
        let enemyType = 'bug';

        // Select type based on weights and elapsed time
        if (elapsedSecs > 25 && r < 0.16) {
            enemyType = 'drone';
        } else if (elapsedSecs > 16 && r < 0.32) {
            enemyType = 'orb';
        } else if (elapsedSecs > 10 && r < 0.46) {
            enemyType = 'cube';
        } else if (elapsedSecs > 4 && r < 0.60) {
            enemyType = 'swarm';
        }

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
                health: 2,
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
                health: 2,
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
                health: 3,
                damage: 25,
                color: '#bd93f9', // Purple
                glow: 'rgba(189, 147, 249, 0.7)',
                hitFlash: 0,
                scoreValue: 30
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
                health: 1,
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
    if (Date.now() - lastFragmentSpawnTime > fragmentSpawnDelay) {
        spawnEnergyFragment(Math.random() * (canvas.width - 60) + 30, -20);
        lastFragmentSpawnTime = Date.now();
    }

    // 4. Update Bullets vs Enemies Collision
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletDestroyed = false;

        for (let j = bugs.length - 1; j >= 0; j--) {
            const bug = bugs[j];

            if (isColliding({ x: bullet.x, y: bullet.y, width: 8, height: 16 }, bug)) {
                bug.health--;
                bug.hitFlash = 3;
                playSound('hit');
                createParticleBurst(bullet.x, bullet.y, '#00f0ff', 5);

                bulletDestroyed = true;

                if (bug.health <= 0) {
                    playSound('explosion');
                    createParticleBurst(bug.x, bug.y, bug.color, 18);
                    shakeScreen(bug.type === 'cube' ? 10 : 5, 200);

                    // Split Cube Shards
                    if (bug.type === 'cube') {
                        for (let k = 0; k < 3; k++) {
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

                    // Score calculation
                    const points = Math.round(bug.scoreValue * combo);
                    score += points;
                    updateScoreUI();

                    // Drop fragment (25% chance)
                    if (Math.random() < 0.25) {
                        spawnEnergyFragment(bug.x, bug.y);
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
    for (let i = bugs.length - 1; i >= 0; i--) {
        const bug = bugs[i];

        // Specific enemy type movement AI
        if (bug.type === 'drone') {
            if (!bug.hovering && bug.y >= bug.targetY) {
                bug.hovering = true;
                bug.vy = 0;
            }

            if (bug.hovering) {
                bug.x += bug.vx;
                if (bug.x < 30 || bug.x > canvas.width - 30) {
                    bug.vx *= -1;
                }

                bug.shootCooldown--;
                if (bug.shootCooldown <= 0) {
                    enemyProjectiles.push({
                        x: bug.x,
                        y: bug.y + 12,
                        vy: 4.8,
                        color: '#ff55ff'
                    });
                    playSound('drone_fire');
                    bug.shootCooldown = 90 + Math.random() * 70;
                }
            } else {
                bug.y += bug.vy;
            }
        } else if (bug.type === 'orb') {
            bug.pulseTime += 0.14;
            bug.chargeTimer--;

            if (bug.chargeTimer <= 0) {
                const dx = player.x - bug.x;
                bug.vx = Math.sign(dx) * 2.8;
                bug.vy = 5.6;
                bug.chargeTimer = 110 + Math.random() * 60;
            } else {
                bug.y += bug.vy;
                bug.x += Math.sin(bug.pulseTime) * 0.7;
            }
        } else {
            bug.y += bug.vy;
            bug.x += bug.vx;

            if (bug.x < 15 || bug.x > canvas.width - 15) {
                bug.vx *= -1;
            }
        }

        // Out of screen
        if (bug.y > canvas.height + 25) {
            bugs.splice(i, 1);
            continue;
        }

        // Player Collision check
        if (isColliding(player, bug)) {
            player.energy -= bug.damage;
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
        ep.y += ep.vy;

        if (ep.y > canvas.height + 15) {
            enemyProjectiles.splice(i, 1);
            continue;
        }

        if (isColliding(player, { x: ep.x, y: ep.y, width: 8, height: 8 })) {
            player.energy -= 12;
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
        frag.y += frag.vy;
        frag.x += frag.vx;
        frag.rot += frag.rotSpeed;
        frag.pulseScale = 1.0 + Math.sin(Date.now() * frag.pulseSpeed) * 0.14;

        if (frag.x < 15 || frag.x > canvas.width - 15) {
            frag.vx *= -1;
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
            createParticleBurst(frag.x, frag.y, frag.color, 12);

            const pointsGained = Math.round(20 * combo);
            score += pointsGained;

            player.energy = Math.min(player.maxEnergy, player.energy + 8);
            combo = Math.min(5.0, combo + 0.1);

            updateScoreUI();
            fragments.splice(i, 1);
            continue;
        }
    }

    // 8. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        if (p.type === 'smoke') {
            p.size = Math.min(p.maxSize, p.size + 0.22);
        }
        
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
}

function renderEntities() {
    // 1. Draw Exhaust/Trail Particles
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        
        if (p.type === 'smoke') {
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        
        ctx.restore();
    });

    // 2. Draw Player Laser Bullets
    bullets.forEach(b => {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = b.color;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
        ctx.restore();
    });

    // 3. Draw Enemy Projectiles
    enemyProjectiles.forEach(ep => {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = ep.color;
        ctx.fillStyle = ep.color;
        ctx.fillRect(ep.x - 3, ep.y - 3, 6, 6);
        ctx.restore();
    });

    // 4. Draw Spaceship
    drawSpaceship(player.x, player.y);

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
            const flap = Math.sin(Date.now() / 110) > 0;
            const sprite = flap ? BUG_SPRITE : BUG_SPRITE_FLAP;
            drawPixelSprite(sprite, bug.x, bug.y, 2.2, color, glow);
        } else if (bug.type === 'orb') {
            const pulse = 1.0 + Math.sin(Date.now() / 130) * 0.15;
            ctx.save();
            ctx.translate(bug.x, bug.y);
            ctx.scale(pulse, pulse);
            drawPixelSprite(VIRUS_SPRITE, 0, 0, 2.4, color, glow);
            ctx.restore();
        } else if (bug.type === 'swarm') {
            drawPixelSprite(SWARM_SPRITE, bug.x, bug.y, 2.0, color, glow);
        } else if (bug.type === 'drone') {
            drawPixelSprite(DRONE_SPRITE, bug.x, bug.y, 2.6, color, glow);
        } else if (bug.type === 'cube_shard') {
            ctx.save();
            ctx.translate(bug.x, bug.y);
            ctx.rotate(Date.now() / 80);
            ctx.shadowBlur = 8;
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
}

// -------------------------------------------------------------
// MUSIC VISUALIZER EFFECT (SIMULATED OR AUDIO SYNCD)
// -------------------------------------------------------------

function tickVisualizer() {
    const bars = document.querySelectorAll('.v-bar');
    if (!bars.length) return;

    bars.forEach((bar, idx) => {
        let targetHeight = 3;

        if (musicEnabled && gameState === STATE_RUNNING) {
            const timeSeed = Date.now() / 70;
            const waveVal = Math.sin(timeSeed + idx * 0.8) * Math.cos(timeSeed * 0.5 + idx);
            targetHeight = 4 + Math.abs(waveVal) * 11;
        } else {
            const timeSeed = Date.now() / 350;
            const waveVal = Math.sin(timeSeed + idx * 0.5);
            targetHeight = 2 + Math.abs(waveVal) * 4;
        }

        if (targetHeight < 2) targetHeight = 2;
        if (targetHeight > 16) targetHeight = 16;

        bar.style.height = `${targetHeight}px`;
    });
}
