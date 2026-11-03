import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    envDir: false,
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.invalid/api') },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        passWithNoTests: false,
    },
});
