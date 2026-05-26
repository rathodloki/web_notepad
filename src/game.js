// game.js - Mini Retro Space Shooter Game for LightPad

let canvas = null;
let ctx = null;
let animationFrameId = null;

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
    speed: 0.6,
    friction: 0.88,
    maxSpeed: 6.5,
    energy: 100,
    maxEnergy: 100
};

// Controls tracking
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

// Game entities
let bugs = [];
let fragments = [];
let particles = [];
let stars = [];

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
let synthOscillator = null;
let musicEnabled = false;
let audioUnlocked = false;

// Sprite Definitions (Pixel matrices)
const BUG_SPRITE_1 = [
    [0,0,1,0,0,0,1,0,0],
    [0,1,0,1,0,1,0,1,0],
    [0,1,1,1,1,1,1,1,0],
    [1,0,1,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,1,1],
    [0,0,1,1,1,1,1,0,0],
    [0,1,0,0,0,0,0,1,0],
    [1,0,0,0,0,0,0,0,1]
];

const BUG_SPRITE_2 = [
    [0,0,0,1,1,1,0,0,0],
    [0,1,1,0,1,0,1,1,0],
    [1,1,1,1,1,1,1,1,1],
    [1,0,1,1,1,1,1,0,1],
    [1,0,1,0,0,0,1,0,1],
    [0,0,0,1,0,1,0,0,0],
    [0,1,1,0,0,0,1,1,0]
];

const BUG_SPRITE_3 = [
    [0,0,1,1,0,1,1,0,0],
    [0,1,1,1,1,1,1,1,0],
    [1,1,0,1,1,1,0,1,1],
    [1,1,1,1,1,1,1,1,1],
    [0,0,1,0,0,0,1,0,0],
    [0,1,0,1,0,1,0,1,0],
    [1,0,0,0,0,0,0,0,1]
];

const FRAGMENT_SYMBOLS = ['{}', '</>', ';', '[]', '()', '=>', '++'];

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
        if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
            keys[e.key] = true;
            // Prevent default browser scrolling on arrow keys inside editor shell
            e.preventDefault();
            e.stopPropagation();
        }
    } else if (gameState === STATE_IDLE) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            startGame();
        }
    } else if (gameState === STATE_GAMEOVER) {
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
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
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
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'hit') {
            // Glitch detune explosion sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'gameover') {
            // Descending sad synth chord
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.8);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.start(now);
            osc.stop(now + 0.8);
        }
    } catch (e) {
        console.warn("Sound play failed", e);
    }
}

// Synthwave procedural baseline sequencer
function startProceduralMusic() {
    if (!audioCtx) return;
    stopProceduralMusic();

    let step = 0;
    // Cyberpunk progression: Am, C, G, F
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

            // Add slight vibrato
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.frequency.value = 8; // Hz
            lfoGain.gain.value = 4; // cents
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

            step++;
        } catch (e) {
            console.error("Music scheduler error", e);
        }
    }, 200); // 120 BPM 8th notes
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
    ctx.shadowBlur = 12;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = color;

    const rows = sprite.length;
    const cols = sprite[0].length;
    const offsetX = - (cols * pixelSize) / 2;
    const offsetY = - (rows * pixelSize) / 2;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (sprite[r][c] === 1) {
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

function drawSpaceship(x, y) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f0ff';
    ctx.strokeStyle = '#00f0ff';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.lineWidth = 2.5;

    // Draw high tech vector ship outline
    ctx.beginPath();
    ctx.moveTo(x, y - 18);          // Nose
    ctx.lineTo(x + 13, y + 11);     // Right wingtip
    ctx.lineTo(x + 5, y + 6);       // Right inner hull
    ctx.lineTo(x - 5, y + 6);       // Left inner hull
    ctx.lineTo(x - 13, y + 11);     // Left wingtip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw engine flame when moving forward or periodically when idle
    const isMoving = keys.w || keys.ArrowUp || Math.random() > 0.4;
    if (isMoving && gameState === STATE_RUNNING) {
        ctx.shadowColor = '#ff007f';
        ctx.fillStyle = '#ff007f';
        ctx.beginPath();
        ctx.moveTo(x - 4, y + 7);
        ctx.lineTo(x, y + 14 + Math.random() * 8);
        ctx.lineTo(x + 4, y + 7);
        ctx.closePath();
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
    resizeCanvas();

    // Reset controls
    Object.keys(keys).forEach(k => keys[k] = false);

    // Initial positioning
    player.x = canvas.width / 2;
    player.y = canvas.height * 0.75;
    player.vx = 0;
    player.vy = 0;
    player.energy = player.maxEnergy;

    // Load stats
    score = 0;
    combo = 1.0;
    highscore = parseInt(localStorage.getItem('lightpad_game_highscore') || '0', 10);
    updateScoreUI();

    gameState = STATE_IDLE;
    showScreen(STATE_IDLE);

    // Generate static space objects
    bugs = [];
    fragments = [];
    particles = [];
    generateStars();

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
    // Release event listeners
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
    }
    window.removeEventListener('resize', resizeCanvas);

    // Stop music synth loop
    stopProceduralMusic();

    // Clear render loop
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    // Reposition player if out of bounds
    if (player.x > canvas.width) player.x = canvas.width / 2;
    if (player.y > canvas.height) player.y = canvas.height * 0.75;
}

