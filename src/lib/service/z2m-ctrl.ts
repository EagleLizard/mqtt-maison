
import mqtt from 'mqtt';
import { OffCb, SubOpts } from '../../cmd/mqtt-ezd/msg-router';
import { MqttCtx } from '../models/mqtt-ctx';
import { maisonConfig } from '../config/maison-config';
import { mqttUtil } from './mqtt-util';
import { prim } from '../util/validate-primitives';
import { MaisonDevice } from '../models/maison-device';

const SET_BIN_STATE_TIMEOUT_MS = 10e3;

export const z2mCtrl = {
  getBinaryState: getBinaryState,
  setBinaryState: setBinaryState,
} as const;

/*
  1. start polling with setTimeout
    Set a timeout in ms, after which if it's not complete, cancel the operation
    Poll every pollIntervalMs
      After some wait period, send a z2m/device/get message to signal the
      device that it should rebroadcast its state
  2. Subscribe to the z2m/device topic to listen for the state change.
    Resolve when the received device state matches the desired state.
  3. Publish the z2m/device/set message
_*/
async function setBinaryState(ctx: MqttCtx, device: MaisonDevice, stateStr: string): Promise<void> {
  if(stateStr !== 'ON' && stateStr !== 'OFF') {
    throw new Error(`Invalid state string '${stateStr}'`);
  }
  let z2mSetTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}/set`;
  let z2mGetTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}/get`;
  let z2mDeviceTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}`;
  let setPubMsg = stateStr;
  let setPubPromise: Promise<void>;
  let pollDeferred: PromiseWithResolvers<void>;
  let subDeferred: PromiseWithResolvers<void>;
  let subOffCb: OffCb;
  let targetState: string;
  let pollIntervalMs: number;
  let pollGetPublishWaitMs: number;
  let pollStartMs: number;
  let subFinished: boolean;
  let sendGetState: boolean;
  targetState = stateStr;
  pollIntervalMs = 500;
  pollGetPublishWaitMs = 800;
  subFinished = false;
  sendGetState = true;
  pollDeferred = Promise.withResolvers();
  subDeferred = Promise.withResolvers();

  const pollFn = () => {
    let elapsedMs: number;
    let pollPromise: Promise<void>;
    if(subFinished) {
      pollDeferred.resolve();
      return;
    }
    elapsedMs = Date.now() - pollStartMs;
    if(elapsedMs > SET_BIN_STATE_TIMEOUT_MS) {
      /*
      Error - timeout
      _*/
      pollDeferred.reject(new Error(`Timeout of ${SET_BIN_STATE_TIMEOUT_MS}ms exceeded`));
      return;
    }
    ctx.logger.debug(`[${device.name}${sendGetState ? '/get' : ''}] Poll - ${elapsedMs} ms`);
    if(sendGetState && elapsedMs > pollGetPublishWaitMs) {
      pollPromise = new Promise((resolve) => {
        let z2mGetMsg = JSON.stringify({ state: '' });
        ctx.msgRouter.publish(z2mGetTopic, z2mGetMsg, (err) => {
          if(err) {
            ctx.logger.error(err);
          }
          sendGetState = false;
          resolve();
        });
      });
    } else {
      pollPromise = Promise.resolve();
    }
    pollPromise.then(() => {
      setTimeout(pollFn, pollIntervalMs);
    });
  };
  pollStartMs = Date.now();
  setTimeout(pollFn, pollIntervalMs);

  let msgCount = 0;
  subOffCb = await ctx.msgRouter.sub(z2mDeviceTopic, (evt) => {
    let payload = mqttUtil.parsePayload(evt.payload);
    if(!prim.isObject(payload) || !prim.isString(payload.state)) {
      subDeferred.reject(new Error(`Invalid payload: ${evt.payload.toString()}`));
      return;
    }
    msgCount++;
    // ctx.logger.debug(`[${device.name}] state - curr: ${payload.state}, target: ${targetState} - msgCount: ${msgCount}`);
    if(payload.state === targetState) {
      // if(device.name === 'croc') {
      //   return; // Debug - force timeout
      // }
      subDeferred.resolve();
      subFinished = true;
    }
  });
  setPubPromise = new Promise((resolve) => {
    ctx.msgRouter.publish(z2mSetTopic, setPubMsg, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  /* ... */
  let resPromise = Promise.all([
    setPubPromise,
    subDeferred.promise,
    pollDeferred.promise,
  ]).then(() => {
    return undefined;
  }).finally(() => {
    subFinished = true;
    subOffCb();
  });
  await resPromise;
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
