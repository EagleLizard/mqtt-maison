
import path from 'node:path';

export const BASE_DIR = path.resolve(__dirname, '..');

const LOG_DIR_NAME = 'logs';
export const LOG_DIR_PATH = [
  BASE_DIR,
  LOG_DIR_NAME,
].join(path.sep);
export const APP_LOGGER_NAME = 'app';
export const LOG_FILE_EXT = 'log';
