# 曲库维护

播放器仅播放本站 `playlist.json` 中配置的歌曲，不提供浏览器本地音频或歌词导入入口。
维护者添加歌曲时，把音频和歌词放在本目录，再更新清单，无需编译 WASM。

```json
{
  "tracks": [{
    "title": "歌曲名称",
    "artist": "四时小路Komichi",
    "originalArtist": "原唱",
    "lyricist": "作词",
    "composer": "作曲",
    "arranger": "编曲（已确认时填写）",
    "audio": "my-song.mp3",
    "lyrics": "my-song.json",
    "offset": 0
  }]
}
```

`artist` 是本站播放版本的演唱者，`originalArtist` 是原唱。播放列表显示翻唱和原唱，当前歌曲信息区显示已提供的词曲、编曲信息；未知字段省略。页面不展示歌词来源，来源记录保留在维护用的 `.source.md` 中。

路径相对 `playlist.json`。`audio` 必填，`lyrics` 可省略；缺少歌词不影响音频播放。`offset` 单位为秒，正数让歌词提前，负数延后；《CHO-DARI-》按用户试听反馈设为 `1`。

页面不会自动播放。列表循环、单曲循环和随机播放均支持手动切歌；音量和静音状态保存在浏览器本机。

## 歌词

支持逐句 LRC 和 Folia JSON v1。原版 LRC 解析器忽略带时间戳的空白行，因此本站使用 JSON 的明确 `end` 保留间奏留白：

```json
{
  "apiVersion": 1,
  "title": "歌曲名称",
  "lines": [{
    "start": 1,
    "end": 4,
    "text": "夜の交差点",
    "translation": "夜晚的十字路口"
  }]
}
```

完整字段见 `lyrics-v1.schema.json`。`example.lrc` 为引擎验证用样例，不会出现在播放列表。

三首歌曲的原始网络歌词保存在 `.lrc`，实际播放的 `.json` 由 `python3 scripts/prepare-song.py` 生成。脚本保留原始逐句时间和文本，剔除作者信息并处理间奏/结尾；它仅转换已下载的本地资源，不访问网络。各首 `.source.md` 记录版本选择及时间处理依据。
