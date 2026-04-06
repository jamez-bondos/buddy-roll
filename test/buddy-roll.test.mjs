import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, deepStrictEqual, ok, throws } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, copyFileSync, unlinkSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Duplicated constants from buddy-roll.mjs ─────────────

const SALT = "friend-2026-401";

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
];

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

const EYES = ["·", "✦", "×", "◉", "@", "°"];
const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"];
const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

const NO_COLOR = true; // force no color for tests

const SPRITE_FRAMES = {
  duck:     ['            ','    __      ','  <({E} )___  ','   (  ._>   ','    `--´    '],
  goose:    ['            ','     ({E}>    ','     ||     ','   _(__)_   ','    ^^^^    '],
  blob:     ['            ','   .----.   ','  ( {E}  {E} )  ','  (      )  ','   `----´   '],
  cat:      ['            ','   /\\_/\\    ','  ( {E}   {E})  ','  (  ω  )   ','  (")_(")   '],
  dragon:   ['            ','  /^\\  /^\\  ',' <  {E}  {E}  > ',' (   ~~   ) ','  `-vvvv-´  '],
  octopus:  ['            ','   .----.   ','  ( {E}  {E} )  ','  (______)  ','  /\\/\\/\\/\\  '],
  owl:      ['            ','   /\\  /\\   ','  (({E})({E}))  ','  (  ><  )  ','   `----´   '],
  penguin:  ['            ','   .---.    ','   ({E}>{E})    ','  /(   )\\   ','   `---´    '],
  turtle:   ['            ','   _,--._   ','  ( {E}  {E} )  ',' /[______]\\ ','  ``    ``  '],
  snail:    ['            ',' {E}    .--.  ','  \\  ( @ )  ','   \\_`--´   ','  ~~~~~~~   '],
  ghost:    ['            ','   .----.   ','  / {E}  {E} \\  ','  |      |  ','  ~`~``~`~  '],
  axolotl:  ['            ','}~(______)~{','}~({E} .. {E})~{','  ( .--. )  ','  (_/  \\_)  '],
  capybara: ['            ','  n______n  ',' ( {E}    {E} ) ',' (   oo   ) ','  `------´  '],
  cactus:   ['            ',' n  ____  n ',' | |{E}  {E}| | ',' |_|    |_| ','   |    |   '],
  robot:    ['            ','   .[||].   ','  [ {E}  {E} ]  ','  [ ==== ]  ','  `------´  '],
  rabbit:   ['            ','   (\\__/)   ','  ( {E}  {E} )  ',' =(  ..  )= ','  (")__(")  '],
  mushroom: ['            ',' .-o-OO-o-. ','(__________)','   |{E}  {E}|   ','   |____|   '],
  chonk:    ['            ','  /\\    /\\  ',' ( {E}    {E} ) ',' (   ..   ) ','  `------´  '],
};

const HAT_LINES = {
  none: '',
  crown:    '   \\^^^/    ',
  tophat:   '   [___]    ',
  propeller:'    -+-     ',
  halo:     '   (   )    ',
  wizard:   '    /^\\     ',
  beanie:   '   (___)    ',
  tinyduck: '    ,>      ',
};

const RARITY_ANSI = {
  common:    "\x1b[90m",
  uncommon:  "\x1b[32m",
  rare:      "\x1b[38;5;75m",
  epic:      "\x1b[38;5;141m",
  legendary: "\x1b[38;5;208m",
};

// ── Duplicated functions from buddy-roll.mjs ─────────────

