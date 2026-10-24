# B 负责：语音交互组件

`VoiceConsole.tsx` 负责录音状态、中文转写、识别文本修正、提交与取消、错误提示和文字降级。
组件不持有任何游戏对象引用，只通过 `onSubmit(utterance, requestId)` 与集成层交换协议对象。

- 优先使用 Chrome / Edge 的 Web Speech API（`zh-CN`）。
- 麦克风被拒绝、浏览器不支持、没有声音分别提示，并保留文字输入。
- 目前接入第一关（`App.tsx` 的 bridge 控制台 → `runPhrase`）；第二、三关可复用同一组件。
