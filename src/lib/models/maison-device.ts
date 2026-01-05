
import { Static, Type } from '@sinclair/typebox';
import { tbUtil } from '../util/tb-util';

const MaisonDeviceDefTSchema = Type.Object({
  /*
    Currently I'll target just the binary state features of devices,
      which are available on switches and lights.
    I want to extend this to include device-specific features,
      e.g. brightness, color for lights
  */
  name: Type.String(), // friendly_name
  groups: Type.Optional(Type.Array(Type.String())),
});

export type MaisonDeviceDef = Static<typeof MaisonDeviceDefTSchema>;

/*
TypeCompiler version. not sure this is a great abstraction so stubbing for now
_*/
// const maisonDeviceParse = (() => {
//   const decodeFn = tbUtil.getSchemaDecodeFn(MaisonDeviceTSchema);
//   return (rawVal: unknown): MaisonDevice => {
//     return decodeFn(rawVal);
//   };
// })();

export const MaisonDeviceDefSchema = {
  parse: maisonDeviceDefParse,
  tschema: MaisonDeviceDefTSchema,
} as const;

function maisonDeviceDefParse(rawVal: unknown): MaisonDeviceDef {
  return tbUtil.decodeWithSchema(MaisonDeviceDefTSchema, rawVal);
}

// export type MaisonDevice = {

//   name: string; // friendly_name
// } & {};
