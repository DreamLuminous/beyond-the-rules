# 共同负责：集成层

固定链路：`WorldSnapshot -> /v1/plan -> ActionPlan -> preflight -> execute -> ExecutionResult -> /v1/explain`。

任何一步失败都必须恢复 UI 可操作状态，并显示可理解的原因。