function generateStars() {
    stars = [];
    const count = Math.min(120, Math.floor((canvas.width * canvas.height) / 4000));
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.8 + 0.4,
            speed: Math.random() * 0.8 + 0.1,
            alpha: Math.random() * 0.7 + 0.3
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

    // Sync current segments
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

    score = 0;
    combo = 1.0;
    timeElapsed = 0;
    gameStartTime = Date.now();
    lastSpawnTime = Date.now();
    lastFragmentSpawnTime = Date.now();

    bugs = [];
    fragments = [];
    particles = [];

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

    // Trigger gameover visual burst
    createParticleBurst(player.x, player.y, '#ff0055', 40);
    createParticleBurst(player.x, player.y, '#00f0ff', 30);
    shakeScreen(15, 600);
}

// -------------------------------------------------------------
// PHYSICS & COLLISION ENGINE
// -------------------------------------------------------------

function createParticleBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1.5;
        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 3 + 1,
            color,
            alpha: 1.0,
            decay: Math.random() * 0.03 + 0.015
        });
    }
}

function shakeScreen(intensity, duration) {
    shakeIntensity = intensity;
    shakeTime = duration;
}

// AABB collision helper
function isColliding(rect1, rect2) {
    return rect1.x - rect1.width/2 < rect2.x + rect2.width/2 &&
           rect1.x + rect1.width/2 > rect2.x - rect2.width/2 &&
           rect1.y - rect1.height/2 < rect2.y + rect2.height/2 &&
           rect1.y + rect1.height/2 > rect2.y - rect2.height/2;
}

// -------------------------------------------------------------
// GAME LOOP
// -------------------------------------------------------------

