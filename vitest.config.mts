import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/client/src", import.meta.url)) },
  },
  test: {
    exclude: ["**/node_modules/**", "**/node_modules.dataless-backup*/**", "**/dist*/**", "services/realtime/test/**"],
  },
});
