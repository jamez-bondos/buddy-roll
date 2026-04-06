#!/usr/bin/env node
// buddy-roll — One-click Claude Code buddy customizer. No binary patching.

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";

// ── Constants ────────────────────────────────────────────

const SALT = "friend-2026-401";

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
];

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_STARS = { common: "★", uncommon: "★★", rare: "★★★", epic: "★★★★", legendary: "★★★★★" };
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

const EYES = ["·", "✦", "×", "◉", "@", "°"];
const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"];
const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

const CONFIG_PATH = join(homedir(), ".claude.json");
const BACKUP_PATH = join(homedir(), ".claude.json.buddy-roll-backup");
const STATE_PATH = join(homedir(), ".buddy-roll-state.json");

const ALIAS_START = "# >>> buddy-roll-alias start >>>";
const ALIAS_END = "# <<< buddy-roll-alias end <<<";

const NO_COLOR = !!(process.env.NO_COLOR || !process.stdout.isTTY);
const c = {
  reset: NO_COLOR ? "" : "\x1b[0m\x1b[39m",
  bold: NO_COLOR ? "" : "\x1b[1m",
  dim: NO_COLOR ? "" : "\x1b[2m",
  green: NO_COLOR ? "" : "\x1b[32m",
  yellow: NO_COLOR ? "" : "\x1b[33m",
  red: NO_COLOR ? "" : "\x1b[31m",
  cyan: NO_COLOR ? "" : "\x1b[36m",
  magenta: NO_COLOR ? "" : "\x1b[35m",
};

// ── i18n ─────────────────────────────────────────────────

let LANG = /^zh/i.test(process.env.LC_ALL || process.env.LANG || "") ? "zh" : "en";

