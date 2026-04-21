import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';

const SRC_DIR = resolve(__dirname, '..');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const ALL_SRC_FILES = walkTsFiles(SRC_DIR);

type Offender = {file: string; line: number; snippet: string};

function scan(pattern: RegExp, skipIfLineContains: string[] = []): Offender[] {
  const out: Offender[] = [];
  for (const f of ALL_SRC_FILES) {
    const text = readFileSync(f, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (skipIfLineContains.some((s) => line.includes(s))) return;
      if (pattern.test(line)) {
        out.push({file: f.replace(SRC_DIR + '/', ''), line: i + 1, snippet: line.trim()});
      }
    });
  }
  return out;
}

/**
 * Regression guards for rename PRs #54 (video→youtube, memo→notes),
 * #57 (/note→/notes), #59 (잔존물 정리). Adding a new reference to these
 * deprecated internal routes will fail the test.
 */
describe('route consistency — regression guard', () => {
  it('no deprecated /video/ internal route references (except external YouTube API URLs)', () => {
    const pattern = /(`\/video\/\$\{|`\/video\?|router\.push\(['"`]\/video|href=\{`\/video\/)/;
    const offenders = scan(pattern, ['youtube.com', 'googleapis.com']);
    expect(
      offenders.length,
      `Found ${offenders.length} deprecated /video references:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n')}`,
    ).toBe(0);
  });

  it('no deprecated /note/ singular internal route references', () => {
    // Match /note/${...} but NOT /notes/${...}
    const pattern = /(`\/note\/\$\{|router\.push\(['"`]\/note\/|href=\{`\/note\/|href=['"]\/note\/)/;
    const offenders = scan(pattern);
    expect(
      offenders.length,
      `Found ${offenders.length} deprecated /note/ (singular) references:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n')}`,
    ).toBe(0);
  });

  it('no deprecated /memo internal route references', () => {
    const pattern = /(`\/memo[/?'"`]|router\.push\(['"`]\/memo|href=\{['"`]\/memo|href=['"]\/memo)/;
    const offenders = scan(pattern);
    expect(
      offenders.length,
      `Found ${offenders.length} deprecated /memo references:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n')}`,
    ).toBe(0);
  });

  it('no deprecated /api/note/ (singular) API references', () => {
    // Match /api/note/ path but NOT /api/notes/. Catches fetch / withTracing labels / comment strings.
    const pattern = /(['"`]\/api\/note\/|\bPOST \/api\/note\/|\bGET \/api\/note\/|\bPATCH \/api\/note\/|\bDELETE \/api\/note\/)/;
    const offenders = scan(pattern);
    expect(
      offenders.length,
      `Found ${offenders.length} deprecated /api/note/ (singular) references:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n')}`,
    ).toBe(0);
  });

  it('no deprecated /api/video/ or /api/memo/ API references', () => {
    const pattern = /(['"`]\/api\/(video|memo)\/|\b(POST|GET|PATCH|DELETE) \/api\/(video|memo)\/)/;
    const offenders = scan(pattern);
    expect(
      offenders.length,
      `Found ${offenders.length} deprecated /api/video/ or /api/memo/ references:\n${offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join('\n')}`,
    ).toBe(0);
  });
});
