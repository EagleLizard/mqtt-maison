
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';
import { MqttMsgEvt, MsgRouter, OffCb, SubOpts } from './msg-router';
import { prim } from '../../lib/util/validate-primitives';
import { mqttUtil } from '../../lib/service/mqtt-util';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { MaisonDevice } from '../../lib/models/maison-device';
import { maison_actions, MaisonAction } from '../../lib/models/maison-actions';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';

const maison_topic_prefix = 'ezd';
const maison_action_topic = `${maison_topic_prefix}/etc`;

/* TODO: load these from a config or DB */
const maison_devices: MaisonDevice[] = [
  {
    name: 'croc',
  },
  {
    name: 'rabbit',
  },
];

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
  let msgRouter: MsgRouter;
  let ctx: MqttCtx;
  console.log('mqtt-ezd main ~');
  actionsTopic = `${z2m_topic_prefix}/${ikea_remote_name}/action`;
  client = await initClient();
  msgRouter = await MsgRouter.init(client, logger);
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
  let actionPayload: MaisonActionPayload;
  let binStatePromises: Promise<string>[];
  let pubPromises: Promise<void>[];
  try {
    actionPayload = MaisonActionPayload.parse(evt.payload);
  } catch(e) {
    ctx.logger.error(e);
    return;
  }
  ctx.logger.info({
    topic: evt.topic,
    payload: actionPayload,
  });
  if(actionPayload.action === 'main') {
    let binStates: string[];
    binStatePromises = [];
    pubPromises = [];
    for(let i = 0; i < maison_devices.length; i++) {
      let binStatePromise: Promise<string>;
      let device = maison_devices[i];
      binStatePromise = getBinaryState(ctx, device.name);
      binStatePromises.push(binStatePromise);
    }
    binStates = await Promise.all(binStatePromises);
    let synced: boolean;
    synced = binStates.slice(1).every(binState => {
      return binState === binStates[0];
    });
    if(!synced) {
      ctx.logger.warn('Devices out of sync');
    }
    for(let i = 0; i < maison_devices.length; i++) {
      let actPromise: Promise<void>;
      let targetState: string;
      let device = maison_devices[i];
      let currState = binStates[i];
      if(currState === 'ON') {
        targetState = 'OFF';
      } else if(currState === 'OFF') {
        targetState = 'ON';
      } else {
        ctx.logger.error({
          deviceName: device.name,
          currState: currState,
        }, 'unrecognized state');
        throw new Error(`Unrecognized state ${currState} for device ${device.name}`);
      }
      actPromise = setBinaryState(ctx, device.name, targetState);
      pubPromises.push(actPromise);
    }
    await Promise.all(pubPromises);
  } else if(actionPayload.action === 'down') {
    pubPromises = [];
    for(let i = 0; i < maison_devices.length; i++) {
      let pubPromise: Promise<void>;
      let device = maison_devices[i];
      pubPromise = setBinaryState(ctx, device.name, 'OFF');
      pubPromises.push(pubPromise);
    }
    await Promise.all(pubPromises);
  } else if(actionPayload.action === 'up') {
    pubPromises = [];
    for(let i = 0; i < maison_devices.length; i++) {
      let pubPromise: Promise<void>;
      let device = maison_devices[i];
      pubPromise = setBinaryState(ctx, device.name, 'ON');
      pubPromises.push(pubPromise);
    }
    await Promise.all(pubPromises);
  } else {
    ctx.logger.info(`unhandled action ${evt.topic}: '${actionPayload.action}'`);
  }
  ctx.logger.info({
    devices: maison_devices.map(device => device.name)
  });
}

async function setBinaryState(ctx: MqttCtx, deviceName: string, stateStr: string): Promise<void> {
  if(stateStr !== 'ON' && stateStr !== 'OFF') {
    throw new Error(`Invalid state string '${stateStr}'`);
  }
  let z2mPubTopic = `${z2m_topic_prefix}/${deviceName}/set`;
  let z2mSubTopic = `${z2m_topic_prefix}/${deviceName}`;
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
    ctx.client.publish(z2mPubTopic, pubMsg, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  await Promise.all([ pubPromise, subDeferred.promise ]);
}

async function ikeaMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let payloadStr = evt.payload.toString();
  let mappedAction: MaisonAction | undefined;
  mappedAction = maison_actions.ikea_action_map.get(payloadStr);
  if(mappedAction === undefined) {
    ctx.logger.warn({
      topic: evt.topic,
    }, `No mapping for action: ${payloadStr}`);
    return;
  }
  let maisonActionPayload: MaisonActionPayload = {
    action: mappedAction,
  };
  let maisonActionPayloadStr = JSON.stringify(maisonActionPayload);
  let pubPromise: Promise<void>;
  let pubOpts: mqtt.IClientPublishOptions;
  pubOpts = {
    qos: 0,
  };
  ctx.logger.info({
    topic: maison_action_topic,
    payload: maisonActionPayload,
  }, 'publish');
  pubPromise = new Promise((resolve) => {
    ctx.client.publish(maison_action_topic, maisonActionPayloadStr, pubOpts, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  await pubPromise;
}

/*
effectively a .once() handler
_*/
async function getBinaryState(ctx: MqttCtx, deviceName: string): Promise<string> {
  let deviceTopic: string;
  let subOffCb: OffCb;
  let deferred: PromiseWithResolvers<string>;
  let subOpts: SubOpts;
  let pubOpts: mqtt.IClientPublishOptions;
  deferred = Promise.withResolvers();
  deviceTopic = `${z2m_topic_prefix}/${deviceName}`;
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
  pubOpts = {
    qos: 0,
  };
  let pubMsg = JSON.stringify({ state: '' });
  ctx.client.publish(`${deviceTopic}/get`, pubMsg, pubOpts, (err) => {
    if(err) {
      return deferred.reject(err);
    }
  });
  let deviceState = await deferred.promise;
  subOffCb();
  return deviceState;
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
