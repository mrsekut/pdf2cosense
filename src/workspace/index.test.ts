import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BunContext } from '@effect/platform-bun';
import { Effect } from 'effect';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getBooksWithoutJson,
  getDirsWithoutIsbn,
  getJsonPaths,
  getPdfsNeedingConversion,
} from './index.ts';

let ws: string;

beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf2cosense-'));
});

afterEach(() => {
  fs.rmSync(ws, { recursive: true, force: true });
});

const run = <A, E>(effect: Effect.Effect<A, E, BunContext.BunContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(BunContext.layer)));

const touch = (rel: string, content = '') => {
  const p = path.join(ws, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

const mkdir = (rel: string) => fs.mkdirSync(path.join(ws, rel));

describe('getPdfsNeedingConversion', () => {
  test('同名ディレクトリがまだない PDF だけを返す', async () => {
    touch('a.pdf');
    touch('b.PDF');
    touch('c.pdf');
    mkdir('c');
    touch('memo.txt');

    const result = await run(getPdfsNeedingConversion(ws));

    expect(result.sort()).toEqual([
      path.join(ws, 'a.pdf'),
      path.join(ws, 'b.PDF'),
    ]);
  });
});

describe('getDirsWithoutIsbn', () => {
  test('.isbn がないディレクトリだけを返す', async () => {
    mkdir('noIsbn');
    touch('hasIsbn/.isbn', '9784000000000');
    touch('file.pdf');

    const result = await run(getDirsWithoutIsbn(ws));

    expect(result).toEqual([path.join(ws, 'noIsbn')]);
  });
});

describe('getBooksWithoutJson', () => {
  test('.isbn があり -ocr.json がまだない本を、ISBN を trim して返す', async () => {
    touch('todo/.isbn', '9784000000000\n');
    touch('done/.isbn', '9784111111111');
    touch('done-ocr.json', '{}');
    mkdir('noIsbn');

    const result = await run(getBooksWithoutJson(ws));

    expect(result).toEqual([
      { imageDir: path.join(ws, 'todo'), isbn: '9784000000000' },
    ]);
  });
});

describe('getJsonPaths', () => {
  test('-ocr.json だけを返す', async () => {
    touch('a-ocr.json');
    touch('b-ocr.json');
    touch('a.pdf');
    touch('other.json');

    const result = await run(getJsonPaths(ws));

    expect(result.sort()).toEqual([
      path.join(ws, 'a-ocr.json'),
      path.join(ws, 'b-ocr.json'),
    ]);
  });
});
