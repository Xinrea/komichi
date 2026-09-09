const $ = (id) => document.getElementById(id);
const audio = $('music-audio');
const player = $('music-player');
const play = $('music-play');
const seek = $('music-seek');
const timeLabel = $('music-time');
const trackList = $('track-list');
const musicStatus = $('music-status');
const lyricStatus = $('lyric-status');
const lyricText = $('current-lyric');
const effects = $('music-effects');
const canvas = $('folia-canvas');
const atmosphere = canvas.parentElement;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const assetBase = new URL('./assets/folia/', import.meta.url);
const playlistURL = new URL('./assets/music/playlist.json', import.meta.url);
const fallbackCover = new URL('../character-cutout.png', playlistURL).href;
const themeIds = ['neon', 'midnight'];
const sceneNames = ['绯红霓虹', '午夜电文'];
const songScenes = new WeakMap();
let sceneBag = [];
function sceneFor(track) {
  if (!songScenes.has(track)) {
    if (!sceneBag.length) {
      sceneBag = [0, 1];
      for (let i = sceneBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sceneBag[i], sceneBag[j]] = [sceneBag[j], sceneBag[i]];
      }
    }
    songScenes.set(track, { style: sceneBag.pop(), seed: Math.floor(Math.random() * 0x7ffffffe) + 1 });
  }
  return songScenes.get(track);
}
const MAX_LYRIC_BYTES = 2 * 1024 * 1024;
const pageTitle = document.title;

function pinPageTitle() {
  Object.defineProperty(document, 'title', {
    configurable: true,
    enumerable: true,
    get: () => pageTitle,
    set() {},
  });
}

let engine;
let enginePromise;
let ready = false;
let effectsEnabled = true;
let selection = 0;
let abortLoad;
let currentIndex = -1;
let lyricRequested = -1;
let mode = 'list';
let shuffleBag = [];
let history = [];
let offset = 0;
let frameRequest = 0;
let lastFrame = 0;
let currentTitle = '';
let tracks = [];
let renderWidth = 1;
let renderHeight = 1;
let pendingSeek = null;

function videoURL(track) {
  const id = typeof track.bvid === 'string' ? track.bvid.trim() : '';
  return /^BV[0-9A-Za-z]+$/.test(id) ? `https://www.bilibili.com/video/${id}` : '';
}

function coverSrc(track) {
  return typeof track.cover === 'string' && track.cover.trim()
    ? new URL(track.cover, playlistURL).href
    : fallbackCover;
}

function updateArtwork(track) {
  const coverLink = $('track-cover-link');
  const coverImage = $('track-cover-image');
  const biliLink = $('track-bilibili');
  const href = videoURL(track);
  coverImage.src = coverSrc(track);
  if (href) {
    coverLink.href = href;
    coverLink.target = '_blank';
    coverLink.rel = 'noopener noreferrer';
    coverLink.setAttribute('aria-label', `在哔哩哔哩观看《${track.title || '当前歌曲'}》`);
    biliLink.href = href;
    biliLink.title = '哔哩哔哩';
    biliLink.hidden = false;
  } else {
    coverLink.removeAttribute('href');
    coverLink.removeAttribute('aria-label');
    coverLink.removeAttribute('target');
    coverLink.removeAttribute('rel');
    biliLink.removeAttribute('href');
    biliLink.removeAttribute('title');
    biliLink.hidden = true;
  }
}

