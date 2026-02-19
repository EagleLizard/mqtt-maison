
import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { mqttUtil } from './mqtt-util';
import mqtt from 'mqtt/*';

const mqttMock = vi.hoisted(() => {
  return {
    connect: vi.fn(),
  };
});
vi.mock('mqtt', () => {
  return {
    default: mqttMock,
  };
});

describe('mqtt-util', () => {
  let mockClient: Mocked<mqtt.MqttClient>;
  let connectCb: ($e?: unknown) => void;
  let errCb: ($e?: unknown) => void;
  beforeEach(() => {
    mockClient = {
      once: (evtStr: 'error' | 'connect', cb: ($e?: unknown) => void) => {
        if(evtStr === 'connect') {
          connectCb = cb;
        } else if(evtStr === 'error') {
          errCb = cb;
        }
      },
      off: vi.fn() as mqtt.MqttClient['off'],
    } as Mocked<mqtt.MqttClient>;
    mqttMock.connect.mockReturnValue(mockClient);
  });
  test('initClient resolves', async () => {
    let p = mqttUtil.initClient();
    connectCb();
    await p;
    expect(mockClient.off).toHaveBeenCalledOnce();
  });
  test('initClient error throws', async () => {
    const mockErrorMsg = 'mock_mqtt_init_error';
    let p = mqttUtil.initClient();
    await expect(async () => {
      errCb(new Error(mockErrorMsg));
      await p;
    }).rejects.toThrow(mockErrorMsg);
  });
});