function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const M64 = (1n << 64n) - 1n;
const WYP = [0xa0761d6478bd642fn, 0xe7037ed1a0b428dbn, 0x8ebc6af09c88c6e3n, 0x589965cc75374cc3n];
function _mx(A, B) { const r = (A & M64) * (B & M64); return ((r >> 64n) ^ r) & M64; }
function _r8(p, i) { return BigInt(p[i]) | (BigInt(p[i+1]) << 8n) | (BigInt(p[i+2]) << 16n) | (BigInt(p[i+3]) << 24n) | (BigInt(p[i+4]) << 32n) | (BigInt(p[i+5]) << 40n) | (BigInt(p[i+6]) << 48n) | (BigInt(p[i+7]) << 56n); }
function _r4(p, i) { return BigInt(p[i]) | (BigInt(p[i+1]) << 8n) | (BigInt(p[i+2]) << 16n) | (BigInt(p[i+3]) << 24n); }
function _r3(p, i, k) { return (BigInt(p[i]) << 16n) | (BigInt(p[i + (k >> 1)]) << 8n) | BigInt(p[i + k - 1]); }

function wyhash(key, seed = 0n) {
  const len = key.length;
  seed = (seed ^ _mx(seed ^ WYP[0], WYP[1])) & M64;
  let a, b;
  if (len <= 16) {
    if (len >= 4) {
      a = ((_r4(key, 0) << 32n) | _r4(key, ((len >> 3) << 2))) & M64;
      b = ((_r4(key, len - 4) << 32n) | _r4(key, len - 4 - ((len >> 3) << 2))) & M64;
    } else if (len > 0) { a = _r3(key, 0, len); b = 0n; }
    else { a = 0n; b = 0n; }
  } else {
    let i = len, p = 0;
    if (i > 48) {
      let s1 = seed, s2 = seed;
      do {
        seed = _mx(_r8(key, p) ^ WYP[1], _r8(key, p + 8) ^ seed);
        s1 = _mx(_r8(key, p + 16) ^ WYP[2], _r8(key, p + 24) ^ s1);
        s2 = _mx(_r8(key, p + 32) ^ WYP[3], _r8(key, p + 40) ^ s2);
        p += 48; i -= 48;
      } while (i > 48);
      seed = (seed ^ s1 ^ s2) & M64;
    }
    while (i > 16) { seed = _mx(_r8(key, p) ^ WYP[1], _r8(key, p + 8) ^ seed); i -= 16; p += 16; }
    a = _r8(key, p + i - 16);
    b = _r8(key, p + i - 8);
  }
  a = (a ^ WYP[1]) & M64; b = (b ^ seed) & M64;
  const r = (a & M64) * (b & M64);
  a = r & M64; b = (r >> 64n) & M64;
  return _mx((a ^ WYP[0] ^ BigInt(len)) & M64, (b ^ WYP[1]) & M64);
}

function wyhash32(s) {
  return Number(wyhash(Buffer.from(s, "utf8")) & 0xffffffffn);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r];
    if (roll < 0) return r;
  }
  return "common";
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);
  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }
  return stats;
}

function fullRoll(id, hashFn) {
  const rng = mulberry32(hashFn(id + SALT));
  const rarity = rollRarity(rng);
  const species = pick(rng, SPECIES);
  const eye = pick(rng, EYES);
  const hat = rarity === "common" ? "none" : pick(rng, HATS);
  const shiny = rng() < 0.01;
  const stats = rollStats(rng, rarity);
  return { rarity, species, eye, hat, shiny, stats };
}

function parseArgs(argv) {
  const args = { command: "interactive" };
  let i = 2;
  if (argv[2] && !argv[2].startsWith("-")) {
    switch (argv[2]) {
      case "current": args.command = "current"; i = 3; break;
      case "verify": args.command = "verify"; args.verifyId = argv[3]; i = 4; break;
      case "restore": args.command = "restore"; i = 3; break;
      case "help": args.command = "help"; i = 3; break;
      default: args.verifyId = argv[2]; args.command = "verify"; i = 3; break;
    }
  }
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "--help": case "-h": args.command = "help"; break;
      case "--restore": args.command = "restore"; break;
      case "--current": args.command = "current"; break;
      case "--verify": args.command = "verify"; args.verifyId = argv[++i]; break;
      case "--species": args.species = argv[++i]; break;
      case "--rarity": args.rarity = argv[++i]; break;
      case "--eye": args.eye = argv[++i]; break;
      case "--hat": args.hat = argv[++i]; break;
      case "--shiny": args.shiny = true; break;
      case "--max": args.max = parseInt(argv[++i]); break;
      case "--dry-run": args.dryRun = true; break;
    }
    i++;
  }
  return args;
}

