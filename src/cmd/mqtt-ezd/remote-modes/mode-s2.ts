/*
mode-s2 = mode switch 1
_*/

import { MqttCtx } from '../../../lib/models/mqtt-ctx';
import { RemoteSubMode } from '../../../lib/models/remote-mode';

export const modeS2: RemoteSubMode = {
  modeName: 's2',
  up: actionUp,
  down: actionDown,
};

async function actionUp(ctx: MqttCtx) {
  console.log('mode-s2: up');
}

async function actionDown(ctx: MqttCtx) {
  console.log('mode-s2: down');
}
