
import { MaisonDeviceDef } from '../models/maison-device';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';

const maison_topic_prefix = 'ezd';
const maison_action_topic_name = 'rmt_ctrl';
const maison_action_topic = `${maison_topic_prefix}/${maison_action_topic_name}`;

/* TODO: load these from a config or DB */
const maison_devices: MaisonDeviceDef[] = [
  {
    name: 'croc',
  },
  {
    name: 'rabbit',
  },
  {
    name: 'sengled_light_2',
  },
  {
    name: 'sengled_light_1',
  },
  {
    name: 'sengled_led_strip',
  },
];

export const maisonConfig = {
  z2m_topic_prefix,
  ikea_remote_name,
  maison_action_topic,
  maison_devices,
} as const;
