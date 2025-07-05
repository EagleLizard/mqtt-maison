
import type { Stats } from 'node:fs';
import fs from 'node:fs';

import { prim } from './validate-primitives';

export const files = {
  checkDir,
  mkdirIfNotExist,
} as const;

function checkDir(dirPath: string): boolean {
  let stats: Stats;
  try {
    stats = fs.statSync(dirPath);
  } catch(e) {
    if(prim.isObject(e) && e.code === 'ENOENT') {
      return false;
    } else {
      throw e;
    }
  }
  return stats.isDirectory();
}

function mkdirIfNotExist(dirPath: string): string | undefined {
  let dirExists = checkDir(dirPath);
  if(dirExists) {
    return;
  }
  let res = fs.mkdirSync(dirPath, { recursive: true });
  return res;
}
