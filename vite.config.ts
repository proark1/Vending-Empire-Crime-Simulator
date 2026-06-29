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
