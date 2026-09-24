import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Un seul worker : chaque test lance une vraie instance Electron contre la
  // vraie API et la vraie base Supabase — pas de parallélisme sur des données partagées.
  workers: 1,
  reporter: "list",
});
