
import { maisonConfig } from '../../lib/config/maison-config';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { z2mCtrl } from '../../lib/service/z2m-ctrl';
import { MqttMsgEvt } from './msg-router';
import { modeMain } from './remote-modes/mode-main';

/*
singleton for now
_*/
let ctrlInstance: MaisonCtrl | undefined;

export class MaisonCtrl {
  private constructor() {}

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
      // await modeMain.main(ctx);
      await actionMain(ctx);
    } else if(payload.action === 'up') {
      await modeMain.up(ctx);
    } else if(payload.action === 'down') {
      await modeMain.down(ctx);
    } else if(payload.action === 'dot') {
      /* todo: dot */
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

  static async init(): Promise<MaisonCtrl> {
    if(ctrlInstance === undefined) {
      ctrlInstance = new MaisonCtrl();
    }
    return ctrlInstance;
  }
}

async function actionMain(ctx: MqttCtx) {
  let binStatePromises: Promise<string>[];
  let binStates: string[];
  let actPromises: Promise<void>[];
  let devices = maisonConfig.maison_devices;
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
    let targetState: string;
    let device = devices[i];
    let currState = binStates[i];
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
    actPromise = z2mCtrl.setBinaryState(ctx, device, targetState)
      .then(() => {
        return z2mCtrl.waitForBinaryState(ctx, device, targetState);
      }).catch((err) => {
        // ctx.logger.error(err);
        throw err;
      });
    actPromises.push(actPromise);
  }
  await Promise.all(actPromises);
}
