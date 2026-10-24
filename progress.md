# progress

- [x] 一页计划（课程路径）
- [ ] 项目文件夹与私有仓库
- [x] 可点原型 + DESIGN.md
- [x] 评审（CLAUDE_REVIEW.md）与计划（PLAN.md）
- [x] 版本库：git init + 基线提交
- [x] i18n 骨架（zh/en 文案文件 + 语言切换）
- [ ] 会议 + 日程 MVP（代码完成，待开发者工具验证）
- [ ] 用车闭环（代码完成，待开发者工具验证）

平台已定：原生微信小程序，纯 JS，逻辑放在与平台无关的 `miniprogram/domain/`，用 Node 跑单元测试。

MVP 范围：会议流程 + 由多个来源（会议、用车）合成的日程。用车闭环已经接上同一套日程，仍用本地演示数据。

下一步：S1-F7，在微信开发者工具里用两种语言截图走查（需要扫码登录），再改走查里发现的问题。

原型：用浏览器打开 `prototype/index.html`。设计见 `DESIGN.md`，规则见 `PROJECT_RULES.md`。