const STRINGS = {
  title:           { en: "buddy-roll — Claude Code Buddy Customizer", zh: "buddy-roll — Claude Code 宠物定制器" },
  detected:        { en: "Detected: %s install (%s mode)", zh: "检测到：%s 安装（%s 模式）" },
  currentBuddy:    { en: "Current buddy: %s %s — %s「%s」", zh: "当前宠物：%s %s — %s「%s」" },
  invalidInput:    { en: "Please enter a number 1-%s", zh: "请输入 1-%s 之间的数字" },
  noBuddy:         { en: "No buddy hatched yet.", zh: "尚未孵化宠物。" },
  selectSpecies:   { en: "Select species:", zh: "选择物种：" },
  selectRarity:    { en: "Select target rarity:", zh: "选择目标稀有度：" },
  selectEye:       { en: "Select eye:", zh: "选择眼睛：" },
  selectHat:       { en: "Select hat:", zh: "选择帽子：" },
  requireShiny:    { en: "Require shiny? (y to require, enter to skip)", zh: "要求闪光？(y 指定, 回车跳过)" },
  skipHint:        { en: ", enter to skip", zh: ", 回车跳过" },
  searching:       { en: "Searching for %s %s...", zh: "正在搜索 %s %s..." },
  found:           { en: "✅ found: %s %s → %s", zh: "✅ 找到：%s %s → %s" },
  noMatch:         { en: "No match found in %s attempts. Try --max to increase.", zh: "在 %s 次尝试中未找到匹配。试试 --max 增加次数。" },
  searchStats:     { en: "🔍 %s attempts, %ss", zh: "🔍 %s 次尝试，耗时 %s 秒" },
  applyAsk:        { en: "(n to quit / r to retry / enter to view apply details)", zh: "(n 退出 / r 重新搜索 / 回车查看应用详情)" },
  applyConfirm:    { en: "Confirm apply? (y/N)", zh: "确认执行？(y/N)" },
  backupCreated:   { en: "Config backed up → %s", zh: "配置已备份 → %s" },
  userIdWritten:   { en: "userID written", zh: "userID 已写入" },
  uuidRemoved:     { en: "accountUuid removed", zh: "accountUuid 已清除" },
  companionCleared:{ en: "companion cleared (will re-hatch on restart)", zh: "companion 已清除（重启后重新孵化）" },
  aliasAdded:      { en: "Launch alias added → %s", zh: "启动别名已添加 → %s" },
  aliasSkipped:    { en: "No oauthAccount — launch alias not needed", zh: "无 oauthAccount — 不需要启动别名" },
  done:            { en: "Done! Restart Claude Code and run /buddy.", zh: "完成！重启 Claude Code 并运行 /buddy。" },
  undoHint:        { en: "To undo: npx buddy-roll restore", zh: "撤销：npx buddy-roll restore" },
  restoring:       { en: "Restoring original configuration...", zh: "正在恢复原始配置..." },
  restoreDetail:   { en: "Will restore the following to ~/.claude.json:", zh: "即将恢复以下字段到 ~/.claude.json：" },
  restored:        { en: "Original config restored", zh: "原始配置已恢复" },
  aliasRemoved:    { en: "Launch alias removed from %s", zh: "启动别名已从 %s 移除" },
  restoreDone:     { en: "Done! Restart Claude Code — your original buddy is back.", zh: "完成！重启 Claude Code — 你的原始宠物回来了。" },
  noBackup:        { en: "No backup found. Nothing to restore.", zh: "未找到备份。无需恢复。" },
  configNotFound:  { en: "Claude Code config not found. Is Claude Code installed?", zh: "未找到 Claude Code 配置文件。是否已安装 Claude Code？" },
  backupExists:    { en: "A previous buddy-roll backup exists. Overwrite?", zh: "已存在 buddy-roll 备份。覆盖？" },
  unsupportedShell:{ en: "Unsupported shell. Skipping alias. Add manually:", zh: "不支持的 shell。跳过 alias 配置。手动添加：" },
  existingAlias:   { en: "Existing 'claude' alias detected. buddy-roll will wrap it with `command claude`.", zh: "检测到已有 'claude' alias。buddy-roll 将使用 `command claude` 包装。" },
  installType:     { en: "Claude Code: %s install (%s)", zh: "Claude Code：%s 安装（%s）" },
  activeId:        { en: "Buddy identity: %s", zh: "Buddy 身份：%s" },
  stateActive:     { en: "buddy-roll state: active (backup from %s)", zh: "buddy-roll 状态：已激活（备份于 %s）" },
  stateInactive:   { en: "buddy-roll state: not active", zh: "buddy-roll 状态：未激活" },
  yesNo:           { en: " (y/n) ", zh: "（y/n）" },
  yes:             { en: "y", zh: "y" },
  anyCombo:        { en: "No, any combination", zh: "不，任意组合" },
  yesCustomize:    { en: "Yes, let me pick", zh: "是，让我选择" },
  dryRun:          { en: "[DRY RUN] No changes made.", zh: "[试运行] 未做任何更改。" },
  dryRunBanner:    { en: "⚠  DRY RUN MODE — no files will be modified", zh: "⚠  试运行模式 — 不会修改任何文件" },
  noUserID:        { en: "No userID found in ~/.claude.json. Start Claude Code at least once first.", zh: "~/.claude.json 中未找到 userID。请先启动一次 Claude Code。" },
  target:          { en: "Target", zh: "目标" },
  willModify:      { en: "The following files will be modified", zh: "即将修改以下文件" },
  modifyUserID:    { en: "modify userID", zh: "修改 userID" },
  removeUuid:      { en: "remove oauthAccount.accountUuid", zh: "移除 oauthAccount.accountUuid" },
  removeCompanion: { en: "remove companion (will re-hatch on restart)", zh: "移除 companion（重启后重新孵化）" },
  addAlias:        { en: "add claude launch alias (auto-clears accountUuid on each start)", zh: "添加 claude 启动别名（每次启动前自动清除 accountUuid）" },
  backupFiles:     { en: "Backup files", zh: "备份文件" },
  backupConfigDesc:{ en: "(Claude Code config backup)", zh: "（Claude Code 配置备份）" },
  backupStateDesc: { en: "(modified fields backup, for restoring original buddy)", zh: "（修改字段备份，用于恢复原有的 Buddy）" },
  restoreHint:     { en: "Restore", zh: "恢复方式" },
  dryRunHintRemove:{ en: "Remove --dry-run to apply for real", zh: "实际执行请去掉 --dry-run 参数" },
  willModifyRc:    { en: "Will modify", zh: "即将修改" },
  removeAliasBrief:{ en: "(remove claude launch alias)", zh: "（移除 claude 启动别名）" },
  willDelete:      { en: "Will delete", zh: "即将删除" },
  fieldsRestored:  { en: "accountUuid / userID / companion restored", zh: "accountUuid / userID / companion 已恢复" },
  statesCleaned:   { en: "State files cleaned up", zh: "状态文件已清理" },
  speciesRequired: { en: "--species is required for non-interactive mode", zh: "非交互模式需要 --species 参数" },
  verifyNeedsId:   { en: "verify requires an ID argument", zh: "verify 需要一个 ID 参数" },
};

function t(key, ...args) {
  let s = STRINGS[key]?.[LANG] || STRINGS[key]?.en || key;
  args.forEach((a, i) => { s = s.replace("%s", a); });
  return s;
}

// ── Hash ─────────────────────────────────────────────────

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

function detectInstallType() {
  // Check actual binary first
  try {
    const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
    const fileType = execSync(`file "${claudePath}"`, { encoding: "utf8" });
    if (/Mach-O|ELF/.test(fileType)) return "native";
    if (/text|script|node/.test(fileType)) return "npm";
  } catch {}
  // Fallback to config
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (config.installMethod === "native") return "native";
  } catch {}
  return "npm";
}

