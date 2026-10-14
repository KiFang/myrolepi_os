// Чистая логика лаунчера (без Electron) — покрыта тестами.

function compareVersions(a, b) {
  const split = (v) => { const [core, pre] = String(v).replace(/^v/, '').split('-'); return { n: core.split('.').map((x) => parseInt(x, 10) || 0), pre }; };
  const x = split(a), y = split(b);
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) {
    const d = (x.n[i] ?? 0) - (y.n[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** Выбор файла релиза под платформу: сначала то, что можно запустить без установщика. */
function pickAsset(assets, platform, arch) {
  const names = assets.map((a) => ({ a, n: a.name.toLowerCase() }));
  const archOk = (n) => (arch === 'arm64' ? /arm64|aarch64/.test(n) : !/arm64|aarch64/.test(n));
  const rules = {
    win: [(n) => /portable.*\.exe$/.test(n), (n) => n.endsWith('.exe')],
    linux: [(n) => n.endsWith('.appimage')],
    mac: [(n) => n.endsWith('.zip'), (n) => n.endsWith('.dmg')],
  }[platform] ?? [];
  for (const rule of rules) {
    const hit = names.find(({ n }) => rule(n) && archOk(n));
    if (hit) return hit.a;
  }
  return null;
}

/** Релизы GitHub API -> список версий для UI (черновики отбрасываются). */
function normalizeReleases(releases, platform, arch) {
  return releases
    .filter((r) => !r.draft && /^v?\d/.test(String(r.tag_name)))
    .map((r) => ({
      version: String(r.tag_name).replace(/^v/, ''),
      date: r.published_at,
      prerelease: !!r.prerelease,
      notes: r.body || '',
      asset: pickAsset(r.assets || [], platform, arch),
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Безопасное имя для каталога установки. */
const safeName = (s) => String(s).replace(/[^\w.\-]/g, '_');

/** Скачивать разрешено только по https с доменов GitHub. */
function isAllowedDownload(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com'));
  } catch { return false; }
}

module.exports = { compareVersions, pickAsset, normalizeReleases, safeName, isAllowedDownload };
