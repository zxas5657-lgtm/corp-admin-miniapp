# progress

- [x] 一页计划（课程路径）
- [ ] 项目文件夹与私有仓库
- [x] 可点原型 + DESIGN.md
- [x] 评审（CLAUDE_REVIEW.md）与计划（PLAN.md）
- [ ] 版本库：git init + 基线提交（等待安装 git 的批准）
- [ ] i18n 骨架（zh/en 文案文件 + 语言切换）
- [ ] 会议 + 日程 MVP
- [ ] 用车闭环

平台已定：原生微信小程序，纯 JS，逻辑放在与平台无关的 `miniprogram/domain/`，用 Node 跑单元测试。

MVP 范围：会议流程 + 由多个来源（会议、用车）合成的日程。用车在本阶段只读演示数据，`scheduleItems` 接收 `sources`，用车闭环阶段不需要重写。

下一步：按 `PLAN.md` 的 Sprint 1 顺序做（先 i18n、domain、store，再页面）。仍用本地演示数据，不做后端、云函数和微信登录。

原型：用浏览器打开 `prototype/index.html`。设计见 `DESIGN.md`，规则见 `PROJECT_RULES.md`。
