
import mqtt from 'mqtt';
import { OffCb, SubOpts } from '../../cmd/mqtt-ezd/msg-router';
import { MqttCtx } from '../models/mqtt-ctx';
import { maisonConfig } from '../config/maison-config';
import { mqttUtil } from './mqtt-util';
import { prim } from '../util/validate-primitives';
import { MaisonDevice } from '../models/maison-device';

export const z2mCtrl = {
  getBinaryState: getBinaryState,
  setBinaryState: setBinaryState,
} as const;

async function setBinaryState(ctx: MqttCtx, device: MaisonDevice, stateStr: string): Promise<void> {
  if(stateStr !== 'ON' && stateStr !== 'OFF') {
    throw new Error(`Invalid state string '${stateStr}'`);
  }
  let z2mSetTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}/set`;
  let z2mSubTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}`;
  let setPubMsg = stateStr;
  let pubPromise: Promise<void>;
  let subDeferred: PromiseWithResolvers<void>;
  subDeferred = Promise.withResolvers();

  let offCb = await ctx.msgRouter.sub(z2mSubTopic, (evt) => {
    /* wait for device to broadcast desired state _*/
    let payload = mqttUtil.parsePayload(evt.payload);
    if(prim.isObject(payload) && payload.state === setPubMsg) {
      /*
      TODO: strictly validate payload shape
      _*/
      subDeferred.resolve();
    }
  });
  pubPromise = new Promise((resolve) => {
    ctx.msgRouter.publish(z2mSetTopic, setPubMsg, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  try {
    await pubPromise;
    await subDeferred.promise;
  } finally {
    /* always clean up subscriptions _*/
    offCb();
  }
}

/*
effectively a .once() handler
_*/
async function getBinaryState(ctx: MqttCtx, device: MaisonDevice): Promise<string> {
  let deviceTopic: string;
  let subOffCb: OffCb;
  let deferred: PromiseWithResolvers<string>;
  let subOpts: SubOpts;
  deferred = Promise.withResolvers();
  deviceTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}`;
  subOpts = {
    // qos: 2,
  };
  subOffCb = await ctx.msgRouter.sub(deviceTopic, subOpts, (evt) => {
    let payload: unknown;
    payload = mqttUtil.parsePayload(evt.payload);
    if(!prim.isObject(payload)) {
      return deferred.reject(
        new Error('Expected payload to be an object')
      );
    }
    if(!prim.isString(payload.state)) {
      return deferred.reject(
        new Error('Expected payload.state to be a string')
      );
    }
    deferred.resolve(payload.state);
  });
  let pubOpts: mqtt.IClientPublishOptions;
  let pubTopic: string;
  let pubMsg: string;
  let pubPromise: Promise<void>;
  let deviceState: string;
  pubOpts = {
    // qos: 0,
  };
  pubTopic = `${deviceTopic}/get`;
  pubMsg = JSON.stringify({ state: '' });
  pubPromise = new Promise((resolve, reject) => {
    ctx.msgRouter.publish(pubTopic, pubMsg, pubOpts, (err) => {
      if(err) {
        return reject(err);
      }
      resolve();
    });
  });
  try {
    await pubPromise;
    deviceState = await deferred.promise;
  } finally {
    /* always clean up subscriptions _*/
    subOffCb();
  }
  return deviceState;
}
