import { Effect, Console } from "effect";
import * as Fs from "@effect/platform/FileSystem";
import type { CosenseProject } from "./types.ts";

export class UploadError extends Error {
  readonly _tag = "UploadError";
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export const uploadToCosense = (jsonPath: string, projectName: string) =>
  Effect.gen(function* () {
    const fs = yield* Fs.FileSystem;

    const content = yield* fs.readFileString(jsonPath);
    const project: CosenseProject = JSON.parse(content);

    yield* Console.log(
      `📤 Uploading ${project.pages.length} pages to Cosense project: ${projectName}`,
    );

    // TODO: Implement Playwright automation
    // 1. Launch browser
    // 2. Login to Cosense
    // 3. Create/navigate to project
    // 4. Import JSON or create pages

    return yield* Effect.fail(new UploadError("Not implemented yet"));
  });
