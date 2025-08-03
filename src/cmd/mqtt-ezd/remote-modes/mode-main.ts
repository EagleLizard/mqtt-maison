
/* the main (default) remote mode _*/

import { maisonConfig } from '../../../lib/config/maison-config';
import { MqttCtx } from '../../../lib/models/mqtt-ctx';
import { z2mCtrl } from '../../../lib/service/z2m-ctrl';

const mode_main_name = 'mode_main';

export const modeMain = {
  modeName: mode_main_name,
  up: actionUp,
  down: actionDown,
} as const;

async function actionUp(ctx: MqttCtx) {
  let pubPromises: Promise<void>[];
  pubPromises = [];
  for(let i = 0; i < maisonConfig.maison_devices.length; i++) {
    let pubPromise: Promise<void>;
    let device = maisonConfig.maison_devices[i];
    pubPromise = z2mCtrl.setBinaryState(ctx, device, 'ON');
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
    pubPromise = z2mCtrl.setBinaryState(ctx, device, 'OFF');
    pubPromises.push(pubPromise);
  }
  await Promise.all(pubPromises);
}
