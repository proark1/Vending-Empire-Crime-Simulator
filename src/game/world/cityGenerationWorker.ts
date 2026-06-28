import type { WorldMapLayout } from "../content/world";
import { regenerateCity } from "./cityRegenerator";

interface CityGenerationRequest {
  requestId: number;
  seed: string;
}

interface CityGenerationResponse {
  error?: string;
  layout?: WorldMapLayout;
  requestId: number;
}

self.addEventListener("message", (event: MessageEvent<CityGenerationRequest>) => {
  const { requestId, seed } = event.data;
  const response: CityGenerationResponse = { requestId };

  try {
    response.layout = regenerateCity(seed);
  } catch (error) {
    response.error = error instanceof Error ? error.message : "City generation failed.";
  }

  self.postMessage(response);
});

export {};
