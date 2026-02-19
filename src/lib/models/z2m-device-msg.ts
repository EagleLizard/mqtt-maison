
import { Type, Static } from '@sinclair/typebox';
import { TransformDecodeCheckError, Value } from '@sinclair/typebox/value';

const Z2mDeviceMsgTSchema = Type.Object({
  state: Type.String(),
});
export type Z2mDeviceMsg = Static<typeof Z2mDeviceMsgTSchema>;
export const Z2mDeviceMsg = {
  parse: z2mDeviceMsgParse,
} as const;

function z2mDeviceMsgParse(rawVal: unknown): Z2mDeviceMsg {
  try {
    return Value.Decode(Z2mDeviceMsgTSchema, rawVal);
  } catch(e) {
    if(!(e instanceof TransformDecodeCheckError)) {
      throw e;
    }
    throw new Error(`${e.error.message}, path: ${e.error.path}`, { cause: e });
  }
}
