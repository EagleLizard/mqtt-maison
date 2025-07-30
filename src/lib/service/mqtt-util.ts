
import mqtt from 'mqtt';
import { ezdConfig } from '../../config';

export const mqttUtil = {
  parsePayload: parsePayload,
  initClient: initClient,
} as const;

function parsePayload(buf: Buffer): unknown | string {
  let payloadStr = buf.toString();
  let payload: unknown | string;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    payload = payloadStr;
  }
  return payload;
}

function initClient(): Promise<mqtt.MqttClient> {
  let p: Promise<mqtt.MqttClient>;
  let clientId: string;
  let mqttCfg = ezdConfig.getMqttConfig();
  clientId = 'mqtt-maison-ts';
  if(ezdConfig.isDevEnv()) {
    /*
      Set clientId during dev to be different than deployed version (if any).
      Needed because the MQTT broker may terminate the running client if we
        attempt to connect with the same clientId.
    _*/
    clientId = `${clientId}_dev`;
  }
  let client = mqtt.connect(mqttCfg.mqtt_server, {
    username: mqttCfg.mqtt_user,
    password: mqttCfg.mqtt_password,
    clientId,
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
