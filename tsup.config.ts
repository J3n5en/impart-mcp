import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  target: "node18",
  platform: "node",
  splitting: false,
  sourcemap: true,
  minify: false,
  treeshake: true,
});