function hashFor(installType) {
  return installType === "native" ? wyhash32 : fnv1a;
}

// ── PRNG ─────────────────────────────────────────────────

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

// ── Roll ─────────────────────────────────────────────────

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

function formatBuddy(b) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rarityColor = NO_COLOR ? "" : (RARITY_ANSI[b.rarity] || "");
  const R = NO_COLOR ? "" : "\x1b[0m\x1b[39m";
  const lines = [];
  lines.push(`${rarityColor}${RARITY_STARS[b.rarity]} ${cap(b.rarity)}${R} — ${cap(b.species)}`);
  if (b.shiny) lines.push(`${c.yellow}✨ SHINY ✨${R}`);
  const sprite = renderSprite(b.species, b.eye, b.hat, b.rarity);
  if (sprite) {
    const spriteLines = sprite.split("\n");
    const trimmed = (b.hat && b.hat !== "none") ? spriteLines : spriteLines.filter((l, i) => i > 0 || l.trim());
    lines.push(trimmed.join("\n"));
  }
  lines.push(`${c.dim}Eye: ${b.eye}  Hat: ${b.hat}${R}`);
  for (const s of STAT_NAMES) {
    lines.push(`${c.dim}${formatStatBar(s, b.stats[s])}${R}`);
  }
  return lines.join("\n");
}

// ── Sprites ──────────────────────────────────────────────

// Frame 0 (rest pose) for each species. 5 lines × 12 chars. {E} = eye placeholder.
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
  common:    "\x1b[90m",          // gray
  uncommon:  "\x1b[32m",          // green
  rare:      "\x1b[38;5;75m",     // #58a6ff blue
  epic:      "\x1b[38;5;141m",    // #bc8cff purple
  legendary: "\x1b[38;5;208m",    // #f0883e orange
};

function renderSprite(species, eye, hat, rarity) {
  const frame = SPRITE_FRAMES[species];
  if (!frame) return "";
  const color = NO_COLOR ? "" : (RARITY_ANSI[rarity] || "");
  const R = NO_COLOR ? "" : "\x1b[0m\x1b[39m";
  const lines = frame.map((line, i) => {
    let result = line.replaceAll("{E}", eye);
    if (i === 0 && hat && hat !== "none" && HAT_LINES[hat] && !result.trim()) {
      result = HAT_LINES[hat];
    }
    return `  ${color}${result}${R}`;
  });
  return lines.join("\n");
}

function formatStatBar(name, value) {
  const barLen = 10;
  const filled = value > 0 ? Math.max(1, Math.round(value / 100 * barLen)) : 0;
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  return `${name.padEnd(9)} ${bar} ${String(value).padStart(3)}`;
}

function formatBuddyCard(b) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rarityColor = NO_COLOR ? "" : (RARITY_ANSI[b.rarity] || "");
  const R = NO_COLOR ? "" : "\x1b[0m\x1b[39m";
  const lines = [];
  lines.push(`${rarityColor}${RARITY_STARS[b.rarity]} ${cap(b.rarity)}${R} — ${cap(b.species)}`);
  if (b.shiny) lines.push(`${c.yellow}✨ SHINY ✨${R}`);

  const sprite = renderSprite(b.species, b.eye, b.hat, b.rarity);
  if (sprite) {
    const spriteLines = sprite.split("\n");
    const trimmed = (b.hat && b.hat !== "none") ? spriteLines : spriteLines.filter((l, i) => i > 0 || l.trim());
    lines.push(trimmed.join("\n"));
  }

  if (b.name) lines.push(`${c.bold}${b.name}${R}`);
  if (b.personality) {
    const maxW = 30;
    const words = b.personality.split(" ");
    let line = "";
    const wrapped = [];
    for (const w of words) {
      if (line && (line + " " + w).length > maxW) { wrapped.push(line); line = w; }
      else { line = line ? line + " " + w : w; }
    }
    if (line) wrapped.push(line);
    lines.push(`${c.dim}"${wrapped.join(`\n`)}"${R}`);
    lines.push("");
  }

  for (const s of STAT_NAMES) {
    lines.push(`${c.dim}${formatStatBar(s, b.stats[s])}${R}`);
  }

  return lines.join("\n");
}

// ── Config ───────────────────────────────────────────────

function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function requireUserID(config) {
  if (!config.userID) {
    console.error(`${c.red}✗${c.reset} ${t("noUserID")}`);
    process.exit(1);
  }
}

function writeConfigAtomic(config) {
  const tmp = CONFIG_PATH + ".buddy-roll-tmp";
  writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  renameSync(tmp, CONFIG_PATH);
}

