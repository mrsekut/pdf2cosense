import { describe, expect, test } from 'bun:test';
import { renderPage } from './renderPage.ts';

describe('renderPage', () => {
  test('タイトル・前後リンク・画像・OCR を並べる', () => {
    const page = renderPage(3, 12, 'abc123', 'line1\nline2');

    expect(page).toEqual({
      title: '03',
      lines: [
        '03',
        'prev: [02]',
        'next: [04]',
        '[[https://gyazo.com/abc123]]',
        '',
        '> line1',
        '> line2',
      ],
    });
  });

  test('先頭ページの prev は自分自身を指す', () => {
    const page = renderPage(0, 12, 'abc123', 'text');

    expect(page.lines.slice(0, 3)).toEqual(['00', 'prev: [00]', 'next: [01]']);
  });

  test('OCR が空でも引用行が1行残る', () => {
    const page = renderPage(0, 3, 'abc123', '');

    expect(page.lines.at(-1)).toBe('> ');
  });
});
