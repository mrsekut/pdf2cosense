import { Context, Layer } from 'effect';

export class AppConfig extends Context.Tag('AppConfig')<
  AppConfig,
  {
    readonly projectPrefix: string;
    readonly profile: string | undefined;
  }
>() {
  static readonly layer = Layer.succeed(AppConfig, {
    projectPrefix: 'mrsekut-book',
    profile: 'mrsekut-merry-firends/mrsekut',
  });
}
