
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';
import { MqttMsgEvt, MsgRouter } from './msg-router';
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { maison_actions, MaisonAction } from '../../lib/models/maison-actions';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { maisonConfig } from '../../lib/config/maison-config';
import { Z2mDeviceService } from '../../lib/service/z2m-device-service';
import { EventQueue } from '../../lib/events/event-queue';
import { MaisonCtrl } from './maison-ctrl';

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
  let z2mDeviceService: Z2mDeviceService;
  let ctx: MqttCtx;
  let maisonEvtQueue: EventQueue<MqttMsgEvt>;
  console.log('mqtt-ezd main ~');
  ikeaTopic = `${maisonConfig.z2m_topic_prefix}/${maisonConfig.ikea_remote_name}/action`;
  maisonTopic = maisonConfig.maison_action_topic;
  client = await initClient();
  msgRouter = await MsgRouter.init(client, logger);
  z2mDeviceService = await Z2mDeviceService.init({
    devices: maisonConfig.maison_devices,
    msgRouter: msgRouter,
  });
  ctx = {
    client,
    logger,
    msgRouter,
    z2mDeviceService,
  };
  let ikeaOffCb = await msgRouter.sub(ikeaTopic, (evt) => {
    ikeaMsgHandler(ctx, evt);
  });
  let inProgressMaisonReqs = 0;
  const inProgressMaisonPollFn = () => {
    ctx.logger.debug({
      handler: 'maisonMsg',
      inProgressReqs: inProgressMaisonReqs,
    });
    // console.log(ctx.msgRouter.topicEventMap); // check for hanging message handlers
    setTimeout(inProgressMaisonPollFn, 5e3);
  };
  // inProgressMisonPollFn();
  let maisonCtrl = await MaisonCtrl.init();
  maisonEvtQueue = EventQueue.init((evt, doneCb) => {
    maisonCtrl.handleMsg(ctx, evt).catch(err => {
      doneCb(err);
    }).finally(() => {
      doneCb();
    });
  });
  let maisonOffCb = await msgRouter.sub(maisonTopic, (evt) => {
    inProgressMaisonReqs++;

    // maisonEvtQueue.push(evt, () => {
    //   inProgressMaisonReqs--;
    // });

    maisonCtrl.handleMsg(ctx, evt).catch((err) => {
      ctx.logger.error(err);
    }).finally(() => {
      inProgressMaisonReqs--;
    });
  });
  msgRouter.listen();
  logger.info('mqtt-ezd start');
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
  let clientId: string;
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
