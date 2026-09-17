import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { GAME_IDS } from "../packages/game-core/src/types.ts";
import { PLAYABLE_GAME_IDS, RETIRED_GAME_IDS } from "../packages/game-core/src/catalog.ts";

const root = resolve(import.meta.dirname, "..");
const clientRoot = join(root, "apps/client");
const webDist = join(clientRoot, "dist");
const iosDist = join(clientRoot, "dist-ios");
const apiBase = process.env.DUO_API_URL ?? "https://duo-arcade.yimgyan.workers.dev";
const REQUEST_TIMEOUT_MS = 10_000;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function exactlyOne(files, predicate, label) {
  const matches = files.filter(predicate);
  assert.equal(matches.length, 1, `${label}: expected one file, found ${matches.length}`);
  return matches[0];
}

function pngInfo(path) {
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} is not PNG`);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR", `${path} has no IHDR`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceNumber(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `could not read ${label}`);
  return Number(match[1]);
}

function sourceString(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `could not read ${label}`);
  return match[1];
}

async function fetchChecked(path, init) {
  const response = await fetch(new URL(path, apiBase), {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return response;
}

async function fetchMatchingText(path, expected) {
  let lastResponse;
  let actual = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    lastResponse = await fetchChecked(path, { headers: { "cache-control": "no-cache" } });
    actual = await lastResponse.text();
    if (actual === expected) return lastResponse;
    if (attempt < 11) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  assert.fail(`${path}: production artifact hash ${sha256(actual)} does not match local ${sha256(expected)}`);
}

const rootPackage = readJson(join(root, "package.json"));
const clientPackage = readJson(join(clientRoot, "package.json"));
const servicePackage = readJson(join(root, "services/realtime/package.json"));
const gameCorePackage = readJson(join(root, "packages/game-core/package.json"));
const protocolPackage = readJson(join(root, "packages/protocol/package.json"));
const appConfig = readJson(join(clientRoot, "app.json")).expo;
const easConfig = readJson(join(clientRoot, "eas.json"));
const nativeRoot = join(clientRoot, "ios");
const hasNativeProject = existsSync(nativeRoot);
let nativeInfo = null;
let nativeProject = null;
let nativePods = null;
if (hasNativeProject) {
  const projectDirectory = exactlyOne(
    readdirSync(nativeRoot, { withFileTypes: true }),
    (entry) => entry.isDirectory() && entry.name.endsWith(".xcodeproj"),
    "native app project",
  );
  nativeProject = readText(join(nativeRoot, projectDirectory.name, "project.pbxproj"));
  const infoPaths = [...nativeProject.matchAll(/INFOPLIST_FILE\s*=\s*"?([^";\n]+)"?;/g)].map((match) => match[1]);
  assert.ok(infoPaths.length > 0, "native Info.plist setting is missing");
  assert.equal(new Set(infoPaths).size, 1, "native build configurations use different Info.plist files");
  const nativeInfoPath = resolve(nativeRoot, infoPaths[0]);
  assert.ok(nativeInfoPath.startsWith(`${nativeRoot}${sep}`), "native Info.plist must belong to this project");
  nativeInfo = readText(nativeInfoPath);
  nativePods = readText(join(nativeRoot, "Podfile.lock"));
}
const routeTestFiles = walk(join(clientRoot, "app")).filter((path) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
assert.deepEqual(
  routeTestFiles.map((path) => relative(clientRoot, path)),
  [],
  "test files inside the Expo Router app directory are bundled as routes; keep them under src",
);
const packageVersions = [rootPackage.version, clientPackage.version, servicePackage.version, gameCorePackage.version, protocolPackage.version];
assert.equal(new Set(packageVersions).size, 1, `package versions disagree: ${packageVersions.join(", ")}`);
assert.match(appConfig.version, /^\d+\.\d+$/, "the user-facing app version must use major.minor format");
assert.equal(packageVersions[0], `${appConfig.version}.0`, "package and user-facing app versions disagree");
assert.match(appConfig.ios.bundleIdentifier, /^[a-zA-Z][a-zA-Z0-9.-]+$/);
assert.match(appConfig.ios.buildNumber, /^\d+$/);
assert.equal(appConfig.scheme, "duoarcade");
assert.equal(appConfig.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio" && plugin[1]?.microphonePermission === false), true);
assert.match(clientPackage.dependencies["expo-asset"] ?? "", /^~57\./, "expo-asset must be installed explicitly for native audio");
assert.equal(appConfig.plugins.includes("expo-asset"), true, "expo-asset config plugin is missing");
if (hasNativeProject) {
  assert.ok(nativeInfo.includes(`<string>${appConfig.name}</string>`), "native display name is stale");
  assert.ok(nativeInfo.includes(`<string>${appConfig.version}</string>`), "native app version is stale");
  assert.ok(nativeInfo.includes(`<string>${appConfig.ios.buildNumber}</string>`), "native build number is stale");
  assert.ok(nativeInfo.includes(`<string>${appConfig.scheme}</string>`), "native URL scheme is stale");
  assert.ok(nativeInfo.includes("<string>UIInterfaceOrientationPortrait</string>"), "native portrait support is missing");
  assert.ok(nativeInfo.includes("<string>Light</string>"), "native interface style is stale");
  const bundleIds = [...nativeProject.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";\n]+)"?;/g)].map((match) => match[1]);
  assert.ok(bundleIds.length > 0, "native bundle id is missing");
  assert.ok(bundleIds.every((bundleId) => bundleId === appConfig.ios.bundleIdentifier), "native bundle id is stale");
  assert.match(nativePods, /\bExpoAsset\b/, "native ExpoAsset pod is missing");
  assert.match(nativePods, /\bExpoAudio\b/, "native ExpoAudio pod is missing");
}
for (const profile of ["preview", "production"]) {
  const env = easConfig.build[profile]?.env;
  assert.match(env?.EXPO_PUBLIC_API_URL ?? "", /^https:\/\//, `${profile} API URL must use HTTPS`);
  assert.match(env?.EXPO_PUBLIC_WEB_URL ?? "", /^https:\/\//, `${profile} invite URL must use HTTPS`);
  assert.equal(
    new URL(env.EXPO_PUBLIC_WEB_URL).origin,
    new URL(env.EXPO_PUBLIC_API_URL).origin,
    `${profile} invites and API must target the deployed app origin`,
  );
}

const protocolSource = readText(join(root, "packages/protocol/src/index.ts"));
const serviceSource = readText(join(root, "services/realtime/src/index.ts"));
const notFoundSource = readText(join(clientRoot, "app/+not-found.tsx"));
const roomHookSource = readText(join(clientRoot, "src/hooks/useRoom.ts"));
const roomServiceSource = readText(join(root, "services/realtime/src/room.ts"));
const protocol = sourceNumber(protocolSource, /PROTOCOL_VERSION\s*=\s*(\d+)/, "protocol version");
const release = sourceString(serviceSource, /const RELEASE\s*=\s*"([^"]+)"/, "release id");
const games = PLAYABLE_GAME_IDS.length;
assert.equal(games, 10, "the curated release must contain ten playable games");
assert.equal(RETIRED_GAME_IDS.length, 19, "the nineteen retired games must remain unavailable for new rooms");
assert.deepEqual([...PLAYABLE_GAME_IDS, ...RETIRED_GAME_IDS].sort(), [...GAME_IDS].sort(), "saved-state compatibility and active catalog must account for every game exactly once");
assert.match(serviceSource, /gameIds:\s*PLAYABLE_GAME_IDS/, "health must expose the actual playable catalog, not legacy identifiers");
assert.match(notFoundSource, /这个页面不存在/);
assert.match(notFoundSource, /router\.replace\("\/"\)/);
assert.doesNotMatch(notFoundSource, /Sitemap|Unmatched Route/);
assert.match(roomHookSource, /`duo-v\$\{PROTOCOL_VERSION\}`/, "client socket must use the shared protocol version");
assert.doesNotMatch(roomHookSource, /["'`]duo-v\d+/, "client socket protocol must not be hard-coded");
assert.match(protocolSource, /COMPATIBLE_PROTOCOL_VERSIONS\s*=\s*\[PROTOCOL_VERSION, PROTOCOL_VERSION - 1\]/, "protocol compatibility window must include only the current and previous versions");
assert.doesNotMatch(protocolSource, /nextActionAt/, "public protocol must not expose internal AI timing");
assert.match(roomServiceSource, /!isCompetitiveGame\(room\.game\)/, "AI coordination must be restricted to cooperative games");
assert.match(appConfig.description, /AI/, "app description must explain solo AI play");

