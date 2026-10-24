# corp-admin-miniapp

公司行政微信小程序：会议、日程、用车、来访、行政日常。

当前是可点击的界面原型，没有真实后端，也不需要微信开发者工具。

## 打开原型

用浏览器打开 [`prototype/index.html`](prototype/index.html)。

可以直接双击这个文件，或把它拖进 Chrome、Edge 或 Safari。桌面宽度下会看到手机外框；窗口窄时页面会铺满屏幕。

底部四个标签：

- **日程**：按天查看会议和用车。点 25 日可以看到没有安排的空状态。
- **会议**：新建会议后，会回到对应日期的日程里。
- **用车**：提交申请后进入「待派车」。在「我的」把身份换成「司机/车管」，即可派车并标记完成。也可以直接打开已有的「机场接客户」。
- **我的**：切换身份。来访接待和行政日常是未开放的骨架页。

新建的内容保存在这台浏览器里。想重来，打开「我的」里的「恢复演示数据」。

## 小程序（正式版）

用微信开发者工具打开：导入本仓库的**项目根目录**。`project.config.json` 里的 `miniprogramRoot` 指向 `miniprogram/`。

检查：

- `npm test`
- `npm run check`

语言在「我的 → 语言 / Language」切换。

演示身份切换和「恢复演示数据」也在「我的」。恢复演示数据会回到初始会议和用车，**语言保持不变**。

`prototype/` 只作参考，不是正式版。

## Mini-program (English)

Open it in WeChat DevTools by importing the **project root**. `project.config.json` points `miniprogramRoot` at `miniprogram/`.

Checks:

- `npm test`
- `npm run check`

Switch language under Me → 语言 / Language.

The demo role switch and “恢复演示数据” (reset demo data) are also on Me. Resetting restores the initial meetings and vehicle requests and **keeps the language**.

`prototype/` is reference only, not the production app.

设计见 [DESIGN.md](DESIGN.md)，协作约定见 [PROJECT_RULES.md](PROJECT_RULES.md)，进度见 [progress.md](progress.md)。
