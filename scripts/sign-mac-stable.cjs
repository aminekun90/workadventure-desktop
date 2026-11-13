// electron-builder afterSign hook (macOS): signs the app again with this project's own self-signed certificate, when
// the CI provides it (MAC_SIGNING_IDENTITY, MAC_SIGNING_KEYCHAIN). macOS then knows the app by that certificate rather
// than by the hash of each build: camera and microphone permissions, and the Keychain entry of the cookies, survive an
// update. Without the certificate, the ad hoc signature of electron-builder.yml stays.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function signMacStable(context) {
  if (context.electronPlatformName !== "darwin") return;
  const identity = process.env.MAC_SIGNING_IDENTITY;
  const keychain = process.env.MAC_SIGNING_KEYCHAIN;
  if (!identity || !keychain) {
    console.log("sign-mac-stable: no certificate, the ad hoc signature stays");
    return;
  }
  // electron-builder may lock keychains while it packages: unlocked again right before signing.
  const password = process.env.MAC_SIGNING_KEYCHAIN_PASSWORD;
  if (password) execFileSync("security", ["unlock-keychain", "-p", password, keychain], { stdio: "inherit" });
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(__dirname, "..", "build", "entitlements.mac.plist");
  execFileSync(
    "codesign",
    ["--force", "--deep", "--options", "runtime", "--entitlements", entitlements, "--keychain", keychain, "--sign", identity, app],
    { stdio: "inherit" },
  );
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  const requirement = execFileSync("codesign", ["--display", "--requirements", "-", app], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!requirement.includes("certificate leaf")) throw new Error(`sign-mac-stable: unexpected designated requirement: ${requirement}`);
  console.log("sign-mac-stable: signed with the project certificate");
};
