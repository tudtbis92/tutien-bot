import type { Collection } from 'discord.js';

declare module 'discord.js' {
  interface Client {
    commands: Collection<
      string,
      {
        data: { name: string; toJSON(): unknown };
        execute: (...args: unknown[]) => Promise<void>;
      }
    >;
  }
}
