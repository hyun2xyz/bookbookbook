import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const desktopRoot = resolve(__dirname, "..");
const source = resolve(root, "pages", "public", "파비.png");
const buildDir = resolve(desktopRoot, "build");
const iconset = resolve(buildDir, "icon.iconset");
const resized = resolve(buildDir, "icon-source.png");
const square = resolve(buildDir, "icon-square.png");
const output = resolve(buildDir, "icon.icns");

await mkdir(buildDir, { recursive: true });
await rm(iconset, { force: true, recursive: true });
await mkdir(iconset, { recursive: true });

run("sips", ["--resampleHeightWidthMax", "1024", source, "--out", resized]);
run("sips", ["--padToHeightWidth", "1024", "1024", "--padColor", "FFFFFF", resized, "--out", square]);

const sizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

for (const [size, filename] of sizes) {
  run("sips", ["--resampleHeightWidth", String(size), String(size), square, "--out", resolve(iconset, filename)]);
}

await rm(output, { force: true });
run("iconutil", ["-c", "icns", iconset, "-o", output]);
console.log(`Created ${output}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}
