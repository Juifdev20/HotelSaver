/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  setupFiles: ["<rootDir>/test/jest.setup.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.jest.json", diagnostics: { exclude: ["**/packages/**"] } }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  // Les tests d'intégration « appareil » font tourner le vrai moteur de synchro et la vraie base locale contre l'API : ils sont
  // compilés depuis leurs sources (pas besoin de les construire avant).
  moduleNameMapper: {
    "^@hotel-chicago/miroir-local$": "<rootDir>/../../packages/miroir-local/src/index.ts",
    "^@hotel-chicago/sync-engine$": "<rootDir>/../../packages/sync-engine/src/index.ts",
  },
};
