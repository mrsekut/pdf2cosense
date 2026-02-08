import { Effect } from 'effect';

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
  effect: Effect.gen(function* () {
    return {
      profile: 'mrsekut-merry-firends/mrsekut',
    } as const;
  }),
}) {}
