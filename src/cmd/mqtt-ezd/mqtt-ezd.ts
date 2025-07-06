
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';
import { MqttMsgEvt, MsgRouter, OffCb } from './msg-router';
import { sleep } from '../../lib/util/sleep';
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
    console.log({
      targetTopic,
      targetPayload,
    });
    return ctx.client.publishAsync(targetTopic, targetPayload);
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

/* mqtt.OnMessageCallback */
function msgRouter(ctx: MqttCtx, opts: MsgFnOpts): void {
  /*
    Try to match the topic and route to handler, else route to default handler
  _*/
  if(checkZ2mTopic(opts.topic)) {
    return z2mMsgRouter(ctx, opts);
  }
  defaultMsgHandler(ctx, opts);
}
/* Parse the message and transform */
function z2mMsgRouter(ctx: MqttCtx, opts: MsgFnOpts) {
  let topic: string;
  topic = opts.topic;
  if(topic === `${z2m_topic_prefix}/${ikea_remote_name}/action`) {
    _ikeaRemoteMsgHandler(ctx, opts);
    return;
  }
  z2mMsgHandler(ctx, opts);
}

function _ikeaRemoteMsgHandler(ctx: MqttCtx, opts: MsgFnOpts): void {
  let logger: EzdLogger;
  let client: mqtt.MqttClient;
  let topic: string;
  let payloadStr: string;
  logger = ctx.logger;
  client = ctx.client;
  topic = opts.topic;
  payloadStr = opts.payload.toString();
  // console.log(`${topic}: ${payloadStr}`);
  logger.info({
    topic: topic,
    payload: payloadStr,
  });
  if(payloadStr === 'toggle') {
    console.log('toggle');
    let getPayload = { state: '' };
    /*
    The intent here is to write some logic to perform a toggle. For most devices, toggle isn't
      an action that's explicitly exposed.
    In order to perform a toggle:
      1. we need to publish a z2m/device/get
        1.1. Before sending, we subscribe to that device's topic
        1.2. We should ignore any messages we get until we publish our message
        1.3. After we publish, wait for exactly 1 message on the device topic
        1.4. After we get a message, assume that it has the current state, and
          unsubscribe from that device's topic
      2. After we get the current state, we need to invert it (assuming it's a
        boolean toggle)
        2.1. The way that would make the most sense would be to await the handshake
          from step 1 in the function
        2.2. The way it's set up right now, all of the messages go through the handler
          in the main function. So to make step 1 awaitable, we need to create an
          abstraction that works with the message router / handler
    _*/
    client.subscribe(`${z2m_topic_prefix}/croc`, (err) => {
      if(err) {
        logger.error(err);
        return;
      }
    });
    client.publish(`${z2m_topic_prefix}/croc/get`, JSON.stringify(getPayload), (err) => {
      if(err) {
        logger.error(err);
        return;
      }
    });
  }
  // console.log(`z2m message, topic: ${opts.topic}`);
}

function z2mMsgHandler(ctx: MqttCtx, opts: MsgFnOpts) {
  let payloadStr: string;
  let payload: unknown;
  payloadStr = opts.payload.toString();
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    payload = payloadStr;
  }
  ctx.logger.info({
    topic: opts.topic,
    payload: payload,
  });
}

function defaultMsgHandler(ctx: MqttCtx, opts: MsgFnOpts): void {
  /*
    treat this as an error - we should only subscribe to messages we expect to handle
  _*/
  let payloadStr: string;
  let payload: unknown;
  let errMsg: string;
  payloadStr = opts.payload.toString();
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    payload = payloadStr;
  }
  errMsg = `mqtt-ezd: Unhandled topic: ${opts.topic}`;
  ctx.logger.error({
    topic: opts.topic,
    payload: payload,
  }, errMsg);
  throw new Error(errMsg);
}

function checkZ2mTopic(topic: string): boolean {
  let res: boolean;
  res = topic.startsWith(`${z2m_topic_prefix}/`);
  return res;
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
