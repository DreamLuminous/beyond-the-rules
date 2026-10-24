import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/v1": { target: "http://127.0.0.1:8787", changeOrigin: true },
  "/health": { target: "http://127.0.0.1:8787", changeOrigin: true }
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: "0.0.0.0", proxy: apiProxy },
  preview: { port: 4173, host: "127.0.0.1", proxy: apiProxy }
});
