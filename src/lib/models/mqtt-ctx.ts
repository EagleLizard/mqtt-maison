
import type mqtt from 'mqtt';
import type { EzdLogger } from '../logger/ezd-logger';
import type { MsgRouter } from '../../cmd/mqtt-ezd/msg-router';
import type { Z2mDeviceService } from '../service/z2m-device-service';

export type MqttCtx = {
  client: mqtt.MqttClient;
  logger: EzdLogger;
  msgRouter: MsgRouter;
  z2mDeviceService: Z2mDeviceService;
} & {};
