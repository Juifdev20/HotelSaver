/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "jsdom",
  testRegex: ".*\\.spec\\.tsx?$",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/src/css-mock.cjs",
  },
  setupFilesAfterEnv: ["<rootDir>/src/jest.setup.ts"],
};
