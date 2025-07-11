
import { mqttUtil } from '../service/mqtt-util';
import { prim } from '../util/validate-primitives';
import { maison_actions, MaisonAction } from './maison-actions';

export class MaisonActionPayload {
  action: MaisonAction;
  constructor(action: MaisonAction) {
    this.action = action;
  }
  static parse(rawVal: Buffer | unknown): MaisonActionPayload {
    if(rawVal instanceof Buffer) {
      rawVal = mqttUtil.parsePayload(rawVal);
    }
    if(!prim.isObject(rawVal)) {
      throw new Error('Expected object');
    }
    if(!prim.isString(rawVal.action)) {
      throw new Error('Expected .action to be a string');
    }
    if(!maison_actions.checkAction(rawVal.action)) {
      throw new Error(`Invalid action: ${rawVal.action}`);
    }
    return new MaisonActionPayload(rawVal.action);
  }
}
