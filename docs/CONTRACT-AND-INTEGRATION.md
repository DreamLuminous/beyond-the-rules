# 统一接口与联调规范

## 唯一真相源

所有协议只定义在 `packages/contracts/src/index.ts`。禁止在 A、B 各自目录复制接口。
运行时必须校验，TypeScript 类型不能替代安全验证。

## 六份共享协议

| 协议 | 产生方 | 使用方 | 说明 |
|---|---|---|---|
| `WorldSnapshot` | 游戏引擎 | AI / UI | 对象、能力、版本、约束、当前目标、预算 |
| `AgentPolicy` | AI 规划器 | 机器人执行器 | 高层目标与带依赖的行动步骤 |
| `AgentAction` | 规划器 / 本地控制器 | 世界引擎 | 单步行动：观察、导航、推动、激活、停止 |
| `LevelDraft` | AI 关卡设计器 / 玩家 | 关卡构建器与验证器 | 地图、物体、出生点、目标、成功条件 |
| `RuleScript` | AI / 玩家 | 规则解释器 | 白名单条件与命令，禁止任意 JS |
| `ExecutionResult` | 游戏引擎 | AI / UI | 真实成功/失败、步骤回执、撤销令牌 |

`LevelValidation` 属于结果族，由引擎产生、UI 与 AI 共同消费：

```ts
type LevelValidation = {
  ok: boolean;                 // 所有检查通过才可载入
  solvable: boolean;           // 枚举镜面/闸门后存在真实通关路径
  checks: { id, ok, detail }[];
  issues: { code, message }[];
  solution?: { mirrorOrientations, pathLength, gatesOpened };
  difficulty: { rating, pathLength, mechanics };
};
```

`LevelDraft.objects[].size` 使用 `{ width, height }`（V1 内由 `{x,y}` 修正，属破坏性变更，
已同步更新示例与测试；后续字段语义变更必须升版本）。

## 计划链路（第一关）

1. 游戏生成 `WorldSnapshot V1`，并增加唯一 `requestId`。
2. 交互层提交 `PlanRequest` 到 `POST /v1/plan`。
3. AI 返回 `ActionPlan` 或 `AgentPolicy`，服务端和浏览器各校验一次。
4. 执行器做整体预检：版本、目标、权限、预算、依赖和参数范围。
5. 预检全部通过后原子入队；否则零修改拒绝。
6. 游戏输出 `ExecutionResult` 并记录撤销令牌。
7. AI 只能根据执行结果解释，不可宣称未发生的世界变化。

## AI 服务端点（B 线，已实现）

| 端点 | 输入 | 输出 |
|---|---|---|
| `POST /v1/plan` | `PlanRequest` | `ActionPlan`，或 `{ code, userMessage, retryable }` |
| `POST /v1/validate-plan` | `ActionPlan` | `{ valid, plan }` 或校验问题 |
| `POST /v1/explain` | `ExecutionResult`（+ 历史提示） | `{ facts, hints, summary }` |
| `GET /health` | — | `{ ok, planner: "llm" \| "rule-based" }` |

- 配置 `MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME` 时走 OpenAI 兼容的结构化输出；15s 超时。
- 未配置、超时、上游错误或 Schema 修复失败时回退规则式规划器，游戏不冻结。
- 同一 `requestId` 幂等；`/v1/explain` 只读取执行结果，建议与事实分开。
- 前端通过 Vite 代理访问 `/v1`；语音组件提交时生成唯一 `requestId`。

## 关卡生成链路（第二关）

1. 玩家自然语言 -> `WorkshopRequirements`（难度、隐藏、提示、未支持能力）。
2. 设计器生成 `LevelDraft`，可带 seed 以复现。
3. 验证器在离散网格上检查：结构、出生点、出口、机关绑定、镜子可达顺序、闸门必要性、通关路径、隐藏区域。
4. `ok === false` 时禁止载入；UI 展示真实 `checks` 与 `issues`，AI 只能解释，不能改写结论。
5. 玩家试玩产生 `workshopComplete` 事件（用时、转动次数、隐藏记录），反馈驱动新版本并保留旧版本。

