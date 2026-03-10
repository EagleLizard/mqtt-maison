
import { JobRepo } from '../../db/jobs-db/job-repo';
import { logger } from '../../logger/logger';
import { MnJob } from '../../models/jobs/mn-job';
import { MqttCtx } from '../../models/mqtt-ctx';
import { dtUtil } from '../../util/dt-util';
import { sol } from '../../util/sol';
import { z2mCtrl } from '../z2m-ctrl';

export class SundownJob {
  private _jobRepo: JobRepo;
  private constructor(jobRepo: JobRepo) {
    this._jobRepo = jobRepo;
  }
  static init(jobRepo: JobRepo): SundownJob {
    return new SundownJob(jobRepo);
  }
  async run(ctx: MqttCtx, job: MnJob) {
    let runAt = new Date(job.run_at);
    let deltaMs = Date.now() - runAt.valueOf();
    /* don't do old jobs _*/
    if(deltaMs < (dtUtil.hour_ms * 3)) {
      let sdDevices = ctx.z2mDeviceService.getDevicesByTag('sundown');
      let devicePromises = sdDevices.map(device => {
        return z2mCtrl.setBinaryState(ctx, device, 'ON');
      });
      await Promise.all(devicePromises);
    } else {
      ctx.logger.info(`Skipping stale '${job.job_type}' job from ${dtUtil.tzIso(runAt)}, run_at is ${deltaMs}ms ago`);
    }
    /* queue next _*/
    let d = new Date();
    d.setDate(d.getDate() + 1);
    this.enqueue(d);
  }
  enqueue(d: Date) {
    let sundownJob = this._jobRepo.getSundownJob(d);
    if(sundownJob !== undefined) {
      return;
    }
    let sundownTs = sol.getSundown(d);
    logger.info(`queueing sundown job for ${dtUtil.tzIso(sundownTs)}`);
    this._jobRepo.enqueue('sundown', sundownTs);
  }
}