function gameLoop() {
    if (!canvas || !ctx) return;

    // Reschedule
    animationFrameId = requestAnimationFrame(gameLoop);

    // Apply Screen Shake Camera transform
    ctx.save();
    let shakeOffset = { x: 0, y: 0 };
    if (shakeTime > 0) {
        shakeOffset.x = (Math.random() - 0.5) * shakeIntensity;
        shakeOffset.y = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(shakeOffset.x, shakeOffset.y);
        shakeTime -= 16.67; // Assuming 60fps (16.67ms per frame)
    }

    // Draw background
    ctx.fillStyle = '#060609';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render stars with parallax
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.save();
        ctx.globalAlpha = star.alpha;
        if (gameState === STATE_RUNNING) {
            star.y += star.speed * (1.0 + (combo - 1) * 0.3); // Speed up stars at high combo
            if (star.y > canvas.height) {
                star.y = 0;
                star.x = Math.random() * canvas.width;
            }
        }
        ctx.fillRect(star.x, star.y, star.size, star.size);
        ctx.restore();
    });

    if (gameState === STATE_RUNNING) {
        updateGame();
    } else if (gameState === STATE_IDLE) {
        // Space float animation in idle state
        player.x = canvas.width / 2 + Math.sin(Date.now() / 800) * 15;
        player.y = canvas.height * 0.7 + Math.cos(Date.now() / 600) * 8;
    }

    // Render Entities
    renderEntities();

    // Render Mouse glow
    if (mouseGlowActive) {
        ctx.save();
        const radGrd = ctx.createRadialGradient(
            mousePos.x, mousePos.y, 0,
            mousePos.x, mousePos.y, 80
        );
        radGrd.addColorStop(0, 'rgba(0, 240, 255, 0.05)');
        radGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radGrd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // Restore shake transform
    ctx.restore();

    // Animate Visualizer Bars in HUD
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

    // Apply friction/inertia decay
    player.vx *= player.friction;
    player.vy *= player.friction;

    // Limit to max speed
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

    // Thruster exhaust particles trailing behind engine
    if (Math.random() > 0.45) {
        particles.push({
            x: player.x + (Math.random() - 0.5) * 6,
            y: player.y + 10,
            vx: (Math.random() - 0.5) * 1.2,
            vy: Math.random() * 2 + 1.5,
            size: Math.random() * 2.5 + 0.8,
            color: Math.random() > 0.4 ? 'rgba(0, 240, 255, 0.6)' : 'rgba(192, 132, 252, 0.6)',
            alpha: 0.8,
            decay: Math.random() * 0.05 + 0.03
        });
    }

    // 2. Entity Spawning (Difficulty scales up with time)
    const elapsedSecs = timeElapsed / 1000;
    const bugSpawnDelay = Math.max(450, 1600 - elapsedSecs * 30); // scale speed from 1.6s to 0.45s min
    const bugSpeed = Math.min(6.5, 2.5 + elapsedSecs * 0.08);

    // Spawn Bug Glitches
    if (Date.now() - lastSpawnTime > bugSpawnDelay) {
        const spriteChoice = Math.random();
        let chosenMatrix = BUG_SPRITE_1;
        let bugColor = '#ff0055'; // Pink-red
        let bugGlow = 'rgba(255, 0, 85, 0.8)';
        let damage = 18;

        if (spriteChoice > 0.65) {
            chosenMatrix = BUG_SPRITE_2;
            bugColor = '#bd93f9'; // Pastel Purple
            bugGlow = 'rgba(189, 147, 249, 0.8)';
            damage = 25; // Brute bug
        } else if (spriteChoice > 0.4) {
            chosenMatrix = BUG_SPRITE_3;
            bugColor = '#ff79c6'; // Hot Pink
            bugGlow = 'rgba(255, 121, 198, 0.8)';
            damage = 15;
        }

        bugs.push({
            x: Math.random() * (canvas.width - 40) + 20,
            y: -20,
            width: 24,
            height: 24,
            sprite: chosenMatrix,
            pixelSize: 2.2,
            color: bugColor,
            glow: bugGlow,
            vy: Math.random() * 1.5 + bugSpeed,
            vx: (Math.random() - 0.5) * 1.8,
            damage
        });

        lastSpawnTime = Date.now();
    }

    // Spawn Code Fragments
    const fragmentSpawnDelay = Math.max(1200, 2400 - elapsedSecs * 15);
    if (Date.now() - lastFragmentSpawnTime > fragmentSpawnDelay) {
        fragments.push({
            x: Math.random() * (canvas.width - 60) + 30,
            y: -20,
            width: 28,
            height: 20,
            char: FRAGMENT_SYMBOLS[Math.floor(Math.random() * FRAGMENT_SYMBOLS.length)],
            vy: Math.random() * 1.0 + 2.0,
            vx: (Math.random() - 0.5) * 0.5,
            glowColor: '#00f0ff'
        });

        lastFragmentSpawnTime = Date.now();
    }

    // 3. Update Bugs
    for (let i = bugs.length - 1; i >= 0; i--) {
        const bug = bugs[i];
        bug.y += bug.vy;
        bug.x += bug.vx;

        // Bounce off side boundaries
        if (bug.x < 15 || bug.x > canvas.width - 15) {
            bug.vx *= -1;
        }

        // Out of screen removal
        if (bug.y > canvas.height + 20) {
            bugs.splice(i, 1);
            continue;
        }

        // Player Collision check
        if (isColliding(player, bug)) {
            // Hit!
            player.energy -= bug.damage;
            playSound('hit');
            createParticleBurst(bug.x, bug.y, bug.color, 15);
            shakeScreen(8, 250);

            // Reset combo multiplier
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

    // 4. Update Fragments
    for (let i = fragments.length - 1; i >= 0; i--) {
        const frag = fragments[i];
        frag.y += frag.vy;
        frag.x += frag.vx;

        // Out of screen
        if (frag.y > canvas.height + 20) {
            fragments.splice(i, 1);
            // Missed item decays combo back to 1.0
            if (combo > 1.0) {
                combo = 1.0;
                updateScoreUI();
            }
            continue;
        }

        // Player Collection check
        if (isColliding(player, frag)) {
            playSound('collect');

            // Burst particle FX
            createParticleBurst(frag.x, frag.y, '#00f0ff', 12);

            // Update stats
            const pointsGained = Math.round(15 * combo);
            score += pointsGained;

            // Increase energy slightly
            player.energy = Math.min(player.maxEnergy, player.energy + 6);

            // Increment combo multiplier
            combo = Math.min(5.0, combo + 0.1);

            updateScoreUI();

            fragments.splice(i, 1);
            continue;
        }
    }

    // 5. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
}

function renderEntities() {
    // 1. Draw Exhaust Particles
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // 2. Draw Spaceship (Always rendered)
    drawSpaceship(player.x, player.y);

    // 3. Draw Bugs (enemies)
    bugs.forEach(bug => {
        drawPixelSprite(bug.sprite, bug.x, bug.y, bug.pixelSize, bug.color, bug.glow);
    });

    // 4. Draw Fragments (glowing code symbols)
    fragments.forEach(frag => {
        ctx.save();
        ctx.font = "bold 13px 'Geist Mono', 'Courier New', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Outer glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = frag.glowColor;

        // Dynamic pulsing style
        const pulse = 1.0 + Math.sin(Date.now() / 150) * 0.15;
        ctx.scale(pulse, pulse);

        ctx.fillStyle = '#00f0ff';
        // Adjust for scale transform positioning offset
        ctx.fillText(frag.char, frag.x / pulse, frag.y / pulse);
        ctx.restore();
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
            // Active synth synced feel
            const timeSeed = Date.now() / 80;
            const waveVal = Math.sin(timeSeed + idx * 0.8) * Math.cos(timeSeed * 0.5 + idx);
            targetHeight = 4 + Math.abs(waveVal) * 11;
        } else {
            // Ambient simulated soft pulse
            const timeSeed = Date.now() / 400;
            const waveVal = Math.sin(timeSeed + idx * 0.5);
            targetHeight = 2 + Math.abs(waveVal) * 4;
        }

        // Clip constraints
        if (targetHeight < 2) targetHeight = 2;
        if (targetHeight > 16) targetHeight = 16;

        bar.style.height = `${targetHeight}px`;
    });
}