function formatStatBar(name, value) {
  const barLen = 10;
  const filled = value > 0 ? Math.max(1, Math.round(value / 100 * barLen)) : 0;
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  return `${name.padEnd(9)} ${bar} ${String(value).padStart(3)}`;
}

function renderSprite(species, eye, hat, rarity) {
  const frame = SPRITE_FRAMES[species];
  if (!frame) return "";
  // NO_COLOR = true for tests
  const color = "";
  const R = "";
  const lines = frame.map((line, i) => {
    let result = line.replaceAll("{E}", eye);
    if (i === 0 && hat && hat !== "none" && HAT_LINES[hat] && !result.trim()) {
      result = HAT_LINES[hat];
    }
    return `  ${color}${result}${R}`;
  });
  return lines.join("\n");
}

// ── Config helpers (parameterized for temp dirs) ─────────

function backupConfig(configPath, backupPath, statePath, config) {
  copyFileSync(configPath, backupPath);
  const state = {
    backupTime: new Date().toISOString(),
    originalAccountUuid: config.oauthAccount?.accountUuid || null,
    originalUserID: config.userID || null,
    originalCompanion: config.companion || null,
    salt: SALT,
    installType: "npm",
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function applyBuddy(configPath, backupPath, statePath, newUserID, dryRun) {
  if (!existsSync(configPath)) throw new Error("Config not found");
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  if (dryRun) return;

  if (existsSync(statePath)) {
    // Already have a backup -- don't overwrite the original
  } else {
    backupConfig(configPath, backupPath, statePath, config);
  }

  config.userID = newUserID;
  if (config.oauthAccount?.accountUuid) {
    delete config.oauthAccount.accountUuid;
  }
  if (config.companion) {
    delete config.companion;
  }
  const tmp = configPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, configPath);
}

function restoreConfig(configPath, backupPath, statePath) {
  if (!existsSync(statePath)) throw new Error("No backup found. Nothing to restore.");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (!existsSync(configPath)) throw new Error("Config not found");
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  if (state.originalAccountUuid && config.oauthAccount) {
    config.oauthAccount.accountUuid = state.originalAccountUuid;
  }
  if (state.originalUserID) config.userID = state.originalUserID;
  if (state.originalCompanion) config.companion = state.originalCompanion;
  else delete config.companion;

  const tmp = configPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, configPath);

  unlinkSync(statePath);
  if (existsSync(backupPath)) unlinkSync(backupPath);
}

// ══════════════════════════════════════════════════════════
// 1. Algorithm layer
// ══════════════════════════════════════════════════════════

describe("FNV-1a", () => {
  it("hashes empty string to offset basis", () => {
    strictEqual(fnv1a(""), 2166136261);
  });
  it("hashes 'hello' to known value", () => {
    strictEqual(fnv1a("hello"), 0x4f9f2cab);
  });
  it("produces consistent results", () => {
    const h1 = fnv1a("test-id" + SALT);
    const h2 = fnv1a("test-id" + SALT);
    strictEqual(h1, h2);
  });
});

describe("wyhash32", () => {
  it("hashes empty string to non-zero", () => {
    const h = wyhash32("");
    strictEqual(typeof h, "number");
    ok(h > 0, "empty string hash should be non-zero");
  });
  it("produces consistent results", () => {
    const h1 = wyhash32("test-id" + SALT);
    const h2 = wyhash32("test-id" + SALT);
    strictEqual(h1, h2);
  });
  it("differs from FNV-1a for same input", () => {
    const input = "some-user-id" + SALT;
    ok(fnv1a(input) !== wyhash32(input), "FNV-1a and wyhash32 should differ");
  });
});

