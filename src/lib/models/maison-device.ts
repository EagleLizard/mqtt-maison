
import { Static, Type } from '@sinclair/typebox';
import { tbUtil } from '../util/tb-util';

const MaisonDeviceTSchema = Type.Object({
  /*
    Currently I'll target just the binary state features of devices,
      which are available on switches and lights.
    I want to extend this to include device-specific features,
      e.g. brightness, color for lights
  */
  name: Type.String(), // friendly_name
});

export type MaisonDevice = Static<typeof MaisonDeviceTSchema>;

/*
TypeCompiler version. not sure this is a great abstraction so stubbing for now
_*/
// const maisonDeviceParse = (() => {
//   const decodeFn = tbUtil.getSchemaDecodeFn(MaisonDeviceTSchema);
//   return (rawVal: unknown): MaisonDevice => {
//     return decodeFn(rawVal);
//   };
// })();

export const MaisonDeviceSchema = {
  parse: maisonDeviceParse,
  tschema: MaisonDeviceTSchema,
} as const;

function maisonDeviceParse(rawVal: unknown): MaisonDevice {
  return tbUtil.decodeWithSchema(MaisonDeviceTSchema, rawVal);
}

// export type MaisonDevice = {

//   name: string; // friendly_name
// } & {};
