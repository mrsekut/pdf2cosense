import { Context, Effect, Layer, Option } from 'effect';
import { PdfToJsonError } from '../types.ts';

export interface ConfigShape {
  readonly workspaceDir: string;
  readonly profile: Option.Option<string>;
  readonly gyazoToken: string;
}

export class Config extends Context.Tag('Config')<Config, ConfigShape>() {}

export const ConfigLive = Layer.effect(
  Config,
  Effect.gen(function* () {
    const gyazoToken = process.env['GYAZO_TOKEN'];

    if (!gyazoToken) {
      return yield* new PdfToJsonError({
        message: 'GYAZO_TOKEN environment variable is not set',
      });
    }

    return {
      workspaceDir: './workspace',
      profile: Option.some('mrsekut-merry-firends/mrsekut'),
      gyazoToken,
    };
  }),
);
