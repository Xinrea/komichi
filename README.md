# 四时小路Komichi

一个零依赖的纸片剧场风格个人主页原型。

已接入 Folia Light WASM 背景歌词和「深夜电台」播放器，静态部署即可使用。WASM 和字体在首次播放或主动开启歌词时加载，主题已嵌入 WASM。

## 本地预览

```bash
python3 scripts/serve.py
```

然后访问 `http://127.0.0.1:4173`（预览服务支持音频拖动所需的 HTTP Range）。

## 音乐与背景歌词

底部「深夜电台」提供歌曲列表、上一首/播放/下一首、进度、音量，以及列表循环、单曲循环、随机播放。点击「詞」切换全屏歌词；播放时介绍文字淡出，朱红色整句歌词居中呈现，背景歌词和装饰随句子随机排布。提供「朱砂排印 / 绯红霓虹 / 午夜电文」三套完整 Folia theme，分别使用 sweep、gradient、typewriter 文字模式，以及各自的排版、场景图层与 shader 后处理，每首歌在本次访问中随机分配并保持一种风格。列表展示翻唱、原唱，以及当前歌曲的作词、作曲和已确认的编曲信息。

第一首曲目为《大女優さん》（四时小路Komichi 演唱），MP3 提取自用户提供的视频，采用网易云音乐现成日文逐句歌词，来源见 [歌曲说明](assets/music/daijoyuu-san.source.md)。另外已加入《天国》（短版）和《CHO-DARI-》，均从用户提供的 Komichi 翻唱视频提取 MP3，并配有下载的日文逐句歌词，详见 [天国来源](assets/music/tengoku.source.md) 与 [CHO-DARI- 来源](assets/music/cho-dari.source.md)。页面不会自动播放。音量与静音状态保存在本机浏览器，点击音量图标可静音或恢复上次音量；播放栏与页面共享 CRT 扫描线。

添加歌曲只需把文件放入 `assets/music/` 并编辑 `assets/music/playlist.json`，详见 [加歌与歌词格式](assets/music/README.md)。无需重新编译 WASM。

Folia Light 的引擎源码、Web 适配、主题与构建均在独立的 `folia-light` 仓库维护。本仓库只使用 `assets/folia/` 内的 WASM、生成的 JS 加载器、字体和许可文件；更新与验证见 [WASM 产物说明](assets/folia/README.md)。

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
