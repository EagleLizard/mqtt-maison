
import pino from 'pino';
import { Mocked, vi } from 'vitest';

export const LoggerMock = {
  init: init,
} as const;

function init(): Mocked<pino.Logger> {
  let mockLogger: Mocked<pino.Logger> = {
    info: vi.fn() as Mocked<pino.Logger>['info'],
    warn: vi.fn() as Mocked<pino.Logger>['warn'],
    error: vi.fn() as Mocked<pino.Logger>['error'],
    debug: vi.fn() as Mocked<pino.Logger>['debug'],
  } as Mocked<pino.Logger>;
  return mockLogger;
}
