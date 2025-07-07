
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';
import { MqttMsgEvt, MsgRouter, OffCb } from './msg-router';
import { prim } from '../../lib/util/validate-primitives';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';
const z2m_device_target = 'croc';

const maison_topic_prefix = 'ezd';

/* match params of mqtt.OnMessageCallback _*/
type MsgFnOpts = {
  topic: string;
  payload: Buffer;
  packet: mqtt.IPublishPacket;
} & {};

type MqttCtx = {
  client: mqtt.MqttClient;
  logger: EzdLogger;
  msgRouter: MsgRouter;
} & {};

/*
  To accomplish the desired behavior, the problem is separate into 2 steps:
  1. z2m Subscribe and Adapt
    Subscribe to zigbee2mqtt MQTT topics published by devices,
    adapt those to NEW mqtt messages on our own topic, e.g. ezd/some_topic
  2. Listen and Dispatch
    subscribe to the new non-device mqtt topic(s)
    dispatch device actions based on the new messages
      This is where modal state would be considered
_*/
export async function mqttEzdMain() {
  let client: mqtt.MqttClient;
  let actionsTopic: string;
  let handleMsg: mqtt.OnMessageCallback;
  let msgRouter: MsgRouter;
  console.log('mqtt-ezd main ~');
  actionsTopic = `${z2m_topic_prefix}/${ikea_remote_name}/action`;
  client = await initClient();
  msgRouter = await MsgRouter.init(client);
  let actionsOffCb = await msgRouter.sub(actionsTopic, (evt) => {
    let ctx: MqttCtx;
    ctx = {
      client,
      logger,
      msgRouter,
    };
    ikeaMsgHandler(ctx, evt);
  });
  msgRouter.listen();
  logger.info('mqtt-ezd start');
}

async function ikeaMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let payloadStr: string;
  payloadStr = evt.payload.toString();
  console.log({
    topic: evt.topic,
    payloadStr: payloadStr,
  });
  if(payloadStr === 'toggle') {
    let targetOffCb: OffCb;
    let stateVal: 'ON' | 'OFF' | 'TOGGLE';
    /* get the state of a device */
    let deviceState = await getBinaryState(ctx, z2m_device_target);
    if(deviceState === 'ON') {
      stateVal = 'OFF';
    } else if(deviceState === 'OFF') {
      stateVal = 'ON';
    } else {
      stateVal = 'TOGGLE';
    }
    let targetPayload = JSON.stringify({ state: stateVal });
    let targetTopic = `${z2m_topic_prefix}/${z2m_device_target}/set`;
    ctx.client.publish(targetTopic, targetPayload, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
    });
  }
}

/*
effectively a .once() handler
_*/
async function getBinaryState(ctx: MqttCtx, deviceName: string): Promise<string> {
  let deviceTopic: string;
  let subOffCb: OffCb;
  let deferred: PromiseWithResolvers<string>;
  deferred = Promise.withResolvers();
  deviceTopic = `${z2m_topic_prefix}/${deviceName}`;
  subOffCb = await ctx.msgRouter.sub(deviceTopic, (evt) => {
    let payloadStr: string;
    let payload: unknown;
    subOffCb();
    payloadStr = evt.payload.toString();
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      payload = payloadStr;
    }
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
  ctx.client.publish(`${deviceTopic}/get`, JSON.stringify({ state: '' }), (err) => {
    if(err) {
      return deferred.reject(err);
    }
  });
  return deferred.promise;
}

function initClient(): Promise<mqtt.MqttClient> {
  let p: Promise<mqtt.MqttClient>;
  let mqttCfg = ezdConfig.getMqttConfig();
  let client = mqtt.connect(mqttCfg.mqtt_server, {
    username: mqttCfg.mqtt_user,
    password: mqttCfg.mqtt_password,
    clientId: 'mqtt-maison',
  });
  p = new Promise((resolve, reject) => {
    let errCb: mqtt.OnErrorCallback;
    let resCb: mqtt.OnConnectCallback;
    errCb = (err) => {
      client.off('connect', resCb);
      reject(err);
    };
    resCb = (packet) => {
      client.off('error', errCb);
      resolve(client);
    };
    client.once('error', errCb);
    client.once('connect', resCb);
  });
  return p;
}
