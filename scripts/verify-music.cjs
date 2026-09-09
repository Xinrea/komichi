// Run against `python3 scripts/serve.py`; requires Playwright and Chrome.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4173';
const output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
function silentWav(seconds = 15) {
  const size = 22050 * seconds * 2;
  const wav = Buffer.alloc(44 + size);
  wav.write('RIFF'); wav.writeUInt32LE(36 + size, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(size, 40);
  return wav;
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    // Verify real media range responses, including HEAD and unsatisfiable requests.
    const media = fs.readFileSync(path.join(root, 'assets/music/daijoyuu-san.mp3'));
    for (const [range, start, end] of [['bytes=0-99', 0, 99], ['bytes=100-', 100, media.length-1], ['bytes=-32',media.length-32,media.length-1]]) {
      const response = await page.request.get(`${origin}/assets/music/daijoyuu-san.mp3`, { headers: { Range: range } });
      assert.equal(response.status(), 206);
      assert.equal(response.headers()['content-range'], `bytes ${start}-${end}/${media.length}`);
      assert.deepEqual(await response.body(), media.subarray(start, end+1));
    }
    assert.equal((await page.request.get(`${origin}/assets/music/daijoyuu-san.mp3`, { headers: { Range: 'bytes=999999999-' } })).status(),416);
    const head = await page.request.head(`${origin}/assets/music/daijoyuu-san.mp3`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(head.status(),206); assert.equal(head.headers()['content-length'],'100');
    // Keep the single-track end/repeat scenarios isolated from the growing library.
    const library = JSON.parse(fs.readFileSync(path.join(root, 'assets/music/playlist.json'), 'utf8'));
    await page.route('**/assets/music/playlist.json', route => route.fulfill({json:{tracks:[library.tracks[0]]}}));
    await page.goto(origin);
    await page.waitForFunction(()=>!document.querySelector('#music-play').disabled);
    const pageTitle = await page.title();
    assert.equal(pageTitle, '四时小路Komichi｜都市传说系虚拟主播个人主页');
    assert.equal(await page.locator('input[type="file"], #lyric-source, .radio-imports').count(), 0);
    await page.locator('#music-list').click();
    assert((await page.locator('#credits-list').innerText()).includes('花隈千冬'));
    assert((await page.locator('#credits-list').innerText()).includes('いよわ'));
    await page.locator('#music-list').click();
    await page.waitForFunction(() => !document.querySelector('#music-play').disabled);
    assert(!requests.some((url) => /folia\.(js|wasm)|cjk\.otf/.test(url)), 'Engine must be lazy');
    assert(await page.locator('#music-audio').evaluate(el=>el.paused), 'No autoplay');
    assert(await page.evaluate(() => {
      const overlay = getComputedStyle(document.querySelector('.crt-overlay'));
      return Number(overlay.zIndex) > Number(getComputedStyle(document.querySelector('#music-player')).zIndex) && overlay.pointerEvents === 'none';
    }), 'CRT must cover the player without intercepting controls');
    const setVolume = async value => page.locator('#music-volume').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input')); }, value);
    await setVolume(.23);
    await page.locator('#music-mute').click();
    assert(await page.locator('#music-audio').evaluate(el => el.muted && el.volume === .23));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#music-play').disabled);
    assert(await page.locator('#music-audio').evaluate(el => el.muted && el.volume === .23), 'Volume and mute persist across reload');
    assert.equal(await page.locator('#music-mute').getAttribute('aria-pressed'), 'true');
    await page.locator('#music-mute').click();
    assert(await page.locator('#music-audio').evaluate(el => !el.muted && el.volume === .23));
    await setVolume(0);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#music-play').disabled);
    await page.locator('#music-mute').click();
    assert(await page.locator('#music-audio').evaluate(el => !el.muted && el.volume === .23), 'Zero-volume unmute restores last audible level');
    await page.locator('#music-mute').click();
    await setVolume(.31);
    assert(await page.locator('#music-audio').evaluate(el => !el.muted && el.volume === .31), 'Dragging volume exits mute');
    const initialScene = await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset }));
    await page.locator('#music-play').click();
    await page.waitForFunction(() => document.querySelector('#lyric-status').textContent.includes('就绪'), null, { timeout: 60000 });
    assert.equal(await page.title(), pageTitle, 'Lyrics mode must keep the original document title');
    assert(requests.some((url)=>url.endsWith('folia.wasm')));
    await page.locator('#music-play').click();
    const at = await page.locator('#music-audio').evaluate(el=>el.currentTime);
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#music-audio').evaluate(el=>el.currentTime), at);
    const seekTo = async (seconds) => {
      await page.locator('#music-seek').evaluate((el, t) => { el.value=t; el.dispatchEvent(new Event('input')); }, seconds);
      await page.waitForFunction(t=>Math.abs(document.querySelector('#music-audio').currentTime-t)<.15,seconds);
    };
    for (const [time, text] of [[5,''],[11,'ショートフィルムを録ろう。'],[48,'殴り合いの大喧嘩。 大女優も　愛の渦も'],[70,''],[130.8,'気分になった。'],[126,''],[210,'']]) {
      await seekTo(time);
      await page.waitForFunction(text=>document.querySelector('#current-lyric').textContent===text,text);
    }
    assert.equal(await page.title(), pageTitle, 'Lyric line changes must not rewrite the document title');
    await seekTo(58);
    await page.waitForTimeout(800);
    const canvasRect = await page.locator('#folia-canvas').boundingBox();
    assert.equal(canvasRect.width,1440); assert.equal(canvasRect.height,900);
    await page.screenshot({ path: path.join(output,'music-desktop.png') });
    await page.locator('#music-list').click();
    assert.equal(await page.locator('.track-row').count(),1);
    await page.screenshot({ path: path.join(output,'music-playlist.png') });
    await page.keyboard.press('Escape');
    assert(await page.locator('#playlist-panel').isHidden());
    await page.locator('#music-effects').click();
    assert(!(await page.locator('.lyric-atmosphere').getAttribute('class')).includes('is-visible'));
    assert(!(await page.locator('body').getAttribute('class')).includes('music-focus'));
    await page.locator('#music-effects').click();
    assert.deepEqual(await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset })), initialScene, 'Effect toggle must preserve song composition');
    await page.locator('#music-play').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'music-next');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(250);
    await page.screenshot({path:path.join(output,'music-mobile.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    // Single track ends safely in each playback mode.
    for (let i=0;i<3;i++) {
      await page.locator('#music-audio').evaluate(el=>{el.currentTime=211; el.dispatchEvent(new Event('ended'));});
      await page.waitForFunction(()=>document.querySelector('#music-audio').currentTime<2 && !document.querySelector('#music-audio').paused);
      await page.locator('#music-play').click();
      await page.locator('#music-mode').click();
    }
    await page.locator('#music-list').click();
    // Bad hosted lyrics must leave playback available and recover on retry.
    await page.route('**/assets/music/daijoyuu-san.json',route=>route.fulfill({contentType:'application/json',body:'{broken'}));
    await page.reload();
    await page.waitForFunction(()=>!document.querySelector('#music-play').disabled);
    await page.locator('#music-play').click();
    await page.waitForFunction(()=>document.querySelector('#lyric-status').textContent.includes('失败'));
    assert(!(await page.locator('#music-play').isDisabled()));
    await page.locator('#music-play').click();
    await page.unroute('**/assets/music/daijoyuu-san.json');
    await page.locator('#music-effects').click();
    await page.locator('#music-effects').click();
    await page.waitForFunction(()=>document.querySelector('#lyric-status').textContent.includes('就绪'));
    // Three distinct mocked songs test navigation, end transitions, shuffle history and races.
    await page.route('**/assets/music/playlist.json',route=>route.fulfill({json:{tracks:[
      {title:'First',audio:'one.wav',lyrics:'slow.lrc'},
      {title:'Second',audio:'two.wav',lyrics:'timed.json',offset:1},
      {title:'Third',audio:'three.wav'},
    ]}}));
    await page.route(/\/assets\/music\/(one|two|three)\.wav$/,route=>route.fulfill({contentType:'audio/wav',body:silentWav()}));
    await page.route('**/assets/music/slow.lrc',async route=>{
      await new Promise(r=>setTimeout(r,300));
      await route.fulfill({body:'[00:00.00]Stale lyrics'}).catch(()=>{});
    });
    await page.route('**/assets/music/timed.json',route=>route.fulfill({json:{apiVersion:1,lines:[{start:1,end:4,text:'夜の交差点',translation:'夜晚的十字路口'}]}}));
    await page.reload(); await page.setViewportSize({width:1440,height:900});
    await page.locator('#music-list').click();
    await page.waitForFunction(()=>document.querySelectorAll('.track-row').length===3);
    const sceneAssignments = [];
    await page.locator('.track-row').nth(0).click();
    sceneAssignments.push(await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset })));
    await page.locator('.track-row').nth(1).click();
    sceneAssignments.push(await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset })));
    await page.waitForFunction(()=>document.querySelector('#current-lyric').textContent==='夜の交差点 · 夜晚的十字路口',null,{timeout:60000});
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#track-title').textContent(),'Second');
    assert.equal(await page.locator('#current-lyric').textContent(),'夜の交差点 · 夜晚的十字路口');
    const expectTitle = async title => {
      await page.waitForFunction(t=>document.querySelector('#track-title').textContent===t && !document.querySelector('#music-audio').paused,title);
    };
    const ended = () => page.locator('#music-audio').evaluate(el=>el.dispatchEvent(new Event('ended')));
    await page.locator('#music-next').click(); await expectTitle('Third');
    sceneAssignments.push(await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset })));
    assert.equal(new Set(sceneAssignments.map(scene => scene.scene)).size, 3, 'Songs draw different styles from the random bag');
    await ended(); await expectTitle('First');
    assert.deepEqual(await page.locator('.lyric-atmosphere').evaluate(el => ({ ...el.dataset })), sceneAssignments[0], 'Returning to a song keeps its random style and seed'); // List wraps.
    await page.locator('#music-prev').click(); await expectTitle('Third');
    await page.locator('#music-mode').click(); // Single repeat.
    assert.equal(await page.locator('#music-mode').getAttribute('aria-label'),'单曲循环');
    await page.locator('#music-audio').evaluate(el=>el.currentTime=8);
    await ended(); await expectTitle('Third');
    assert(await page.locator('#music-audio').evaluate(el=>el.currentTime<2));
    await page.locator('#music-next').click(); await expectTitle('First'); // Manual next still works.
    await page.locator('#music-mode').click(); // Shuffle.
    assert.equal(await page.locator('#music-mode').getAttribute('aria-label'),'随机播放');
    const order=['First'];
    for(let i=0;i<2;i++) { await ended(); await page.waitForTimeout(100); order.push(await page.locator('#track-title').textContent()); }
    assert.equal(new Set(order).size,3,'Shuffle bag plays every alternative once');
    await page.locator('#music-prev').click(); await expectTitle(order[1]);
    await page.locator('#music-play').click();
    // Verify every real song exposes credits and consumes the external engine bundle.
    const creditsPage = await browser.newPage({viewport:{width:1440,height:900}});
    creditsPage.on('pageerror',error=>errors.push(error.message));
    creditsPage.on('request',request=>requests.push(request.url()));
    await creditsPage.goto(origin);
    await creditsPage.waitForFunction(()=>!document.querySelector('#music-play').disabled);
    await creditsPage.locator('#music-list').click();
    assert.equal(await creditsPage.locator('.track-row').count(),library.tracks.length);
    for (let i=0;i<library.tracks.length;i++) {
      const track=library.tracks[i];
      await creditsPage.locator('.track-row').nth(i).click();
      await creditsPage.waitForFunction(()=>document.querySelector('#lyric-status').textContent.includes('就绪'),null,{timeout:60000});
      const creditValues=await creditsPage.locator('#credits-list dd').allTextContents();
      assert(creditValues.includes(track.originalArtist));
      assert(creditValues.includes(track.composer));
      assert(creditValues.includes(track.artist));
      await creditsPage.locator('#music-play').click();
    }
    assert.equal(await creditsPage.locator('input[type="file"], #lyric-source').count(),0);
    assert(!requests.some(url=>/\/assets\/folia\/(themes\/|theme\.json|scene\.json)/.test(url)),'Theme sources must be embedded in the external WASM');
    await creditsPage.screenshot({path:path.join(output,'song-credits-desktop.png')});
    await creditsPage.setViewportSize({width:390,height:844});
    await creditsPage.screenshot({path:path.join(output,'song-credits-mobile.png')});
    await creditsPage.close();
    // Call the compiled C ABI directly and inspect the actual WebGL framebuffer.
    const probe = await browser.newPage();
    probe.on('console', (message) => { if (message.type() === 'warning' || message.type() === 'error') console.log('WebGL:', message.text()); });
    await probe.route('**/__folia_probe', (route) => route.fulfill({ contentType: 'text/html', body: '<canvas id="canvas" width="960" height="720"></canvas>' }));
    await probe.goto(`${origin}/__folia_probe`);
    const native = await probe.evaluate(async () => {
      const { default: createFolia } = await import('/assets/folia/folia.js');
      const canvas = document.querySelector('canvas');
      const module = await createFolia({ canvas, locateFile: (file) => `/assets/folia/${file}` });
      const phaseErrors = [];
      const checkGL = (phase) => {
        const gl = canvas.getContext('webgl');
        const error = gl.getError();
        if (error) phaseErrors.push({ phase, error });
      };
      module.FS.mkdirTree('/probe');
      module.FS.writeFile('/probe/cjk.otf',new Uint8Array(await (await fetch('/assets/folia/cjk.otf')).arrayBuffer()));
      for (const file of ['theme.json','scene.json']) module.FS.writeFile(`/probe/${file}`,module.FS.readFile(`/folia/themes/minimal/${file}`));
      module.FS.writeFile('/probe/test.lrc', await (await fetch('/assets/music/example.lrc')).text());
      if (!module._folia_init(960, 720)) throw new Error('init failed');
      checkGL('init');
      if (!module.ccall('folia_load', 'number', ['string', 'string'], ['/probe/test.lrc', '/probe'])) throw new Error('load failed');
      checkGL('load');
      const lyricPhrases = text => text ? [text] : [];
      const texts = JSON.parse(module.ccall('folia_texts', 'string', [], []));
      if (!module.ccall('folia_set_phrases', 'number', ['string'], [JSON.stringify(texts.map(lyricPhrases))])) throw new Error('Phrase setup failed');
      if (module.ccall('folia_set_phrases', 'number', ['string'], ['[["wrong text"]]'])) throw new Error('Invalid groups accepted');
      const sample = (time) => {
        module._folia_frame(time, 960, 720, 0);
        checkGL(`frame ${time}`);
        return JSON.parse(module.ccall('folia_status', 'string', [], []));
      };
      const samples = [0, 1.5, 2.5, 5, 1.5, 14].map(sample);
      const stablePixels = (time = 2.5) => {
        module._folia_frame(time, 960, 720, 1);
        const gl = canvas.getContext('webgl');
        const pixels = new Uint8Array(960 * 720 * 4);
        gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let hash = 2166136261;
        for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
        return hash;
      };
      if (stablePixels(2.1) !== stablePixels(2.5)) throw new Error('Words still animate independently within one sentence');
      const styles = [];
      const catalog = JSON.parse(module.FS.readFile('/folia/themes/index.json',{encoding:'utf8'}));
      for (const entry of catalog.themes) {
        const root = `/probe/themes/${entry.id}`;
        module.FS.mkdirTree(root);
        for (const file of entry.files) module.FS.writeFile(`${root}/${file}`, module.FS.readFile(`/folia/themes/${entry.id}/${file}`));
        module.FS.writeFile(`${root}/cjk.otf`,module.FS.readFile('/probe/cjk.otf'));
        if (!module.ccall('folia_load','number',['string','string'],['/probe/test.lrc',root])) throw new Error(module.ccall('folia_error','string',[],[]));
        module._folia_set_seed(124);
        const hash = stablePixels();
        const status = JSON.parse(module.ccall('folia_status','string',[],[]));
        if (status.themeId !== `komichi.${entry.id}` || !status.layers.some(layer => layer.type === 'lyrics' && layer.drawn)) throw new Error('Real theme graph was not rendered');
        if (entry.id !== 'minimal' && status.postPasses !== 1) throw new Error('Theme shader pipeline was bypassed');
        if (hash !== stablePixels(2.1)) throw new Error('Reduced-motion scene changed within a sentence');
        styles.push(hash);
        checkGL(entry.id);
      }
      if (new Set(styles).size !== 3) throw new Error('The three themes must paint different compositions');
      if (!module.ccall('folia_load','number',['string','string'],['/probe/test.lrc','/probe'])) throw new Error('Default theme reload failed');
      module._folia_set_seed(125);
      const changedSeed = stablePixels();
      module._folia_set_seed(124);
      if (stablePixels() === changedSeed) throw new Error('Seed did not change adjacent lyrics');
      module._folia_set_seed(1);
      const beforeSeek = stablePixels();
      sample(5);
      const afterSeek = stablePixels();
      if (beforeSeek !== afterSeek) throw new Error('Layout changed after backward seek');
      sample(2.5);
      const gl = canvas.getContext('webgl');
      const pixels = new Uint8Array(960 * 720 * 4);
      gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let ink = 0, transparent = 0, red = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) ink++; else transparent++;
        if (pixels[i] > 100 && pixels[i - 3] > pixels[i - 2] * 2 && pixels[i - 3] > pixels[i - 1] * 2) red++;
      }
      window.foliaProbe = module;
      module.FS.writeFile('/probe/spaces.lrc', '[00:01.00]殴り合いの大喧嘩。 大女優も　愛の渦も');
      if (!module.ccall('folia_load', 'number', ['string', 'string'], ['/probe/spaces.lrc', '/probe'])) throw new Error('Sentence fixture failed');
      for (const [width, height] of [[1440, 900], [390, 844]]) {
        module._folia_frame(2, width, height, 1);
        const status = JSON.parse(module.ccall('folia_status', 'string', [], []));
        if (status.missingGlyphs) throw new Error('Full-width spaces must not paint missing-glyph boxes');
      }
      return { samples, ink, transparent, red, glError: gl.getError(), phaseErrors };
    });
    await probe.setViewportSize({ width: 1440, height: 900 });
    await probe.evaluate(() => { document.body.style.cssText = 'margin:0;background:#090c14'; });
    for (let style = 0; style < 3; style++) {
      for (const [width, height] of [[1440,900], [390,844]]) {
        await probe.setViewportSize({ width, height });
        await probe.evaluate(({style,width,height}) => {
          const themeId = ['minimal','neon','midnight'][style];
          if (!window.foliaProbe.ccall('folia_load','number',['string','string'],['/probe/spaces.lrc',`/probe/themes/${themeId}`])) throw new Error('Screenshot theme failed');
          window.foliaProbe._folia_set_seed(124);
          window.foliaProbe._folia_frame(2.5, width, height, 0);
        }, {style,width,height});
        await probe.screenshot({path:path.join(output, `scene-${style}-${width}.png`)});
      }
    }
    assert.equal(native.samples[0].text, '');
    assert.equal(native.samples[1].wordIndex, 0);
    assert.equal(native.samples[2].wordIndex, 1);
    assert.equal(native.samples[3].text, '夜晚的十字路口');
    assert.equal(native.samples[4].text, '凌晨四点', 'Backward seek must reset correctly');
    // Original LRC parser ignores empty markers; the example's final line lasts 5 s.
    assert.equal(native.samples[5].text, '');
    assert(native.samples.every((sample) => sample.missingGlyphs === 0), 'CJK glyphs must actually exist');
    assert(native.red > 100, 'Sentence highlight must use the site red');
    assert(native.ink > 100, 'WASM must paint visible glyph pixels');
    assert(native.transparent > 960 * 720 / 2, 'The scene background must be transparent');
    assert.equal(native.glError, 0);
    assert.deepEqual(native.phaseErrors, []);
    assert.deepEqual(errors, []);
    console.log('PASS: persistent volume/mute, CRT stacking, three real Folia theme graphs and shader chains, MP3 range/seek, online lyrics, full-stage layout, all playlist modes, shuffle history, no import/source UI, song credits, embedded-theme WASM, CJK pixels, exact word timing, play/pause, seeks, gaps, effects, keyboard, mobile, reduced motion, malformed lyric recovery, playlist switching, offset, translations, transparent WebGL framebuffer.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
