import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const buildDir = resolve(desktopRoot, "build");

await mkdir(buildDir, { recursive: true });
await createBackground(resolve(buildDir, "dmg-background.png"), 540, 380, 1);
await createBackground(resolve(buildDir, "dmg-background@2x.png"), 1080, 760, 2);

async function createBackground(output, width, height, scale) {
  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = Math.round(239 + 9 * (y / height) - 5 * (x / width));
      setPixel(pixels, width, x, y, [shade, shade, shade]);
    }
  }

  const ppm = Buffer.concat([
    Buffer.from(`P6\n${width} ${height}\n255\n`),
    pixels,
  ]);
  const ppmPath = output.replace(/\.png$/, ".ppm");

  await writeFile(ppmPath, ppm);
  await rm(output, { force: true });
  run("sips", ["-s", "format", "png", ppmPath, "--out", output]);
  await rm(ppmPath, { force: true });
  console.log(`Created ${output}`);
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || x >= width || y < 0) {
    return;
  }

  const index = (y * width + x) * 3;
  if (index < 0 || index + 2 >= pixels.length) {
    return;
  }

  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}
