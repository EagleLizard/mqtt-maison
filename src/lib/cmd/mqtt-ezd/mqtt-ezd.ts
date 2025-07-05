
import { ezdConfig } from '../../../config';

export async function mqttEzdMain() {
  let mqttCfg = ezdConfig.getMqttConfig();
  console.log('mqtt-ezd main ~');
}
