
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
  await Promise.all([ pubPromise, subDeferred.promise ]);
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
    qos: 0,
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
  let pubMsg: string;
  let deviceState: string;
  pubOpts = {
    // qos: 0,
  };
  pubMsg = JSON.stringify({ state: '' });
  ctx.msgRouter.publish(`${deviceTopic}/get`, pubMsg, pubOpts, (err) => {
    if(err) {
      return deferred.reject(err);
    }
  });
  deviceState = await deferred.promise;
  subOffCb();
  return deviceState;
}
