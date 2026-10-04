import { Context, Layer } from 'effect';

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly projectPrefix: string;
    readonly profile: string | undefined;
  }
>()('AppConfig') {
  static readonly layer = Layer.succeed(AppConfig, {
    projectPrefix: 'mrsekut-book',
    profile: 'mrsekut-merry-firends/mrsekut',
  });
}
