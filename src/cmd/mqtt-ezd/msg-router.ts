import mqtt from 'mqtt';
import { EventRegistry } from '../../lib/events/event-registry';
import { EzdLogger } from '../../lib/logger/ezd-logger';
import { TopicMeta } from '../../lib/models/topic-meta';

/*
handle topic subscriptions and forward them to the handlers
  that expect to depend on them
Could also manage automatically unsubscribing from topics,
  because if no one has handlers registered to listen to a topic,
  we don't need to subscribe to it anymore
_*/
export type SubOpts = Partial<mqtt.IClientSubscribeOptions> & {};
export type PubOpts = mqtt.IClientPublishOptions & {};
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
  topicMetaMap: Map<string, TopicMeta>;
  logger: EzdLogger;
  private constructor(client: mqtt.MqttClient, logger: EzdLogger) {
    this.client = client;
    this.topicEventMap = new Map();
    this.topicMetaMap = new Map();
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
  async sub(
    topic: string,
    opts: SubOpts & {} | ((evt: MqttMsgEvt) => void),
    onMsgCb?: (evt: MqttMsgEvt) => void,
  ): Promise<OffCb> {
    let topicEvtReg: EventRegistry<MqttMsgEvt> | undefined;
    let topicMeta: TopicMeta | undefined;
    let subPromise: Promise<OffCb>;
    let subOpts: SubOpts;

    /* default _*/
    subOpts = {
      qos: 1,
    };
    if(typeof opts === 'function' && opts !== undefined) {
      onMsgCb = opts;
    }
    if(typeof opts !== 'function' && opts !== undefined) {
      /* shallow merge */
      subOpts = Object.assign({}, subOpts, opts);
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
    topicMeta = this.topicMetaMap.get(topic);
    if(topicMeta === undefined) {
      topicMeta = TopicMeta.init(topic);
      this.topicMetaMap.set(topic, topicMeta);
    }
    /*
      It's not clear if mqtt.js provides a way to check if a topic is
        already subscribed to, so we will subscribe every time
    _*/
    let deregCb: OffCb;
    let subOffCb: OffCb;
    subPromise = new Promise((resolve, reject) => {
      this.client.subscribe(topic, subOpts, (err) => {
        if(err) {
          return reject(err);
        }
        deregCb = topicEvtReg.register(onMsgCb);
        resolve(deregCb);
      });
    });
    deregCb = await subPromise;
    subOffCb = () => {
      deregCb();
      this.unsubIfNoHandlers(topic);
    };
    return subOffCb;
  }
  /* publish to a topic */
  publish(
    topic: string,
    message: string | Buffer,
    opts?: PubOpts
  ): Promise<mqtt.Packet | undefined> {
    let pubOpts: PubOpts;
    /* default _*/
    pubOpts = {
      qos: 1,
    };
    pubOpts = Object.assign({}, pubOpts, opts);
    return this.client.publishAsync(topic, message, pubOpts);
  }

  /* returns function to unlisted */
  listen(): OffCb {
    let listenerCount: number;
    listenerCount = this.client.listenerCount('message', this.handleMessage);
    if(listenerCount < 1) {
      this.client.on('message', this.handleMessage);
    }
    return () => {
      this.unlisten();
    };
  }
  unlisten(): void {
    this.client.off('message', this.handleMessage);
  }
  /* mqtt.OnMessageCallback _*/
  private handleMessage = (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
    let evt: MqttMsgEvt;
    let evtReg: EventRegistry<MqttMsgEvt> | undefined;
    evtReg = this.topicEventMap.get(topic);
    if(evtReg === undefined || evtReg.eventFnCount() < 1) {
      /*
      TODO: noisy because some devices always broadcast immediately
        before the client processes the unsubscribe. Could fix by tracking
        when the last function was unsubscribed, and only logging this if a
        message is received on that topic after some cooldown period.
      _*/
      let topicMeta = this.topicMetaMap.get(topic);
      if(topicMeta?.unsubbing !== true) {
        /*
          Only log for messages received on topics that aren't currently unsubscribing.
            Unsubscribe happens async, so we may get messages while unsubscribing
            is in progress.
        _*/
        this.logger.warn(`No handlers for message received on topic: ${topic}`);
      }
    }
    evt = {
      topic,
      payload,
      packet,
    };
    evtReg?.fire(evt);
    this.unsubIfNoHandlers(topic);
  };

  private unsubIfNoHandlers(topic: string) {
    /*
    If there is an event registry that matches,
    _*/
    let evtReg: EventRegistry<MqttMsgEvt> | undefined;
    let topicMeta: TopicMeta | undefined;
    let fnCount: number;
    evtReg = this.topicEventMap.get(topic);
    fnCount = evtReg?.eventFnCount() ?? 0;
    if(fnCount > 0) {
      return;
    }
    topicMeta = this.topicMetaMap.get(topic);
    if(topicMeta === undefined) {
      /*
        should never happen - topic meta is created once and retained for
          the life of the program
      _*/
      throw new Error(`No topic meta exists for topic '${topic}'`);
    }
    /*
    clean up registry
    NOTE: this shouldn't be done asynchronously otherwise it may delete
      the topic EventRegistry after a new event has subscribed.
    _*/
    this.topicEventMap.delete(topic);
    topicMeta.unsubbing = true;
    this.client.unsubscribe(topic, (err) => {
      topicMeta.unsubbing = false;
      if(err) {
        this.logger.error(err);
        throw err;
      }
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
