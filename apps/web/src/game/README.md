# A 负责：游戏世界

建议目录：`scenes/`、`entities/`、`puzzles/`、`city/`、`systems/`。

游戏层只接收已通过验证的 `ActionPlan`，不得解析自然语言，也不得直接信任模型输出。

当前已实现 `FloatingBridgeScene` 第一版：移动、跳跃、动态石板、固定计划执行、整体预检、状态快照与撤销。

