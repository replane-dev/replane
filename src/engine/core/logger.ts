import {pino, type Level, type Logger as PinoLogger} from 'pino';
import type {Context} from './context';
export type LogLevel = Level | 'silent';

export interface LogEntry {
  msg: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface Logger {
  debug(ctx: Context, entry: LogEntry): void;
  info(ctx: Context, entry: LogEntry): void;
  warn(ctx: Context, entry: LogEntry): void;
  error(ctx: Context, entry: LogEntry): void;
}

function errorToJson(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? errorToJson(error.cause) : undefined,
    };
  }

  return error;
}

class ConsoleLogger implements Logger {
  private logger: PinoLogger;
  private level: LogLevel;

  constructor(options: {level: LogLevel}) {
    this.level = options.level;
    this.logger = pino({level: options.level});
  }

  private log(level: Level, ctx: Context, entry: LogEntry): void {
    this.logger[level]({
      ...entry,
      error: entry.error ? errorToJson(entry.error) : undefined,
      traceId: ctx.traceId,
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      msg: entry.error ? `${entry.msg} - ${entry.error?.toString()}` : entry.msg,
    });
  }

  debug(ctx: Context, entry: LogEntry): void {
    this.log('debug', ctx, entry);
  }

  info(ctx: Context, entry: LogEntry): void {
    this.log('info', ctx, entry);
  }

  warn(ctx: Context, entry: LogEntry): void {
    this.log('warn', ctx, entry);
  }

  error(ctx: Context, entry: LogEntry): void {
    this.log('error', ctx, entry);
  }
}

export function createLogger(options: {level: LogLevel}): Logger {
  return new ConsoleLogger(options);
}
