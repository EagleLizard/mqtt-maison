
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';

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
  console.log('mqtt-ezd main ~');
  actionsTopic = `${z2m_topic_prefix}/${ikea_remote_name}/action`;
  client = await initClient();
  logger.info('mqtt-ezd start');
  client.on('message', (topic, payload, packet) => {
    let ctx: MqttCtx;
    ctx = {
      client: client,
      logger: logger,
    };
    return msgRouter(ctx, {
      topic: topic,
      payload: payload,
      packet: packet,
    });
  });
  client.subscribe(actionsTopic, (err, granted, packet) => {
    if(err) {
      logger.error(err);
      return;
    }
  });
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
function z2mMsgRouter(ctx: MqttCtx, opts: MsgFnOpts): void {
  let logger: EzdLogger;
  let topic: string;
  let payloadStr: string;
  logger = ctx.logger;
  topic = opts.topic;
  payloadStr = opts.payload.toString();
  // console.log(`${topic}: ${payloadStr}`);
  logger.info({
    topic: topic,
    payload: payloadStr,
  });
  // console.log(`z2m message, topic: ${opts.topic}`);

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
