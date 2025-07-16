
import mqtt from 'mqtt';
import { OffCb, SubOpts } from '../../cmd/mqtt-ezd/msg-router';
import { MqttCtx } from '../models/mqtt-ctx';
import { maisonConfig } from '../config/maison-config';
import { mqttUtil } from './mqtt-util';
import { prim } from '../util/validate-primitives';

export const z2mCtrl = {
  getBinaryState: getBinaryState,
  setBinaryState: setBinaryState,
} as const;

async function setBinaryState(ctx: MqttCtx, deviceName: string, stateStr: string): Promise<void> {
  if(stateStr !== 'ON' && stateStr !== 'OFF') {
    throw new Error(`Invalid state string '${stateStr}'`);
  }
  let z2mPubTopic = `${maisonConfig.z2m_topic_prefix}/${deviceName}/set`;
  let z2mSubTopic = `${maisonConfig.z2m_topic_prefix}/${deviceName}`;
  let pubMsg = stateStr;
  let pubPromise: Promise<void>;
  let subDeferred: PromiseWithResolvers<void>;
  subDeferred = Promise.withResolvers();
  let offCb = await ctx.msgRouter.sub(z2mSubTopic, (evt) => {
    /* wait for device to broadcast desired state _*/
    let payload = mqttUtil.parsePayload(evt.payload);
    if(prim.isObject(payload) && payload.state === pubMsg) {
      /*
      TODO: strictly validate payload shape
      _*/
      offCb();
      subDeferred.resolve();
    }
  });
  pubPromise = new Promise((resolve) => {
    ctx.msgRouter.publish(z2mPubTopic, pubMsg, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  await pubPromise;
  await subDeferred.promise;
}

/*
effectively a .once() handler
_*/
async function getBinaryState(ctx: MqttCtx, deviceName: string): Promise<string> {
  let deviceTopic: string;
  let subOffCb: OffCb;
  let deferred: PromiseWithResolvers<string>;
  let subOpts: SubOpts;
  deferred = Promise.withResolvers();
  deviceTopic = `${maisonConfig.z2m_topic_prefix}/${deviceName}`;
  subOpts = {
    // qos: 2,
  };
  subOffCb = await ctx.msgRouter.sub(deviceTopic, subOpts, (evt) => {
    let payload: unknown;
    subOffCb();
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
  await pubPromise;
  deviceState = await deferred.promise;
  return deviceState;
}
