
import { ezdConfig } from '../../config';
import { logger } from '../../lib/logger/logger';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';

export async function mqttEzdMain() {
  let mqttCfg = ezdConfig.getMqttConfig();
  console.log('mqtt-ezd main ~');
  logger.info('mqtt-ezd start');
}
