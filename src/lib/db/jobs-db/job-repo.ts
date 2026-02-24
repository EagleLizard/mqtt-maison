import { EzdError } from '../../models/error/ezd-error';
import { MnJob } from '../../models/jobs/mn-job';
import { ISqliteClient } from '../sqlite-client';

export type JobRepo = ReturnType<typeof JobRepo['init']>;
export const JobRepo = {
  init: initJobRepo,
} as const;

type InitJobRepoOpts = {
  sqlClient: ISqliteClient;
} & {};
function initJobRepo(opts: InitJobRepoOpts) {
  const sqlClient = opts.sqlClient;

  const jobRepo = {
    completeJob: completeJob,
    failJob: failJob,
    getOnceDailyJob: getOnceDailyJob,
    getSunupJob: getSunupJob,
    getSundownJob: getSundownJob,
    enqueue: enqueue,
    dequeue: dequeue,
  } as const;
  return jobRepo;
  /* --- _*/

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
  }

  function failJob(job: MnJob) {
    sqlClient.run(`
      update jobs
        set status = 'failed',
          modified_at = CURRENT_TIMESTAMP
      where id = @jobId
        -- and status = 'in_progress'
    `, {
      jobId: job.id,
    });
  }

  function getOnceDailyJob(d: Date): MnJob | undefined {
    return _getDailyJob(d, 'daily');
  }

  function getSunupJob(d: Date): MnJob | undefined {
    return _getDailyJob(d, 'sunup');
  }

  function getSundownJob(d: Date): MnJob | undefined {
    return _getDailyJob(d, 'sundown');
  }

  function _getDailyJob(d: Date, jobType: string): MnJob | undefined {
    let dMin = new Date(d.valueOf());
    dMin.setHours(0, 0, 0, 0);
    let dMax = new Date(dMin.valueOf());
    dMax.setDate(dMin.getDate() + 1);
    let rawJob = sqlClient.get(`
      select * from jobs j
        where j.job_type = ?
          and j.run_at >= ?
          and j.run_at < ?
        order by j.run_at
      limit 1
    `, [
      jobType,
      dMin.toISOString(),
      dMax.toISOString(),
    ]);
    if(rawJob === undefined) {
      return;
    }
    let job = MnJob.decode(rawJob);
    return job;
  }

  function enqueue(jobType: string, runAt = new Date()) {
    sqlClient.run(`
      insert into jobs (job_type, run_at) values (@jobType, @runAt)
    `, {
      jobType: jobType,
      runAt: runAt.toISOString(),
    });
  }

  function dequeue(): MnJob | undefined {
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
}
