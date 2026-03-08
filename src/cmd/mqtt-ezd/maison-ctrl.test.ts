
import pino from 'pino';
import { describe, test, expect, beforeEach, Mocked, vi, afterEach } from 'vitest';
import { MqttClient } from 'mqtt/*';

import { MaisonCtrl } from './maison-ctrl';
import { MaisonDeviceDef } from '../../lib/models/maison-device';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { MqttClientMock } from '../../lib/util/test/mqtt-client-mock';
import { LoggerMock } from '../../lib/util/test/logger-mock';
import { MqttMsgEvt, MsgRouter } from './msg-router';
import { Z2mDeviceService } from '../../lib/service/z2m-device-service';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { z2mCtrl } from '../../lib/service/z2m-ctrl';

const z2mCtrlMock: Mocked<typeof z2mCtrl> = vi.hoisted(() => {
  return {
    getBinaryState: vi.fn(),
    setBinaryState: vi.fn(),
    waitForBinaryState: vi.fn(),
    setAndWaitForBinaryState: vi.fn(),
  } as Mocked<typeof z2mCtrl>;
});
vi.mock('../../lib/service/z2m-ctrl.ts', () => {
  return {
    z2mCtrl: z2mCtrlMock,
  };
});

describe('maison-ctrl', () => {
  let devicesMock: MaisonDeviceDef[];
  let maisonCtrl: MaisonCtrl;
  let mqttClientMock: Mocked<MqttClient>;
  let loggerMock: Mocked<pino.Logger>;
  let msgRouterMock: Mocked<MsgRouter>;
  let z2mDeviceServiceMock: Mocked<Z2mDeviceService>;
  let ctxMock: MqttCtx;

  let testTopic: string;

  beforeEach(() => {
    vi.useFakeTimers();
    devicesMock = [
      {
        name: 'test_0',
        groups: [ 'action_main' ],
      },
      {
        name: 'test_light_0',
        groups: [ 'etc_lights' ],
      },
      {
        name: 'test_light_1',
        groups: [ 'etc_lights' ],
      },
      {
        name: 'test_light_2',
        groups: [ 'etc_lights' ],
      },
    ];
    testTopic = 'ezd/test_topic';
    maisonCtrl = MaisonCtrl.init({ deviceDefs: devicesMock });
    mqttClientMock = MqttClientMock.init();
    loggerMock = LoggerMock.init();
    msgRouterMock = {
      publish: vi.fn() as Mocked<MsgRouter>['publish'],
    } as Mocked<MsgRouter>;
    z2mDeviceServiceMock = {
      getStateMsgEvt: vi.fn() as Mocked<Z2mDeviceService>['getStateMsgEvt'],
    } as Mocked<Z2mDeviceService>;
    ctxMock = {
      client: mqttClientMock,
      logger: loggerMock,
      msgRouter: msgRouterMock,
      z2mDeviceService: z2mDeviceServiceMock,
    };

    /* reset mocks */
    z2mCtrlMock.getBinaryState.mockReset();
    z2mCtrlMock.setBinaryState.mockReset();
    z2mCtrlMock.waitForBinaryState.mockReset();
    z2mCtrlMock.setAndWaitForBinaryState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('.init()', () => {
    let maisonCtrl1 = MaisonCtrl.init({ deviceDefs: devicesMock });
    let maisonCtrl2 = MaisonCtrl.init({ deviceDefs: devicesMock });
    expect(maisonCtrl1).not.toStrictEqual(maisonCtrl2);
  });

  test(`.handleMsg() 'main'`, async () => {
    let dob = new Date();
    let payload: MaisonActionPayload = {
      action: 'main',
      dob: dob.toISOString(),
    };
    let msgEvt = getMsgEvt(testTopic, payload);
    z2mCtrlMock.getBinaryState.mockReturnValueOnce(Promise.resolve('OFF').finally(() => {
      z2mCtrlMock.setAndWaitForBinaryState.mockResolvedValueOnce();
    }));
    await maisonCtrl.handleMsg(ctxMock, msgEvt);
    expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalled();
  });

  test(`.handleMsg() 'up'`, async () => {
    let binStateMap: Map<string, string> = new Map();
    z2mCtrlMock.setBinaryState.mockImplementation((ctx, device, stateStr): Promise<void> => {
      binStateMap.set(device.name, stateStr);
      return Promise.resolve();
    });
    z2mCtrlMock.waitForBinaryState.mockImplementation((ctx, device, targetState): Promise<void> => {
      if(binStateMap.get(device.name) !== targetState) {
        return Promise.reject(new Error(`No setBinState call for device: ${device.name}`));
      }
      return Promise.resolve();
    });
    let dob = new Date();
    let payload: MaisonActionPayload = {
      action: 'up',
      dob: dob.toISOString(),
    };
    let msgEvt = getMsgEvt(testTopic, payload);
    await maisonCtrl.handleMsg(ctxMock, msgEvt);
    for(let i = 0; i < devicesMock.length; i++) {
      let device = devicesMock[i];
      expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalledWith(ctxMock, device, 'ON');
    }
  });

  test(`.handleMsg() 'down'`, async () => {;
    let dob = new Date();
    let payload: MaisonActionPayload = {
      action: 'down',
      dob: dob.toISOString(),
    };
    let msgEvt = getMsgEvt(testTopic, payload);
    await maisonCtrl.handleMsg(ctxMock, msgEvt);
    for(let i = 0; i < devicesMock.length; i++) {
      let device = devicesMock[i];
      expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalledWith(ctxMock, device, 'OFF');
    }
  });

  describe('.handleMsg() seek fns', () => {
    let blinkBinState: string;
    let seekDevices: MaisonDeviceDef[];

    beforeEach(() => {
      blinkBinState = 'OFF';
      seekDevices = devicesMock.filter((device) => {
        return device.groups?.includes('etc_lights');
      });

      z2mCtrlMock.getBinaryState.mockImplementation((ctx, device) => {
        return Promise.resolve(blinkBinState);
      });
      z2mCtrlMock.setAndWaitForBinaryState.mockImplementation((ctx, device, stateStr) => {
        blinkBinState = stateStr;
        vi.advanceTimersByTime(MaisonCtrl.blink_delay_ms);
        return Promise.resolve();
      });
    });

    test(`.handleMsg() 'prev'`, async () => {
      let dob = new Date();
      let payload: MaisonActionPayload = {
        action: 'prev',
        dob: dob.toISOString(),
      };
      let msgEvt = getMsgEvt(testTopic, payload);
      await maisonCtrl.handleMsg(ctxMock, msgEvt);
      /*
        'prev' called from initial state underflows and should
        select last device
      _*/
      let prevDevice = seekDevices[seekDevices.length - 1];
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalledWith(ctxMock, prevDevice);
      expect(z2mCtrlMock.getBinaryState).not.toHaveBeenCalledWith(ctxMock, seekDevices[0]);
    });

    test(`.handleMsg() 'next'`, async () => {
      let dob = new Date();
      let payload: MaisonActionPayload = {
        action: 'next',
        dob: dob.toISOString(),
      };
      let msgEvt = getMsgEvt(testTopic, payload);
      await maisonCtrl.handleMsg(ctxMock, msgEvt);
      /*
        'prev' called from initial state underflows and should
        select last device
      _*/
      let nextDevice = seekDevices[1];
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalledWith(ctxMock, nextDevice);
      expect(z2mCtrlMock.getBinaryState).not.toHaveBeenCalledWith(ctxMock, seekDevices[0]);
    });

    test(`.handleMsg() 'dots'`, async () => {
      let dob = new Date();
      let payload: MaisonActionPayload = {
        action: 'dots_double',
        dob: dob.toISOString(),
      };
      let msgEvt = getMsgEvt(testTopic, payload);
      await maisonCtrl.handleMsg(ctxMock, msgEvt);
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.setAndWaitForBinaryState).toHaveBeenCalled();
      expect(z2mCtrlMock.getBinaryState).toHaveBeenCalledWith(ctxMock, seekDevices[0]);
    });
  });
});

function getMsgEvt(topic: string, payload: unknown): MqttMsgEvt {
  let payloadBuf = Buffer.from(JSON.stringify(payload));
  let msgEvt: MqttMsgEvt = {
    topic: topic,
    payload: payloadBuf,
    packet: MqttClientMock.getMockPubPacket(topic, payloadBuf),
  };
  return msgEvt;
}
