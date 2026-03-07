
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { MaisonAction } from '../../lib/models/maison-actions';
import { MaisonDeviceDef } from '../../lib/models/maison-device';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { z2mCtrl } from '../../lib/service/z2m-ctrl';
import { sleep } from '../../lib/util/sleep';
import { MqttMsgEvt } from './msg-router';

type MaisonCtrlCtorOpts = {
  deviceDefs: MaisonDeviceDef[];
};

export class MaisonCtrl {

  private deviceDefs: MaisonDeviceDef[];
  private actionMainDeviceDefs: MaisonDeviceDef[];
  private etcLightDeviceDefs: MaisonDeviceDef[];
  private selectedDeviceIdx: number;

  private inProgressMap: Partial<Record<MaisonAction, boolean>>;
  private msgHandlerMap: Map<MaisonAction, (ctx: MqttCtx) => Promise<void>>;

  static readonly blink_delay_ms = 300;
  static readonly blink_count = 2;

  private constructor(opts: MaisonCtrlCtorOpts) {
    this.deviceDefs = opts.deviceDefs;
    this.actionMainDeviceDefs = this.deviceDefs.filter((device) => {
      return device.groups?.includes('action_main');
    });
    this.etcLightDeviceDefs = this.deviceDefs.filter((device) => {
      return device.groups?.includes('etc_lights');
    });
    this.selectedDeviceIdx = 0;
    this.inProgressMap = {};
    this.msgHandlerMap = this.initMsgHandlers();
  }

  private initMsgHandlers(): MaisonCtrl['msgHandlerMap'] {
    let msgHandlerMap: MaisonCtrl['msgHandlerMap'] = new Map();
    let msgHandlerTuples: [MaisonAction, (ctx: MqttCtx) => Promise<void>][] = [
      [ 'main', this.handleMain ],
      [ 'up', this.handleUp ],
      [ 'down', this.handleDown ],
      [ 'dot', this.handleDot ],
      [ 'dot_double', this.handleDotDouble ],
      [ 'dots', this.handleDots ],
      [ 'dots_double', this.handleDotsDouble ],
      [ 'next', this.handleNext ],
      [ 'prev', this.handlePrev ],
    ];
    msgHandlerTuples.forEach(([ action, handleFn ]) => {
      msgHandlerMap.set(action, handleFn.bind(this));
    });
    return msgHandlerMap;
  }

  async handleMsg(ctx: MqttCtx, evt: MqttMsgEvt) {
    let payload = MaisonActionPayload.parse(evt.payload);
    let startMs = Date.now();
    let msgDob = new Date(payload.dob);
    let msgAgeMs = startMs - msgDob.valueOf();
    ctx.logger.info(`[start] maisonCtrl.handleMsg() | ${evt.topic}: ${payload.action} | age: ${msgAgeMs}ms`);
    let msgFn = this.msgHandlerMap.get(payload.action);
    if(msgFn === undefined) {
      ctx.logger.info(`unhandled action ${evt.topic}: '${payload.action}'`);
    }
    await msgFn?.(ctx);
    let endMs = Date.now();
    /*
      This exists here to debug cases where the handler hangs and never resolves.
        Any async operations should either resolve / reject or timeout.
    _*/
    ctx.logger.info(`[end] maisonCtrl.handleMsg() | ${evt.topic}: ${payload.action} | ${endMs - startMs}ms`);
  }

  private async handleMain(ctx: MqttCtx) {
    if(this.inProgressMap['main'] === true) {
      ctx.logger.debug('handleMain() - in progress');
      return;
    }
    this.inProgressMap['main'] = true;
    try {
      await actionMain(ctx, this.actionMainDeviceDefs);
    } finally {
      this.inProgressMap['main'] = false;
    }
  }
  private async handleUp(ctx: MqttCtx) {
    await actionUp(ctx, this.deviceDefs);
  }
  private async handleDown(ctx: MqttCtx) {
    await actionDown(ctx, this.deviceDefs);
  }
  private async handlePrev(ctx: MqttCtx) {
    await this.seekEtc(ctx, -1);
  }
  private async handleNext(ctx: MqttCtx) {
    await this.seekEtc(ctx, 1);
  }
  /*
    -1 or 1
  _*/
  private async seekEtc(ctx: MqttCtx, seekDir: number) {
    let incVal: number;
    let selectedDevice: MaisonDeviceDef | undefined;
    if(seekDir > 0) {
      incVal = 1;
    } else if (seekDir < 0) {
      incVal = -1;
    } else {
      throw new Error(`Invalid seekDir val: ${seekDir}`);
    }
    let nextIdx = this.selectedDeviceIdx + incVal;
    if(nextIdx >= this.etcLightDeviceDefs.length) {
      /* overflow to first */
      nextIdx = 0;
    } else if(nextIdx < 0) {{
      /* underflow to last */
      nextIdx = this.etcLightDeviceDefs.length - 1;
    }}
    this.selectedDeviceIdx = nextIdx;
    selectedDevice = this.etcLightDeviceDefs[this.selectedDeviceIdx];
    if(selectedDevice === undefined) {
      /* TODO: error, invalid index */
      return;
    }
    await blinkBinaryDevice(ctx, selectedDevice, MaisonCtrl.blink_count);
  }

