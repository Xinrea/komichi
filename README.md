# 四时小路Komichi

一个零依赖的纸片剧场风格个人主页原型。

## 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173`。

## SEO 配置

正式站点地址为 `https://komichi.cn/`。Canonical、社交分享信息、结构化数据、robots 和 sitemap 均已使用此域名。

社交分享图与应用图标可通过以下命令重新生成：

```bash
python3 scripts/generate_seo_assets.py
```

## 替换内容

- 人物图片：修改 `index.html` 中 `.performer img` 的 `src`。
- 个人文案与项目：修改 `index.html` 中对应的 `.story-card`。
- 角色路线：修改 `script.js` 中的 `scenes` 数组。
- 主色与舞台颜色：修改 `styles.css` 开头的 CSS 变量。

## 素材来源

- 舞台幕布改编自 Openclipart 的 [se abre el telon](https://openclipart.org/detail/94951/se-abre-el-telon)，作者 rastrojo，CC0 公共领域。
- 角色立绘由用户提供，原图标注 `©VirtuaReal`；页面中保留了对应署名标签。
