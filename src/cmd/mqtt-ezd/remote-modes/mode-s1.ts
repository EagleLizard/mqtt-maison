/*
mode-s1 = mode switch 1
_*/

import { MqttCtx } from '../../../lib/models/mqtt-ctx';
import { RemoteSubMode } from '../../../lib/models/remote-mode';

export const modeS1: RemoteSubMode = {
  modeName: 's1',
  up: actionUp,
  down: actionDown,
};

async function actionUp(ctx: MqttCtx) {
  console.log('mode-s1: up');
}

async function actionDown(ctx: MqttCtx) {
  console.log('mode-s1: down');
}
