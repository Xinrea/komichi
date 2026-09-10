# Folia Light 浏览器产物

本站仅消费外部 `folia-light` 仓库构建的引擎，不包含 C++ 源码、Web 适配源码或构建目录。

- `folia.js`：Emscripten 生成的 ES module 加载器。
- `folia.wasm`：渲染引擎，内嵌全部主题（`/folia/themes/index.json` 为目录清单：朱砂排印、绯红霓虹、午夜电文、心象漫游、倾斜诗笺、错落组曲）的 JSON 和 GLSL ES shader。
- `build-info.json`：构建所用的基础 Git revision、实际源码摘要、编译器版本和产物 SHA-256。源码摘要也覆盖未提交修改，不能仅凭基础 revision 重现产物。
- `cjk.otf`：浏览器按需加载的 Noto Serif CJK JP 字体。
- `FONT-LICENSE.txt` 及其他许可文件：运行时第三方资源许可。

## 更新引擎

所有引擎、主题和 shader 修改都在 `folia-light` 仓库完成。激活 Emscripten 4.0.14 后，在那个仓库运行：

```sh
bash scripts/build-web.sh
```

把生成的 `build/web/dist/folia.js`、`folia.wasm`、`build-info.json` 一起复制到本站本目录。不要复制 `src/`、`include/`、`web/` 或构建缓存。构建细节见引擎仓库的 `docs/web.md`。

本站 `music.js` 负责音频、播放控件、音量记忆及渲染调度。主题在 WASM 虚拟文件系统 `/folia/themes/` 内，通过 `folia_load` 加载；浏览器仅向对应目录提供共享的 CJK 字体。每首歌从五套动态主题（绯红霓虹 luminous、午夜电文 typewriter、心象漫游 mindscape、倾斜诗笺 tilt、错落组曲 partita）中随机选择，同一次访问中保持不变。歌词按显示单元均匀估算时序，逐字点亮；页面通过 `Intl.Segmenter` 把每行分词后经 `folia_set_phrases` 交给引擎，词组因此按真实词边界整体入场（不支持的浏览器退回引擎内置的脚本启发式分组）。`folia.js` 与 `folia.wasm` 会按 `build-info.json` 的 `sourceDigest` 成对带查询参数加载，避免 CDN 缓存把新旧产物拼在一起。修改本站曲库和歌词不需要重新构建引擎。

## 验证

启动本站 `python3 scripts/serve.py` 后，使用安装了 Playwright 的 Node 环境运行 `node scripts/verify-music.cjs`。检查包括全部嵌入主题（按 `index.json` 目录逐一渲染并截图）、WebGL 帧缓冲、CJK 字形、歌词跳转和间奏、播放模式、音量记忆、歌曲信息，以及本地导入和来源入口确实已移除。

字体来源：Noto Serif CJK JP 2.003（Adobe / Noto CJK），SIL Open Font License；原始字体 SHA-256 为 `d9854c7a8ef170b5a7932558856fd64eb8de0b007cd823fed6f9f514ad2803d3`。
