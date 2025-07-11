import { mqttUtil } from '../service/mqtt-util';
import { prim } from '../util/validate-primitives';

export class EzdActionPayload {
  action: string;
  constructor(action: string) {
    this.action = action;
  }
  static parse(rawVal: Buffer | unknown): EzdActionPayload {
    if(rawVal instanceof Buffer) {
      rawVal = mqttUtil.parsePayload(rawVal);
    }
    if(!prim.isObject(rawVal)) {
      throw new Error('Expected object');
    }
    if(!prim.isString(rawVal.action)) {
      throw new Error('Expected .action to be a string');
    }
    return new EzdActionPayload(rawVal.action);
  }
}