function clock(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

const icons = {
  play: '<path d="M8 5 20 12 8 19Z" fill="currentColor" stroke="none"/>',
  volume: '<path d="M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 4 5 9H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  list: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  shuffle: '<path d="m17 3 4 4-4 4M3 17h3c5 0 7-10 12-10h3M3 7h3c2 0 3 1 4 3m4 4c1 2 2 3 4 3h3m-4-4 4 4-4 4"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
let wasPlaying;
function updateFocus() {
  const focus = ready && effectsEnabled && (audio.currentTime > 0 || !audio.paused);
  document.body.classList.toggle('music-focus', focus);
  document.querySelector('.scene-copy').inert = focus;
}
function updateTransport() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const max = String(duration || 1);
  if (seek.max !== max) seek.max = max;
  const currentTime = pendingSeek ?? (audio.currentTime || 0);
  seek.value = currentTime;
  seek.disabled = duration <= 0;
  seek.style.setProperty('--progress', `${duration ? currentTime / duration * 100 : 0}%`);
  seek.setAttribute('aria-valuetext', `${clock(currentTime)} / ${clock(duration)}`);
  timeLabel.value = `${clock(currentTime)} / ${clock(duration)}`;
  $('elapsed-time').textContent = clock(currentTime);
  $('duration-time').textContent = clock(duration);
  const playing = !audio.paused && !audio.ended;
  player.classList.toggle('is-playing', playing);
  if (wasPlaying !== playing) {
    play.innerHTML = svg(playing ? 'pause' : 'play');
    wasPlaying = playing;
  }
  play.setAttribute('aria-label', playing ? '暂停' : '播放');
  play.title = playing ? '暂停' : '播放';
  $('music-prev').disabled = $('music-next').disabled = !tracks.length;
  updateFocus();
}

function stopFrames() {
  cancelAnimationFrame(frameRequest);
  frameRequest = 0;
}

function hideLyrics() {
  ready = false;
  stopFrames();
  atmosphere.classList.remove('is-visible');
  lyricText.textContent = '';
  if (engine) engine._folia_clear();
  updateFocus();
}

function engineError() {
  return engine.ccall('folia_error', 'string', [], []);
}

function render() {
  if (!ready || !effectsEnabled || document.hidden) return;
  const ok = engine._folia_frame(Math.max(0, audio.currentTime + offset), renderWidth, renderHeight, Number(motion.matches));
  if (!ok) {
    lyricStatus.textContent = '歌词特效暂时不可用，音乐可以继续播放。';
    console.error('Folia render:', engineError());
    hideLyrics();
    return;
  }
  const status = JSON.parse(engine.ccall('folia_status', 'string', [], []));
  const text = [status.text, status.translation].filter(Boolean).join(' · ');
  if (lyricText.textContent !== text) lyricText.textContent = text;
  atmosphere.classList.toggle('is-visible', !!status.text);
}

function animate(now) {
  frameRequest = 0;
  if (now - lastFrame >= (motion.matches ? 100 : 1000 / 30)) {
    render();
    updateTransport();
    lastFrame = now;
  }
  if (ready && effectsEnabled && !audio.paused && !audio.ended && !document.hidden) {
    frameRequest = requestAnimationFrame(animate);
  }
}

function refresh() {
  stopFrames();
  updateTransport();
  render();
  if (ready && effectsEnabled && !audio.paused && !audio.ended && !document.hidden) {
    frameRequest = requestAnimationFrame(animate);
  }
}

function measure() {
  // Limit framebuffer and atlas work on high-DPI phones. Coordinates remain in CSS pixels.
  const rect = atmosphere.getBoundingClientRect();
  renderWidth = Math.max(1, Math.min(2560, Math.round(rect.width)));
  renderHeight = Math.max(1, Math.min(1600, Math.round(rect.height)));
  refresh();
}

async function fetchBytes(url, signal, limit = Infinity) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('歌词文件超过 2 MB');
  // Bound downloaded lyric data even when Content-Length is absent.
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('歌词文件超过 2 MB'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  return bytes;
}

function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const [{ default: createFolia }, font] = await Promise.all([
      import('./assets/folia/folia.js'),
      fetchBytes(new URL('cjk.otf', assetBase)),
    ]);
    pinPageTitle();
    const module = await createFolia({
      canvas,
      locateFile: (file) => new URL(file, assetBase).href,
      print: () => {},
      printErr: (message) => console.warn('Folia:', message),
    });
    module.FS.mkdirTree('/komichi');
    module.FS.writeFile('/komichi/cjk.otf', font);
    if (!module._folia_init(renderWidth, renderHeight)) {
      throw new Error(module.ccall('folia_error', 'string', [], []));
    }
    engine = module;
    return module;
  })().catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

function loadSongTheme(module, style) {
  // Theme JSON and shaders are compiled into the engine distribution in folia-light.
  const path = `/folia/themes/${themeIds[style]}`;
  if (!module.FS.analyzePath(`${path}/cjk.otf`).exists) {
    module.FS.writeFile(`${path}/cjk.otf`, module.FS.readFile('/komichi/cjk.otf'), { canOwn: true });
  }
  return path;
}

