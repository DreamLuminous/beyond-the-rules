# 统一接口与联调规范

## 唯一真相源

所有协议只定义在 `packages/contracts/src/index.ts`。禁止在 A、B 各自目录复制接口。运行时必须校验，TypeScript 类型不能替代安全验证。

## 请求链路

1. 游戏生成 `WorldSnapshot V1`，并增加唯一 `requestId`。
2. 交互层提交 `PlanRequest` 到 `POST /v1/plan`。
3. AI 返回 `ActionPlan V1`，服务端和浏览器各校验一次。
4. 执行器做整体预检：版本、目标、权限、预算、依赖和参数范围。
5. 预检全部通过后原子入队；否则零修改拒绝。
6. 游戏输出 `ExecutionResult V1` 并记录撤销令牌。
7. AI 只能根据执行结果解释，不可宣称未发生的世界变化。

## 协议所有权

| 内容 | 主责 | 复核 |
|---|---|---|
| 物理/机关命令参数 | A | B |
| 城市政策参数 | A | B |
| 快照裁剪和对象描述 | B | A |
| 错误码与用户消息 | B | A |
| 版本升级与兼容策略 | 共同 | 共同 |

## 变更流程

1. 提交协议变更说明：新增能力、使用关卡、参数边界、失败方式。
2. 先改 Schema 和正反例测试，不先改业务实现。
3. A 实现执行，B 实现生成；任一侧未完成时用 fixture 独立开发。
4. 破坏性变更提升协议版本；V1 已发布字段不改语义。

## 必测错误码

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

## 第一天集成检查点

- A：读取 fixture 计划，石块浮起且真实参与碰撞；撤销可恢复。
- B：读取 fixture 快照，把三种相同意图表达解析为同一类命令。
- 联调：语音/文字 -> 计划 -> 预检 -> 世界变化 -> 结果解释完整跑通。

## 合并门槛

- 类型检查与契约测试通过；
- 所有 AI 输出均经 Zod 校验；
- 不存在部分执行非法计划；
- 关卡两条基准解法仍可通关；
- API 故障不会冻结游戏；
- 存档版本可读取或有明确迁移策略。