function getCurrentBuddy(config, installType) {
  if (!config) return null;
  const uuid = config.oauthAccount?.accountUuid;
  const userId = config.userID;
  const activeId = uuid ?? userId ?? "anon";
  const hashFn = hashFor(installType);
  const bones = fullRoll(activeId, hashFn);
  const soul = config.companion || null;
  return { ...bones, name: soul?.name, personality: soul?.personality, activeId, source: uuid ? "accountUuid" : "userID" };
}

function backupConfig(config) {
  copyFileSync(CONFIG_PATH, BACKUP_PATH);
  chmodSync(BACKUP_PATH, 0o600);
  const state = {
    backupTime: new Date().toISOString(),
    originalAccountUuid: config.oauthAccount?.accountUuid || null,
    originalUserID: config.userID || null,
    originalCompanion: config.companion || null,
    salt: SALT,
    installType: detectInstallType(),
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function applyBuddy(newUserID, dryRun) {
  const config = readConfig();
  if (!config) { console.error(`${c.red}✗${c.reset} ${t("configNotFound")}`); process.exit(1); }

  if (dryRun) {
    console.log(`\n${c.yellow}${t("dryRun")}${c.reset}`);
    console.log(`  userID: ${config.userID || "(none)"} → ${newUserID}`);
    if (config.oauthAccount?.accountUuid) console.log(`  accountUuid: ${config.oauthAccount.accountUuid} → (deleted)`);
    console.log(`  companion: → (deleted for re-hatch)`);
    return;
  }

  if (existsSync(STATE_PATH)) {
    // Already have a backup — don't overwrite the original
  } else {
    backupConfig(config);
    console.log(`${c.green}✓${c.reset} ${t("backupCreated", "~/.claude.json.buddy-roll-backup")}`);
  }

  config.userID = newUserID;
  console.log(`${c.green}✓${c.reset} ${t("userIdWritten")}`);
  if (config.oauthAccount?.accountUuid) {
    delete config.oauthAccount.accountUuid;
    console.log(`${c.green}✓${c.reset} ${t("uuidRemoved")}`);
  }
  if (config.companion) {
    delete config.companion;
    console.log(`${c.green}✓${c.reset} ${t("companionCleared")}`);
  }
  writeConfigAtomic(config);
}

function restoreConfig() {
  if (!existsSync(STATE_PATH)) {
    console.error(`${c.red}✗${c.reset} ${t("noBackup")}`);
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const config = readConfig();
  if (!config) { console.error(`${c.red}✗${c.reset} ${t("configNotFound")}`); process.exit(1); }

  console.log(`${c.bold}${t("restoreDetail")}${c.reset}`);
  if (state.originalAccountUuid) console.log(`  - oauthAccount.accountUuid → ${state.originalAccountUuid.slice(0, 8)}...`);
  if (state.originalUserID) console.log(`  - userID → ${state.originalUserID.slice(0, 16)}...`);
  if (state.originalCompanion) console.log(`  - companion → ${state.originalCompanion.name}`);
  const shell = detectShell();
  if (shell) console.log(`${c.bold}${t("willModifyRc")}：${c.reset}\n  - ${shell.rcFile.replace(homedir(), "~")} ${t("removeAliasBrief")}`);
  console.log(`${c.bold}${t("willDelete")}：${c.reset}\n  - ~/.buddy-roll-state.json\n  - ~/.claude.json.buddy-roll-backup`);
  console.log("");

  if (state.originalAccountUuid && config.oauthAccount) {
    config.oauthAccount.accountUuid = state.originalAccountUuid;
  }
  if (state.originalUserID) config.userID = state.originalUserID;
  if (state.originalCompanion) config.companion = state.originalCompanion;
  else delete config.companion;
  writeConfigAtomic(config);
  console.log(`${c.green}✓${c.reset} ${t("fieldsRestored")}`);

  if (shell) {
    removeAlias(shell.rcFile);
    console.log(`${c.green}✓${c.reset} ${t("aliasRemoved", shell.rcFile.replace(homedir(), "~"))}`);
  }

  unlinkSync(STATE_PATH);
  if (existsSync(BACKUP_PATH)) unlinkSync(BACKUP_PATH);
  console.log(`${c.green}✓${c.reset} ${t("statesCleaned")}`);
}

// ── Alias ────────────────────────────────────────────────

function detectShell() {
  const shell = process.env.SHELL || "";
  if (shell.endsWith("/zsh")) return { name: "zsh", rcFile: join(homedir(), ".zshrc") };
  if (shell.endsWith("/bash")) {
    const rc = process.platform === "darwin" ? ".bash_profile" : ".bashrc";
    return { name: "bash", rcFile: join(homedir(), rc) };
  }
  return null;
}

function getAliasBlock() {
  return [
    ALIAS_START,
    `# Auto-strips accountUuid so buddy uses custom userID`,
    `claude() { node -e "const f=require(\\"os\\").homedir()+\\"/.claude.json\\";try{const c=JSON.parse(require(\\"fs\\").readFileSync(f));if(c.oauthAccount?.accountUuid){delete c.oauthAccount.accountUuid;delete c.companion;require(\\"fs\\").writeFileSync(f,JSON.stringify(c,null,2))}}catch{}"; command claude "$@"; }`,
    ALIAS_END,
  ].join("\n");
}

function writeRcAtomic(rcFile, content) {
  const tmp = rcFile + ".buddy-roll-tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, rcFile);
}

function addAlias(rcFile) {
  if (!existsSync(rcFile)) {
    writeRcAtomic(rcFile, getAliasBlock() + "\n");
    return;
  }
  let content = readFileSync(rcFile, "utf8");

  if (content.includes(ALIAS_START)) {
    const startIdx = content.indexOf(ALIAS_START);
    const endIdx = content.indexOf(ALIAS_END);
    if (endIdx > startIdx) {
      content = content.slice(0, startIdx) + getAliasBlock() + content.slice(endIdx + ALIAS_END.length);
      writeRcAtomic(rcFile, content);
      return;
    }
  }

  if (/^\s*alias\s+claude\s*=/m.test(content)) {
    console.log(`${c.yellow}!${c.reset} ${t("existingAlias")}`);
  }

  const nl = content.endsWith("\n") ? "" : "\n";
  writeRcAtomic(rcFile, content + nl + "\n" + getAliasBlock() + "\n");
}

function removeAlias(rcFile) {
  if (!existsSync(rcFile)) return;
  let content = readFileSync(rcFile, "utf8");
  const startIdx = content.indexOf(ALIAS_START);
  const endIdx = content.indexOf(ALIAS_END);
  if (startIdx === -1 || endIdx === -1) return;

  let before = content.slice(0, startIdx);
  let after = content.slice(endIdx + ALIAS_END.length);
  before = before.replace(/\n\n$/, "\n");
  after = after.replace(/^\n/, "");
  writeRcAtomic(rcFile, before + after);
}

function setupAlias(config, dryRun) {
  if (!config.oauthAccount) {
    console.log(`${c.dim}${t("aliasSkipped")}${c.reset}`);
    return;
  }

  const shell = detectShell();
  if (!shell) {
    console.log(`${c.yellow}!${c.reset} ${t("unsupportedShell")}`);
    console.log(`  ${getAliasBlock()}`);
    return;
  }

  if (dryRun) {
    console.log(`  alias: would add to ${shell.rcFile}`);
    return;
  }

  addAlias(shell.rcFile);
  console.log(`${c.green}✓${c.reset} ${t("aliasAdded", shell.rcFile)}`);
}

// ── Search ───────────────────────────────────────────────

function search(target, hashFn, maxAttempts) {
  const { species, rarity, eye, hat, shiny } = target;
  let best = null;
  const startTime = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    const id = randomBytes(32).toString("hex");
    const result = fullRoll(id, hashFn);

    if (species && result.species !== species) continue;
    if (eye && result.eye !== eye) continue;
    if (hat && result.hat !== hat) continue;
    if (shiny && !result.shiny) continue;

    if (result.rarity === rarity) {
      best = { ...result, id, iterations: i + 1, elapsed: ((Date.now() - startTime) / 1000).toFixed(1) };
      break;
    }
  }

  return best;
}

// ── Interactive ──────────────────────────────────────────

function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function selectFromList(rl, prompt, items) {
  console.log(`\n${c.bold}${prompt}${c.reset}`);
  if (items.length > 10) {
    const cols = 3;
    const rows = Math.ceil(items.length / cols);
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let col = 0; col < cols; col++) {
        const idx = r + col * rows;
        if (idx < items.length) {
          const num = String(idx + 1).padStart(2);
          line += `  ${c.cyan}${num}${c.reset}) ${items[idx].label.padEnd(12)}`;
        }
      }
      console.log(line);
    }
  } else {
    items.forEach((item, i) => {
      console.log(`  ${c.cyan}${i + 1}${c.reset}) ${item.label}`);
    });
  }
  while (true) {
    const ans = await ask(rl, `\n  (1-${items.length}) ❯ `);
    const n = parseInt(ans.trim());
    if (n >= 1 && n <= items.length) return items[n - 1].value;
    console.log(`  ${c.dim}${t("invalidInput", items.length)}${c.reset}`);
  }
}