async function prepareLyrics(track, token, signal) {
  if (!track.lyrics) {
    lyricStatus.textContent = '这首歌暂无歌词。';
    return;
  }
  lyricStatus.textContent = '正在准备背景歌词，首次加载需要下载字体…';
  try {
    const filename = new URL(track.lyrics, playlistURL).pathname;
    const extension = /\.json$/i.test(filename) ? 'json' : 'lrc';
    const bytes = await fetchBytes(new URL(track.lyrics, playlistURL), signal, MAX_LYRIC_BYTES);
    if (token !== selection) return;
    const module = await loadEngine();
    if (token !== selection) return;
    const scene = sceneFor(track);
    const themePath = loadSongTheme(module, scene.style);
    if (token !== selection) return;
    const path = `/komichi/lyrics.${extension}`;
    module.FS.writeFile(path, bytes);
    const ok = module.ccall('folia_load', 'number', ['string', 'string'], [path, themePath]);
    module.FS.unlink(path);
    if (!ok) throw new Error(engineError());
    module._folia_set_seed(scene.seed);
    ready = true;
    lyricStatus.textContent = `背景歌词已就绪 · ${sceneNames[scene.style]}`;
    refresh();
  } catch (error) {
    if (token !== selection || error.name === 'AbortError') return;
    hideLyrics();
    lyricRequested = -1;
    lyricStatus.textContent = '歌词加载失败，请检查歌词文件或网络；音乐仍可播放。';
    console.error('Folia load:', error);
  }
}

function updateTrackList() {
  const focusedIndex = trackList.contains(document.activeElement) ? document.activeElement.dataset.index : null;
  trackList.replaceChildren();
  $('track-count').textContent = String(tracks.length).padStart(2, '0');
  tracks.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'track-item';
    const href = videoURL(track);
    const thumb = document.createElement(href ? 'a' : 'span');
    thumb.className = 'track-thumb';
    if (href) {
      thumb.href = href;
      thumb.target = '_blank';
      thumb.rel = 'noopener noreferrer';
      thumb.setAttribute('aria-label', `在哔哩哔哩观看《${track.title || '未命名歌曲'}》`);
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = coverSrc(track);
    img.loading = index < 12 ? 'eager' : 'lazy';
    img.decoding = 'async';
    thumb.append(img);
    const button = document.createElement('button');
    button.className = 'track-row';
    button.dataset.index = index;
    if (index === currentIndex) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
    const number = document.createElement('span');
    number.className = 'track-number'; number.textContent = String(index + 1).padStart(2, '0');
    const info = document.createElement('span');
    info.className = 'track-row-info';
    const title = document.createElement('strong'); title.textContent = track.title || '未命名歌曲';
    const artist = document.createElement('small'); artist.textContent = [`翻唱 ${track.artist || 'Komichi'}`, track.originalArtist && `原唱 ${track.originalArtist}`].filter(Boolean).join(' · ');
    info.append(title, artist);
    const indicator = document.createElement('span'); indicator.className = 'track-indicator';
    indicator.textContent = index === currentIndex ? '♫' : '';
    indicator.setAttribute('aria-hidden', 'true');
    button.append(number, info, indicator);
    button.addEventListener('click', () => selectTrack(index, true));
    li.append(thumb, button);
    if (href) {
      const bili = document.createElement('a');
      bili.className = 'track-row-bili';
      bili.href = href;
      bili.target = '_blank';
      bili.rel = 'noopener noreferrer';
      bili.title = '哔哩哔哩';
      bili.setAttribute('aria-label', `在哔哩哔哩打开《${track.title || '未命名歌曲'}》`);
      bili.append($('track-bilibili').querySelector('svg').cloneNode(true));
      li.append(bili);
    }
    trackList.append(li);
  });
  if (focusedIndex != null) trackList.querySelector(`[data-index="${Number(focusedIndex)}"]`)?.focus({ preventScroll: true });
}

function updateCredits(track) {
  const groups = [
    [['翻唱', track.artist], ['原唱', track.originalArtist]],
    [['作词', track.lyricist], ['作曲', track.composer], ['编曲', track.arranger]],
  ].map((group) => group.filter(([, value]) => typeof value === 'string' && value.trim()));
  $('credits-title').textContent = `${track.title || '当前歌曲'} · 歌曲信息`;
  $('credits-list').replaceChildren();
  for (const group of groups) {
    if (!group.length) continue;
    const line = document.createElement('div');
    line.className = 'credit-line';
    for (const [label, value] of group) {
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = value;
      line.append(term, description);
    }
    $('credits-list').append(line);
  }
  $('track-credits').hidden = groups.every((group) => group.length === 0);
}

function ensureLyrics() {
  if (currentIndex < 0 || lyricRequested === selection || !effectsEnabled) return;
  lyricRequested = selection;
  void prepareLyrics(tracks[currentIndex], selection, abortLoad.signal);
}

