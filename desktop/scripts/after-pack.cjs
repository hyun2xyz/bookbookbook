const { spawnSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (isMasTarget(context) || process.env.BOOKBOOKBOOK_SKIP_ADHOC_SIGN === "1") {
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(`codesign failed for ${appPath}\n${result.stdout}\n${result.stderr}`);
  }
};

function isMasTarget(context) {
  const targetNames = Array.from(context.targets ?? []).map((target) => {
    return typeof target === "string" ? target : target?.name;
  });

  return targetNames.includes("mas") || context.appOutDir.toLowerCase().includes(`${path.sep}mas`);
}
