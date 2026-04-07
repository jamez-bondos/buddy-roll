# buddy-roll

[![Tests](https://github.com/jamez-bondos/buddy-roll/actions/workflows/test.yml/badge.svg)](https://github.com/jamez-bondos/buddy-roll/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/buddy-roll)](https://www.npmjs.com/package/buddy-roll)

> One-click Claude Code buddy customizer. No binary patching.

[中文文档](./README.zh-CN.md)

## Quick Start

```bash
npx buddy-roll
```

An interactive menu walks you through species, rarity, eyes, hat, and shiny preferences — then brute-forces a matching userID and applies it.

## How It Works

Claude Code generates your `/buddy` companion from `hash(identity + salt)` fed into a deterministic PRNG. The identity is your `userID` in `~/.claude.json`.

buddy-roll brute-forces random userIDs until one produces the buddy you want, then applies it in four steps:

1. **Backup** your existing `~/.claude.json`
2. **Write** the new `userID`
3. **Remove** `oauthAccount.accountUuid` (so the custom userID takes priority)
4. **Add a `claude` alias** that strips `accountUuid` on each Claude launch

## Commands

| Command | Description |
|---|---|
| `npx buddy-roll` | Interactive buddy customizer |
| `npx buddy-roll current` | Show your current buddy info |
| `npx buddy-roll verify <id>` | Check what buddy a given ID produces |
| `npx buddy-roll restore` | Restore original config and buddy |
| `npx buddy-roll apply <id>` | Apply a saved buddy ID directly |
| `npx buddy-roll help` | Show help |

## Non-Interactive Mode

Skip the menus with flags:

```bash
npx buddy-roll --species dragon --rarity legendary --shiny --dry-run
```

| Flag | Description |
|---|---|
| `--species <name>` | Target species (required for non-interactive) |
| `--rarity <level>` | Target rarity (common/uncommon/rare/epic/legendary, default: legendary) |
| `--eye <style>` | Target eye style (`·`, `✦`, `×`, `◉`, `@`, `°`) |
| `--hat <type>` | Target hat (crown, tophat, propeller, halo, wizard, beanie, tinyduck) |
| `--shiny` | Require shiny |
| `--yes, -y` | Skip confirmation prompt (for scripts) |
| `--max <number>` | Max search attempts (default: 20,000,000) |
| `--dry-run` | Preview changes without applying |
| `--lang en\|zh` | Force language |

### Species

duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk

## Supported Platforms

- **macOS** — zsh (default), bash (`.bash_profile`)
- **Linux** — zsh, bash (`.bashrc`)
- Works with both npm (`npm i -g @anthropic-ai/claude-code`) and native binary installs (auto-detected)

## Limitations

- Shell launch alias only works in terminal — IDE extensions launch the binary directly, bypassing the alias
- If Claude Code updates its salt or hashing algorithm, rerun buddy-roll
- Windows and fish shell are not yet supported

## Uninstall

```bash
npx buddy-roll restore
```

This restores your original `~/.claude.json` and removes the `claude` alias from your rc file.

## License

MIT
