import { MqttMsgEvt, MsgRouter, OffCb } from '../../cmd/mqtt-ezd/msg-router';
import { maisonConfig } from '../config/maison-config';
import { MaisonDevice } from '../models/maison-device';
import { mqttUtil } from './mqtt-util';

type Z2mDeviceServiceParams = {
  devices: MaisonDevice[];
  msgRouter: MsgRouter;
};

type DeviceStateMsg = {
  received_at: number; // timestamp
  evt: MqttMsgEvt;
};

type DeviceStateStoreItem = {
  device: MaisonDevice;
  subOffCb: OffCb;
  lastMsg?: DeviceStateMsg;
  /* only used for the first call to get _*/
  initialMsgEvt: PromiseWithResolvers<MqttMsgEvt>;
}

export class Z2mDeviceService {
  devices: MaisonDevice[];
  msgRouter: MsgRouter;
  deviceStateStore: Map<string, DeviceStateStoreItem>;
  private constructor(params: Z2mDeviceServiceParams) {
    this.devices = params.devices;
    this.msgRouter = params.msgRouter;
    this.deviceStateStore = new Map();
  }

  async getStateMsgEvt(device: MaisonDevice): Promise<MqttMsgEvt> {
    let deviceStoreItem: DeviceStateStoreItem | undefined;
    let getMsgEvtPromise: Promise<MqttMsgEvt>;
    deviceStoreItem = this.deviceStateStore.get(device.name);
    if(deviceStoreItem === undefined) {
      throw new Error(`No deviceStateStore entry for device: ${device.name}`);
    }
    if(deviceStoreItem.lastMsg !== undefined) {
      return Promise.resolve(deviceStoreItem.lastMsg.evt);
    }
    if(deviceStoreItem.initialMsgEvt === undefined) {
      throw new Error(`No initial message event promise for device: ${device.name}`);
    }
    getMsgEvtPromise = deviceStoreItem.initialMsgEvt.promise;
    /*
      If this is the first request to get the state, publish a message to the device
        to rebroadcast it's state
    _*/
    let pubPromise: Promise<void>;
    let z2mGetTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}/get`;
    let z2mGetMsg = JSON.stringify({ state: '' });
    pubPromise = new Promise((resolve, reject) => {
      this.msgRouter.publish(z2mGetTopic, z2mGetMsg, (err) => {
        if(err) {
          return reject(err);
        }
        resolve();
      });
    });
    await pubPromise;
    return getMsgEvtPromise;
  }

  private async initStateSubs() {
    for(let i = 0; i < this.devices.length; i++) {
      let device = this.devices[i];
      let deviceName = device.name;
      let z2mDeviceTopic = `${maisonConfig.z2m_topic_prefix}/${deviceName}`;
      let deviceSubOffCb = await this.msgRouter.sub(z2mDeviceTopic, (evt) => {
        this.handleDeviceMsg(device, evt);
      });
      this.deviceStateStore.set(deviceName, {
        device: device,
        subOffCb: deviceSubOffCb,
        initialMsgEvt: Promise.withResolvers(),
      });
    }
  }
  private handleDeviceMsg(device: MaisonDevice, evt: MqttMsgEvt) {
    let deviceStoreItem: DeviceStateStoreItem | undefined;
    let receivedAt: number;
    deviceStoreItem = this.deviceStateStore.get(device.name);
    if(deviceStoreItem === undefined) {
      throw new Error(`No deviceStateStore entry for device: ${device.name}`);
    }
    receivedAt = Date.now();
    deviceStoreItem.lastMsg = {
      received_at: receivedAt,
      evt: evt,
    };
    if(deviceStoreItem.initialMsgEvt !== undefined) {
      deviceStoreItem.initialMsgEvt.resolve(deviceStoreItem.lastMsg.evt);
      // deviceStoreItem.initialMsgEvt = undefined;
    }
  }
  static async init(params: Z2mDeviceServiceParams): Promise<Z2mDeviceService> {
    let z2mDeviceService: Z2mDeviceService;
    z2mDeviceService = new Z2mDeviceService(params);
    await z2mDeviceService.initStateSubs();
    return z2mDeviceService;
  }
}
