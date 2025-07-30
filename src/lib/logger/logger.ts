
import pino from 'pino';
import {
  APP_LOGGER_NAME,
  LOG_DIR_PATH,
  LOG_FILE_EXT,
} from '../../constants';
import path from 'node:path';
import { ezdConfig } from '../../config';
import { files } from '../util/files';

const dev_env = ezdConfig.isDevEnv();

const level = (dev_env)
  ? 'debug'
  : 'info'
;

/*
  Base application logger for general purpose.
_*/
export const logger = initLogger();

function initLogger(): pino.Logger {
  let logger: pino.Logger;
  let opts: pino.LoggerOptions;
  let streams: pino.StreamEntry[];
  let multistreamOpts: pino.MultiStreamOptions;
  let stream: pino.MultiStreamRes;
  let logFileName: string;
  let errorLogFileName: string;
  let logFilePath: string;
  let errorLogFilePath: string;
  let logStream: pino.DestinationStream;
  let errorLogStream: pino.DestinationStream;

  files.mkdirIfNotExist(LOG_DIR_PATH);

  logFileName = `${APP_LOGGER_NAME}.${LOG_FILE_EXT}`;
  errorLogFileName = `${APP_LOGGER_NAME}.error.${LOG_FILE_EXT}`;
  logFilePath = [
    LOG_DIR_PATH,
    logFileName,
  ].join(path.sep);
  errorLogFilePath = [
    LOG_DIR_PATH,
    errorLogFileName,
  ].join(path.sep);
  logStream = pino.transport({
    target: 'pino/file',
    options: {
      destination: logFilePath,
    },
  });
  errorLogStream = pino.transport({
    target: 'pino/file',
    options: {
      destination: errorLogFilePath,
    },
  });
  streams = [
    { level: 'error', stream: errorLogStream },
    { level: level, stream: logStream },
  ];
  if(dev_env) {
    streams.push({ level: level, stream: process.stdout });
  }
  multistreamOpts = {
    // dedupe: true // send logs only to the stream with the higher level
  };
  stream = pino.multistream(streams, multistreamOpts);
  opts = {
    level,
    formatters: {
      level: (label) => {
        if(label === 'debug') {
          label = label.toLocaleUpperCase();
        }
        return {
          level: label,
        };
      },
      bindings: (bindings) => {
        return {
          pid: bindings.pid,
          // host: bindings.hostname,
        };
      }
    },
    /* TODO: I want this to print local time with timezone _*/
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  logger = pino(opts, stream);
  return logger;
}
