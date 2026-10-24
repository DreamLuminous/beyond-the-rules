# 规则之外（Beyond the Rules）

双人协作开发的 Web AI 规则创造游戏。比赛版范围：2 个基础关卡 + 1 个高级关卡。

## 首个可验证目标

打开网页后，玩家对石块说“让前面的石头慢慢浮起来”，AI 返回 `ActionPlan V1`，游戏通过统一执行器改变石块状态；玩家可跳上石块，并可撤销恢复。

## 当前进度

`feat/a-first-playable` 已完成 A 线首个可玩原型：

- Phaser 场景和沉浸式 HUD；
- A/D 移动、Space 跳跃与真实碰撞；
- 悬空之桥的三块动态石板、木箱、谷底平台和出口；
- 固定离线计划器，用于在 B 线接入前独立验证游戏；
- `ActionPlan` 整体预检、世界版本、规则能量、执行结果与撤销；
- 契约与规则引擎测试。

当前输入“让前面的石头慢慢浮起来”“让三块石板依次升起来”“把石板移动成台阶”或“向右推动木箱”即可测试不同命令。

## 项目结构

```text
apps/web             Phaser 游戏与 React UI
apps/api             AI、语音和解释服务
packages/contracts   双方唯一共享协议源
packages/rule-engine 安全预检与规则执行器
packages/level-data  关卡数据和能力声明
content              关卡、剧情与成就内容
tests                契约、模拟和端到端测试
docs                 分工、接口和联调说明
```

## 开发者职责

- 开发者 A：世界、物理、机关、城市模拟、执行器、关卡判定。
- 开发者 B：语音、模型 API、意图解析、计划生成、解释与降级。
- 共同维护：`packages/contracts`、示例数据、契约测试与端到端联调。

详细计划：

- [开发者 A 计划](docs/PLAN-A-GAME-WORLD.md)
- [开发者 B 计划](docs/PLAN-B-AI-INTERACTION.md)
- [统一接口与联调规范](docs/CONTRACT-AND-INTEGRATION.md)

## 分支策略

- `main`：随时可演示；
- `dev`：日常集成；
- `feat/a-*`：A 的短功能分支；
- `feat/b-*`：B 的短功能分支；
- 协议变更必须两人共同评审，先更新 Schema、示例和契约测试。

## 快速开始

```bash
corepack enable
pnpm install
pnpm dev
pnpm test
pnpm typecheck
```

Node.js 建议使用 20 LTS。密钥仅写入本地 `.env`，不得提交。

