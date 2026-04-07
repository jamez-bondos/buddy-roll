# buddy-roll

[![Tests](https://github.com/jamez-bondos/buddy-roll/actions/workflows/test.yml/badge.svg)](https://github.com/jamez-bondos/buddy-roll/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/buddy-roll)](https://www.npmjs.com/package/buddy-roll)

> Claude Code Buddy 定制工具。一键定制，无需修改二进制文件。

[English](./README.md)

## 快速开始

```bash
npx buddy-roll
```

交互式菜单引导你选择物种、稀有度、眼睛、帽子和闪光偏好，然后暴力搜索匹配的 userID 并应用。

## 工作原理

Claude Code 通过 `hash(identity + salt)` 输入确定性 PRNG 来生成 `/buddy` 伙伴。identity 就是 `~/.claude.json` 中的 `userID`。

buddy-roll 暴力搜索随机 userID，直到找到能生成你想要的宠物的那个，然后分四步应用：

1. **备份** 现有的 `~/.claude.json`
2. **写入** 新的 `userID`
3. **移除** `oauthAccount.accountUuid`（让自定义 userID 优先生效）
4. **添加 `claude` 别名**，每次启动 Claude 时自动清除 `accountUuid`

## 命令

| 命令 | 说明 |
|---|---|
| `npx buddy-roll` | 交互式宠物定制 |
| `npx buddy-roll current` | 查看当前宠物信息 |
| `npx buddy-roll verify <id>` | 查看某个 ID 生成的宠物 |
| `npx buddy-roll restore` | 恢复原始配置和宠物 |
| `npx buddy-roll apply <id>` | 直接应用已保存的 buddy ID |
| `npx buddy-roll help` | 显示帮助 |

## 非交互模式

使用命令行参数跳过菜单：

```bash
npx buddy-roll --species dragon --rarity legendary --shiny --dry-run
```

| 参数 | 说明 |
|---|---|
| `--species <name>` | 目标物种（非交互模式必填） |
| `--rarity <level>` | 目标稀有度（common/uncommon/rare/epic/legendary，默认：legendary） |
| `--eye <style>` | 目标眼睛样式（`·`, `✦`, `×`, `◉`, `@`, `°`） |
| `--hat <type>` | 目标帽子（crown, tophat, propeller, halo, wizard, beanie, tinyduck） |
| `--shiny` | 要求闪光 |
| `--yes, -y` | 跳过确认提示（用于脚本） |
| `--max <number>` | 最大搜索次数（默认：20,000,000） |
| `--dry-run` | 预览变更，不实际修改 |
| `--lang en\|zh` | 强制指定语言 |

### 物种列表

duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk

## 支持平台

- **macOS** — zsh（默认）、bash（`.bash_profile`）
- **Linux** — zsh、bash（`.bashrc`）
- 支持 npm 安装和原生二进制安装（自动检测）

## 限制

- 启动别名仅在终端生效 — IDE 扩展直接调用二进制，绕过别名
- 如果 Claude Code 更新了 salt 或哈希算法，需要重新运行 buddy-roll
- 暂不支持 Windows 和 fish shell

## 卸载

```bash
npx buddy-roll restore
```

恢复原始 `~/.claude.json` 并从 rc 文件中移除 `claude` 别名。

## 许可证

MIT