  private async handleDot(ctx: MqttCtx) {
    console.log('dot');
  }
  private async handleDotDouble(ctx: MqttCtx) {
    await actionMain(ctx, this.etcLightDeviceDefs);
  }

  private async handleDots(ctx: MqttCtx) {
    let selectedDevice: MaisonDeviceDef | undefined;
    selectedDevice = this.etcLightDeviceDefs[this.selectedDeviceIdx];
    if(selectedDevice === undefined) {
      /* TODO: error, invalid index */
      return;
    }
    /* blink the current light */
    await blinkBinaryDevice(ctx, selectedDevice, MaisonCtrl.blink_count);
  }
  private async handleDotsDouble(ctx: MqttCtx) {
    let selectedDevice: MaisonDeviceDef | undefined;
    selectedDevice = this.etcLightDeviceDefs[this.selectedDeviceIdx];
    if(selectedDevice === undefined) {
      /* TODO: error, invalid index */
      return;
    }
    await actionToggle(ctx, selectedDevice);
  }

  static init(opts: MaisonCtrlCtorOpts): MaisonCtrl {
    return new MaisonCtrl(opts);
  }
}

async function actionToggle(ctx: MqttCtx, device: MaisonDeviceDef): Promise<void> {
  let currState: string;
  currState = await z2mCtrl.getBinaryState(ctx, device);
  await toggleBinaryState(ctx, device, currState);
}

async function blinkBinaryDevice(
  ctx: MqttCtx,
  device: MaisonDeviceDef,
  numBlinks: number
): Promise<void> {
  let numToggles = numBlinks * 2;
  for(let i = 0; i < numToggles; i++) {
    let remainingDelayMs: number;
    let startMs = Date.now();
    let currState = await z2mCtrl.getBinaryState(ctx, device);
    await toggleBinaryState(ctx, device, currState);
    let elapsedMs = Date.now() - startMs;
    if((i < numToggles - 1) && elapsedMs < MaisonCtrl.blink_delay_ms) {
      /* wait for the remaining time */
      remainingDelayMs = MaisonCtrl.blink_delay_ms - elapsedMs;
      await sleep(remainingDelayMs);
    }
  }
}

async function actionUp(ctx: MqttCtx, devices: MaisonDeviceDef[]): Promise<void> {
  let targetState = 'ON';
  let upPromises = devices.map((device) => {
    return z2mCtrl.setBinaryState(ctx, device, targetState)
      .then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      });
  });
  await Promise.all(upPromises);
}
async function actionDown(ctx: MqttCtx, devices: MaisonDeviceDef[]): Promise<void> {
  let targetState = 'OFF';
  let downPromises = devices.map((device) => {
    return z2mCtrl.setBinaryState(ctx, device, targetState)
      .then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      });
  });
  await Promise.all(downPromises);
}

async function actionMain(ctx: MqttCtx, devices: MaisonDeviceDef[]) {
  let binStates = await Promise.all(
    devices.map((device) => {
      return z2mCtrl.getBinaryState(ctx, device);
    })
  );
  let synced = binStates.slice(1).every((binState) => {
    return binState === binStates[0];
  });
  if(!synced) {
    ctx.logger.warn('Devices out of sync');
  }
  let actPromises = devices.map((device, idx) => {
    let currState = synced
      ? binStates[idx]
      : binStates[0];
    return toggleBinaryState(ctx, device, currState);
  });
  await Promise.all(actPromises);
}

async function toggleBinaryState(
  ctx: MqttCtx,
  device: MaisonDeviceDef,
  currState: string
): Promise<void> {
  let targetState: string;
  if(currState === 'ON') {
    targetState = 'OFF';
  } else if(currState === 'OFF') {
    targetState = 'ON';
  } else {
    ctx.logger.error({
      deviceName: device.name,
      currState: currState,
    }, 'unrecognized state');
    throw new Error(`Unrecognized state ${currState} for device ${device.name}`);
  }
  await z2mCtrl.setBinaryState(ctx, device, targetState);
  await z2mCtrl.waitForBinaryState(ctx, device, targetState);
}
