
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { MqttMsgEvt, MsgRouter } from './msg-router';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { maison_actions, MaisonAction } from '../../lib/models/maison-actions';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { modeMain } from './remote-modes/mode-main';
import { maisonConfig } from '../../lib/config/maison-config';
import { RemoteMode, RemoteSubMode } from '../../lib/models/remote-mode';
import { ModeCtrl } from '../../lib/service/mode-ctrl';
import { modeS1 } from './remote-modes/mode-s1';
import { modeS2 } from './remote-modes/mode-s2';

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
  let ikeaTopic: string;
  let maisonTopic: string;
  let msgRouter: MsgRouter;
  let modeCtrl: ModeCtrl;
  let ctx: MqttCtx;
  console.log('mqtt-ezd main ~');
  ikeaTopic = `${maisonConfig.z2m_topic_prefix}/${maisonConfig.ikea_remote_name}/action`;
  maisonTopic = maisonConfig.maison_action_topic;
  client = await initClient();
  msgRouter = await MsgRouter.init(client, logger);
  modeCtrl = ModeCtrl.init({
    defaultMode: modeMain,
    subModes: [
      modeS1,
      modeS2,
    ],
  });
  ctx = {
    client,
    logger,
    msgRouter,
    modeCtrl,
  };
  let ikeaOffCb = await msgRouter.sub(ikeaTopic, (evt) => {
    ikeaMsgHandler(ctx, evt);
  });
  let maisonOffCb = await msgRouter.sub(maisonTopic, (evt) => {
    maisonMsgHandler(ctx, evt);
  });
  msgRouter.listen();
  logger.info('mqtt-ezd start');
}

async function maisonMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let actionPayload: MaisonActionPayload;
  let defaultMode: RemoteMode;
  let currMode: RemoteSubMode;
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
  defaultMode = modeMain;
  currMode = ctx.modeCtrl.currMode();
  if(actionPayload.action === 'main') {
    await defaultMode.main(ctx);
  } else if(actionPayload.action === 'up') {
    await defaultMode.up(ctx);
  } else if(actionPayload.action === 'down') {
    await defaultMode.down(ctx);
  } else if(actionPayload.action === 'next') {
    ctx.modeCtrl.selectNext();
    console.log(ctx.modeCtrl.currMode().modeName);
  } else if(actionPayload.action === 'prev') {
    ctx.modeCtrl.selectPrev();
    console.log(ctx.modeCtrl.currMode().modeName);
  } else {
    ctx.logger.info(`unhandled action ${evt.topic}: '${actionPayload.action}'`);
  }
  ctx.logger.info({
    devices: maisonConfig.maison_devices.map(device => device.name)
  });
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
    // qos: 2,
  };
  let pubTopic: string;
  pubTopic = maisonConfig.maison_action_topic;
  ctx.logger.info({
    topic: pubTopic,
    payload: maisonActionPayload,
  }, 'publish');
  pubPromise = new Promise((resolve) => {
    ctx.msgRouter.publish(pubTopic, maisonActionPayloadStr, pubOpts, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      resolve();
    });
  });
  await pubPromise;
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
