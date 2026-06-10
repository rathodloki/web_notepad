# Arcade Game & Audio Engine

## Overview

LightPad contains an embedded space shooter arcade game and a stream-based music player. The arcade runs on a high-performance canvas rendering loop, adjusting boss mechanics using Dynamic Difficulty Adjustment (DDA), while the audio player routes Web Audio API data through Fast Fourier Transform (FFT) analyzers to power reactive visualizers.

- **Volatile Game Loop** — Suspend the requestAnimationFrame loops and game tickers when switching tabs to prevent background resource leaks.
- **Dynamic Difficulty Adjustment (DDA)** — Scale boss fire rates, enemy hitpoints, and score multipliers dynamically based on the user's active energy levels.
- **Streaming Web Audio Analyzers** — Capture real-time frequency bins from online audio streams to sync layout border glow pulses and HUD visualizer heights.

```
       +-------------------------------------------------+
       |                  tab-arcade UI                  |
       +------------------------+------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                       game-canvas (Canvas 2D)                   |
|  - gameLoop()               - Player Ship                       |
|  - Enemy Tickers            - Boss.js (Vector detailed sprites) |
+-----------------------------------------------------------------+
                                ^
                                | (FFT Data Array)
+-----------------------------------------------------------------+
|                     Web Audio Stream Analyser                   |
|  - music-impl.js            - music-reaction.js                 |
|  - AudioContext             - Coderadio API Polls               |
+-----------------------------------------------------------------+
```

## Core Types / Structure

### Space Shooter Arcade

[`src/game.js`](../src/game.js)

| Parameter / Method | Type | Purpose |
|------|------|---------|
| `initGame` | `()` | Sets up key bindings, canvas dimensions, parallax star fields, and triggers the animation frames. |
| `stopGame` | `()` | Cancels active game loops, clears intervals, and releases keys. |
| `pauseGameOnTabLeave`| `()` | Freezes ship positions and stops ticker ticks without resetting player stats. |
| `drawBossSprite` | `(ctx, boss)` | Renders multi-stage boss geometries, vector cracks, and orbiting charge shields. |

### Boss Geometries & Difficulty

[`src/boss.js`](../src/boss.js)

| Parameter / Method | Type | Purpose |
|------|------|---------|
| `Sentinel / Leviathan`| Boss profiles | Custom coordinates and vector matrices for distinct boss types. |
| `DDA Factors` | Config object | Difficulty adjustment limits (e.g. boss firing scales, projectile velocities, screen shake bounds). |
| `drawBossBeams` | `(ctx)` | Triggers vertical swept lasers, drawing clipping paths to prevent canvas borders from smearing. |

### Web Audio Station Player

[`src/music-impl.js`](../src/music-impl.js)

```javascript
export const STATIONS = [
    { name: "Code Radio (freeCodeCamp)", url: "https://coderadio-admin-v2.freecodecamp.org/listen/coderadio/radio.mp3" },
    ...
];
```

| Method / Variable | Signature / Type | Purpose |
|--------|------------------|---------|
| `audio` | `Audio` | Active HTML5 Audio constructor instance. |
| `analyser` | `AnalyserNode` | Web Audio API analyzer node tracking stream frequencies. |
| `ensureAudioReady` | `()` | Resumes active AudioContext instances, initializing nodes on user clicks. |
| `playItem` | `(item: Object)` | Changes active stream sources, playing songs or station URLs. |
| `togglePlay` | `(isGame: Boolean)` | Plays or pauses the active audio element, logging stats. |
| `setVolume` | `(val: Number)` | Sets volume attributes (`0.0` - `1.0`), saving value to local storage. |

### Music UI & Visualizer

[`src/music-ui.js`](../src/music-ui.js) | [`src/music-reaction.js`](../src/music-reaction.js)

| Method / Variable | Signature / Type | Purpose |
|--------|------------------|---------|
| `setupMusicPlayer` | `()` | Binds status buttons (Prev, Next, Play) and context menus. |
| `getMusicReactionData`| `() => Object` | Analyzes frequency array bins to compute bass beats and average values. |
| `updateVisualizer` | `()` | Animates bar indicators (`.v-bar`) on the HUD in response to active song volumes. |

## Core Behaviors

### Dynamic Difficulty Progression
During arcade gameplay, threat values increment based on scores and tick metrics:
1.  **DDA Scaling**: As threats increase, the engine scales boss cracks, laser counts, and bullet speeds.
2.  **Energy Feedback**: If the player's shield health depletes to low counts, boss projectile speeds scale down by up to 40% to allow recoveries.
3.  **Boss Signal Progress**: HUD progress bars scale dynamically, adjusting spawn thresholds based on player performance scores.

### Web Audio Stream Retrieval
Music streams fetch audio and parse track metadata dynamically:
1.  **Stream Selection**: The user clicks status elements or selects stations from context menus.
2.  **Metadata Fetching**: If freeCodeCamp's Code Radio is active, a background poll queries their now-playing JSON endpoint every 15 seconds to parse titles, artists, and stations.
3.  **FFT Spectrum Analysis**: When audio plays, `setupAnalyser()` creates a 256-size FFT analyzer. The HUD queries `getMusicReactionData()` to pulse interface panel highlights, CRT keyframe skews, and visualizer heights.

## Related Specs
- [State Management](./state-management.md) — Connects state audio preferences and flags.
- [UI & Rendering](./ui-rendering.md) — Renders the retro HUD panels, visualizer bars, and console screens.
- [Data & Integration](./data-integration.md) — Preserves score metrics, volume states, and handles mock audio contexts for tests.
