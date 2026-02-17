
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
})();

export const JobCtrl = {
  run: run,
  enqueue: enqueue,
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
    let job = dequeue();
    if(job !== undefined) {
      await execJob(ctx, job);
    }
  }
}

function checkDailyJobs() {
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  let tomorrow = new Date(today.valueOf());
  tomorrow.setDate(today.getDate() + 1);
  sqlClient.run(`
    delete from jobs
      where job_type = 'daily'
  `);
  let todaysJob = sqlClient.get(`
    select * from jobs j
      where j.job_type = 'daily'
        and j.run_at >= ?
        and j.run_at < ?
      limit 1
  `, [
    today.toISOString(),
    tomorrow.toISOString(),
  ]);
  if(todaysJob === undefined) {
    logger.warn('no daily job found for today');
    JobCtrl.enqueue('daily', today);
  }
}

function enqueue(jobType = 'test', runAt = new Date()) {
  sqlClient.run(`
    insert into jobs (job_type, run_at) values (@jobType, @runAt)
  `, {
    jobType: jobType,
    runAt: runAt.toISOString(),
  });
}

function dequeue() {
  let txnFn = sqlClient.transaction(() => {
    let rawJob = sqlClient.get(`
      select * from jobs j
        where j.status = 'pending'
        and run_at <= @timestamp
      order by j.run_at
      limit 1
    `, {
      timestamp: (new Date()).toISOString()
    });
    if(rawJob === undefined) {
      return;
    }
    let job = MnJob.decode(rawJob);
    let updateRes = sqlClient.run(`
      update jobs
          set status = 'in_progress',
            modified_at = CURRENT_TIMESTAMP
        where id = @jobId
          and status = 'pending'
    `, {
      jobId: job.id
    });
    if(updateRes.changes !== 1) {
      throw new EzdError(`error updating job ${job.id}`, 'JB_0.1');
    }
    return job;
  });
  let job: MnJob | undefined;
  try {
    job = txnFn();
  } catch(e) {
    if(!(e instanceof EzdError) || e.code !== 'JB_0.1') {
      throw e;
    }
    console.error(e);
  }
  return job;
}

function completeJob(job: MnJob) {
  sqlClient.run(`
    update jobs
      set status = 'done',
        modified_at = CURRENT_TIMESTAMP
    where id = @jobId
      and status = 'in_progress'
  `, {
    jobId: job.id,
  });
  logger.info(`Completed '${job.job_type}' job ${job.id}`);
}
function failJob(job: MnJob, reason: string, code: string) {
  sqlClient.run(`
    update jobs
      set status = 'failed',
        modified_at = CURRENT_TIMESTAMP
    where id = @jobId
      -- and status = 'in_progress'
  `, {
    jobId: job.id,
  });
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
  queueSunup(now);
  queueSundown(now);
  /* --- _*/
  let d3 = new Date(d2.valueOf());
  d3.setDate(d2.getDate() + 1);
  let rawNextDailyJob = sqlClient.get(`
    select * from jobs j
      where j.job_type = 'daily'
        and j.run_at >= ?
        and j.run_at <= ?
    limit 1
  `, [
    d2.toISOString(),
    d3.toISOString(),
  ]);
  if(rawNextDailyJob === undefined) {
    JobCtrl.enqueue('daily', d2);
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
  let dMin = new Date(d.valueOf());
  dMin.setHours(0, 0, 0, 0);
  let dMax = new Date(dMin.valueOf());
  dMax.setDate(dMin.getDate() + 1);
  let rawSunupJob = sqlClient.get(`
    select * from jobs j
      where j.job_type = 'sunup'
       and j.run_at > ?
       and j.run_at < ?
      order by j.run_at
    limit 1
  `, [
    dMin.toISOString(),
    dMax.toISOString(),
  ]);
  if(rawSunupJob !== undefined) {
    return;
  }
  JobCtrl.enqueue('sunup', sunupTs);
}
function queueSundown(d: Date) {
  let sundownTs = solar.getSundown(d);
  if(sundownTs < d) {
    let d2 = new Date(d.valueOf());
    d2.setDate(d.getDate() + 1);
    d = d2;
    sundownTs = solar.getSundown(d2);
  }
  let dMin = new Date(d.valueOf());
  dMin.setHours(0, 0, 0, 0);
  let dMax = new Date(dMin.valueOf());
  dMax.setDate(dMin.getDate() + 1);
  let rawSundownJob = sqlClient.get(`
    select * from jobs j
      where j.job_type = 'sundown'
        and j.run_at > ?
        and j.run_at < ?
      order by j.run_at
    limit 1
  `, [
    dMin.toISOString(),
    dMax.toISOString(),
  ]);
  if(rawSundownJob !== undefined) {
    return;
  }
  JobCtrl.enqueue('sundown', sundownTs);
}

async function doSunupJob(ctx: MqttCtx, job: MnJob) {
  await Promise.all(sunDevices.map(device => {
    return z2mCtrl.setBinaryState(ctx, device, 'OFF');
  }));
  /* queue next _*/
  let d = new Date();
  d.setDate(d.getDate() + 1);
  queueSunup(d);
}

async function doSundownJob(ctx: MqttCtx, job: MnJob) {
  let devicePromises = sunDevices.map(device => {
    return z2mCtrl.setBinaryState(ctx, device, 'ON');
  });
  await Promise.all(devicePromises);
  /* queue next */
  let d = new Date();
  d.setDate(d.getDate() + 1);
  queueSundown(d);
}

async function doTestJob(ctx: MqttCtx, job: MnJob) {
  await sleep(500);
  // logger.info(`Completed '${job.job_type}' job ${job.id}`);
  enqueue('test', new Date(Date.now() + 10_000));
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
