const sharedFonts = new WeakMap();

// Adapt the embedded Folia themes to this site's concert-sized lyric stage.
// Keep the shipped themes untouched so resizing can always start from their original values.
export function stageTypography(theme, width) {
  const portrait = width < 780;
  return {
    ...theme,
    typography: {
      ...theme.typography,
      size: Math.min(240, theme.typography.size * (portrait ? 2.8 : 2.35)),
      adjacentSize: portrait ? 34 : 38,
      subtitleSize: portrait ? 25 : 27,
    },
    layout: { ...theme.layout, maxWidth: portrait ? .88 : .9, maxLines: 3 },
    lyrics: {
      ...theme.lyrics,
      inactiveOpacity: Math.max(.3, theme.lyrics.inactiveOpacity),
      adjacentOpacity: portrait ? .18 : .2,
    },
  };
}

export function loadStageTheme(module, id, width) {
  const source = `/folia/themes/${id}`;
  const path = `/komichi/stage/${id}/${width < 780 ? 'portrait' : 'wide'}`;
  if (module.FS.analyzePath(`${path}/theme.json`).exists) return path;
  const catalog = JSON.parse(module.FS.readFile('/folia/themes/index.json', { encoding: 'utf8' }));
  const entry = catalog.themes.find((theme) => theme.id === id);
  if (!entry) throw new Error(`Missing Folia theme: ${id}`);
  module.FS.mkdirTree(path);
  for (const file of entry.files) module.FS.writeFile(`${path}/${file}`, module.FS.readFile(`${source}/${file}`));
  const theme = JSON.parse(module.FS.readFile(`${source}/theme.json`, { encoding: 'utf8' }));
  const adapted = stageTypography(theme, width);
  const scene = JSON.parse(module.FS.readFile(`${source}/${theme.scene}`, { encoding: 'utf8' }));
  for (const layer of scene.layers) {
    if (layer.type !== 'lyrics') continue;
    // More phrase rows make the tilted theme large enough to read on phones.
    if (layer.mode === 'tilt') layer.splitProbability = Math.max(1.5, layer.splitProbability || 0);
    if (layer.mode === 'partita' && width < 780) {
      // Leave room for stagger, rotation and the glow outside the glyph body.
      adapted.layout.maxWidth = .82;
      layer.staggerMin = 18;
      layer.staggerMax = 64;
    }
  }
  // Folia requires assets inside the theme directory. Share one read-only byte
  // buffer between profiles rather than duplicating the 24 MB font for each.
  if (!sharedFonts.has(module)) sharedFonts.set(module, module.FS.readFile('/komichi/cjk.otf'));
  module.FS.writeFile(`${path}/cjk.otf`, sharedFonts.get(module), { canOwn: true });
  module.FS.writeFile(`${path}/theme.json`, JSON.stringify(adapted));
  module.FS.writeFile(`${path}/${theme.scene}`, JSON.stringify(scene));
  return path;
}