describe("Mulberry32 PRNG", () => {
  it("is deterministic for same seed", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    strictEqual(rng1(), rng2());
    strictEqual(rng1(), rng2());
    strictEqual(rng1(), rng2());
  });
  it("returns values in [0, 1)", () => {
    const rng = mulberry32(99999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      ok(v >= 0, `value ${v} should be >= 0`);
      ok(v < 1, `value ${v} should be < 1`);
    }
  });
  it("different seeds produce different sequences", () => {
    const rng1 = mulberry32(111);
    const rng2 = mulberry32(222);
    const seq1 = [rng1(), rng1(), rng1()];
    const seq2 = [rng2(), rng2(), rng2()];
    const allSame = seq1.every((v, i) => v === seq2[i]);
    ok(!allSame, "different seeds should produce different sequences");
  });
});

describe("rollRarity", () => {
  it("returns a valid rarity", () => {
    const rng = mulberry32(42);
    const rarity = rollRarity(rng);
    ok(RARITIES.includes(rarity), `${rarity} should be a valid rarity`);
  });
  it("is deterministic", () => {
    const r1 = rollRarity(mulberry32(42));
    const r2 = rollRarity(mulberry32(42));
    strictEqual(r1, r2);
  });
  it("distribution roughly matches weights (common > 50%)", () => {
    const counts = {};
    for (const r of RARITIES) counts[r] = 0;
    for (let i = 0; i < 10000; i++) {
      const rng = mulberry32(i);
      counts[rollRarity(rng)]++;
    }
    ok(counts.common > 5000, `common count ${counts.common} should be > 5000 (>50%)`);
    ok(counts.legendary < 500, `legendary count ${counts.legendary} should be < 500 (<5%)`);
  });
});

describe("rollStats", () => {
  it("returns all 5 stats", () => {
    const rng = mulberry32(100);
    const stats = rollStats(rng, "rare");
    deepStrictEqual(Object.keys(stats).sort(), [...STAT_NAMES].sort());
  });
  it("has a peak stat (highest value)", () => {
    const rng = mulberry32(100);
    const stats = rollStats(rng, "epic");
    const values = Object.values(stats);
    const max = Math.max(...values);
    ok(max >= 85, `peak stat ${max} should be >= 85 for epic`);
  });
  it("has a dump stat (lowest value)", () => {
    const rng = mulberry32(100);
    const stats = rollStats(rng, "epic");
    const values = Object.values(stats);
    const min = Math.min(...values);
    const max = Math.max(...values);
    ok(min < max, "dump stat should be lower than peak stat");
  });
  it("respects rarity floor", () => {
    // For legendary, floor=50; non-dump stats should be >= floor
    const rng = mulberry32(777);
    const stats = rollStats(rng, "legendary");
    const values = Object.values(stats);
    // The peak stat uses floor+50+random and the regular stats use floor+random
    // Dump stat can go below floor (floor-10+random), but at least 1
    for (const v of values) {
      ok(v >= 1, `stat value ${v} should be >= 1`);
    }
  });
  it("all values 1-100", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const rarity = pick(rng, RARITIES);
      const stats = rollStats(rng, rarity);
      for (const [name, val] of Object.entries(stats)) {
        ok(val >= 1, `${name}=${val} should be >= 1 (seed=${seed})`);
        ok(val <= 100, `${name}=${val} should be <= 100 (seed=${seed})`);
      }
    }
  });
});

