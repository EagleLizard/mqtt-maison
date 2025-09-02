
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { MaisonAction } from '../../lib/models/maison-actions';
import { MaisonDeviceDef } from '../../lib/models/maison-device';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { z2mCtrl } from '../../lib/service/z2m-ctrl';
import { sleep } from '../../lib/util/sleep';
import { MqttMsgEvt } from './msg-router';

const action_main_device_names: string[] = [
  'croc',
  'rabbit',
];
const etc_light_device_names: string[] = [
  'sengled_light_1',
  'sengled_light_2',
  'sengled_led_strip',
];

/*
singleton for now
_*/
let ctrlInstance: MaisonCtrl | undefined;

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

  private constructor(opts: MaisonCtrlCtorOpts) {
    this.deviceDefs = opts.deviceDefs;
    this.actionMainDeviceDefs = this.deviceDefs.filter((device) => {
      return action_main_device_names.includes(device.name);
    });
    this.etcLightDeviceDefs = this.deviceDefs.filter((device) => {
      return etc_light_device_names.includes(device.name);
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
    let payload: MaisonActionPayload;
    let startMs: number;
    let endMs: number;
    let msgAgeMs: number;
    let msgDob: Date;
    // let msgHandlerMap: Partial<Record<MaisonAction, (ctx: MqttCtx) => Promise<void>>>;
    // let msgHandlerMap: Map<MaisonAction, (ctx: MqttCtx) => Promise<void>>;
    let msgFn: ((ctx: MqttCtx) => Promise<void>) | undefined;

    payload = MaisonActionPayload.parse(evt.payload);

    startMs = Date.now();
    msgDob = new Date(payload.dob);
    msgAgeMs = startMs - msgDob.valueOf();
    ctx.logger.info({
      topic: evt.topic,
      payload: payload,
    });
    // ctx.logger.debug({ action: payload.action, age: msgAgeMs });
    console.log(`age: ${msgAgeMs} ms`);
    // msgFn = this.msgHandlerMap[payload.action];
    msgFn = this.msgHandlerMap.get(payload.action);
    if(msgFn === undefined) {
      ctx.logger.info(`unhandled action ${evt.topic}: '${payload.action}'`);
    }
    if(msgFn !== undefined) {
      await msgFn(ctx);
    }
    endMs = Date.now();
    /*
      This exists here to debug cases where the handler hangs and never resolves.
        Any async operations should either resolve / reject or timeout.
    _*/
    ctx.logger.debug({
      log: {
        topic: evt.topic,
        payload: payload,
        elapsed: endMs - startMs,
      }
    }, 'END maisonCtrl.handleMsg()');
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
    let nextIdx: number;
    let selectedDevice: MaisonDeviceDef | undefined;
    if(seekDir > 0) {
      incVal = 1;
    } else if (seekDir < 0) {
      incVal = -1;
    } else {
      throw new Error(`Invalid seekDir val: ${seekDir}`);
    }
    nextIdx = this.selectedDeviceIdx + incVal;
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
    await blinkBinaryDevice(ctx, selectedDevice, 2);
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
    let numBlinks = 2;
    await blinkBinaryDevice(ctx, selectedDevice, numBlinks);
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

  static async init(opts: MaisonCtrlCtorOpts): Promise<MaisonCtrl> {
    if(ctrlInstance === undefined) {
      ctrlInstance = new MaisonCtrl(opts);
    }
    return ctrlInstance;
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
  // let currState = await z2mCtrl.getBinaryState(ctx, device);
  let toggleDelayMs = 200;
  for(let i = 0; i < numToggles; i++) {
    let startMs: number;
    let elapsedMs: number;
    let remainingDelayMs: number;
    startMs = Date.now();
    let currState = await z2mCtrl.getBinaryState(ctx, device);
    await toggleBinaryState(ctx, device, currState);
    elapsedMs = Date.now() - startMs;
    if((i < numToggles - 1) && elapsedMs < toggleDelayMs) {
      /* wait for the remaining time */
      remainingDelayMs = toggleDelayMs - elapsedMs;
      console.log(`remainingDelayMs: ${remainingDelayMs} ms`);
      await sleep(remainingDelayMs);
    }
  }
}

async function actionUp(ctx: MqttCtx, devices: MaisonDeviceDef[]): Promise<void> {
  let upPromises: Promise<void>[];
  let targetState: string;
  upPromises = [];
  targetState = 'ON';
  for(let i = 0; i < devices.length; i++) {
    let device = devices[i];
    let upPromise = z2mCtrl.setBinaryState(ctx, device, targetState)
      .then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      });
    upPromises.push(upPromise);
  }
  await Promise.all(upPromises);
}
async function actionDown(ctx: MqttCtx, devices: MaisonDeviceDef[]): Promise<void> {
  let downPromises: Promise<void>[];
  let targetState: string;
  downPromises = [];
  targetState = 'OFF';
  for(let i = 0; i < devices.length; i++) {
    let device = devices[i];
    let downPromise = z2mCtrl.setBinaryState(ctx, device, targetState)
      .then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      });
    downPromises.push(downPromise);
  }
  await Promise.all(downPromises);
}

async function actionMain(ctx: MqttCtx, devices: MaisonDeviceDef[]) {
  let binStatePromises: Promise<string>[];
  let binStates: string[];
  let actPromises: Promise<void>[];
  binStatePromises = [];
  for(let i = 0; i < devices.length; i++) {
    let device = devices[i];
    let binStatePromise = z2mCtrl.getBinaryState(ctx, device);
    binStatePromises.push(binStatePromise);
  }
  binStates = await Promise.all(binStatePromises);
  let synced = binStates.slice(1).every((binState) => {
    return binState === binStates[0];
  });
  if(!synced) {
    ctx.logger.warn('Devices out of sync');
  }
  actPromises = [];
  for(let i = 0; i < devices.length; i++) {
    let actPromise: Promise<void>;
    let device = devices[i];
    let currState = binStates[i];
    if(!synced) {
      currState = binStates[0];
    }
    actPromise = toggleBinaryState(ctx, device, currState);
    actPromises.push(actPromise);
  }
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
