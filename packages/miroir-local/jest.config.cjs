/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.cjs.json", diagnostics: false }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
};
