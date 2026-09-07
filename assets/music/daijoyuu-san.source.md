# 大女優さん — 四时小路Komichi

- 音频来源：用户提供的 `41668184364-1-192.mp4`，原视频约 212.045 秒。
- MP3：保留完整音轨，以 FFmpeg `libmp3lame -q:a 2` 提取，44.1 kHz、双声道，约 5.4 MB；未剪辑或改变速度。MP3 容器时长约 212.088 秒（编码帧边界造成的差异）。
- 演唱：四时小路Komichi；原作：いよわ，原作主唱：花隈千冬。
- 歌词：直接采用网易云音乐条目 **2036133286** 的现成日文 LRC，获取于 2026-09-07。`daijoyuu-san.lrc` 保存返回的原始歌词文本，不采用先前视频转录稿。
- 来源：[网易云音乐原作条目](https://music.163.com/#/song?id=2036133286)，[歌词接口](https://music.163.com/api/song/lyric?id=2036133286&lv=-1&kv=-1&tv=-1)。原作条目时长 212.280 秒，与提供视频同为约 3 分 32 秒。
- `daijoyuu-san.json` 由 `scripts/prepare-song.py` 从 LRC 生成。保留歌词文本和行时间，排除开头的作词/作曲/编曲信息；根据提供视频为间奏及结尾设置 69.0、125.0、189.5 秒结束时间，避免字幕一直停留。
- 按用户选择采用**日文原文、逐句同步**。网络 LRC 没有精确逐字时间，句内字形发光进度由 Folia 估算；没有音素级精校。
- 音频仍然来自用户提供的视频，没有下载或替换任何网络音源。

重新提取音频（在项目根目录执行，输出文件已存在时不会覆盖）：

```bash
ffmpeg -i /path/to/41668184364-1-192.mp4 -map 0:a:0 -vn \
  -codec:a libmp3lame -q:a 2 -id3v2_version 3 \
  -metadata title=大女優さん -metadata artist=四时小路Komichi \
  -n assets/music/daijoyuu-san.mp3
```
