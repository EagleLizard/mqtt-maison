import mqtt from 'mqtt';
import { EventRegistry } from '../../lib/events/event-registry';
import { logger } from '../../lib/logger/logger';
import { EzdLogger } from '../../lib/logger/ezd-logger';

/*
handle topic subscriptions and forward them to the handlers
  that expect to depend on them
Could also manage automatically unsubscribing from topics,
  because if no one has handlers registered to listen to a topic,
  we don't need to subscribe to it anymore
_*/
export type SubOpts = Partial<mqtt.IClientSubscribeOptions> & {};
export type MqttMsgEvt = {
  topic: string;
  payload: Buffer;
  packet: mqtt.IPublishPacket;
};
export type OffCb = () => void;
export class MsgRouter {
  client: mqtt.MqttClient;
  /* map of topics -> registered events */
  topicEventMap: Map<string, EventRegistry<MqttMsgEvt>>;
  logger: EzdLogger;
  private constructor(client: mqtt.MqttClient, logger: EzdLogger) {
    this.client = client;
    this.topicEventMap = new Map();
    this.logger = logger;
  }

  /*
    subscribe to a topic and add the callback to the list of handlers
    returns an off callback
    for a source on overloading see: https://stackoverflow.com/a/61367418/4677252
  _*/
  sub(topic: string, onMsgCb: (evt: MqttMsgEvt) => void): Promise<OffCb>
  sub(
    topic: string,
    opts: SubOpts,
    onMsgCb: (evt: MqttMsgEvt) => void,
  ): Promise<OffCb>
  sub(
    topic: string,
    opts: SubOpts & {} | ((evt: MqttMsgEvt) => void),
    onMsgCb?: (evt: MqttMsgEvt) => void,
  ): Promise<OffCb> {
    let topicEvtReg: EventRegistry<MqttMsgEvt> | undefined;
    let subPromise: Promise<OffCb>;
    let subOpts: SubOpts;
    subOpts = {}; // default
    if(typeof opts === 'function' && opts !== undefined) {
      onMsgCb = opts;
    }
    if(typeof opts !== 'function' && opts !== undefined) {
      subOpts = opts;
    }
    if(onMsgCb === undefined) {
      /* this should be unreachable */
      throw new Error('Invalid, no onMsgCb passed');
    }
    topicEvtReg = this.topicEventMap.get(topic);
    if(topicEvtReg === undefined) {
      topicEvtReg = new EventRegistry();
      this.topicEventMap.set(topic, topicEvtReg);
    }
    /*
      It's not clear if mqtt.js provides a way to check if a topic is
        already subscribed to, so we will subscribe every time
    _*/
    subPromise = new Promise((resolve, reject) => {
      this.client.subscribe(topic, subOpts, (err) => {
        let offCb: OffCb;
        if(err) {
          return reject(err);
        }
        offCb = topicEvtReg.register(onMsgCb);
        resolve(offCb);
      });
    });
    return subPromise;
  }
  /* returns function to unlisted */
  listen(): OffCb {
    let listenerCount: number;
    listenerCount = this.client.listenerCount('message', this.handleMessage);
    if(listenerCount < 1) {
      this.client.on('message', this.handleMessage);
    }
    return this.unlisten;
  }
  unlisten(): void {
    this.client.off('message', this.handleMessage);
  }
  /* mqtt.OnMessageCallback _*/
  private handleMessage = (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
    let evt: MqttMsgEvt;
    let evtReg: EventRegistry<MqttMsgEvt> | undefined;
    evtReg = this.topicEventMap.get(topic);
    if(evtReg === undefined) {
      this.logger.warn((`No handlers for message received on topic: ${topic}`));
    }
    evt = {
      topic,
      payload,
      packet,
    };
    if(evtReg !== undefined && evtReg.eventFnCount() < 1) {
      /*
      TODO: noisy because some devices always broadcast immediately
        before the client processes the unsubscribe. Could fix by tracking
        when the last function was unsubscribed, and only logging this if a
        message is received on that topic after some cooldown period.
      _*/
      logger.warn({
        topic,
      }, 'message with no handler');
    }
    this.unsubIfNoHandlers(topic);
    evtReg?.fire(evt);
  };

  private unsubIfNoHandlers(topic: string) {
    /*
    If there is an event registry that matches,
    _*/
    let evtReg: EventRegistry<MqttMsgEvt> | undefined;
    let evtCount: number;
    evtReg = this.topicEventMap.get(topic);
    evtCount = evtReg?.eventFnCount() ?? 0;
    if(evtCount > 0) {
      return;
    }
    this.client.unsubscribe(topic, (err) => {
      if(err) {
        logger.error(err);
        throw err;
      }
      /* clean up registry */
      this.topicEventMap.delete(topic);
    });
  }

  /*
  TODO: overload to take the same params as mqtt.Client.connect
  _*/
  static init(client: mqtt.MqttClient, logger: EzdLogger): Promise<MsgRouter> {
    let msgRouter: MsgRouter;
    msgRouter = new MsgRouter(client, logger);
    return Promise.resolve(msgRouter);
  }
}