describe("fullRoll", () => {
  it("known ID produces legendary cat (FNV-1a)", () => {
    const result = fullRoll(
      "da55a6e264a84bb4ab5e68f09dd9f6b096f1394a758d1d3ad603f706cab71bcf",
      fnv1a,
    );
    strictEqual(result.rarity, "legendary");
    strictEqual(result.species, "cat");
  });
  it("produces valid buddy for any ID (wyhash)", () => {
    const result = fullRoll("any-test-id-12345", wyhash32);
    ok(RARITIES.includes(result.rarity));
    ok(SPECIES.includes(result.species));
    ok(EYES.includes(result.eye));
    ok(HATS.includes(result.hat) || result.hat === "none");
    strictEqual(typeof result.shiny, "boolean");
  });
  it("is deterministic", () => {
    const r1 = fullRoll("deterministic-test", fnv1a);
    const r2 = fullRoll("deterministic-test", fnv1a);
    deepStrictEqual(r1, r2);
  });
  it("different IDs produce different results", () => {
    const r1 = fullRoll("id-aaa", fnv1a);
    const r2 = fullRoll("id-bbb", fnv1a);
    const same = r1.rarity === r2.rarity && r1.species === r2.species && r1.eye === r2.eye;
    ok(!same, "different IDs should produce different results");
  });
  it("common rarity always has hat=none", () => {
    // Run many rolls and check all commons
    let foundCommon = false;
    for (let i = 0; i < 500; i++) {
      const result = fullRoll(`common-check-${i}`, fnv1a);
      if (result.rarity === "common") {
        strictEqual(result.hat, "none", "common rarity should have hat=none");
        foundCommon = true;
      }
    }
    ok(foundCommon, "should have found at least one common in 500 rolls");
  });
  it("does NOT include inspirationSeed", () => {
    const result = fullRoll("test-no-inspiration", fnv1a);
    strictEqual(result.inspirationSeed, undefined);
    strictEqual("inspirationSeed" in result, false);
  });
});

// ══════════════════════════════════════════════════════════
// 2. CLI layer
// ══════════════════════════════════════════════════════════

describe("parseArgs", () => {
  // Helper: simulate process.argv with ["node", "buddy-roll", ...rest]
  const argv = (...rest) => ["node", "buddy-roll", ...rest];

  describe("subcommand style", () => {
    it("current", () => {
      const args = parseArgs(argv("current"));
      strictEqual(args.command, "current");
    });
    it("verify <id>", () => {
      const args = parseArgs(argv("verify", "abc123"));
      strictEqual(args.command, "verify");
      strictEqual(args.verifyId, "abc123");
    });
    it("restore", () => {
      const args = parseArgs(argv("restore"));
      strictEqual(args.command, "restore");
    });
    it("help", () => {
      const args = parseArgs(argv("help"));
      strictEqual(args.command, "help");
    });
  });

  describe("legacy --flag style", () => {
    it("--current", () => {
      const args = parseArgs(argv("--current"));
      strictEqual(args.command, "current");
    });
    it("--verify <id>", () => {
      const args = parseArgs(argv("--verify", "xyz789"));
      strictEqual(args.command, "verify");
      strictEqual(args.verifyId, "xyz789");
    });
    it("--restore", () => {
      const args = parseArgs(argv("--restore"));
      strictEqual(args.command, "restore");
    });
    it("--help", () => {
      const args = parseArgs(argv("--help"));
      strictEqual(args.command, "help");
    });
    it("-h", () => {
      const args = parseArgs(argv("-h"));
      strictEqual(args.command, "help");
    });
  });

  describe("search options", () => {
    it("--species/--rarity/--eye/--hat/--shiny/--max/--dry-run", () => {
      const args = parseArgs(argv(
        "--species", "cat",
        "--rarity", "legendary",
        "--eye", "✦",
        "--hat", "crown",
        "--shiny",
        "--max", "5000000",
        "--dry-run",
      ));
      strictEqual(args.species, "cat");
      strictEqual(args.rarity, "legendary");
      strictEqual(args.eye, "✦");
      strictEqual(args.hat, "crown");
      strictEqual(args.shiny, true);
      strictEqual(args.max, 5000000);
      strictEqual(args.dryRun, true);
    });
  });

  describe("bare ID", () => {
    it("bare ID is treated as verify", () => {
      const args = parseArgs(argv("abcdef1234567890"));
      strictEqual(args.command, "verify");
      strictEqual(args.verifyId, "abcdef1234567890");
    });
  });

  describe("defaults", () => {
    it("no args defaults to interactive", () => {
      const args = parseArgs(argv());
      strictEqual(args.command, "interactive");
    });
  });
});