const icon = pngInfo(join(clientRoot, "assets/branding/app-icon.png"));
const splash = pngInfo(join(clientRoot, "assets/branding/splash-mark.png"));
const pwa192 = pngInfo(join(clientRoot, "public/pwa-icon-192.png"));
const pwa512 = pngInfo(join(clientRoot, "public/pwa-icon-512.png"));
const appleTouch = pngInfo(join(clientRoot, "public/apple-touch-icon.png"));
assert.deepEqual([icon.width, icon.height], [1024, 1024]);
assert.deepEqual([splash.width, splash.height, splash.colorType], [1024, 1024, 6], "splash must be 1024px RGBA PNG");
assert.deepEqual([pwa192.width, pwa192.height], [192, 192]);
assert.deepEqual([pwa512.width, pwa512.height], [512, 512]);
assert.deepEqual([appleTouch.width, appleTouch.height], [180, 180]);

const webFiles = walk(webDist);
const iosFiles = walk(iosDist);
const webBundle = exactlyOne(webFiles, (path) => /\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js$/.test(path), "web bundle");
const iosBundle = exactlyOne(iosFiles, (path) => /\/_expo\/static\/js\/ios\/entry-[a-f0-9]+\.hbc$/.test(path), "iOS Hermes bundle");
const webBundleBytes = readFileSync(webBundle);
const iosBundleBytes = readFileSync(iosBundle);
const webBundleGzipBytes = gzipSync(webBundleBytes, { level: 9 }).byteLength;
const webBundleBrotliBytes = brotliCompressSync(webBundleBytes, {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
}).byteLength;
const releaseOrigin = Buffer.from(new URL(apiBase).origin);
assert.ok(statSync(webBundle).size < 2_500_000, "web bundle exceeds 2.5 MB budget");
assert.ok(webBundleGzipBytes < 650_000, "gzip web bundle exceeds 650 KB transfer budget");
assert.ok(webBundleBrotliBytes < 500_000, "Brotli web bundle exceeds 500 KB transfer budget");
assert.ok(statSync(iosBundle).size < 4_000_000, "iOS Hermes bundle exceeds 4 MB budget");
assert.ok(webBundleBytes.includes(releaseOrigin), "web bundle does not contain the release API origin");
assert.ok(iosBundleBytes.includes(releaseOrigin), "iOS bundle does not contain the release API origin");
assert.ok(webBundleBytes.includes(Buffer.from("AI game settings")), "web bundle is missing English AI settings copy");
assert.ok(iosBundleBytes.includes(Buffer.from("AI game settings")), "iOS bundle is missing English AI settings copy");
assert.ok(webBundleBytes.includes(Buffer.from("Ember Crew")), "web export predates the curated library update");
assert.ok(iosBundleBytes.includes(Buffer.from("Ember Crew")), "iOS export predates the curated library update");
assert.equal(webFiles.filter((path) => path.endsWith(".wav")).length, 12, "expected 12 original audio assets");
const webGameArt = webFiles.filter((path) => path.includes(`${sep}game-art${sep}`));
assert.equal(webGameArt.length, 2, "expected exactly two optimized game-art assets");
assert.equal(webGameArt.some((path) => /cover-hunt-alien-optimized\.[a-f0-9]+\.png$/.test(path)), true);
assert.equal(webGameArt.some((path) => /cover-hunt-arena-optimized\.[a-f0-9]+\.jpg$/.test(path)), true);
assert.equal(webGameArt.some((path) => /cover-hunt-(alien|arena)\.[a-f0-9]+\.png$/.test(path)), false, "unoptimized game art leaked into the web export");
assert.ok(webGameArt.every((path) => statSync(path).size < 500_000), "optimized game art exceeds 500 KB per asset");
const webExportBytes = webFiles.reduce((total, path) => total + statSync(path).size, 0);
assert.ok(webExportBytes < 4_500_000, "web export exceeds 4.5 MB performance budget");

