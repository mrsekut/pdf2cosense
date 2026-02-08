import { Effect, Option } from 'effect';

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
  effect: Effect.gen(function* () {
    return {
      workspaceDir: './workspace',
      profile: Option.some('mrsekut-merry-firends/mrsekut'),
    } as const;
  }),
}) {}
