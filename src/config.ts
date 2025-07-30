
import 'dotenv/config';

const mqtt_required_keys = [
  'mqtt_server',
  'mqtt_user',
  'mqtt_password',
] as const;
type MqttConfigKey = typeof mqtt_required_keys[number];
type MqttConfig = Record<MqttConfigKey, string> & {};

const DEV_ENV_STR = 'dev';

export const ezdConfig = {
  getMqttConfig,
  isDevEnv: isDevEnv,
  getEnvironment,
} as const;

function isDevEnv() {
  return getEnvironment() === DEV_ENV_STR;
}

function getEnvironment() {
  return process.env.ENVIRONMENT;
}

function getMqttConfig(): MqttConfig {
  let cfg: Partial<MqttConfig>;
  let missingKeys: MqttConfigKey[];
  missingKeys = [];
  cfg = {};
  for(let i = 0; i < mqtt_required_keys.length; ++i) {
    let currKey = mqtt_required_keys[i];
    if(process.env[currKey] === undefined) {
      // throw new Error(`MQTT - Missing required key: ${currKey}`);
      missingKeys.push(currKey);
    }
    cfg[currKey] = process.env[currKey];
  }
  if(missingKeys.length > 0) {
    throw new Error(`MQTT - Missing required key: ${missingKeys.join(', ')}`);
  }
  return cfg as MqttConfig;
}
