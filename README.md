# Komichi Paper Theater

一个零依赖的纸片剧场风格个人主页原型。

## 本地预览

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 替换内容

- 人物图片：修改 `index.html` 中 `.performer img` 的 `src`。
- 个人文案与项目：修改 `index.html` 中对应的 `.story-card`。
- 角色路线：修改 `script.js` 中的 `scenes` 数组。
- 主色与舞台颜色：修改 `styles.css` 开头的 CSS 变量。
