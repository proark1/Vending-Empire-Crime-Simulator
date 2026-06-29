import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Socket } from "node:net";

async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (connected: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(180);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, host);
  });
}

export default defineConfig(async () => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000";
  const apiUrl = new URL(apiTarget);
  const port = Number(apiUrl.port || (apiUrl.protocol === "https:" ? 443 : 80));
  const proxyApi = process.env.VITE_API_PROXY === "1" || await canConnect(apiUrl.hostname, port);

  return {
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("/src/game/systems/") || id.includes("/src/game/ai/")) {
              return "game-systems";
            }
            if (id.includes("/src/game/content/")) {
              return "game-content";
            }
            if (id.includes("/src/game/world/")) {
              return "game-world";
            }
            if (!id.includes("node_modules")) {
              return undefined;
            }
            if (id.includes("/node_modules/three/")) {
              return id.includes("/examples/") ? "vendor-three-extras" : "vendor-three";
            }
            if (id.includes("/node_modules/lucide-react/")) {
              return "vendor-icons";
            }
            if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) {
              return "vendor-react";
            }
            return "vendor";
          }
        }
      }
    },
    plugins: [react()],
    server: {
      proxy: proxyApi
        ? {
            "/api": {
              changeOrigin: true,
              target: apiTarget
            }
          }
        : undefined
    }
  };
});
