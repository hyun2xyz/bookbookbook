import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(desktopRoot, "package.json"), "utf8"));
const defaultDmg = resolve(desktopRoot, "dist", `Bookbookbook-${packageJson.version}.dmg`);
const defaultIcon = resolve(desktopRoot, "build", "icon-square.png");
const dmgPath = resolve(process.argv[2] ?? defaultDmg);
const iconPath = resolve(process.argv[3] ?? defaultIcon);
const tempDir = await mkdtemp(resolve(tmpdir(), "bookbookbook-dmg-icon-"));
const resourcePath = resolve(tempDir, "icon.rsrc");

try {
  run("sips", ["-i", iconPath]);
  const derez = spawnSync("DeRez", ["-only", "icns", iconPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  if (derez.error) {
    throw derez.error;
  }

  if (derez.status !== 0) {
    throw new Error(`DeRez exited with ${derez.status}`);
  }

  await import("node:fs/promises").then(({ writeFile }) => writeFile(resourcePath, derez.stdout));
  run("Rez", ["-append", resourcePath, "-o", dmgPath]);
  run("SetFile", ["-a", "C", dmgPath]);
  console.log(`Set custom icon on ${dmgPath}`);
} finally {
  await rm(tempDir, { force: true, recursive: true });
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
