# 摄影师作品集网站

纯 HTML/CSS/JS，无需构建。本地预览：`cd docs && python3 -m http.server`，打开 http://localhost:8000/photography/

GitHub Pages 开启后地址为 `https://<用户名>.github.io/<仓库名>/photography/`。

## 换成自己的内容
- **照片**：把图片放进 `photos/` 文件夹，在 `app.js` 顶部的 `PHOTOS` 列表里改 `src`、`title`、`cat`（分类按钮会自动生成）。
- **首页大图 / 个人照**：`index.html` 里搜索 `picsum.photos` 替换。
- **名字、简介、价格、社交链接**：直接改 `index.html` 中的文字。
- **联系邮箱**：`app.js` 里的 `CONTACT_EMAIL`，以及 `index.html` 底部的 `hello@example.com`。
- **配色**：`style.css` 顶部的 `:root` 变量（`--accent` 是金色强调色），已自动适配深色模式。
