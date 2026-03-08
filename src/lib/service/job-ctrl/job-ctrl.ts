
import fs from 'node:fs';
import path from 'node:path';

import { DB_DIR_PATH, DATA_DIR_PATH } from '../../../constants';
import { SqliteClient } from '../../db/sqlite-client';
import { EzdError } from '../../models/error/ezd-error';
import { MnJob } from '../../models/jobs/mn-job';
import { logger } from '../../logger/logger';
import { sol } from '../../util/sol';
import { MqttCtx } from '../../models/mqtt-ctx';
import { maisonConfig } from '../../config/maison-config';
import { z2mCtrl } from '../z2m-ctrl';
import { JobRepo } from '../../db/jobs-db/job-repo';
import { dtUtil } from '../../util/dt-util';

const hour_ms = dtUtil.hour_ms;

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
  enqueue: enqueue
} as const;

function enqueue(jobType: string, runAt = new Date()): MnJob {
  return jobRepo.enqueue(jobType, runAt);
}

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
    JobCtrl.enqueue('daily', today);
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
  let now = new Date();
  initSunJobs(now);
}

function initSunJobs(d = new Date()) {
  let sunup = sol.getSunup(d);
  if(d <= sunup) {
    queueSunup(d);
    return;
  }
  // sunup in the past
  let sundown = sol.getSundown(d);
  if(d <= sundown) {
    queueSundown(d);
    return;
  }
}

function queueSunup(d: Date) {
  let sunupJob = jobRepo.getSunupJob(d);
  if(sunupJob !== undefined) {
    return;
  }
  let sunupTs = sol.getSunup(d);
  logger.info(`queueing sunup job for ${dtUtil.tzIso(sunupTs)}`);
  jobRepo.enqueue('sunup', sunupTs);
}
function queueSundown(d: Date) {
  let sundownJob = jobRepo.getSundownJob(d);
  if(sundownJob !== undefined) {
    return;
  }
  let sundownTs = sol.getSundown(d);
  logger.info(`queueing sundown job for ${dtUtil.tzIso(sundownTs)}`);
  jobRepo.enqueue('sundown', sundownTs);
}

async function doSunupJob(ctx: MqttCtx, job: MnJob) {
  let runAt = new Date(job.run_at);
  let deltaMs = Date.now() - runAt.valueOf();
  /* don't do old jobs _*/
  if(deltaMs < (hour_ms * 7)) {
    let suDevices = ctx.z2mDeviceService.getDevicesByGroup('sunup');
    await Promise.all(suDevices.map(device => {
      return z2mCtrl.setBinaryState(ctx, device, 'OFF');
    }));
  } else {
    ctx.logger.info(`Skipping stale '${job.job_type}' job from ${dtUtil.tzIso(runAt)}, run_at is ${deltaMs}ms ago`);
  }
  /* queue next _*/
  queueSundown(new Date());
}

async function doSundownJob(ctx: MqttCtx, job: MnJob) {
  let runAt = new Date(job.run_at);
  let deltaMs = Date.now() - runAt.valueOf();
  /* don't do old jobs _*/
  if(deltaMs < (hour_ms * 3)) {
    let sdDevices = ctx.z2mDeviceService.getDevicesByGroup('sundown');
    let devicePromises = sdDevices.map(device => {
      return z2mCtrl.setBinaryState(ctx, device, 'ON');
    });
    await Promise.all(devicePromises);
  } else {
    ctx.logger.info(`Skipping stale '${job.job_type}' job from ${dtUtil.tzIso(runAt)}, run_at is ${deltaMs}ms ago`);
  }
  /* queue next */
  let d = new Date();
  d.setDate(d.getDate() + 1);
  queueSunup(d);
}

async function doTestJob(ctx: MqttCtx, job: MnJob) {
  const testDevices = maisonConfig.maison_devices.filter(device => {
    return device.name === 'plum';
  });
  JobCtrl.enqueue('test', new Date(Date.now() + 2_000));
  let devicePromises: Promise<void>[] = [];
  for(let i = 0; i < testDevices.length; i++) {
    let device = testDevices[i];
    let p = z2mCtrl.getBinaryState(ctx, device).then(state => {
      let targetState = state === 'ON' ? 'OFF' : 'ON';
      return z2mCtrl.setBinaryState(ctx, device, targetState).then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      });
    });
    devicePromises.push(p);
  }
  await Promise.all(devicePromises);
}
