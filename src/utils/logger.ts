type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// 'debug' maps to console.log — console.debug is identical but less common
const CONSOLE_METHODS: Record<LogLevel, 'info' | 'warn' | 'error' | 'log'> = {
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'log',
};

function log(level: LogLevel, context: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;
  const args: unknown[] = [formatted];
  if (data !== undefined) args.push(data);
  console[CONSOLE_METHODS[level]](...args);
}

export const logger = {
  info: (ctx: string, msg: string, data?: unknown) => log('info', ctx, msg, data),
  warn: (ctx: string, msg: string, data?: unknown) => log('warn', ctx, msg, data),
  error: (ctx: string, msg: string, data?: unknown) => log('error', ctx, msg, data),
  debug: (ctx: string, msg: string, data?: unknown) => log('debug', ctx, msg, data),
};