async function selectFromListOptional(rl, prompt, items) {
  console.log(`\n${c.bold}${prompt}${c.reset}`);
  if (items.length > 10) {
    const cols = 3;
    const rows = Math.ceil(items.length / cols);
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let col = 0; col < cols; col++) {
        const idx = r + col * rows;
        if (idx < items.length) {
          const num = String(idx + 1).padStart(2);
          line += `  ${c.cyan}${num}${c.reset}) ${items[idx].label.padEnd(12)}`;
        }
      }
      console.log(line);
    }
  } else {
    items.forEach((item, i) => {
      console.log(`  ${c.cyan}${i + 1}${c.reset}) ${item.label}`);
    });
  }
  while (true) {
    const ans = await ask(rl, `\n  (1-${items.length}${t("skipHint")}) ❯ `);
    if (!ans.trim()) return null;
    const n = parseInt(ans.trim());
    if (n >= 1 && n <= items.length) return items[n - 1].value;
    console.log(`  ${c.dim}${t("invalidInput", items.length)}${c.reset}`);
  }
}

async function confirm(rl, prompt) {
  const ans = await ask(rl, `${prompt}${t("yesNo")}`);
  return ans.trim().toLowerCase().startsWith("y");
}

async function interactiveMode(installType, dryRun, userMax) {
  const config = readConfig();
  if (!config) { console.error(`${c.red}✗${c.reset} ${t("configNotFound")}`); process.exit(1); }
  requireUserID(config);

  const hashFn = hashFor(installType);
  const installLabel = installType === "native" ? "native binary" : "npm";
  const hashName = installType === "native" ? "wyhash" : "FNV-1a";

  console.log(`\n${c.bold}${c.magenta}${t("title")}${c.reset}\n`);
  if (dryRun) {
    console.log(`${c.yellow}${c.bold}${t("dryRunBanner")}${c.reset}\n`);
  }
  console.log(`${t("installType", installLabel, hashName)}`);

  const current = getCurrentBuddy(config, installType);
  if (current?.name) {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    console.log(`${t("currentBuddy", RARITY_STARS[current.rarity], cap(current.rarity), cap(current.species), current.name)}`);
  } else {
    console.log(`${t("noBuddy")}`);
  }

  const rl = createRL();

  try {
    const speciesItems = SPECIES.map(s => ({ label: s, value: s }));
    const targetSpecies = await selectFromList(rl, t("selectSpecies"), speciesItems);

    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const maxStars = 5;
    const rarityItems = [...RARITIES].reverse().map(r => {
      const stars = RARITY_STARS[r].padEnd(maxStars);
      const name = cap(r).padEnd(10);
      const pct = String(RARITY_WEIGHTS[r]).padStart(2) + "%";
      const color = NO_COLOR ? "" : (RARITY_ANSI[r] || "");
      const R = NO_COLOR ? "" : "\x1b[0m\x1b[39m";
      return { label: `${color}${stars}${R} ${name} ${pct}`, value: r };
    });
    const targetRarity = await selectFromList(rl, t("selectRarity"), rarityItems);

    const eyeItems = EYES.map(e => ({ label: e, value: e }));
    const targetEye = await selectFromListOptional(rl, t("selectEye"), eyeItems);

    let targetHat = null;
    if (targetRarity !== "common") {
      const hatItems = HATS.map(h => ({ label: h, value: h }));
      targetHat = await selectFromListOptional(rl, t("selectHat"), hatItems);
    }

    const shinyAns = await ask(rl, `\n${t("requireShiny")} ❯ `);
    const targetShiny = shinyAns.trim().toLowerCase() === "y";

    const uc = s => s.charAt(0).toUpperCase() + s.slice(1);
    const parts = [`${RARITY_STARS[targetRarity]} ${uc(targetRarity)} ${uc(targetSpecies)}`];
    if (targetEye) parts.push(`Eye: ${targetEye}`);
    if (targetHat) parts.push(`Hat: ${targetHat}`);
    if (targetShiny) parts.push(`Shiny: ✨`);
    console.log(`\n${t("target")}：${parts.join(" | ")}`);

    const maxAttempts = userMax || (targetShiny ? 50000000 : (targetEye || targetHat) ? 20000000 : 20000000);
    let result = null;

    while (true) {
      console.log(`${t("searching", targetRarity, targetSpecies)}`);
      result = search(
        { species: targetSpecies, rarity: targetRarity, eye: targetEye, hat: targetHat, shiny: targetShiny },
        hashFn,
        maxAttempts,
      );

      if (!result) {
        console.log(`\n${c.yellow}${t("noMatch", maxAttempts.toLocaleString())}${c.reset}`);
        rl.close();
        return;
      }

      console.log(`${t("searchStats", result.iterations.toLocaleString(), result.elapsed)}`);
      console.log(`${c.green}${t("found", result.rarity, result.species, result.id.slice(0, 8) + "..." + result.id.slice(-8))}${c.reset}`);
      console.log("");
      console.log(formatBuddy(result));
      console.log(`\n${c.dim}ID: ${result.id}${c.reset}`);

      const choice = await ask(rl, `\n${t("applyAsk")} ❯ `);
      const ch = choice.trim().toLowerCase();
      if (ch === "r") continue;
      if (ch === "n") { rl.close(); return; }
      break;
    }

    const idShort = result.id.slice(0, 8) + "..." + result.id.slice(-8);
    console.log(`\n${c.yellow}⚠  ${t("willModify")}：${c.reset}`);
    console.log(`  ${c.cyan}~/.claude.json${c.reset}`);
    console.log(`    - ${t("modifyUserID")}: ${idShort}`);
    console.log(`    - ${t("removeUuid")}`);
    console.log(`    - ${t("removeCompanion")}`);
    if (config.oauthAccount) {
      const shell = detectShell();
      if (shell) console.log(`  ${c.cyan}${shell.rcFile.replace(homedir(), "~")}${c.reset}\n    - ${t("addAlias")}`);
    }
    console.log(`\n${t("backupFiles")}：`);
    console.log(`  ~/.claude.json.buddy-roll-backup  ${c.dim}${t("backupConfigDesc")}${c.reset}`);
    console.log(`  ~/.buddy-roll-state.json          ${c.dim}${t("backupStateDesc")}${c.reset}`);
    console.log(`\n${t("restoreHint")}：npx buddy-roll restore`);

    if (dryRun) {
      rl.close();
      console.log(`\n${c.yellow}${t("dryRunBanner")}${c.reset}`);
      console.log(`${c.dim}${t("dryRunHintRemove")}${c.reset}`);
      return;
    }

    const ans = await ask(rl, `\n${t("applyConfirm")} ❯ `);
    rl.close();

    if (ans.trim().toLowerCase() !== "y") return;

    applyBuddy(result.id, false);
    if (existsSync(STATE_PATH)) {
      const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
      state.appliedUserID = result.id;
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    }
    setupAlias(config, false);

    console.log(`\n${c.green}${c.bold}${t("done")}${c.reset}`);
    console.log(`${c.dim}${t("undoHint")}${c.reset}`);
  } catch (e) {
    rl.close();
    throw e;
  }
}

