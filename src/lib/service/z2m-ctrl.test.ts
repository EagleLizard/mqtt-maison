
import mqtt from 'mqtt/*';
import pino from 'pino';

import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { z2mCtrl } from './z2m-ctrl';
import { MqttCtx } from '../models/mqtt-ctx';
import { MqttMsgEvt, MsgRouter } from '../../cmd/mqtt-ezd/msg-router';
import { Z2mDeviceService } from './z2m-device-service';
import { mqttClientMock } from '../util/test/mqtt-client-mock';
import { MaisonDeviceDef } from '../models/maison-device';

vi.mock('../util/sleep.ts', () => {
  return {
    sleep: () => {
      return Promise.resolve();
    },
  };
});

describe('z2m-ctrl', () => {
  let clientMock: Mocked<mqtt.MqttClient>;
  let loggerMock: Mocked<pino.Logger>;
  let msgRouterMock: Mocked<MsgRouter>;
  let devicesMock: MaisonDeviceDef[];
  let z2mDeviceServiceMock: Mocked<Z2mDeviceService>;
  let ctxMock: MqttCtx;
  beforeEach(() => {
    clientMock = mqttClientMock.init();
    loggerMock = {} as Mocked<pino.Logger>;
    msgRouterMock = {
      sub: vi.fn() as MsgRouter['sub'],
      publish: vi.fn() as MsgRouter['publish'],
    } as Mocked<MsgRouter>;
    devicesMock = [
      {
        name: 'test'
      },
    ];
    z2mDeviceServiceMock = {
      getStateMsgEvt: vi.fn() as Z2mDeviceService['getStateMsgEvt'],
    } as Mocked<Z2mDeviceService>;
    ctxMock = {
      client: clientMock,
      logger: loggerMock,
      msgRouter: msgRouterMock,
      z2mDeviceService: z2mDeviceServiceMock,
    };
  });

  test('.getBinaryState()', async () => {
    let deviceMock = devicesMock[0];
    let topic = `mock/${deviceMock.name}`;
    let state = 'ON';
    let payload = {
      state: state,
    };
    let payloadBuf = Buffer.from(JSON.stringify(payload));
    let msgEvt: MqttMsgEvt = {
      topic: topic,
      payload: payloadBuf,
      packet: mqttClientMock.getMockPubPacket(topic, payloadBuf)
    };
    z2mDeviceServiceMock.getStateMsgEvt.mockResolvedValueOnce(msgEvt);
    let res = await z2mCtrl.getBinaryState(ctxMock, deviceMock);
    expect(res).toBe(state);
  });
  test('.setBinaryState()', async () => {
    let state = 'ON';
    let deviceMock = devicesMock[0];
    await z2mCtrl.setBinaryState(ctxMock, deviceMock, state);
    expect(msgRouterMock.publish).toHaveBeenCalled();
  });
  test('.waitForBinaryState()', async () => {
    let deviceMock = devicesMock[0];
    let topic = `mock/${deviceMock.name}`;
    let state = 'ON';
    let targetState = 'OFF';
    let payload = {
      state: state,
    };
    let payloadBuf = Buffer.from(JSON.stringify(payload));
    let msgEvt: MqttMsgEvt = {
      topic: topic,
      payload: payloadBuf,
      packet: mqttClientMock.getMockPubPacket(topic, payloadBuf)
    };
    let targetPayload = {
      state: targetState,
    };
    let targetPayloadBuf = Buffer.from(JSON.stringify(targetPayload));
    let targetMsgEvt = {
      topic: topic,
      payload: targetPayloadBuf,
      packet: mqttClientMock.getMockPubPacket(topic, targetPayloadBuf),
    };
    z2mDeviceServiceMock.getStateMsgEvt.mockImplementationOnce(async () => {
      z2mDeviceServiceMock.getStateMsgEvt.mockResolvedValueOnce(targetMsgEvt);
      return msgEvt;
    });
    await expect(
      z2mCtrl.waitForBinaryState(ctxMock, deviceMock, targetState)
    ).resolves.toBeUndefined();
  });
});
