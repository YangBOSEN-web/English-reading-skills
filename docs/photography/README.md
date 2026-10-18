# 张昊天的相册

一个日常风格的个人摄影网站，纯 HTML/CSS/JS，不需要构建。

- 网站上线后的地址：`https://<GitHub 用户名>.github.io/<仓库名>/photography/`（需要在仓库 Settings → Pages 里开启）
- 本地预览：`cd docs && python3 -m http.server`，然后打开 http://localhost:8000/photography/

## 怎么加照片

照片放在 `photos/`，列表在 `photos.json`。网站会自动读取列表，不用改代码。

**用脚本（推荐）**：它会把照片缩到适合网页的大小（长边 1800px），并去掉照片里的拍摄信息（包括 GPS 位置）。

```bash
cd docs/photography
pip install pillow   # 第一次需要
python3 add_photos.py ~/Downloads/新照片/*.jpg --group 林间白衣 --place 长沙 --date 2026-10-12
```

也可以把信息写在文件名里，格式是 `日期_组名_地点_标题.jpg`，后面的部分可以省略：

```
2026-10-12_林间白衣_长沙_回头.jpg
花田傍晚_长沙_奔跑.jpg
```

- **组名**会变成相册上方的筛选按钮（只有一组时不显示按钮）。
- **日期**会显示成右下角橙色的胶片日期戳；不写就不显示。
- 删除照片：`python3 add_photos.py --remove 003.jpg`
- 加完以后提交并推送，一两分钟后网站就会更新。

**不用脚本**：也可以在 GitHub 网页上把照片上传到 `photos/`，再在 `photos.json` 里照着已有的格式加一条。照片最好先压缩到 1–2 MB 以内，否则国内打开会慢。

## 其他要改的地方（都在 `index.html`）

- 名字「张昊天」：页面标题、左上角、开头的打招呼、页脚
- 自我介绍：「关于我」那一段
- 关于我的照片：`<img src="photos/001.jpg">` 换成自己的照片
- 联系方式：把「待填写」换成真实的微信号、小红书号；不想公开的那一行整行删掉
- 颜色：`style.css` 顶部的 `:root`
