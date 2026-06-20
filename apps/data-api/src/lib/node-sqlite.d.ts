declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(
      location: string,
      options?: {
        open?: boolean;
        readOnly?: boolean;
        enableForeignKeyConstraints?: boolean;
        enableDoubleQuotedStringLiterals?: boolean;
        allowExtension?: boolean;
        timeout?: number;
      },
    );
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class StatementSync {
    all(...anonymousParameters: unknown[]): Record<string, unknown>[];
    get(...anonymousParameters: unknown[]): Record<string, unknown> | undefined;
    iterate(...anonymousParameters: unknown[]): IterableIterator<Record<string, unknown>>;
  }
}
