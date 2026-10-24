# GitHub 初始化与协作设置

建议仓库名：`beyond-the-rules`，比赛阶段设为 Private。

```bash
git init
git add .
git commit -m "chore: initialize Beyond the Rules web MVP"
git branch -M main
git remote add origin https://github.com/<OWNER>/beyond-the-rules.git
git push -u origin main
git switch -c dev
git push -u origin dev
```

随后在 GitHub 中：

1. 邀请另一位成员为 Collaborator；
2. 将 `main` 设为保护分支，要求 Pull Request 和通过测试；
3. 默认分支保持 `main`，日常功能 PR 合并至 `dev`；
4. 演示稳定后由 `dev` 向 `main` 发起发布 PR；
5. 不上传 `.env`、API Key、录音样本中的个人敏感内容。

