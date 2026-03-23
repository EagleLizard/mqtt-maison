
import 'dotenv/config';
import { prim } from './lib/util/validate-primitives';

const mqtt_required_keys = [
  'mqtt_server_uri',
  'mqtt_user',
  'mqtt_password',
] as const;
type MqttConfigKey = typeof mqtt_required_keys[number];
type MqttConfig = Record<MqttConfigKey, string> & {};

const DEV_ENV_STR = 'dev';

export const ezdConfig = {
  solar: {
    latitude: getNumberEnvVar('sun_latitude'),
    longitude: getNumberEnvVar('sun_longitude'),
    elevation_ft: getNumberEnvVar('sun_elevation_ft'),
  },
  ha_token: process.env['ha_token'] ?? '',
  skipSundown: getBoolEnvVar('SKIP_SUNDOWN'),
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

function getNumberEnvVar(envKey: string): number {
  let rawPort: string;
  let portNum: number;
  rawPort = getEnvVarOrErr(envKey);
  portNum = +rawPort;
  if(isNaN(portNum)) {
    throw new Error(`invalid env var ${envKey}, expected 'number'`);
  }
  return portNum;
}

function getBoolEnvVar(envKey: string): boolean {
  let rawBoolVal = process.env[envKey] ?? '';
  let boolVal = rawBoolVal.toLowerCase() === 'true';
  return boolVal;
}

function getEnvVarOrErr(envKey: string): string {
  let rawEnvVar: string | undefined;
  rawEnvVar = process.env[envKey];
  if(!prim.isString(rawEnvVar)) {
    throw new Error(`Invalid ${envKey}`);
  }
  return rawEnvVar;
}
