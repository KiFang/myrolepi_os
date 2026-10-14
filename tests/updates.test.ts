import { describe, expect, it } from 'vitest';
import { checkForUpdate, compareVersions, validateFeed } from '../src/core';

const rel = (version: string, platforms: ('win' | 'mac' | 'linux')[]) => ({
  version, date: '', notes: '', assets: platforms.map((platform) => ({ platform, arch: 'x64' as const, url: `https://x/${version}-${platform}` })),
});

describe('updates', () => {
  it('compares versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('v1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });
  it('finds newer releases for the current platform only', () => {
    const feed = { id: 'x', latest: '0.3.0', releases: [rel('0.3.0', ['win']), rel('0.2.0', ['win', 'linux']), rel('0.1.0', ['win', 'linux'])] };
    expect(validateFeed(feed)).toBe(true);
    expect(checkForUpdate('0.1.0', feed, 'win', 'x64').available?.version).toBe('0.3.0');
    const linux = checkForUpdate('0.1.0', feed, 'linux', 'x64');
    expect(linux.available?.version).toBe('0.2.0');
    expect(linux.asset?.url).toContain('linux');
    expect(checkForUpdate('0.3.0', feed, 'win', 'x64').available).toBeNull();
    expect(checkForUpdate('0.1.0', feed, 'mac', 'x64').available).toBeNull();
  });
});