const manifest = readJson(join(webDist, "manifest.webmanifest"));
assert.equal(manifest.lang, "en-US");
assert.equal(manifest.display, "standalone");
assert.match(manifest.description, /AI/);
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);
const webHtml = readText(join(webDist, "index.html"));
assert.match(webHtml, /<html lang="en-US">/);
assert.match(webHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(webHtml, /\[role="radio"\]\):focus-visible/, "radio controls must retain the visible keyboard focus ring");
assert.match(webHtml, /body\s*\{[^}]*margin:\s*0;/s, "inline reset must prevent the browser's default body-margin layout shift");
const publicHtml = readText(join(clientRoot, "public/index.html"));
const ogDescription = sourceString(publicHtml, /property="og:description" content="([^"]+)"/, "Open Graph description");
assert.ok(webHtml.includes(`property="og:description" content="${ogDescription}"`), "exported sharing copy is stale");
assert.doesNotMatch(webHtml, /Twenty-eight|28 games/i, "the exported page still advertises the retired catalog");
assert.match(webHtml, /solo play with adaptive AI/);
assert.ok(webHtml.includes(`src="/${relative(webDist, webBundle).split(sep).join("/")}"`), "index does not reference the current web bundle");

const result = {
  ok: true,
  version: appConfig.version,
  packageVersion: packageVersions[0],
  release,
  protocol,
  games,
  gameIds: [...PLAYABLE_GAME_IDS],
  legacyGameIds: [...RETIRED_GAME_IDS],
  iosBuild: appConfig.ios.buildNumber,
  nativeProject: hasNativeProject ? "checked" : "managed Expo project",
  artifacts: {
    webBundle: {
      bytes: statSync(webBundle).size,
      gzipBytes: webBundleGzipBytes,
      brotliBytes: webBundleBrotliBytes,
      sha256: sha256(webBundleBytes),
    },
    iosBundle: { bytes: statSync(iosBundle).size, sha256: sha256(iosBundleBytes) },
    webExportBytes,
  },
};

