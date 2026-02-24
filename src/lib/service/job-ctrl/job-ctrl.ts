
import fs from 'node:fs';
import path from 'node:path';

import { DB_DIR_PATH, DATA_DIR_PATH } from '../../../constants';
import { SqliteClient } from '../../db/sqlite-client';
import { sleep } from '../../util/sleep';
import { EzdError } from '../../models/error/ezd-error';
import { MnJob } from '../../models/jobs/mn-job';
import { logger } from '../../logger/logger';
import { solar } from '../../util/solar';
import { MqttCtx } from '../../models/mqtt-ctx';
import { maisonConfig } from '../../config/maison-config';
import { z2mCtrl } from '../z2m-ctrl';
import { JobRepo } from '../../db/jobs-db/job-repo';

/*
  Simple job scheduler

  Run in a loop at some interval and check if any jobs should be executed
_*/

const jobs_db_file_path = [
  DATA_DIR_PATH,
  'jobs.db',
].join(path.sep);
const jobs_db_init_script_path = [
  DB_DIR_PATH,
  'init-jobs.sql',
].join(path.sep);

const sunDevices = maisonConfig.maison_devices.filter(device => {
  return device.groups?.includes('solar');
});

let sqlClient: SqliteClient;
let jobRepo: JobRepo;

(function _init() {
  /*
  !!! depends on being sync to initialize once on module import
  _*/
  sqlClient = SqliteClient.init({
    filename: jobs_db_file_path,
    fileMustExist: false,
  });
  let initScriptData = fs.readFileSync(jobs_db_init_script_path);
  sqlClient.exec(initScriptData.toString());

  jobRepo = JobRepo.init({
    sqlClient: sqlClient,
  });
})();

export const JobCtrl = {
  run: run,
} as const;

function run(ctx: MqttCtx) {
  checkDailyJobs();
  /* loop _*/
  (function loop() {
    setTimeout(() => {
      _run();
      loop();
    }, 500);
  })();
  async function _run() {
    let job = jobRepo.dequeue();
    if(job !== undefined) {
      await execJob(ctx, job);
    }
  }
}

function checkDailyJobs() {
  let today = new Date();
  today.setHours(0,0,0,0);
  let todaysJob = jobRepo.getOnceDailyJob(today);
  if(todaysJob === undefined) {
    logger.warn('no daily job found for today');
    jobRepo.enqueue('daily', today);
  }
}

function completeJob(job: MnJob) {
  jobRepo.completeJob(job);
  logger.info(`Completed '${job.job_type}' job ${job.id}`);
}
function failJob(job: MnJob, reason: string, code: string) {
  jobRepo.failJob(job);
  logger.error(new EzdError(reason, code));
}

async function execJob(ctx: MqttCtx, job: MnJob) {
  try {
    await doJob(ctx, job);
  } catch(e) {
    if(e instanceof EzdError) {
      failJob(job, e.message, e.code);
    } else if(e instanceof Error) {
      failJob(job, e.message, 'JB_0.3');
    } else {
      failJob(job, 'Job failed to to an unexpected error', 'JB_0.4');
    }
  } finally {
    /* should only complete non-failed jobs _*/
    completeJob(job);
  }
}
async function doJob(ctx: MqttCtx, job: MnJob) {
  switch(job.job_type) {
    case 'test':
      await doTestJob(ctx, job);
      break;
    case 'daily':
      await doDailyJob(ctx, job);
      break;
    case 'sunup':
      await doSunupJob(ctx, job);
      break;
    case 'sundown':
      await doSundownJob(ctx, job);
      break;
    default:
      throw new EzdError('invalid job type', 'JB_0.2');
  }
}

async function doDailyJob(ctx: MqttCtx, job: MnJob) {
  let now = new Date;
  let d = new Date(now.valueOf());
  d.setHours(0, 0, 0, 0);
  let d2 = new Date(d.valueOf());
  d2.setDate(d.getDate() + 1);

  let sunupD = new Date(now.valueOf());
  sunupD.setHours(4, 0, 0, 0);
  queueSunup(sunupD);
  let sundownD = new Date(now.valueOf());
  sundownD.setHours(12, 0, 0, 0);
  queueSundown(sundownD);

  /* --- _*/
  let nextDailyJob = jobRepo.getOnceDailyJob(d2);
  if(nextDailyJob === undefined) {
    jobRepo.enqueue('daily', d2);
  }
}
function queueSunup(d: Date) {
  let sunupTs = solar.getSunup(d);
  if(sunupTs < d) {
    let d2 = new Date(d.valueOf());
    d2.setDate(d.getDate() + 1);
    d = d2;
    sunupTs = solar.getSunup(d2);
  }
  let sunupJob = jobRepo.getSunupJob(d);
  if(sunupJob !== undefined) {
    return;
  }
  jobRepo.enqueue('sunup', sunupTs);
}
function queueSundown(d: Date) {
  let sundownTs = solar.getSundown(d);
  if(sundownTs < d) {
    let d2 = new Date(d.valueOf());
    d2.setDate(d.getDate() + 1);
    d = d2;
    sundownTs = solar.getSundown(d2);
  }
  let sundownJob = jobRepo.getSundownJob(d);
  if(sundownJob !== undefined) {
    return;
  }
  jobRepo.enqueue('sundown', sundownTs);
}

async function doSunupJob(ctx: MqttCtx, job: MnJob) {
  await Promise.all(sunDevices.map(device => {
    return z2mCtrl.setBinaryState(ctx, device, 'OFF');
  }));
  /* queue next _*/
  let d = new Date(job.run_at);
  d.setDate(d.getDate() + 1);
  /*
    set to 4am because suncalc returns wrong results for some times of day
      https://github.com/mourner/suncalc/issues/161#issuecomment-2054134528
    At the time of writing this, the lowest value for setHours is:
      d.setHours(1, 0, 0, 0);
  _*/
  d.setHours(4, 0, 0, 0);
  queueSunup(d);
}

async function doSundownJob(ctx: MqttCtx, job: MnJob) {
  let devicePromises = sunDevices.map(device => {
    return z2mCtrl.setBinaryState(ctx, device, 'ON');
  });
  await Promise.all(devicePromises);
  /* queue next */
  let d = new Date(job.run_at);
  d.setDate(d.getDate() + 1);
  /*
    set to noon because suncalc returns wrong results for some times of day
      https://github.com/mourner/suncalc/issues/161#issuecomment-2054134528
    At the time of writing this, the lowest value for setHours is:
      d.setHours(1, 0, 0, 0);
  _*/
  d.setHours(12, 0, 0, 0);
  queueSundown(d);
}

async function doTestJob(ctx: MqttCtx, job: MnJob) {
  await sleep(500);
  // logger.info(`Completed '${job.job_type}' job ${job.id}`);
  jobRepo.enqueue('test', new Date(Date.now() + 10_000));
  let devicePromises: Promise<void>[] = [];
  for(let i = 0; i < sunDevices.length; i++) {
    let device = sunDevices[i];
    let p = z2mCtrl.getBinaryState(ctx, device).then(state => {
      if(state === 'ON') {
        return z2mCtrl.setBinaryState(ctx, device, 'OFF');
      } else {
        return z2mCtrl.setBinaryState(ctx, device, 'ON');
      }
    });
    devicePromises.push(p);
  }
  await Promise.all(devicePromises);
}
