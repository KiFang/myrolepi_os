const test = require('node:test');
const assert = require('node:assert');
const { compareVersions, pickAsset, normalizeReleases, isAllowedDownload, safeName } = require('./lib');

const assets = [
  { name: 'App Setup 1.0.0.exe' }, { name: 'App-1.0.0-portable.exe' },
  { name: 'App-1.0.0.AppImage' }, { name: 'App-1.0.0.dmg' }, { name: 'App-1.0.0-mac.zip' }, { name: 'App-1.0.0-arm64-mac.zip' },
];

test('compareVersions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('v1.0.0-beta.1', '1.0.0'), -1);
});
test('pickAsset prefers runnable files per platform', () => {
  assert.equal(pickAsset(assets, 'win', 'x64').name, 'App-1.0.0-portable.exe');
  assert.equal(pickAsset(assets, 'linux', 'x64').name, 'App-1.0.0.AppImage');
  assert.equal(pickAsset(assets, 'mac', 'x64').name, 'App-1.0.0-mac.zip');
  assert.equal(pickAsset(assets, 'mac', 'arm64').name, 'App-1.0.0-arm64-mac.zip');
  assert.equal(pickAsset([], 'win', 'x64'), null);
});
test('normalizeReleases sorts newest first and drops drafts', () => {
  const r = normalizeReleases([
    { tag_name: 'v0.1.0', assets }, { tag_name: 'v0.2.0', assets }, { tag_name: 'v0.3.0', draft: true, assets },
  ], 'linux', 'x64');
  assert.deepEqual(r.map((x) => x.version), ['0.2.0', '0.1.0']);
});
test('download allow-list and safe names', () => {
  assert.equal(isAllowedDownload('https://github.com/a/b/releases/download/v1/x.exe'), true);
  assert.equal(isAllowedDownload('https://objects.githubusercontent.com/x'), true);
  assert.equal(isAllowedDownload('http://github.com/x'), false);
  assert.equal(isAllowedDownload('https://evil.com/x'), false);
  assert.equal(safeName('../../etc'), '.._.._etc');
});
