import { defineConfig } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
    testDir: './security', workers: 1, fullyParallel: false, forbidOnly: true,
    timeout: 30000, globalTimeout: 180000, retries: 0, reporter: 'list',
    use: { browserName: 'chromium', headless: true, bypassCSP: false,
        launchOptions: process.env.GNOSIS_SECURITY_BROWSER ? { executablePath: process.env.GNOSIS_SECURITY_BROWSER } : {} },
});