## 城市规则链路（第三关）

1. 玩家原话 -> `CityRequirements`（居民优先、生态下限、限工、备用泵、规则精简、未支持能力）。
2. AI 生成 `RuleScript`：规则按数组顺序求值，**第一条匹配的规则决定当日策略**；条件支持 `all` / `any`
   与数值/布尔比较，动作只允许白名单城市命令。
3. `RuleScriptSchema` 校验通过后才交给解释器；规则不能修改天气、来水或凭空增加水量。
4. 模拟器逐日执行 7 天，输出 `CityAssessment`（含每日 `CityDayReport`）。
5. 通关判定只读取模拟结果：居民均值、每日能源、生态下限、水库安全；AI 不得改写结论。
6. 反馈修订产生新 `RuleScript` 版本，旧版本的 `CityAssessment` 保留用于对比。

城市动作：

| 命令 | 作用 |
|---|---|
| `city.setPolicy` | 配水比例（总和 100）+ 工业上限 |
| `city.setIrrigation` | 灌溉开关与最低水库余量 |
| `city.setFacility` | 启停设施（如 `pump.spare`；未探索时无效） |

## 协议所有权

| 内容 | 主责 | 复核 |
|---|---|---|
| 物理/机关命令参数 | A | B |
| 城市政策参数 | A | B |
| 关卡几何与验证规则 | A | B |
| 快照裁剪和对象描述 | B | A |
| 错误码与用户消息 | B | A |
| 版本升级与兼容策略 | 共同 | 共同 |

## 变更流程

1. 提交协议变更说明：新增能力、使用关卡、参数边界、失败方式。
2. 先改 Schema 和正反例测试，不先改业务实现。
3. A 实现执行，B 实现生成；任一侧未完成时用 fixture 独立开发。
4. 破坏性变更提升协议版本；V1 已发布字段不改语义。

## 必测错误码

**计划与执行**

- `INVALID_REQUEST`：请求本身不符合协议；
- `TARGET_NOT_FOUND`：目标不存在；
- `TARGET_AMBIGUOUS`：目标指代不明确；
- `TARGET_IMMUTABLE`：核心对象不可修改；
- `COMMAND_NOT_ALLOWED`：关卡未开放该命令；
- `PARAMETER_OUT_OF_RANGE`：参数越界；
- `BUDGET_EXCEEDED`：资源不足；
- `STALE_WORLD`：计划基于旧世界版本；
- `INVALID_DEPENDENCY`：步骤依赖非法；
- `CONDITION_TIMEOUT`：条件在限制时间内未满足；
- `MODEL_TIMEOUT`：模型超时，可重试；
- `PLANNER_NOT_CONFIGURED`：开发环境未配置模型。

**关卡验证**

- `INVALID_LEVEL_DRAFT`：不符合 `LevelDraft`；
- `INVALID_SPAWN`：出生点不可站立；
- `MISSING_EXIT`：没有出口；
- `INCOMPLETE_MECHANISM`：缺少发射器、接收器、镜子、闸门或绑定；
- `MIRROR_UNREACHABLE`：镜子被尚未打开的闸门挡在后面；
- `MECHANISM_OPTIONAL`：不开机关也能通关；
- `NOT_SOLVABLE`：枚举所有朝向仍无通关路径；
- `STAGED_PATH_BLOCKED`：理论有解但玩家无法按顺序启动机关；
- `HIDDEN_UNREACHABLE`：隐藏区域不可达。

## 第一天集成检查点

- A：读取 fixture 计划，石块浮起且真实参与碰撞；撤销可恢复。
- B：读取 fixture 快照，把三种相同意图表达解析为同一类命令。
- 联调：语音/文字 -> 计划 -> 预检 -> 世界变化 -> 结果解释完整跑通。

## 合并门槛

- `pnpm typecheck`、`pnpm test`、`pnpm build` 全绿；
- 所有 AI 输出均经 Zod 校验；
- 不存在部分执行非法计划；
- 第二关未通过验证的草案不得载入；
- 第一关两条基准解法仍可通关；
- API 故障不会冻结游戏；
- 存档版本可读取或有明确迁移策略。