async function startPlayback() {
  const token = selection;
  ensureLyrics();
  if (audio.ended) audio.currentTime = 0;
  try { await audio.play(); }
  catch (error) {
    if (token !== selection || error.name === 'AbortError') return;
    musicStatus.textContent = '暂时无法播放，请点击播放重试。';
    console.warn('Audio playback:', error);
  }
}

function selectTrack(index, autoplay = false, recordHistory = true) {
  const track = tracks[index];
  if (!track) return;
  if (recordHistory && currentIndex >= 0 && currentIndex !== index) history.push(currentIndex);
  if (history.length > 1000) history.shift();
  currentIndex = index;
  const scene = sceneFor(track);
  atmosphere.dataset.scene = sceneNames[scene.style];
  atmosphere.dataset.themeId = `komichi.${themeIds[scene.style]}`;
  atmosphere.dataset.sceneSeed = String(scene.seed);
  shuffleBag = shuffleBag.filter((item) => item !== index);
  ++selection;
  abortLoad?.abort();
  abortLoad = new AbortController();
  pendingSeek = null;
  audio.pause();
  hideLyrics();
  offset = Number.isFinite(track.offset) ? track.offset : 0;
  currentTitle = track.title || '未命名歌曲';
  musicStatus.textContent = '';
  lyricStatus.textContent = track.lyrics ? '开始播放后显示全屏歌词' : '这首歌尚未添加歌词';
  $('track-title').textContent = currentTitle;
  $('track-artist').textContent = `翻唱 ${track.artist || 'Komichi'}`;
  updateArtwork(track);
  updateCredits(track);
  audio.src = new URL(track.audio, playlistURL).href;
  audio.load();
  play.disabled = false;
  updateTransport();
  updateTrackList();
  if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
    const artwork = typeof track.cover === 'string' && track.cover.trim()
      ? [{ src: coverSrc(track), sizes: '960x540', type: 'image/jpeg' }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({ title: currentTitle, artist: track.artist || 'Komichi', album: '深夜电台', artwork });
  }
  if (autoplay) void startPlayback();
}

function randomNext() {
  if (tracks.length <= 1) return currentIndex;
  if (!shuffleBag.length) {
    shuffleBag = tracks.map((_, i) => i).filter((i) => i !== currentIndex);
    for (let i = shuffleBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
    }
  }
  return shuffleBag.pop();
}
function nextTrack(ended = false) {
  if (!tracks.length) return;
  if (ended && mode === 'single') { audio.currentTime = 0; void startPlayback(); return; }
  selectTrack(mode === 'shuffle' ? randomNext() : (currentIndex + 1) % tracks.length, true);
}
function previousTrack() {
  if (!tracks.length) return;
  if (mode === 'shuffle' && history.length) selectTrack(history.pop(), true, false);
  else selectTrack((currentIndex - 1 + tracks.length) % tracks.length, true);
}

