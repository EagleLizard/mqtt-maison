
/* the main (default) remote mode _*/

import { maisonConfig } from '../../../lib/config/maison-config';
import { MqttCtx } from '../../../lib/models/mqtt-ctx';
import { z2mCtrl } from '../../../lib/service/z2m-ctrl';

const mode_main_name = 'mode_main';

export const modeMain = {
  modeName: mode_main_name,
  main: actionMain,
  up: actionUp,
  down: actionDown,
} as const;

async function actionMain(ctx: MqttCtx) {
  let binStates: string[];
  let binStatePromises: Promise<string>[];
  binStatePromises = [];
  for(let i = 0; i < maisonConfig.maison_devices.length; i++) {
    let device = maisonConfig.maison_devices[i];
    let binStatePromise = z2mCtrl.getBinaryState(ctx, device.name);
    binStatePromises.push(binStatePromise);
  }
  binStates = await Promise.all(binStatePromises);
  let synced: boolean;
  synced = binStates.slice(1).every((binState) => {
    return binState === binStates[0];
  });
  if(!synced) {
    ctx.logger.warn('Devices out of sync');
  }
  let actPromises: Promise<void>[];
  actPromises = [];
  for(let i = 0; i < maisonConfig.maison_devices.length; i++) {
    let actPromise: Promise<void>;
    let targetState: string;
    let device = maisonConfig.maison_devices[i];
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
    actPromise = z2mCtrl.setBinaryState(ctx, device.name, targetState);
    actPromises.push(actPromise);
  }
  await Promise.all(actPromises);
}

async function actionUp(ctx: MqttCtx) {
  let pubPromises: Promise<void>[];
  pubPromises = [];
  for(let i = 0; i < maisonConfig.maison_devices.length; i++) {
    let pubPromise: Promise<void>;
    let device = maisonConfig.maison_devices[i];
    pubPromise = z2mCtrl.setBinaryState(ctx, device.name, 'ON');
    pubPromises.push(pubPromise);
  }
  await Promise.all(pubPromises);
}

async function actionDown(ctx: MqttCtx) {
  let pubPromises: Promise<void>[];
  pubPromises = [];
  for(let i = 0; i < maisonConfig.maison_devices.length; i++) {
    let pubPromise: Promise<void>;
    let device = maisonConfig.maison_devices[i];
    pubPromise = z2mCtrl.setBinaryState(ctx, device.name, 'OFF');
    pubPromises.push(pubPromise);
  }
  await Promise.all(pubPromises);
}