if (process.env.DUO_SKIP_REMOTE !== "1") {
  const healthResponse = await fetchChecked("/health");
  const health = await healthResponse.json();
  assert.deepEqual(
    [health.release, health.protocol, health.games],
    [release, protocol, games],
    "production health does not match source",
  );
  assert.equal(healthResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(health.gameIds, [...PLAYABLE_GAME_IDS], "production exposes a different playable catalog");

  const homeResponse = await fetchMatchingText("/", webHtml);
  const requiredHeaders = {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
  };
  for (const [name, expected] of Object.entries(requiredHeaders)) {
    assert.equal(homeResponse.headers.get(name), expected, `unexpected ${name}`);
  }
  assert.match(homeResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const remoteManifest = await (await fetchChecked("/manifest.webmanifest")).json();
  assert.deepEqual(remoteManifest, manifest, "production manifest differs from local artifact");
  for (const path of ["/pwa-icon-192.png", "/pwa-icon-512.png", "/apple-touch-icon.png"]) {
    assert.match((await fetchChecked(path)).headers.get("content-type") ?? "", /^image\/png/);
  }

  const bundlePath = `/${relative(webDist, webBundle).split(sep).join("/")}`;
  const remoteBundleResponse = await fetchChecked(bundlePath);
  assert.match(remoteBundleResponse.headers.get("cache-control") ?? "", /immutable/);
  const remoteBundle = Buffer.from(await remoteBundleResponse.arrayBuffer());
  assert.equal(sha256(remoteBundle), result.artifacts.webBundle.sha256, "production web bundle hash mismatch");
  result.remote = { baseUrl: apiBase, bundleCache: remoteBundleResponse.headers.get("cache-control") };
}

console.log(JSON.stringify(result, null, 2));