// ── CLI ──────────────────────────────────────────────────

function cmdCurrent() {
  const config = readConfig();
  if (!config) { console.error(`${c.red}✗${c.reset} ${t("configNotFound")}`); process.exit(1); }
  requireUserID(config);

  const installType = detectInstallType();
  const installLabel = installType === "native" ? "native binary" : "npm";
  const hashName = installType === "native" ? "wyhash" : "FNV-1a";
  console.log(`${t("installType", installLabel, hashName)}`);

  const uuid = config.oauthAccount?.accountUuid;
  const userId = config.userID;
  const fmtId = id => id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-8)}` : id;
  const source = uuid ? `accountUuid (${fmtId(uuid)})` : userId ? `userID (${fmtId(userId)})` : "anon";
  console.log(`${t("activeId", source)}`);

  const buddy = getCurrentBuddy(config, installType);
  if (buddy) {
    console.log("");
    console.log(formatBuddyCard(buddy));
  }

  if (existsSync(STATE_PATH)) {
    const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    console.log(`\n${t("stateActive", state.backupTime.split("T")[0])}`);
  } else {
    console.log(`\n${t("stateInactive")}`);
  }
}

function cmdVerify(id) {
  const installType = detectInstallType();
  const installLabel = installType === "native" ? "native binary" : "npm";
  const hashName = installType === "native" ? "wyhash" : "FNV-1a";
  const hashFn = hashFor(installType);
  const fmtId = s => s.length > 16 ? `${s.slice(0, 8)}...${s.slice(-8)}` : s;

  console.log(`${t("installType", installLabel, hashName)}`);
  console.log(`ID: ${fmtId(id)}\n`);

  const result = fullRoll(id, hashFn);
  console.log(formatBuddy(result));
}

function cmdHelp() {
  const b = c.bold, r = c.reset;
  const eyes = EYES.join(", ");

  if (LANG === "zh") {
    console.log(`
