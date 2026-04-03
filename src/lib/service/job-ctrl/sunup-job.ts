
/*
  Stubbing notes on testing in light of the suncalc issues
    simulate running jobs for every day of the year, starting at 2026-1-1
_*/

import { ezdConfig } from '../../../config';
import { JobRepo } from '../../db/jobs-db/job-repo';
import { logger } from '../../logger/logger';
import { MnJob } from '../../models/jobs/mn-job';
import { MqttCtx } from '../../models/mqtt-ctx';
import { dtUtil } from '../../util/dt-util';
import { sol } from '../../util/sol';
import { z2mCtrl } from '../z2m-ctrl';

export class SunupJob {
  private _jobRepo: JobRepo;
  private constructor(jobRepo: JobRepo) {
    this._jobRepo = jobRepo;
  }
  static init(jobRepo: JobRepo): SunupJob {
    return new SunupJob(jobRepo);
  }
  async run(ctx: MqttCtx, job: MnJob) {
    let runAt = new Date(job.run_at);
    let deltaMs = Date.now() - runAt.valueOf();
    if(ezdConfig.skipSunup) {
      ctx.logger.info(`Skipping '${job.job_type}' job based on config val.`);
    } else if(deltaMs < (dtUtil.hour_ms * 7)) {
      /* don't do old jobs _*/
      let suDevices = ctx.z2mDeviceService.getDevicesByTag('sunup');
      await Promise.all(suDevices.map(device => {
        return z2mCtrl.setBinaryState(ctx, device, 'OFF');
      }));
    } else {
      ctx.logger.info(`Skipping stale '${job.job_type}' job from ${dtUtil.tzIso(runAt)}, run_at is ${deltaMs}ms ago`);
    }
    /* queue next _*/
    let d = new Date();
    d.setDate(d.getDate() + 1);
    this.enqueue(d);
  }
  enqueue(d: Date) {
    let sunupJob = this._jobRepo.getSunupJob(d);
    if(sunupJob !== undefined) {
      return;
    }
    let sunupTs = sol.getSunup(d);
    logger.info(`queueing sunup job for ${dtUtil.tzIso(sunupTs)}`);
    this._jobRepo.enqueue('sunup', sunupTs);
  }
}
