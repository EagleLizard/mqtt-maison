
import mqtt from 'mqtt/*';
import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { MqttMsgEvt, MsgRouter } from './msg-router';
import pino from 'pino';
import assert from 'node:assert';

describe('msg-router', () => {
  let mockClient: Mocked<mqtt.MqttClient>;
  let mockLogger: Mocked<pino.Logger>;
  beforeEach(() => {
    mockClient = {
      subscribe: vi.fn() as mqtt.MqttClient['subscribe'],
      unsubscribe: vi.fn() as mqtt.MqttClient['unsubscribe'],
      listenerCount: vi.fn()
        .mockImplementation((event: string, listener: mqtt.OnMessageCallback) => {
          return 0;
        }) as mqtt.MqttClient['listenerCount'],
      on: vi.fn() as mqtt.MqttClient['on'],
      off: vi.fn() as mqtt.MqttClient['off'],
      publishAsync: vi.fn().mockResolvedValue(undefined) as mqtt.MqttClient['publishAsync'],
    } as Mocked<mqtt.MqttClient>;
    mockLogger = {
      warn: (obj: unknown, msg?: string) => {
        if(msg === undefined) {
          console.log(obj);
        } else {
          console.log(obj, msg);
        }
      }
    } as Mocked<pino.Logger>;
  });

  test(`.listen() subscribes to client 'message' event, returned callback calls client.off`, () => {
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let offCb = msgRouter.listen();
    expect(mockClient.on).toHaveBeenCalled();
    offCb();
    expect(mockClient.off).toHaveBeenCalled();
  });

  test('.sub() promise resolves', async () => {
    let clientSubCb: mqtt.ClientSubscribeCallback | undefined;
    mockClient.subscribe.mockImplementation((topic, subOpts, cb) => {
      clientSubCb = cb;
      return mockClient;
    });
    let topicMock = 'test_topic';
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub(topicMock, () => void 0);
    assert(clientSubCb !== undefined);
    clientSubCb(null);
    await expect(subPromise).resolves.toBeTruthy();
  });

  test('.sub() without handler param throws error', async () => {
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub('test_topic', undefined as unknown as (evt: MqttMsgEvt) => void);
    await expect(subPromise).rejects.toThrow('MSGR_0.1');
  });

  test('.sub() with options promise resolves', async () => {
    let clientSubCb: mqtt.ClientSubscribeCallback | undefined;
    mockClient.subscribe.mockImplementation((topic, subOpts, cb) => {
      clientSubCb = cb;
      return mockClient;
    });
    let topicMock = 'test_topic';
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub(topicMock, { qos: 0 }, () => void 0);
    assert(clientSubCb !== undefined);
    clientSubCb(null);
    await expect(subPromise).resolves.toBeTruthy();
  });

  test('.sub() promise rejects on error', async () => {
    let clientSubCb: mqtt.ClientSubscribeCallback | undefined;
    mockClient.subscribe.mockImplementation((topic, subOpts, cb) => {
      clientSubCb = cb;
      return mockClient;
    });
    let topicMock = 'test_topic';
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub(topicMock, () => void 0);
    let errStr = 'Mock MsgRouter.sub Error';
    assert(clientSubCb !== undefined);
    clientSubCb(new Error(errStr));
    await expect(subPromise).rejects.toThrow(errStr);
  });

  test('.sub() registers firable handler', async () => {
    let clientSubCb: mqtt.ClientSubscribeCallback | undefined;
    let messageHandlerFn: mqtt.OnMessageCallback | undefined;
    mockClient.subscribe.mockImplementation((topic, subOpts, cb) => {
      clientSubCb = cb;
      return mockClient;
    });
    let subCb = vi.fn();
    let topicMock = 'test_topic';
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub(topicMock, subCb);
    assert(clientSubCb !== undefined);
    clientSubCb(null);
    await subPromise;
    mockClient.on.mockImplementation((evt, cb) => {
      if(evt === 'message') {
        messageHandlerFn = cb as mqtt.OnMessageCallback;
      }
      return mockClient;
    });
    msgRouter.listen();
    assert(messageHandlerFn !== undefined);
    let payloadMock = {
      val: 'mock_val',
    } as const;
    let payloadBuf = Buffer.from(JSON.stringify(payloadMock));
    let packetMock = getMockPubPacket(topicMock, payloadBuf);
    messageHandlerFn(topicMock, payloadBuf, packetMock);
    expect(subCb).toBeCalledWith({
      topic: topicMock,
      payload: payloadBuf,
      packet: packetMock,
    });
  });

  test('.sub() unregistered when returned callback is called', async () => {
    let clientSubCb: mqtt.ClientSubscribeCallback | undefined;
    let messageHandlerFn: mqtt.OnMessageCallback | undefined;
    mockClient.subscribe.mockImplementation((topic, subOpts, cb) => {
      clientSubCb = cb;
      return mockClient;
    });
    let subCb = vi.fn();
    let topicMock = 'test_topic';
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let subPromise = msgRouter.sub(topicMock, subCb);
    assert(clientSubCb !== undefined);
    clientSubCb(null);
    let subOffCb = await subPromise;
    mockClient.on.mockImplementation((evt, cb) => {
      if(evt === 'message') {
        messageHandlerFn = cb as mqtt.OnMessageCallback;
      }
      return mockClient;
    });
    msgRouter.listen();
    assert(messageHandlerFn !== undefined);
    let payloadMock = {
      val: 'mock_val',
    } as const;
    let payloadBuf = Buffer.from(JSON.stringify(payloadMock));
    let packetMock = getMockPubPacket(topicMock, payloadBuf);
    subOffCb();
    messageHandlerFn(topicMock, payloadBuf, packetMock);
    expect(subCb).toHaveBeenCalledTimes(0);
  });

  test('.publish() called with custom qos', async () => {
    let msgRouter = MsgRouter.init(mockClient, mockLogger);
    let pubOpts = {
      qos: 2 // invalid with actual client
    } as const;
    let topicMock = 'test_topic';
    let pubMsgMock = 'test';
    await msgRouter.publish(topicMock, pubMsgMock, pubOpts);
    expect(mockClient.publishAsync).toHaveBeenCalledWith(topicMock, pubMsgMock, pubOpts);
  });
});

/*
  details of this are fuzzy since this program doesn't utilized packet info
_*/
function getMockPubPacket(topic: string, payload: Buffer): mqtt.IPublishPacket {
  return {
    cmd: 'publish',
    retain: false,
    qos: 1,
    dup: false,
    length: 65,
    payload,
    topic,
  };
}
