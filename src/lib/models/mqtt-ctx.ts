
import type mqtt from 'mqtt';
import type { EzdLogger } from '../logger/ezd-logger';
import type { MsgRouter } from '../../cmd/mqtt-ezd/msg-router';
import { ModeCtrl } from '../service/mode-ctrl';

export type MqttCtx = {
  client: mqtt.MqttClient;
  logger: EzdLogger;
  msgRouter: MsgRouter;
  modeCtrl: ModeCtrl;
} & {};
