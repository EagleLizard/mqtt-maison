
import { mqttUtil } from '../service/mqtt-util';
import { prim } from '../util/validate-primitives';
import { maison_actions, MaisonAction } from './maison-actions';

export class MaisonActionPayload {
  action: MaisonAction;
  /* ISO 8691 string _*/
  dob: string;
  constructor(action: MaisonAction, dob: string) {
    this.action = action;
    this.dob = dob;
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
    // if((rawVal.dob !== undefined) && !prim.isString(rawVal.dob)) {
    if((rawVal.dob === undefined) || !prim.isString(rawVal.dob)) {
      /*
      TODO: validate datetime strictly
      _*/
      throw new Error(`Invalid dob: ${rawVal.dob}`);
    }
    return new MaisonActionPayload(rawVal.action, rawVal.dob);
  }
}
