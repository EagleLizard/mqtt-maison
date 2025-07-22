
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { MqttMsgEvt, MsgRouter } from './msg-router';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { maison_actions, MaisonAction } from '../../lib/models/maison-actions';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { modeMain } from './remote-modes/mode-main';
import { maisonConfig } from '../../lib/config/maison-config';
import { RemoteMode } from '../../lib/models/remote-mode';
import { EventQueue } from '../../lib/events/event-queue';
import { mqttUtil } from '../../lib/service/mqtt-util';

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
  let ctx: MqttCtx;
  let maisonEvtQueue: EventQueue<MqttMsgEvt>;
  console.log('mqtt-ezd main ~');
  ikeaTopic = `${maisonConfig.z2m_topic_prefix}/${maisonConfig.ikea_remote_name}/action`;
  maisonTopic = maisonConfig.maison_action_topic;
  client = await initClient();
  msgRouter = await MsgRouter.init(client, logger);
  ctx = {
    client,
    logger,
    msgRouter,
  };
  let ikeaOffCb = await msgRouter.sub(ikeaTopic, (evt) => {
    ikeaMsgHandler(ctx, evt);
  });
  let inProgressMaisonReqs = 0;
  const inProgressMisonPollFn = () => {
    ctx.logger.debug({
      handler: 'maisonMsg',
      inProgressReqs: inProgressMaisonReqs,
    });
    // console.log(ctx.msgRouter.topicEventMap); // check for hanging message handlers
    setTimeout(inProgressMisonPollFn, 5e3);
  };
  inProgressMisonPollFn();
  maisonEvtQueue = EventQueue.init((evt, doneCb) => {
    inProgressMaisonReqs++;
    maisonMsgHandler(ctx, evt).catch(err => {
      doneCb(err);
    }).finally(() => {
      inProgressMaisonReqs--;
      doneCb();
    });
  });
  let maisonOffCb = await msgRouter.sub(maisonTopic, (evt) => {
    // maisonEvtQueue.push(evt);

    inProgressMaisonReqs++;
    maisonMsgHandler(ctx, evt).catch(err => {
      ctx.logger.error(err);
    }).finally(() => {
      inProgressMaisonReqs--;
    });
  });
  // let crocOffCb = await msgRouter.sub(`${maisonConfig.z2m_topic_prefix}/croc`, (evt) => {
  //   let payload = mqttUtil.parsePayload(evt.payload);
  //   ctx.logger.debug(`main():[croc] state: ${payload?.state}`);
  // });
  msgRouter.listen();
  logger.info('mqtt-ezd start');
}

async function maisonMsgHandler(ctx: MqttCtx, evt: MqttMsgEvt) {
  let actionPayload: MaisonActionPayload;
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
  if(actionPayload.dob !== undefined) {
    console.log(`age: ${Date.now() - (new Date(actionPayload.dob)).valueOf()}ms`);
  }
  if(actionPayload.action === 'main') {
    await modeMain.main(ctx);
  } else if(actionPayload.action === 'up') {
    await modeMain.up(ctx);
  } else if(actionPayload.action === 'down') {
    await modeMain.down(ctx);
  } else if(actionPayload.action === 'dot') {
    let getPubMsg = JSON.stringify({ state: '' });
    ctx.msgRouter.publish(`${maisonConfig.z2m_topic_prefix}/croc/get`, getPubMsg, (err) => {
      if(err) {
        ctx.logger.error(err);
      }
      ctx.logger.debug('croc/get');
    });
  } else {
    ctx.logger.info(`unhandled action ${evt.topic}: '${actionPayload.action}'`);
  }
  ctx.logger.debug({
    topic: evt.topic,
    action: actionPayload
  }, 'END maisonMsgHandler()');
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
    dob: (new Date()).toISOString(),
  };
  let maisonActionPayloadStr = JSON.stringify(maisonActionPayload);
  // console.log(maisonActionPayload);
  let pubPromise: Promise<void>;
  let pubOpts: mqtt.IClientPublishOptions;
  pubOpts = {
    // qos: 2,
  };
  let pubTopic: string;
  pubTopic = maisonConfig.maison_action_topic;
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
