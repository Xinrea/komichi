// Run against scripts/serve.py with Playwright and Chrome available.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4173';
const output = path.resolve(__dirname, '../test-results/visual');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { Math.random = () => .5; });
    await page.goto(origin);
    await page.waitForFunction(() => !document.querySelector('#music-play').disabled);
    // Exercise both sides of the 25% boundary and immediate hit/skip/hit bursts.
    const rolls = await page.evaluate(() => {
      const random = Math.random;
      const overlay = document.querySelector('.crt-overlay');
      const echo = document.querySelector('.crt-face-echo');
      try {
        return [0, .249999, .25, .5, .999999, .1].map(value => {
          let calls = 0;
          Math.random = () => { calls++; return value; };
          triggerGlitch();
          return { value, calls, face: overlay.classList.contains('has-face-echo'),
            glitch: overlay.classList.contains('is-glitching') && document.querySelector('.theater').classList.contains('is-glitching'),
            animations: echo.getAnimations().length, opacity: +getComputedStyle(echo).opacity };
        });
      } finally { Math.random = random; }
    });
    for (const roll of rolls) {
      assert.equal(roll.calls, 1, 'Every actual glitch must draw exactly once');
      assert.equal(roll.glitch, true, 'Skipping the face must preserve the glitch');
      assert.equal(roll.face, roll.value < .25, '25% probability boundary');
      assert.equal(roll.animations, roll.face ? 1 : 0, 'Skipped bursts must cancel a previous face animation');
      if (!roll.face) assert.equal(roll.opacity, 0, 'No face residue after a skipped burst');
    }
    // Capture the real, timed echo at a visible frame, keeping the existing CRT slices in sync.
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const face = await page.evaluate(() => {
        const random = Math.random;
        try { Math.random = () => 0; triggerGlitch(); }
        finally { Math.random = random; }
        const echo = document.querySelector('.crt-face-echo');
        const style = getComputedStyle(echo);
        const animation = echo.getAnimations()[0];
        animation.pause(); animation.currentTime = 150;
        return { opacity: +getComputedStyle(echo).opacity, duration: animation.effect.getTiming().duration,
          rect: { width: echo.getBoundingClientRect().width, height: echo.getBoundingClientRect().height },
          pointerEvents: style.pointerEvents,
          src: style.backgroundImage,
          synchronized: document.querySelector('.theater').classList.contains('is-glitching') && document.querySelector('.crt-overlay').classList.contains('is-glitching') };
      });
      assert(face.opacity > 0 && face.opacity <= .18);
      assert.equal(face.duration, 420);
      assert.equal(face.pointerEvents, 'none');
      assert(face.synchronized && face.src.includes('character-cutout.png'));
      assert(face.rect.width >= width && face.rect.height >= height);
      await page.screenshot({ path: path.join(output, `face-${width}.png`) });
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.crt-face-echo').evaluate(e => +getComputedStyle(e).opacity), 0);
      assert.equal(await page.locator('.crt-overlay').evaluate(e => e.classList.contains('has-face-echo')), false);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#music-play').click();
    await page.waitForFunction(() => document.querySelector('#lyric-status').textContent.includes('就绪'), null, { timeout: 60000 });
    await page.locator('#music-audio').evaluate(a => { a.pause(); a.currentTime = 48; });
    await page.waitForFunction(() => document.querySelector('#current-lyric').textContent.includes('殴り合い'));
    const song = await page.locator('.lyric-atmosphere').evaluate(e => ({ ...e.dataset }));
    for (const [width, height] of [[1440,900], [390,844], [360,640], [844,390], [1366,768]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(450);
      assert.equal(await page.locator('#current-lyric').textContent(), '殴り合いの大喧嘩。 大女優も　愛の渦も');
      assert.deepEqual(await page.locator('.lyric-atmosphere').evaluate(e => ({ ...e.dataset })), song);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator('#music-audio').evaluate(a => a.currentTime === 48 && a.paused));
      await page.screenshot({ path: path.join(output, `lyrics-${width}x${height}.png`) });
    }
    await page.evaluate(() => {
      const random = Math.random;
      try { Math.random = () => 0; triggerGlitch(); }
      finally { Math.random = random; }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.crt-face-echo').evaluate(e => getComputedStyle(e).display), 'none');
    assert.equal(await page.locator('.crt-overlay').evaluate(e => e.classList.contains('has-face-echo')), false);
    const reduced = await page.evaluate(() => {
      const random = Math.random;
      let calls = 0;
      try {
        Math.random = () => { calls++; return 0; };
        triggerGlitch();
        return { calls, glitch: document.querySelector('.crt-overlay').classList.contains('is-glitching') };
      } finally { Math.random = random; }
    });
    assert.deepEqual(reduced, { calls: 0, glitch: false });
    // Inspect every stage's actual WebGL output and diagnostics with the same layout adapter.
    await page.route('**/__visual_probe', route => route.fulfill({ contentType: 'text/html', body: '<canvas id="canvas"></canvas>' }));
    await page.goto(`${origin}/__visual_probe`);
    const results = await page.evaluate(async () => {
      const { default: createFolia } = await import('/assets/folia/folia.js');
      const { loadStageTheme } = await import('/lyric-layout.js?v=1');
      const canvas = document.querySelector('canvas');
      const module = await createFolia({ canvas, locateFile: file => `/assets/folia/${file}`, print: () => {}, printErr: () => {} });
      module.FS.mkdirTree('/komichi');
      module.FS.writeFile('/komichi/cjk.otf', new Uint8Array(await (await fetch('/assets/folia/cjk.otf')).arrayBuffer()));
      module.FS.writeFile('/komichi/probe.lrc', '[00:01.00]殴り合いの大喧嘩。 大女優も　愛の渦も\n[00:08.00]最小限の\n[00:12.00]夜の交差点');
      module._folia_init(1440,900);
      window.visualProbe = module;
      const results = [];
      for (const id of ['neon','midnight','mindscape','tilt','partita']) {
        for (const [width,height] of [[1440,900],[390,844],[360,640],[844,390]]) {
          const source = `/folia/themes/${id}`;
          module.FS.writeFile(`${source}/cjk.otf`, module.FS.readFile('/komichi/cjk.otf'));
          const frame = theme => {
            if (!module.ccall('folia_load','number',['string','string'],['/komichi/probe.lrc',theme])) throw new Error(module.ccall('folia_error','string',[],[]));
            module._folia_set_seed(124);
            module._folia_frame(4.5,width,height,1);
            const status = JSON.parse(module.ccall('folia_status','string',[],[]));
            const gl = canvas.getContext('webgl');
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let ink = 0;
            for (let i=0;i<pixels.length;i+=4) if (pixels[i+3] >= 128 && Math.max(pixels[i],pixels[i+1],pixels[i+2]) >= 80) ink++;
            return { ...status, ink };
          };
          const before = frame(source);
          const after = frame(loadStageTheme(module,id,width));
          results.push({ id,width,height,before,after,glError:canvas.getContext('webgl').getError() });
        }
      }
      return results;
    });
    fs.writeFileSync(path.join(output, 'diagnostics.json'), JSON.stringify(results, null, 2));
    for (const result of results) {
      assert.equal(result.glError, 0, `${result.id} WebGL`);
      assert.equal(result.after.missingGlyphs, 0, `${result.id} CJK`);
      assert(result.after.layers.some(l => l.type === 'lyrics' && l.drawn), `${result.id} lyrics layer`);
      if (result.height > 640) assert(result.after.ink > result.before.ink * 1.2, `${result.id} at ${result.width}: visible lyric ink must grow substantially`);
    }
    for (const id of ['neon','midnight','mindscape','tilt','partita']) {
      for (const [width,height] of [[1440,900],[390,844]]) {
        await page.setViewportSize({width,height});
        await page.evaluate(async ({id,width,height}) => {
          document.body.style.cssText='margin:0;background:#09060a';
          document.querySelector('canvas').style.cssText='width:100vw;height:100vh;display:block';
          const {loadStageTheme}=await import('/lyric-layout.js?v=1');
          const module=window.visualProbe;
          module.ccall('folia_load','number',['string','string'],['/komichi/probe.lrc',loadStageTheme(module,id,width)]);
          module._folia_set_seed(124);
          module._folia_frame(4.5,width,height,0);
        },{id,width,height});
        await page.screenshot({path:path.join(output,`${id}-${width}.png`)});
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: all 5 enlarged lyric themes at 4 viewport sizes, real CJK/WebGL rendering, responsive reload preserving lyrics/time/seed, no horizontal overflow, independent 25% face sampling and boundary cases, skipped-burst residue cleanup, synchronized low-opacity face echo, automatic cleanup, pointer passthrough and reduced-motion suppression.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
