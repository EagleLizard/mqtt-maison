
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
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

  private mainInProgress: boolean;
  private dotInProgress: boolean;
  private dotDoubleInProgress: boolean;
  private dotsInProgress: boolean;
  private dotsDoubleInProgress: boolean;
  private nextInProgress: boolean;
  private prevInProgress: boolean;
  private upInProgress: boolean;
  private downInProgress: boolean;

  private constructor(opts: MaisonCtrlCtorOpts) {
    this.deviceDefs = opts.deviceDefs;
    this.actionMainDeviceDefs = this.deviceDefs.filter((device) => {
      return action_main_device_names.includes(device.name);
    });
    this.etcLightDeviceDefs = this.deviceDefs.filter((device) => {
      return etc_light_device_names.includes(device.name);
    });
    this.selectedDeviceIdx = 0;
    this.mainInProgress = false;
    this.dotInProgress = false;
    this.dotDoubleInProgress = false;
    this.dotsInProgress = false;
    this.dotsDoubleInProgress = false;
    this.nextInProgress = false;
    this.prevInProgress = false;
    this.upInProgress = false;
    this.downInProgress = false;
  }

  async handleMsg(ctx: MqttCtx, evt: MqttMsgEvt) {
    let payload: MaisonActionPayload;
    let startMs: number;
    let endMs: number;
    let msgAgeMs: number;
    let msgDob: Date;

    try {
      payload = MaisonActionPayload.parse(evt.payload);
    } catch(e) {
      ctx.logger.error(e);
      return;
    }
    startMs = Date.now();
    msgDob = new Date(payload.dob);
    msgAgeMs = startMs - msgDob.valueOf();
    ctx.logger.info({
      topic: evt.topic,
      payload: payload,
    });
    // ctx.logger.debug({ action: payload.action, age: msgAgeMs });
    console.log(`age: ${msgAgeMs} ms`);
    if(payload.action === 'main') {
      await this.handleMain(ctx);
    } else if(payload.action === 'up') {
      await this.handleUp(ctx);
    } else if(payload.action === 'down') {
      await this.handleDown(ctx);
    } else if(payload.action === 'dot') {
      /* todo: dot */
      await this.handleDot(ctx);
    } else if(payload.action === 'dot_double') {
      await this.handleDotDouble(ctx);
    } else if(payload.action === 'dots') {
      await this.handleDots(ctx);
    } else if(payload.action === 'dots_double') {
      await this.handleDotsDouble(ctx);
    } else if(payload.action === 'next') {
      await this.handleNext(ctx);
    } else if(payload.action === 'prev') {
      await this.handlePrev(ctx);
    } else {
      ctx.logger.info(`unhandled action ${evt.topic}: '${payload.action}'`);
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

  private async handleUp(ctx: MqttCtx) {
    if(this.upInProgress) {
      ctx.logger.debug('handleUp() - in progress');
      return;
    }
    this.upInProgress = true;
    try {
      await actionUp(ctx, this.deviceDefs);
    } finally {
      this.upInProgress = false;
    }
  }
  private async handleDown(ctx: MqttCtx) {
    if(this.downInProgress) {
      ctx.logger.debug('handleDown() - in progress');
      return;
    }
    this.downInProgress = true;
    try {
      await actionDown(ctx, this.deviceDefs);
    } finally {
      this.downInProgress = false;
    }
  }
  private async handlePrev(ctx: MqttCtx) {
    if(this.prevInProgress) {
      ctx.logger.debug('handlePrev() - in progress');
      return;
    }
    this.prevInProgress = true;
    try {
      await this.seekEtc(ctx, -1);
    } finally {
      this.prevInProgress = false;
    }
  }
  private async handleNext(ctx: MqttCtx) {
    if(this.nextInProgress) {
      ctx.logger.debug('handleNext() - in progress');
      return;
    }
    this.nextInProgress = true;
    try {
      await this.seekEtc(ctx, 1);
    } finally {
      this.nextInProgress = false;
    }
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
    if(this.dotInProgress) {
      ctx.logger.debug('handleDot() - in progress');
      return;
    }
    this.dotInProgress = true;
    try {
      // await blinkBinaryDevice(ctx, selectedDevice, numBlinks);
      console.log('dot');
    } finally {
      this.dotInProgress = false;
    }
  }
  private async handleDotDouble(ctx: MqttCtx) {
    if(this.dotDoubleInProgress) {
      ctx.logger.debug('handleDotDouble() - in progress');
      return;
    }
    this.dotDoubleInProgress = true;
    try {
      await actionMain(ctx, this.etcLightDeviceDefs);
    } finally {
      this.dotDoubleInProgress = false;
    }
  }

  private async handleDots(ctx: MqttCtx) {
    let selectedDevice: MaisonDeviceDef | undefined;
    if(this.dotsInProgress) {
      ctx.logger.debug('handleDots() - in progress');
      return;
    }
    selectedDevice = this.etcLightDeviceDefs[this.selectedDeviceIdx];
    if(selectedDevice === undefined) {
      /* TODO: error, invalid index */
      return;
    }
    /* blink the current light */
    let numBlinks = 2;
    this.dotsInProgress = true;
    try {
      await blinkBinaryDevice(ctx, selectedDevice, numBlinks);
    } finally {
      this.dotsInProgress = false;
    }
  }
  private async handleDotsDouble(ctx: MqttCtx) {
    let selectedDevice: MaisonDeviceDef | undefined;
    if(this.dotsDoubleInProgress) {
      ctx.logger.debug('handleDotsDouble() - in progress');
      return;
    }
    selectedDevice = this.etcLightDeviceDefs[this.selectedDeviceIdx];
    if(selectedDevice === undefined) {
      /* TODO: error, invalid index */
      return;
    }
    this.dotsDoubleInProgress = true;
    try {
      await actionToggle(ctx, selectedDevice);
    } finally {
      this.dotsDoubleInProgress = false;
    }
  }

  private async handleMain(ctx: MqttCtx) {
    if(this.mainInProgress) {
      ctx.logger.debug('handleMain() - in progress');
      return;
    }
    this.mainInProgress = true;
    try {
      await actionMain(ctx, this.actionMainDeviceDefs);
    } finally {
      this.mainInProgress = false;
    }
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
  let currState = await z2mCtrl.getBinaryState(ctx, device);
  let toggleDelayMs = 200;
  for(let i = 0; i < numToggles; i++) {
    let startMs: number;
    let elapsedMs: number;
    let remainingDelayMs: number;
    startMs = Date.now();
    currState = await toggleBinaryState(ctx, device, currState);
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
  let actPromises: Promise<string>[];
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
    /*
      TODO: sync devices - could select a 'leader' somehow,
        and set all devices to that device's state.
    _*/
    ctx.logger.warn('Devices out of sync');
  }
  actPromises = [];
  for(let i = 0; i < devices.length; i++) {
    let actPromise: Promise<string>;
    let device = devices[i];
    let currState = binStates[i];
    actPromise = toggleBinaryState(ctx, device, currState);
    actPromises.push(actPromise);
  }
  await Promise.all(actPromises);
}

async function toggleBinaryState(
  ctx: MqttCtx,
  device: MaisonDeviceDef,
  currState: string
): Promise<string> {
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
  return targetState;
}
