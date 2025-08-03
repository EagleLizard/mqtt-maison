
import path from 'node:path';

export const BASE_DIR = path.resolve(__dirname, '..');

const LOG_DIR_NAME = 'logs';
export const LOG_DIR_PATH = [
  BASE_DIR,
  LOG_DIR_NAME,
].join(path.sep);
export const APP_LOGGER_NAME = 'app';
export const LOG_FILE_EXT = 'log';

const DATA_DIR_NAME = 'data';
export const DATA_DIR_PATH = [
  BASE_DIR,
  DATA_DIR_NAME,
].join(path.sep);

export const EZD_DB_FILE_NAME = 'ezd.db';

const CONFIG_DIR_NAME = 'config';
export const CONFIG_DIR_PATH = [
  BASE_DIR,
  CONFIG_DIR_NAME,
].join(path.sep);

export const MAISON_DEVICES_DEF_FILE_NAME = 'devices.json';
