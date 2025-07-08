
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';
import { MqttMsgEvt, MsgRouter, OffCb } from './msg-router';
import { prim } from '../../lib/util/validate-primitives';
import { mqttUtil } from '../../lib/service/mqtt-util';
import { EzdActionPayload } from '../../lib/models/ezd-action-payload';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';
const z2m_device_target = 'croc';

const maison_topic_prefix = 'ezd';
const maison_action_topic = `${maison_topic_prefix}/etc`;

const ikea_remote_actions = [
  'toggle',
  'volume_up',
  'volume_down',
  'track_next',
  'track_previous',
  'dots_1_initial_press',
  'dots_1_short_release',
  'dots_1_long_press',
  'dots_1_long_release',
  'dots_1_double_press',
  'dots_2_initial_press',
  'dots_2_long_press',
  'dots_2_long_release',
  'dots_2_double_press',
];

/* TODO: load these from a config or DB */
const maison_actions: MaisonAction[] = [
  {
    deviceName: 'croc',
    action: { state: 'TOGGLE' },
  },
  {
    deviceName: 'rabbit',
    action: { state: 'TOGGLE' },
  },
];

// ] as const;
// type IkeaRemoteAction = typeof ikea_remote_actions[number];

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

type MaisonAction = {
  /*
    Currently I'll target just the binary state features of devices,
      which are available on switches and lights.
    I want to extend this to include device-specific features,
      e.g. brightness, color for lights
  */
  deviceName: string; // friendly name
  action: {
    state: 'ON' | 'OFF' | 'TOGGLE';
  };
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
  let msgRouter: MsgRouter;
  let ctx: MqttCtx;
  console.log('mqtt-ezd main ~');
  actionsTopic = `${z2m_topic_prefix}/${ikea_remote_name}/action`;
  client = await initClient();
  msgRouter = await MsgRouter.init(client);
  ctx = {
    client,
    logger,
    msgRouter,
  };
  let ikeaActionsOffCb = await msgRouter.sub(actionsTopic, (evt) => {
    ikeaMsgHandler(ctx, evt);
  });
  let maisonActionsOffCb = await msgRouter.sub(maison_action_topic, (evt) => {
    maisonMsgHandler(ctx, evt);
  });
  msgRouter.listen();
  logger.info('mqtt-ezd start');
}

async function maisonMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let actionPayload: EzdActionPayload;
  let pubPromises: Promise<void>[];
  actionPayload = EzdActionPayload.parse(evt.payload);
  logger.info({
    topic: evt.topic,
    payload: actionPayload,
  });
  pubPromises = [];
  for(let i = 0; i < maison_actions.length; i++) {
    let pubPromise: Promise<void>;
    let maisonAction = maison_actions[i];
    let z2mTopic = `${z2m_topic_prefix}/${maisonAction.deviceName}/set`;
    let maisonMsg = JSON.stringify(maisonAction.action);
    pubPromise = new Promise((resolve) => {
      ctx.client.publish(z2mTopic, maisonMsg, (err) => {
        if(err) {
          ctx.logger.error(err, z2mTopic);
        }
        resolve();
      });
    });
    pubPromises.push(pubPromise);
  }
  await Promise.all(pubPromises);
}

async function ikeaMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  const action_map = new Map(Object.entries({
    toggle: 'main',
    volume_up: 'up',
    volume_down: 'down',
    track_next: 'next',
    track_previous: 'prev',
  }));
  let payloadStr = evt.payload.toString();
  let mappedAction: string | undefined;
  mappedAction = action_map.get(payloadStr);
  if(mappedAction === undefined) {
    ctx.logger.warn({
      topic: evt.topic,
    }, `No mapping for action: ${payloadStr}`);
    return;
  }
  let maisonActionPayload: EzdActionPayload = {
    action: mappedAction,
  };
  let maisonActionPayloadStr = JSON.stringify(maisonActionPayload);
  let pubPromise: Promise<void>;
  pubPromise = new Promise((resolve) => {
    ctx.client.publish(maison_action_topic, maisonActionPayloadStr, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  await pubPromise;
}

async function _ikeaMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let payloadStr: string;
  payloadStr = evt.payload.toString();
  // console.log({
  //   topic: evt.topic,
  //   payloadStr: payloadStr,
  // });
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
    clientId: 'mqtt-maison-ts',
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
