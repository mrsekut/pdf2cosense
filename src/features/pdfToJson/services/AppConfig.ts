import { Config, Effect, Option } from 'effect';

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
  effect: Effect.gen(function* () {
    const gyazoToken = yield* Config.string('GYAZO_TOKEN');

    return {
      workspaceDir: './workspace',
      profile: Option.some('mrsekut-merry-firends/mrsekut'),
      gyazoToken,
    } as const;
  }),
}) {}