play.addEventListener('click', () => {
  if (!audio.paused) audio.pause();
  else void startPlayback();
});
$('music-next').addEventListener('click', () => nextTrack());
$('music-prev').addEventListener('click', previousTrack);
$('music-mode').addEventListener('click', () => {
  const modes = ['list', 'single', 'shuffle'];
  mode = modes[(modes.indexOf(mode) + 1) % modes.length];
  shuffleBag = [];
  const label = { list: '列表循环', single: '单曲循环', shuffle: '随机播放' }[mode];
  const button = $('music-mode');
  button.innerHTML = svg(mode === 'shuffle' ? 'shuffle' : 'list') + (mode === 'single' ? '<span class="mode-one">1</span>' : '');
  button.setAttribute('aria-label', label); button.title = label;
  button.dataset.mode = mode;
});
function toggleList(open) {
  $('playlist-panel').hidden = !open;
  $('music-list').setAttribute('aria-expanded', String(open));
}
$('music-list').addEventListener('click', () => toggleList($('playlist-panel').hidden));
$('playlist-close').addEventListener('click', () => { toggleList(false); $('music-list').focus(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('playlist-panel').hidden) { toggleList(false); $('music-list').focus(); }
});
document.addEventListener('pointerdown', (event) => {
  if (!player.contains(event.target)) toggleList(false);
});
seek.addEventListener('input', () => {
  if (Number.isFinite(audio.duration)) {
    pendingSeek = Math.max(0, Math.min(audio.duration, Number(seek.value)));
    audio.currentTime = pendingSeek;
  }
  ensureLyrics();
  // Chrome may dispatch timeupdate before the asynchronous seek settles.
  // Keep the thumb at the user's target until the media element emits seeked.
  updateTransport();
});
const volume = $('music-volume');
const mute = $('music-mute');
const volumeKey = 'komichi.radio.volume';
let lastAudibleVolume = .65;
audio.volume = .65;
try {
  const saved = JSON.parse(localStorage.getItem(volumeKey));
  if (saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1) {
    audio.volume = saved.volume;
    audio.muted = saved.muted === true;
    if (typeof saved.lastAudibleVolume === 'number' && saved.lastAudibleVolume > 0 && saved.lastAudibleVolume <= 1) lastAudibleVolume = saved.lastAudibleVolume;
  }
} catch { /* Storage can be unavailable or contain malformed data. */ }
function syncVolume() {
  if (audio.volume > 0) lastAudibleVolume = audio.volume;
  const silent = audio.muted || audio.volume === 0;
  volume.value = silent ? 0 : audio.volume;
  volume.style.setProperty('--progress', `${Number(volume.value) * 100}%`);
  mute.innerHTML = svg(silent ? 'muted' : 'volume');
  mute.setAttribute('aria-pressed', String(silent));
  mute.setAttribute('aria-label', silent ? '取消静音' : '静音');
  mute.title = silent ? '取消静音' : '静音';
  try { localStorage.setItem(volumeKey, JSON.stringify({ volume: audio.volume, muted: audio.muted, lastAudibleVolume })); }
  catch { /* Playback still works when storage is blocked. */ }
}
volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
  audio.muted = false;
  syncVolume();
});
mute.addEventListener('click', () => {
  if (audio.muted || audio.volume === 0) {
    if (audio.volume === 0) audio.volume = lastAudibleVolume;
    audio.muted = false;
  } else audio.muted = true;
  syncVolume();
});
audio.addEventListener('volumechange', syncVolume);
syncVolume();
effects.addEventListener('click', () => {
  effectsEnabled = !effectsEnabled;
  effects.setAttribute('aria-pressed', String(effectsEnabled));
  if (!effectsEnabled) atmosphere.classList.remove('is-visible');
  else ensureLyrics();
  refresh();
});

for (const event of ['play', 'pause', 'seeking', 'ended', 'ratechange', 'loadeddata']) audio.addEventListener(event, refresh);
audio.addEventListener('seeked', () => {
  pendingSeek = null;
  refresh();
});
audio.addEventListener('timeupdate', updateTransport);
audio.addEventListener('loadedmetadata', () => { if (audio.getAttribute('src')) updateTransport(); });
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  musicStatus.textContent = '音频加载失败，请检查文件地址或更换音频格式。';
  play.disabled = true;
  hideLyrics();
});
audio.addEventListener('ended', () => nextTrack(true));
audio.addEventListener('playing', () => { musicStatus.textContent = ''; });
audio.addEventListener('waiting', () => { if (!audio.paused) musicStatus.textContent = '正在缓冲…'; });

if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({
    play: startPlayback, pause: () => audio.pause(), nexttrack: () => nextTrack(), previoustrack: previousTrack,
    seekto: ({ seekTime }) => { if (Number.isFinite(seekTime) && Number.isFinite(audio.duration)) { audio.currentTime = Math.max(0, Math.min(audio.duration, seekTime)); ensureLyrics(); refresh(); } },
  })) { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported OS media action. */ } }
}
document.addEventListener('visibilitychange', refresh);
motion.addEventListener('change', refresh);
new ResizeObserver(measure).observe(atmosphere);
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); ready = false; stopFrames();
  atmosphere.classList.remove('is-visible'); updateFocus();
  lyricStatus.textContent = '图形上下文已中断，刷新页面可恢复歌词；音乐仍可播放。';
});
addEventListener('pagehide', stopFrames);
addEventListener('pageshow', refresh);

async function loadPlaylist() {
  try {
    const response = await fetch(playlistURL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.tracks)) throw new Error('playlist.tracks must be an array');
    const incoming = data.tracks.filter((track) => track && typeof track.audio === 'string' && track.audio.trim());
    tracks.push(...incoming);
    updateTrackList();
    if (currentIndex < 0 && tracks.length) selectTrack(0);
    else if (!tracks.length) $('track-title').textContent = '暂无歌曲';
  } catch (error) {
    musicStatus.textContent = '歌曲清单暂时不可用，请稍后刷新重试。';
    console.warn('Playlist:', error);
  }
}
measure();
void loadPlaylist();
