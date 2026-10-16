const fs = require('node:fs');
const path = require('node:path');

const validThemeId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id);

// Local themes use the same configuration/snapshot UI as catalogue themes.
// Installation remains restricted to the known remote catalogue.
function listThemes(baseDir, builtin) {
  const themes = [...builtin];
  const directory = path.join(baseDir, 'themes');
  let entries;
  try { entries = fs.readdirSync(directory).sort(); } catch (_) { return themes; }
  for (const id of entries) {
    if (!validThemeId(id) || themes.some(theme => theme.id === id || theme.themeDir === id)) continue;
    const folder = path.join(directory, id);
    try {
      if (!fs.statSync(path.join(folder, 'layout')).isDirectory() || !fs.statSync(path.join(folder, '_config.yml')).isFile()) continue;
      let metadata = {};
      try { metadata = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
        if (!metadata || typeof metadata !== 'object') metadata = {}; } catch (_) {}
      themes.push({
        id, name: typeof metadata.displayName === 'string' ? metadata.displayName : id,
        description: typeof metadata.description === 'string' ? metadata.description : '本地已安装主题，可配置和切换',
        author: typeof metadata.author === 'string' ? metadata.author : '',
        themeDir: id, configFile: `_config.${id}.yml`, local: true
      });
    } catch (_) { /* Ignore incomplete theme folders. */ }
  }
  return themes;
}

function findTheme(baseDir, builtin, id) {
  return validThemeId(id) ? listThemes(baseDir, builtin).find(theme => theme.id === id) : undefined;
}

module.exports = {listThemes, findTheme, validThemeId};
