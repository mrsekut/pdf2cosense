import { Schema } from 'effect';

export type Page = typeof Page.Type;
export const Page = Schema.Struct({
  title: Schema.String,
  lines: Schema.Array(Schema.String),
});

export type Project = {
  pages: Page[];
};
