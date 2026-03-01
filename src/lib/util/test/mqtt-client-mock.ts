import mqtt from 'mqtt/*';
import { Mocked, vi } from 'vitest';
import { prim } from '../validate-primitives';

export const MqttClientMock = {
  init: init,
  getMockPubPacket: getMockPubPacket,
} as const;

function init(): Mocked<mqtt.MqttClient> {
  let mockClient = {
    subscribe: vi.fn() as mqtt.MqttClient['subscribe'],
    unsubscribe: vi.fn() as mqtt.MqttClient['unsubscribe'],
    listenerCount: vi.fn() as mqtt.MqttClient['listenerCount'],
    on: vi.fn() as mqtt.MqttClient['on'],
    off: vi.fn() as mqtt.MqttClient['off'],
    publishAsync: vi.fn().mockResolvedValue(undefined) as mqtt.MqttClient['publishAsync'],
  } as Mocked<mqtt.MqttClient>;
  return mockClient;
}

/*
  details of this are fuzzy since this program doesn't utilized packet info
_*/
function getMockPubPacket(topic: string, payload: Buffer | unknown): mqtt.IPublishPacket {
  let payloadBuf: Buffer = (Buffer.isBuffer(payload))
    ? payload
    : (prim.isString(payload))
      ? Buffer.from(payload)
      : Buffer.from(JSON.stringify(payload))
  ;
  return {
    cmd: 'publish',
    retain: false,
    qos: 1,
    dup: false,
    length: 65,
    payload: payloadBuf,
    topic,
  };
}