${b}buddy-roll${r} — 一键 Claude Code 宠物定制器。不修改二进制文件。

${b}用法：${r}
  npx buddy-roll                    搜索并应用自定义宠物（交互式）
  npx buddy-roll current            查看当前宠物信息
  npx buddy-roll verify <id>        查看某个 ID 生成的宠物
  npx buddy-roll restore            恢复原始配置和宠物
  npx buddy-roll help               显示帮助

${b}非交互模式：${r}
  --species <name>     目标物种
                       duck, goose, blob, cat, dragon, octopus,
                       owl, penguin, turtle, snail, ghost, axolotl,
                       capybara, cactus, robot, rabbit, mushroom, chonk
  --rarity <level>     目标稀有度
                       common, uncommon, rare, epic, legendary
  --eye <style>        目标眼睛 (${eyes})
  --hat <type>         目标帽子
                       none, crown, tophat, propeller,
                       halo, wizard, beanie, tinyduck
  --shiny              要求闪光
  --max <number>       最大搜索次数（默认 20000000）

${b}选项：${r}
  --lang en|zh         强制语言
  --dry-run            预览变更，不实际修改
`);
  } else {
    console.log(`
${b}buddy-roll${r} — One-click Claude Code buddy customizer. No binary patching.

${b}Usage:${r}
  npx buddy-roll                    Search and apply a custom buddy (interactive)
  npx buddy-roll current            Show current buddy info
  npx buddy-roll verify <id>        Check what buddy an ID produces
  npx buddy-roll restore            Restore original config and buddy
  npx buddy-roll help               Show this help

