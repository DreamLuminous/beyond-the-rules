# 规则之外（Beyond the Rules）

双人协作开发的 Web AI 共创冒险：玩家制定任务和规则，AI 伙伴观察世界、自主规划并执行行动。比赛版范围为 2 个基础关卡 + 1 个高级关卡。

## 首个可验证目标

打开网页后，玩家对墨点说“先走到箱子旁边，观察周围的机关”，本地计划器返回 `AgentPolicy V1`，墨点先观察目标，再自主移动到可交互距离。玩家也能输入环境规则，继续通过 `ActionPlan V1` 改变石板、木箱和风场。

## 当前进度

`feat/a-agent-controlled-bridge` 已完成 A 线第一关 V3.1 闭环：

- Phaser 场景和沉浸式 HUD；
- 墨点的观察、导航、推动、激活、停止与暂停能力；
- 1800×720 横向世界，包含起点、断桥、风场机关区、终点装置和隐藏空间；
- 固定离线计划器，用于在 B 线接入前独立验证游戏；
- `AgentPolicy` 与 `ActionPlan` 双执行入口、世界版本、规则能量、执行结果与撤销；
- 契约与规则引擎测试。

当前输入“墨点，先走到箱子旁边，观察周围的机关”即可验证首个 AI 行动闭环。也可输入“让前面的石头慢慢浮起来”“把石板移动成台阶”或“让风把木箱吹到压力机关上”测试世界规则；木箱压住压力机关后会启动辅助升降平台。

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

