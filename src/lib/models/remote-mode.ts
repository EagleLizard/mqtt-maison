
import { MqttCtx } from './mqtt-ctx';

/*
maps to maison actions on our custom topic,
  except for the actions that control mode selection,
  e.g. next / prev
_*/

export type RemoteMode = {
  modeName: string;
  main: (ctx: MqttCtx) => Promise<void>;
  up: (ctx: MqttCtx) => Promise<void>;
  down: (ctx: MqttCtx) => Promise<void>;
  // dot: (ctx: MqttCtx) => Promise<void>;
} & {};

// export type RemoteSubMode = Partial<Omit<RemoteMode, 'modeName'>> & Pick<RemoteMode, 'modeName'>;

// export type RemoteSubMode = {
//   modeName: RemoteMode['modeName'] & {};
//   main?: RemoteMode['main'] & {};
//   up?: RemoteMode['up'] & {};
//   down?: RemoteMode['down'] & {};
// } & {};

/*
static assertions
  see: https://stackoverflow.com/a/72945564/4677252
*/

// type StaticAssert<T extends true> = T;
// type TypeExtends<T, U> = T extends U ? true : false;

// type SubModeExtendsMode = StaticAssert<TypeExtends<RemoteSubMode, RemoteMode> >;