${b}Non-interactive:${r}
  --species <name>     Target species
                       duck, goose, blob, cat, dragon, octopus,
                       owl, penguin, turtle, snail, ghost, axolotl,
                       capybara, cactus, robot, rabbit, mushroom, chonk
  --rarity <level>     Target rarity
                       common, uncommon, rare, epic, legendary
  --eye <style>        Target eye (${eyes})
  --hat <type>         Target hat
                       none, crown, tophat, propeller,
                       halo, wizard, beanie, tinyduck
  --shiny              Require shiny
  --max <number>       Max search attempts (default: 20000000)

${b}Options:${r}
  --lang en|zh         Force language
  --dry-run            Show what would change without applying
`);
  }
}

function cmdRestore() {
  if (!existsSync(STATE_PATH)) {
    console.error(`${c.red}✗${c.reset} ${t("noBackup")}`);
    process.exit(1);
  }
  console.log(`${t("restoring")}\n`);
  restoreConfig();
  console.log(`\n${c.green}${c.bold}${t("restoreDone")}${c.reset}`);
}

function exitWithHelp(msg) {
  console.error(`${c.red}✗${c.reset} ${msg}\n`);
  cmdHelp();
  process.exit(1);
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
      case "--lang": LANG = argv[++i]; break;
      case "--dry-run": args.dryRun = true; break;
      case "--yes": case "-y": args.yes = true; break;
    }
    i++;
  }
  return args;
}

async function nonInteractiveMode(args) {
  if (!args.species) exitWithHelp(t("speciesRequired"));
  if (!SPECIES.includes(args.species)) exitWithHelp(`Unknown species: ${args.species}. Valid: ${SPECIES.join(", ")}`);
  if (args.rarity && !RARITIES.includes(args.rarity)) exitWithHelp(`Unknown rarity: ${args.rarity}. Valid: ${RARITIES.join(", ")}`);
  if (args.eye && !EYES.includes(args.eye)) exitWithHelp(`Unknown eye: ${args.eye}. Valid: ${EYES.join(", ")}`);
  if (args.hat && !HATS.includes(args.hat)) exitWithHelp(`Unknown hat: ${args.hat}. Valid: ${HATS.join(", ")}`);


  const config = readConfig();
  if (!config) { console.error(`${c.red}✗${c.reset} ${t("configNotFound")}`); process.exit(1); }
  requireUserID(config);

  const installType = detectInstallType();
  const hashFn = hashFor(installType);
  const rarity = args.rarity || "legendary";
  const max = args.max || (args.shiny ? 50000000 : 20000000);

  console.log(`\n${t("searching", rarity, args.species)}`);
  const result = search(
    { species: args.species, rarity, eye: args.eye, hat: args.hat, shiny: args.shiny },
    hashFn, max,
  );

  if (!result) {
    console.log(`\n${c.yellow}${t("noMatch", max.toLocaleString())}${c.reset}`);
    process.exit(1);
  }

  console.log(`${t("searchStats", result.iterations.toLocaleString(), result.elapsed)}`);
  console.log(`${c.green}${t("found", result.rarity, result.species, result.id.slice(0, 8) + "..." + result.id.slice(-8))}${c.reset}`);
  console.log("");
  console.log(formatBuddy(result));
  console.log(`\n${c.dim}ID: ${result.id}${c.reset}`);

  applyBuddy(result.id, args.dryRun);
  if (!args.dryRun) setupAlias(config, args.dryRun);

  console.log(`\n${c.green}${c.bold}${t("done")}${c.reset}`);
  console.log(`${c.dim}${t("undoHint")}${c.reset}`);
}

async function main() {
  const args = parseArgs(process.argv);

  switch (args.command) {
    case "help": cmdHelp(); break;
    case "restore": cmdRestore(); break;
    case "current": cmdCurrent(); break;
    case "verify":
      if (!args.verifyId) exitWithHelp(t("verifyNeedsId"));
      cmdVerify(args.verifyId);
      break;
    case "interactive":
      if (args.species) {
        await nonInteractiveMode(args);
      } else {
        await interactiveMode(detectInstallType(), args.dryRun, args.max);
      }
      break;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
