
import assert from 'node:assert';

const ikea_remote_actions = [
  'toggle',
  'volume_up',
  'volume_down',
  'track_next',
  'track_previous',
  'dots_1_initial_press',
  'dots_1_short_release',
  'dots_1_long_press',
  'dots_1_long_release',
  'dots_1_double_press',
  'dots_2_initial_press',
  'dots_2_long_press',
  'dots_2_long_release',
  'dots_2_double_press',
];

const maison_actions_enum = {
  main: 'main',
  up: 'up',
  up_hold: 'up_hold',
  down: 'down',
  down_hold: 'down_hold',
  next: 'next',
  prev: 'prev',
  dot: 'dot',
  dot_double: 'dot_double',
  dot_long: 'dot_long',
  dots: 'dots',
  dots_double: 'dots_double',
  dots_long: 'dots_long',
} as const;
const maison_action_map = new Map(Object.entries(maison_actions_enum));
assert(maison_action_map.keys().every((k) => {
  return k === maison_action_map.get(k);
}));

export type MaisonAction = (typeof maison_actions_enum)[keyof typeof maison_actions_enum];

/*
mapping of ikea symfonisk remote actions to our actions
possible actions:
  toggle
  volume_up
  volume_down
  track_next
  track_previous
  dots_1_initial_press
  dots_1_short_release
  dots_1_long_press
  dots_1_long_release
  dots_1_double_press
  dots_2_initial_press
  dots_2_long_press
  dots_2_long_release
  dots_2_double_press
_*/
const ikea_action_map = new Map(Object.entries<MaisonAction>({
  toggle: 'main',
  volume_up: 'up',
  volume_up_hold: 'up_hold',
  volume_down: 'down',
  volume_down_hold: 'down_hold',
  track_next: 'next',
  track_previous: 'prev',
  dots_1_short_release: 'dot',
  dots_1_double_press: 'dot_double',
  dots_1_long_release: 'dot_long',
  dots_2_short_release: 'dots',
  dots_2_double_press: 'dots_double',
}));

export const maison_actions = {
  ikea_action_map,
  checkAction: checkMaisonAction,
};

function checkMaisonAction(val: string): val is MaisonAction {
  return maison_action_map.has(val);
}
