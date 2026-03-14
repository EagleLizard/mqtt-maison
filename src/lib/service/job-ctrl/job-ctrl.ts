
import fs from 'node:fs';
import path from 'node:path';

import { DB_DIR_PATH, DATA_DIR_PATH } from '../../../constants';
import { SqliteClient } from '../../db/sqlite-client';
import { EzdError } from '../../models/error/ezd-error';
import { MnJob } from '../../models/jobs/mn-job';
import { sol } from '../../util/sol';
import { MqttCtx } from '../../models/mqtt-ctx';
import { maisonConfig } from '../../config/maison-config';
import { z2mCtrl } from '../z2m-ctrl';
import { JobRepo } from '../../db/jobs-db/job-repo';
import { SunupJob } from './sunup-job';
import { SundownJob } from './sundown-job';
import { ezdConfig } from '../../../config';

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

let sqlClient: SqliteClient;
let jobRepo: JobRepo;
let sunupJob: SunupJob;
let sundownJob: SundownJob;

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
  sunupJob = SunupJob.init(jobRepo);
  sundownJob = SundownJob.init(jobRepo);
})();

export const JobCtrl = {
  run: run,
  enqueue: enqueue
} as const;

function enqueue(jobType: string, runAt = new Date()): MnJob {
  return jobRepo.enqueue(jobType, runAt);
}

function run(ctx: MqttCtx) {
  _dbg(ctx);
  checkDailyJobs(ctx);
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

function _dbg(ctx: MqttCtx) {
  if(!ezdConfig.isDevEnv()) {
    return;
  }
  ctx.logger.debug('!!! _dbg() !!!');

  let d = new Date();
  d.setHours(0,0,0,0);
  let d2 = new Date(d.valueOf());
  d2.setDate(d.getDate() + 1);
  console.log(sqlClient.run(`
    delete from jobs
      where id in (
        select id from jobs
          where run_at >= ?
            and run_at < ?
            and (
              job_type = 'daily'
              or job_type = 'sundown'
              or job_type = 'sunup'
            )
      )
  `, [
    d.toISOString(),
    d2.toISOString(),
  ]));
}

function checkDailyJobs(ctx: MqttCtx) {
  let today = new Date();
  today.setHours(0,0,0,0);
  let todaysJob = jobRepo.getOnceDailyJob(today);
  if(todaysJob === undefined) {
    ctx.logger.warn('no daily job found for today');
    JobCtrl.enqueue('daily', today);
  }
}

function completeJob(ctx: MqttCtx, job: MnJob) {
  jobRepo.completeJob(job);
  ctx.logger.info(`Completed '${job.job_type}' job ${job.id}`);
}
function failJob(ctx: MqttCtx, job: MnJob, reason: string, code: string) {
  jobRepo.failJob(job);
  ctx.logger.error(new EzdError(reason, code));
}

async function execJob(ctx: MqttCtx, job: MnJob) {
  try {
    await doJob(ctx, job);
  } catch(e) {
    if(e instanceof EzdError) {
      failJob(ctx, job, e.message, e.code);
    } else if(e instanceof Error) {
      failJob(ctx, job, e.message, 'JB_0.3');
    } else {
      failJob(ctx, job, 'Job failed to to an unexpected error', 'JB_0.4');
    }
  } finally {
    /* should only complete non-failed jobs _*/
    completeJob(ctx, job);
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
      await sunupJob.run(ctx, job);
      break;
    case 'sundown':
      await sundownJob.run(ctx, job);
      break;
    default:
      throw new EzdError('invalid job type', 'JB_0.2');
  }
}

async function doDailyJob(ctx: MqttCtx, job: MnJob) {
  let now = new Date();
  sunupJob.enqueue(now);
  sundownJob.enqueue(now);
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
