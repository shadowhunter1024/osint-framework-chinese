# OSINT Framework 中文汉化约定

本仓库（`shadowhunter1024/osint-framework-chinese`）是 [lockfale/osint-framework](https://github.com/lockfale/osint-framework) 的长期维护中文版，只有 `main` 一个分支（默认分支）。同步官方更新时直接合并 `upstream/master`，不要把 `master` 推送到本仓库。推送 `main` 会自动部署 GitHub Pages 在线版。详见 `I18N.md`。

## 核心约定

1. **不修改 `public/arf.json`。** 工具名称、URL、`status` / `pricing` / `opsec` 等取值保持英文；工具名称同时是评分接口的工具 ID。
2. **只改显示层。** 分类名和工具说明字段（`description`、`bestFor`、`input`、`output`、`opsecNote`）在运行时由 `public/i18n/i18n.js` 替换；界面文字通过 `MutationObserver` 与 `ui.json` 替换。不要让程序逻辑依赖翻译后的文字。
3. **译文放在独立目录。** `public/i18n/zh-CN/`：`ui.json`、`categories.json`、`tools.json`（以英文原文为键）。词典缺失时必须回退英文。不要把中文写进官方源文件。
4. **尽量少改官方文件。** 只允许 `public/index.html` 加载脚本的 1 行和 `public/js/arf.js` 搜索的几行，并用 `i18n` 注释标出。新的界面文字优先放进 `ui.json`。
5. **安全。** 用 `Map` / `Object.create(null)` 存词典，DOM 中用 `textContent` / `createTextNode`，不要用 `innerHTML` 插入译文。

## 工作流程

- 修改后运行 `node --test tests/i18n.test.mjs` 和 `node scripts/i18n-check.mjs`。
- 合并官方更新后用 `node scripts/i18n-check.mjs --template todo.json` 生成待翻译模板，翻译新增条目并删除过期条目。
- 本地预览：`cd public && python3 -m http.server 8000`。