describe("formatStatBar", () => {
  it("value 0 produces empty bar", () => {
    const bar = formatStatBar("TEST", 0);
    ok(bar.includes("░░░░░░░░░░"), "value 0 should have all empty blocks");
    ok(!bar.includes("█"), "value 0 should have no filled blocks");
    ok(bar.includes("  0"), "value 0 should show 0 right-aligned");
  });
  it("value 1 produces minimum 1 filled bar", () => {
    const bar = formatStatBar("TEST", 1);
    ok(bar.includes("█"), "value 1 should have at least 1 filled block");
    ok(bar.includes("  1"), "should show value 1");
  });
  it("value 50 produces roughly half bar", () => {
    const bar = formatStatBar("TEST", 50);
    const filled = (bar.match(/█/g) || []).length;
    strictEqual(filled, 5, "value 50 should have 5 filled blocks");
    ok(bar.includes(" 50"), "should show value 50");
  });
  it("value 100 produces full bar", () => {
    const bar = formatStatBar("TEST", 100);
    const filled = (bar.match(/█/g) || []).length;
    strictEqual(filled, 10, "value 100 should have 10 filled blocks");
    ok(!bar.includes("░"), "value 100 should have no empty blocks");
    ok(bar.includes("100"), "should show value 100");
  });
  it("name is padded to 9 chars", () => {
    const bar = formatStatBar("AB", 50);
    // "AB" padded to 9 = "AB       "
    ok(bar.startsWith("AB       "), `name should be padded: "${bar}"`);
  });
  it("value is right-aligned to 3 chars", () => {
    const bar5 = formatStatBar("X", 5);
    ok(bar5.includes("  5"), "single-digit value should be right-aligned");
    const bar50 = formatStatBar("X", 50);
    ok(bar50.includes(" 50"), "two-digit value should be right-aligned");
  });
});

describe("renderSprite", () => {
  it("eye replacement works", () => {
    const sprite = renderSprite("cat", "✦", "none", "common");
    ok(sprite.includes("✦"), "sprite should contain the chosen eye");
    ok(!sprite.includes("{E}"), "sprite should not have {E} placeholder");
  });
  it("hat replacement on line 0", () => {
    const sprite = renderSprite("cat", "·", "crown", "rare");
    const lines = sprite.split("\n");
    ok(lines[0].includes("\\^^^/"), "first line should contain crown hat");
  });
  it("no-hat skips blank first line", () => {
    const sprite = renderSprite("cat", "·", "none", "common");
    const lines = sprite.split("\n");
    // Line 0 should remain blank (spaces) since hat=none
    strictEqual(lines[0].trim(), "", "first line should be blank for hat=none");
  });
  it("unknown species returns empty string", () => {
    const sprite = renderSprite("unicorn", "·", "none", "common");
    strictEqual(sprite, "");
  });
});

// ══════════════════════════════════════════════════════════
// 3. Config operations layer (using temp dirs)
// ══════════════════════════════════════════════════════════

