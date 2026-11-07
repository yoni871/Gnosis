import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        react(),
        tailwindcss()
    ],

    server: {
        host: "localhost",
        port: 5173,
        strictPort: true,

        allowedHosts: [
            "p1rzgsbr-5173.usw3.devtunnels.ms"
        ],

        proxy: {
            "/api": {
                target: "http://127.0.0.1:5000",
                changeOrigin: true
            }
        }
    }
});