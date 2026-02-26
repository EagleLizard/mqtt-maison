
import assert from 'node:assert';

import type mqtt from 'mqtt/*';

import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { Z2mDeviceService } from './z2m-device-service';
import { MqttMsgEvt, MsgRouter, SubOpts } from '../../cmd/mqtt-ezd/msg-router';
import { mqttClientMock } from '../util/test/mqtt-client-mock';
import { MaisonDeviceDef } from '../models/maison-device';

describe('z2m-device-service', () => {
  let msgRouter: Mocked<MsgRouter>;
  let devicesMock: MaisonDeviceDef[];

  beforeEach(() => {
    msgRouter = {
      sub: vi.fn() as MsgRouter['sub'],
      publish: vi.fn() as MsgRouter['publish'],
    } as Mocked<MsgRouter>;
    devicesMock = [
      {
        name: 'test'
      },
    ];
  });

  test('.init() subscribes and inits devices', async () => {
    let z2mDeviceService = await Z2mDeviceService.init({
      devices: devicesMock,
      msgRouter,
    });
    expect(z2mDeviceService.devices.find(device => {
      return device.name === devicesMock[0].name;
    })).toBeDefined();
    expect(msgRouter.sub).toHaveBeenCalled();
  });

  test((
    '.init(): calling handleDeviceMsg() for the first time ' +
    'sets store entry'
  ), async () => {
    let testTopic: string | undefined;
    let testMsgCb: ((evt: MqttMsgEvt) => void) | undefined;
    let testMsgOffCb = vi.fn();
    let deviceMock = devicesMock[0];
    msgRouter.sub.mockImplementation(async (
      topic: string,
      opts: SubOpts & {} | ((evt: MqttMsgEvt) => void),
      onMsgCb?: (evt: MqttMsgEvt) => void,
    ) => {
      if(topic.endsWith(`/${deviceMock.name}`) && ((typeof opts) === 'function')) {
        testTopic = topic;
        testMsgCb = opts;
      }
      return testMsgOffCb;
    });
    let z2mDeviceService = await Z2mDeviceService.init({
      devices: devicesMock,
      msgRouter,
    });
    assert(testTopic !== undefined && testMsgCb !== undefined);
    let payloadMock = { topic: testTopic, val: 'test_payload' };
    let payloadBuf = Buffer.from(JSON.stringify(payloadMock));
    let packetMock = mqttClientMock.getMockPubPacket(testTopic, payloadBuf);
    let evtMock: MqttMsgEvt = {
      topic: testTopic,
      payload: payloadBuf,
      packet: packetMock,
    };
    testMsgCb(evtMock);
    expect(msgRouter.sub).toHaveBeenCalled();
    let lastMsg = z2mDeviceService.deviceStateStore.get(deviceMock.name);
    assert(lastMsg !== undefined);
    expect(lastMsg.lastMsg?.evt).toEqual(evtMock);;
  });

  test('.getStateMsgEvt() publishes to device /get topic and awaits result on sub()', async () => {
    let testTopic: string | undefined;
    let testMsgCb: ((evt: MqttMsgEvt) => void) | undefined;
    let testMsgOffCb = vi.fn();
    let deviceMock = devicesMock[0];
    msgRouter.sub.mockImplementation(async (
      topic: string,
      opts: SubOpts & {} | ((evt: MqttMsgEvt) => void),
      onMsgCb?: (evt: MqttMsgEvt) => void,
    ) => {
      if(topic.endsWith(`/${deviceMock.name}`) && ((typeof opts) === 'function')) {
        testTopic = topic;
        testMsgCb = opts;
      }
      return testMsgOffCb;
    });
    let z2mDeviceService = await Z2mDeviceService.init({
      devices: devicesMock,
      msgRouter: msgRouter,
    });
    assert(testTopic !== undefined);
    let payloadMock = { topic: testTopic, val: 'test_payload' };
    let payloadBuf = Buffer.from(JSON.stringify(payloadMock));
    let packetMock = mqttClientMock.getMockPubPacket(testTopic, payloadBuf);
    let evtMock: MqttMsgEvt = {
      topic: testTopic,
      payload: payloadBuf,
      packet: packetMock,
    };
    msgRouter.publish.mockImplementationOnce(async (
      topic,
      msg
    ): Promise<mqtt.Packet | undefined> => {
      if(topic.startsWith(`${testTopic}`)) {
        testMsgCb?.(evtMock);
      }
      return;
    });
    let stateMsgEvt = await z2mDeviceService.getStateMsgEvt(deviceMock);
    expect(stateMsgEvt).toEqual(evtMock);
    expect(msgRouter.publish).toHaveBeenCalledTimes(1);
  });
});