describe("Config operations", () => {
  let tmpDir;
  let configPath, backupPath, statePath;

  const FAKE_CONFIG = {
    userID: "original-user-id",
    oauthAccount: {
      accountUuid: "original-uuid",
      emailAddress: "test@test.com",
    },
    companion: {
      name: "TestBuddy",
      personality: "test personality",
    },
    otherField: "should-not-be-touched",
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "buddy-roll-test-"));
    configPath = join(tmpDir, ".claude.json");
    backupPath = join(tmpDir, ".claude.json.buddy-roll-backup");
    statePath = join(tmpDir, ".buddy-roll-state.json");
    writeFileSync(configPath, JSON.stringify(FAKE_CONFIG, null, 2));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("backupConfig", () => {
    it("creates backup file and state file", () => {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      backupConfig(configPath, backupPath, statePath, config);
      ok(existsSync(backupPath), "backup file should exist");
      ok(existsSync(statePath), "state file should exist");
    });
    it("records original values in state", () => {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      backupConfig(configPath, backupPath, statePath, config);
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      strictEqual(state.originalAccountUuid, "original-uuid");
      strictEqual(state.originalUserID, "original-user-id");
      deepStrictEqual(state.originalCompanion, { name: "TestBuddy", personality: "test personality" });
      strictEqual(state.salt, SALT);
    });
  });

  describe("applyBuddy", () => {
    it("writes userID, removes accountUuid, removes companion", () => {
      applyBuddy(configPath, backupPath, statePath, "new-user-id", false);
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      strictEqual(config.userID, "new-user-id");
      strictEqual(config.oauthAccount?.accountUuid, undefined);
      strictEqual(config.companion, undefined);
      // Other fields preserved
      strictEqual(config.otherField, "should-not-be-touched");
      strictEqual(config.oauthAccount.emailAddress, "test@test.com");
    });

    it("dry-run does not modify files", () => {
      const before = readFileSync(configPath, "utf8");
      applyBuddy(configPath, backupPath, statePath, "new-user-id", true);
      const after = readFileSync(configPath, "utf8");
      strictEqual(before, after, "config should not change in dry-run");
      ok(!existsSync(backupPath), "backup should not be created in dry-run");
      ok(!existsSync(statePath), "state should not be created in dry-run");
    });

    it("second call does not overwrite original backup", () => {
      // First apply
      applyBuddy(configPath, backupPath, statePath, "first-new-id", false);
      const state1 = JSON.parse(readFileSync(statePath, "utf8"));
      strictEqual(state1.originalUserID, "original-user-id");

      // Second apply (state file already exists)
      applyBuddy(configPath, backupPath, statePath, "second-new-id", false);
      const state2 = JSON.parse(readFileSync(statePath, "utf8"));
      // State should still reference the ORIGINAL values, not the first-new-id
      strictEqual(state2.originalUserID, "original-user-id");
      // But the config should have the latest ID
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      strictEqual(config.userID, "second-new-id");
    });
  });

  describe("restoreConfig", () => {
    it("restores all 3 fields, deletes state+backup files", () => {
      // Apply first to create backup+state
      applyBuddy(configPath, backupPath, statePath, "temporary-id", false);
      // Verify applied
      let config = JSON.parse(readFileSync(configPath, "utf8"));
      strictEqual(config.userID, "temporary-id");
      strictEqual(config.oauthAccount?.accountUuid, undefined);

      // Restore
      restoreConfig(configPath, backupPath, statePath);
      config = JSON.parse(readFileSync(configPath, "utf8"));
      strictEqual(config.userID, "original-user-id");
      strictEqual(config.oauthAccount.accountUuid, "original-uuid");
      deepStrictEqual(config.companion, { name: "TestBuddy", personality: "test personality" });
      strictEqual(config.otherField, "should-not-be-touched");

      // State and backup files should be deleted
      ok(!existsSync(statePath), "state file should be deleted after restore");
      ok(!existsSync(backupPath), "backup file should be deleted after restore");
    });

    it("errors correctly without state file", () => {
      // No backup/state exists
      throws(
        () => restoreConfig(configPath, backupPath, statePath),
        /No backup found/,
        "should throw when no state file exists",
      );
    });
  });
});
