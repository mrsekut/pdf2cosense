import { Effect } from 'effect';
import * as Fs from '@effect/platform/FileSystem';
import type { Page, Project } from '../../Cosense/types.ts';

/**
 * Page オブジェクトを生成
 */
export const renderPage = (
  index: number,
  totalPages: number,
  gyazoImageId: string,
  ocrText: string,
): Page => {
  const padLength = String(totalPages).length;

  const title = String(index).padStart(padLength, '0');
  const prev = index === 0 ? index : index - 1;
  const next = index + 1;

  const prevStr = String(prev).padStart(padLength, '0');
  const nextStr = String(next).padStart(padLength, '0');

  const url = `https://gyazo.com/${gyazoImageId}`;

  const ocrLines = ocrText
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

  const content = `${title}
prev: [${prevStr}]
next: [${nextStr}]
[[${url}]]

${ocrLines}`;

  return {
    title,
    lines: content.split('\n'),
  };
};

/**
 * Project を JSON ファイルに保存
 */
export const saveJson = (filePath: string, project: Project) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;

    const jsonStr = JSON.stringify(project, null, 2);

    yield* fs.writeFileString(filePath, jsonStr);
  });
