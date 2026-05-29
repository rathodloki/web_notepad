import { test, expect } from '@playwright/test';

test.describe('LightPad Retro Game Suite', () => {

    test.beforeEach(async ({ page }) => {
        // Start fresh: go to harness URL and clear localStorage
        await page.goto('/?harness=true');
        await page.evaluate(() => localStorage.clear());
        await page.evaluate(() => localStorage.setItem('lightpad-harness', 'true'));
        await page.goto('/?harness=true');
        await page.waitForSelector('.window-header');

        // Enable God Mode and fast-forward transition timers in test environment
        await page.evaluate(() => {
            setInterval(() => {
                if (window.__lightpadHarness && window.__lightpadHarness.game) {
                    const p = window.__lightpadHarness.game.getPlayer();
                    if (p) p.energy = p.maxEnergy || 100;

                    // Speed up recovery and defeat phases for test efficiency
                    if (window.__lightpadHarness.game.fastForwardTimers) {
                        window.__lightpadHarness.game.fastForwardTimers();
                    }
                }
            }, 100);
        });
    });

    test('should start game and play through all boss fights using mock harness control', async ({ page }) => {
        // 1. Click to start the game
        await page.click('#console-btn-play-game');

        // Verify game state transitions to running
        const gameState = await page.evaluate(() => window.__lightpadHarness.game.getState());
        expect(gameState).toBe('RUNNING');

        // 2. Test Boss 1: SENTINEL MK-I
        await page.evaluate(() => window.__lightpadHarness.game.spawnBoss(1));

        // Wait for boss system to transition to RECOVERY
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'RECOVERY', { timeout: 5000 });
        let bossState = await page.evaluate(() => window.__lightpadHarness.game.getBossState());
        expect(bossState).toBe('RECOVERY');

        // Wait for entry phase and fighting phase
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'ACTIVE', { timeout: 15000 });
        
        let boss = await page.evaluate(() => window.__lightpadHarness.game.getBoss());
        expect(boss).not.toBeNull();
        expect(boss.name).toBe('SENTINEL MK-I');
        expect(boss.level).toBe(1);

        // Kill Boss 1
        await page.evaluate(() => window.__lightpadHarness.game.killBoss());
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'NONE', { timeout: 8000 });

        // 3. Test Boss 2: VOIDREAPER
        await page.evaluate(() => window.__lightpadHarness.game.spawnBoss(2));
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'RECOVERY', { timeout: 5000 });
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'ACTIVE', { timeout: 15000 });

        boss = await page.evaluate(() => window.__lightpadHarness.game.getBoss());
        expect(boss).not.toBeNull();
        expect(boss.name).toBe('VOIDREAPER');
        expect(boss.level).toBe(2);

        // Kill Boss 2
        await page.evaluate(() => window.__lightpadHarness.game.killBoss());
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'NONE', { timeout: 8000 });

        // 4. Test Boss 3: OMEGA CORE
        await page.evaluate(() => window.__lightpadHarness.game.spawnBoss(3));
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'RECOVERY', { timeout: 5000 });
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'ACTIVE', { timeout: 15000 });

        boss = await page.evaluate(() => window.__lightpadHarness.game.getBoss());
        expect(boss).not.toBeNull();
        expect(boss.name).toBe('OMEGA NEXUS');
        expect(boss.level).toBe(3);

        // Kill Boss 3
        await page.evaluate(() => window.__lightpadHarness.game.killBoss());
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'NONE', { timeout: 8000 });

        // 5. Test Boss 4 (Procedural Boss)
        await page.evaluate(() => window.__lightpadHarness.game.spawnBoss(4));
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'RECOVERY', { timeout: 5000 });
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'ACTIVE', { timeout: 15000 });

        boss = await page.evaluate(() => window.__lightpadHarness.game.getBoss());
        expect(boss).not.toBeNull();
        expect(boss.level).toBe(4);

        // Kill Boss 4
        await page.evaluate(() => window.__lightpadHarness.game.killBoss());
        await page.waitForFunction(() => window.__lightpadHarness.game.getBossState() === 'NONE', { timeout: 8000 });
    });
});
