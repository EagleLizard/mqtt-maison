
/*
copy pino.LogFn, w/o extra rest args
_*/
type EzdLogFn = {
  (obj: unknown, msg?: string): void;
  (msg: string): void;
}

/* logger interface */
export type EzdLogger = {
  info: EzdLogFn;
  warn: EzdLogFn;
  error: EzdLogFn;
  fatal: EzdLogFn;
} & {};
