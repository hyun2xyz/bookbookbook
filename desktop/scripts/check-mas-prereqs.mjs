import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const profilePath = resolve(desktopRoot, "build", "Bookbookbook_Mac_App_Store.provisionprofile");
const bundleId = "xyz.hyun2.bookbookbook";

const checks = [
  checkXcode(),
  ...checkCodeSigningIdentities(),
  checkProvisioningProfile(),
];

console.log("Bookbookbook Mac App Store preflight\n");

for (const check of checks) {
  console.log(`${check.ok ? "OK " : "ERR"} ${check.label}`);
  if (check.detail) {
    console.log(`   ${check.detail}`);
  }
}

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.log(`\n${failed.length} App Store prerequisite(s) are missing.`);
  console.log("Next steps:");
  console.log("1. Apple Developer account holder: accept the latest program agreement in App Store Connect.");
  console.log("2. Install full Xcode, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer");
  console.log(`3. Create/register the bundle ID in Certificates, Identifiers & Profiles: ${bundleId}`);
  console.log("4. Install Apple Distribution/Mac App Distribution and Mac Installer Distribution certificates into this Mac keychain.");
  console.log(`5. Download the Mac App Store provisioning profile to: ${profilePath}`);
  process.exit(1);
}

console.log("\nReady for npm run dist:mas.");

function checkXcode() {
  const xcodeSelect = run("xcode-select", ["-p"]);
  const xcodebuild = run("xcodebuild", ["-version"]);
  const selectedPath = xcodeSelect.stdout.trim();
  const hasFullXcode = xcodebuild.status === 0 && selectedPath.includes("/Xcode.app/");

  return {
    ok: hasFullXcode,
    label: "Full Xcode is selected",
    detail: hasFullXcode
      ? xcodebuild.stdout.split("\n").filter(Boolean).join(", ")
      : `selected developer directory: ${selectedPath || "unknown"}`,
  };
}

function checkCodeSigningIdentities() {
  const result = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  const output = `${result.stdout}\n${result.stderr}`;
  const hasDistributionIdentity = /Apple Distribution|3rd Party Mac Developer Application|Mac App Distribution/.test(output);
  const hasInstallerIdentity = /Mac Installer Distribution|3rd Party Mac Developer Installer/.test(output);

  return [
    {
      ok: hasDistributionIdentity,
      label: "Apple Distribution or Mac App Distribution identity is installed",
      detail: hasDistributionIdentity ? "app distribution certificate found" : "no app distribution identity found",
    },
    {
      ok: hasInstallerIdentity,
      label: "Mac Installer Distribution identity is installed",
      detail: hasInstallerIdentity ? "installer distribution certificate found" : "no installer distribution identity found",
    },
  ];
}

function checkProvisioningProfile() {
  return {
    ok: existsSync(profilePath),
    label: "Mac App Store provisioning profile is present",
    detail: profilePath,
  };
}

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
  });
}
