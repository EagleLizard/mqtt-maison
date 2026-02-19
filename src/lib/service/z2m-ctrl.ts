
import { MqttMsgEvt } from '../../cmd/mqtt-ezd/msg-router';
import { MqttCtx } from '../models/mqtt-ctx';
import { maisonConfig } from '../config/maison-config';
import { mqttUtil } from './mqtt-util';
import { prim } from '../util/validate-primitives';
import { MaisonDeviceDef } from '../models/maison-device';
import { Z2mDeviceMsg } from '../models/z2m-device-msg';
import { sleep } from '../util/sleep';

const SET_BIN_STATE_TIMEOUT_MS = 10e3;

export const z2mCtrl = {
  getBinaryState: getBinaryState,
  setBinaryState: setBinaryState,
  waitForBinaryState: waitForBinaryState,
} as const;

async function setBinaryState(
  ctx: MqttCtx,
  device: MaisonDeviceDef,
  stateStr: string
): Promise<void> {
  if(stateStr !== 'ON' && stateStr !== 'OFF') {
    throw new Error(`Invalid state string '${stateStr}'`);
  }
  let z2mSetTopic = `${maisonConfig.z2m_topic_prefix}/${device.name}/set`;
  let setPubMsg = stateStr;
  await ctx.msgRouter.publish(z2mSetTopic, setPubMsg);
}

async function waitForBinaryState(
  ctx: MqttCtx,
  device: MaisonDeviceDef,
  targetState: string,
  timeoutMs = SET_BIN_STATE_TIMEOUT_MS,
): Promise<void> {
  let currMsgEvt: MqttMsgEvt;
  if(targetState !== 'ON' && targetState !== 'OFF') {
    throw new Error(`Invalid state string '${targetState}'`);
  }
  let msgEvt = await ctx.z2mDeviceService.getStateMsgEvt(device);
  let payload = mqttUtil.parsePayload(msgEvt.payload);
  let z2mMsg = Z2mDeviceMsg.parse(payload);
  let pollStartMs = Date.now();
  while(z2mMsg.state !== targetState) {
    await sleep(100);
    // await sleep(10);
    currMsgEvt = await ctx.z2mDeviceService.getStateMsgEvt(device);
    let hasNewMsg = currMsgEvt !== msgEvt;
    if(hasNewMsg) {
      msgEvt = currMsgEvt;
      payload = mqttUtil.parsePayload(msgEvt.payload);
      z2mMsg = Z2mDeviceMsg.parse(payload);
    }
    let elapsedMs = Date.now() - pollStartMs;
    if(elapsedMs > timeoutMs) {
      throw new Error(`Timeout of ${timeoutMs}ms exceeded`);
    }
  }
}

async function getBinaryState(ctx: MqttCtx, device: MaisonDeviceDef): Promise<string> {
  let currMsgEvt: MqttMsgEvt;
  currMsgEvt = await ctx.z2mDeviceService.getStateMsgEvt(device);
  let payload: unknown;
  payload = mqttUtil.parsePayload(currMsgEvt.payload);
  if(!prim.isObject(payload)) {
    throw new Error('Expected payload to be an object');
  }
  if(!prim.isString(payload.state)) {
    throw new Error('Expected payload.state to be a string');
  }
  return payload.state;
}
