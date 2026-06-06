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

  drawSketchArrow(pixels, width, height, scale);

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

function drawSketchArrow(pixels, width, height, scale) {
  const color = [78, 78, 78];
  const lines = [
    [[232, 190], [272, 190], [272, 166], [318, 210], [272, 254], [272, 228], [232, 228]],
  ];

  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const [fromX, fromY] = line[index];
      const [toX, toY] = line[index + 1];
      drawWobblyLine(
        pixels,
        width,
        fromX * scale,
        fromY * scale,
        toX * scale,
        toY * scale,
        Math.max(1.35 * scale, 1.2),
        color,
      );
    }
  }
}

function drawWobblyLine(pixels, width, startX, startY, endX, endY, radius, color) {
  const steps = Math.max(Math.round(distance(startX, startY, endX, endY) / 1.15), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const wobble = Math.sin(t * Math.PI * 5) * 1.2 + Math.sin(t * Math.PI * 13) * 0.55;
    const x = startX + (endX - startX) * t + wobble;
    const y = startY + (endY - startY) * t - wobble * 0.5;
    drawDot(pixels, width, x, y, radius, color, 0.82);
  }
}

function drawDot(pixels, width, centerX, centerY, radius, color, alpha) {
  const minX = Math.floor(centerX - radius);
  const maxX = Math.ceil(centerX + radius);
  const minY = Math.floor(centerY - radius);
  const maxY = Math.ceil(centerY + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const falloff = Math.max(0, 1 - distance(x, y, centerX, centerY) / radius);
      blendPixel(pixels, width, x, y, color, alpha * falloff);
    }
  }
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

function blendPixel(pixels, width, x, y, color, alpha) {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (roundedX < 0 || roundedX >= width || roundedY < 0) {
    return;
  }

  const index = (roundedY * width + roundedX) * 3;
  if (index < 0 || index + 2 >= pixels.length) {
    return;
  }

  pixels[index] = Math.round(pixels[index] * (1 - alpha) + color[0] * alpha);
  pixels[index + 1] = Math.round(pixels[index + 1] * (1 - alpha) + color[1] * alpha);
  pixels[index + 2] = Math.round(pixels[index + 2] * (1 - alpha) + color[2] * alpha);
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
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
