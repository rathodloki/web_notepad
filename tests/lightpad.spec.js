import { test, expect } from '@playwright/test';

test.describe('LightPad Test Harness Suite', () => {

    test.beforeEach(async ({ page }) => {
        // Start fresh: go to harness URL and clear localStorage
        await page.goto('/?harness=true');
        await page.evaluate(() => localStorage.clear());
        // Set the localStorage flag so it stays active across reloads
        await page.evaluate(() => localStorage.setItem('lightpad-harness', 'true'));
        await page.goto('/?harness=true');
        
        // Wait for application DOM loading
        await page.waitForSelector('.window-header');
    });

    test('should load the page with LightPad brand title', async ({ page }) => {
        const brand = await page.locator('.app-brand').textContent();
        expect(brand).toBe('LightPad');
    });

    test('should create a new tab and allow editing in CodeMirror', async ({ page }) => {
        // Create new tab
        await page.click('#btn-new-tab');
        
        // Check state
        const tabCount = await page.evaluate(() => window.__lightpadHarness.state.tabs.length);
        expect(tabCount).toBe(1);

        // Edit CodeMirror editor
        await page.waitForSelector('.cm-content');
        await page.locator('.cm-content').fill('Hello from Playwright E2E test!');

        // Verify content in diagnostic harness API
        const editorText = await page.evaluate(() => window.__lightpadHarness.getEditorContent());
        expect(editorText).toBe('Hello from Playwright E2E test!');
    });

    test('should cycle tabs cyclically using Alt + Arrow keys', async ({ page }) => {
        // Create two tabs
        await page.click('#btn-new-tab'); // Tab 1
        await page.click('#btn-new-tab'); // Tab 2

        const tabsStateBefore = await page.evaluate(() => {
            const h = window.__lightpadHarness;
            return {
                count: h.state.tabs.length,
                activeId: h.state.activeTabId,
                tabIds: h.state.tabs.map(t => t.id)
            };
        });
        expect(tabsStateBefore.count).toBe(2);
        
        // Trigger Alt + ArrowLeft
        await page.evaluate(() => window.__lightpadHarness.triggerShortcut('ArrowLeft', { alt: true }));

        const activeIdAfterLeft = await page.evaluate(() => window.__lightpadHarness.state.activeTabId);
        // It should have cycled back to the first tab
        expect(activeIdAfterLeft).toBe(tabsStateBefore.tabIds[0]);

        // Trigger Alt + ArrowRight
        await page.evaluate(() => window.__lightpadHarness.triggerShortcut('ArrowRight', { alt: true }));
        const activeIdAfterRight = await page.evaluate(() => window.__lightpadHarness.state.activeTabId);
        // It should have cycled to the second tab
        expect(activeIdAfterRight).toBe(tabsStateBefore.tabIds[1]);
    });

    test('should open a file from VFS using mock openDialog', async ({ page }) => {
        // Set up mock open dialog selection path
        await page.evaluate(() => {
            window.__lightpadHarness.dialogPaths.open = 'C:\\test\\notes.txt';
        });

        // Click open button
        await page.click('#btn-open');

        // Check active tab content matches VFS Notes
        await page.waitForSelector('.cm-content');
        const content = await page.evaluate(() => window.__lightpadHarness.getEditorContent());
        expect(content).toBe('Hello World from LightPad Harness!');

        // Check tab title
        const activeTabTitle = await page.locator('.tab.active .tab-title').textContent();
        expect(activeTabTitle).toBe('notes.txt');
    });

    test('should save changes back to mock VFS', async ({ page }) => {
        // Open file C:\test\save_target.txt
        await page.evaluate(() => {
            window.__lightpadHarness.dialogPaths.open = 'C:\\test\\save_target.txt';
        });
        await page.click('#btn-open');
        await page.waitForSelector('.cm-content');

        // Edit content
        await page.locator('.cm-content').fill('Updated Test Content via Harness');

        // Save file
        await page.click('#btn-save');

        // Allow write operation to settle
        await page.waitForTimeout(200);

        // Verify file is saved in mock VFS
        const vfsContent = await page.evaluate(() => window.__lightpadHarness.vfs['C:\\test\\save_target.txt']);
        expect(vfsContent).toBe('Updated Test Content via Harness');
    });

    test('should toggle Settings items correctly', async ({ page }) => {
        // Open settings menu
        await page.click('#btn-settings');
        await page.waitForSelector('#settings-menu', { state: 'visible' });

        // Toggle Word Wrap (keeps settings menu open in current UI implementation)
        await page.click('#menu-toggle-wordwrap');
        const wordWrapState = await page.evaluate(() => window.__lightpadHarness.state.isWordWrapEnabled);
        expect(wordWrapState).toBe(true);

        // Toggle Auto Save (menu is already open, so click directly)
        await page.click('#menu-toggle-autosave');
        const autoSaveState = await page.evaluate(() => window.__lightpadHarness.state.isAutoSaveEnabled);
        expect(autoSaveState).toBe(true);

        // Close settings menu by clicking elsewhere
        await page.click('.app-brand');
        await page.waitForSelector('#settings-menu', { state: 'hidden' });
    });

    test('should open file from internet URL', async ({ page }) => {
        // Open the URL modal
        await page.click('#btn-open-url');
        await page.waitForSelector('#open-url-modal', { state: 'visible' });

        // Fill URL input
        await page.fill('#open-url-input', 'https://raw.githubusercontent.com/test/notes.txt');
        
        // Confirm fetch
        await page.click('#btn-confirm-url');

        // Wait for modal to close and status to update
        await page.waitForSelector('#open-url-modal', { state: 'hidden' });

        // Verify remote file content is loaded in the editor
        await page.waitForSelector('.cm-content');
        const content = await page.evaluate(() => window.__lightpadHarness.getEditorContent());
        expect(content).toBe('Remote file content fetch works!');

        // Verify new tab is named notes.txt
        const activeTabTitle = await page.locator('.tab.active .tab-title').textContent();
        expect(activeTabTitle).toBe('notes.txt');
    });

    test('should open music stations list on left-click and play selected station', async ({ page }) => {
        // Confirm music menu is hidden initially
        await expect(page.locator('#music-context-menu')).toBeHidden();

        // Left-click on status music info marquee container
        await page.click('#status-music-info');

        // Verify the music stations menu is now visible
        await expect(page.locator('#music-context-menu')).toBeVisible();

        // Check that it lists some stations
        const stationsCount = await page.locator('#music-menu-stations .menu-item').count();
        expect(stationsCount).toBeGreaterThan(0);

        // Click the second station
        await page.locator('#music-menu-stations .menu-item').nth(1).click();

        // Verify menu is hidden after selection
        await expect(page.locator('#music-context-menu')).toBeHidden();

        // Check if the music title matches selected station or changed from "Music Off"
        const currentTitle = await page.locator('#status-music-title').textContent();
        expect(currentTitle).not.toBe('Music Off');
    });


});
