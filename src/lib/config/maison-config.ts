
import { MaisonDevice } from '../models/maison-device';

// TODO: make these configurable
const z2m_topic_prefix = 'zigbee2mqtt';
const ikea_remote_name = 'symfonisk_remote';

const maison_topic_prefix = 'ezd';
const maison_action_topic = `${maison_topic_prefix}/etc`;

/* TODO: load these from a config or DB */
const maison_devices: MaisonDevice[] = [
  {
    name: 'croc',
  },
  {
    name: 'rabbit',
  },
];

export const maisonConfig = {
  z2m_topic_prefix,
  ikea_remote_name,
  maison_action_topic,
  maison_devices,
} as const;
