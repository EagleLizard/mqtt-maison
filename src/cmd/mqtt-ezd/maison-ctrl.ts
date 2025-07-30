
import { MaisonActionPayload } from '../../lib/models/maison-action-payload';
import { MqttCtx } from '../../lib/models/mqtt-ctx';
import { MqttMsgEvt } from './msg-router';
import { modeMain } from './remote-modes/mode-main';

/*
singleton for now
_*/
let ctrlInstance: MaisonCtrl | undefined;

export class MaisonCtrl {
  private constructor() {}

  async handleMsg(ctx: MqttCtx, evt: MqttMsgEvt) {
    let payload: MaisonActionPayload;
    let startMs: number;
    let endMs: number;
    let msgAgeMs: number;
    let msgDob: Date;

    try {
      payload = MaisonActionPayload.parse(evt.payload);
    } catch(e) {
      ctx.logger.error(e);
      return;
    }
    startMs = Date.now();
    msgDob = new Date(payload.dob);
    msgAgeMs = startMs - msgDob.valueOf();
    ctx.logger.info({
      topic: evt.topic,
      payload: payload,
    });
    // ctx.logger.debug({ action: payload.action, age: msgAgeMs });
    console.log(`age: ${msgAgeMs} ms`);
    if(payload.action === 'main') {
      await modeMain.main(ctx);
    } else if(payload.action === 'up') {
      await modeMain.up(ctx);
    } else if(payload.action === 'down') {
      await modeMain.down(ctx);
    } else if(payload.action === 'dot') {
      /* todo: dot */
    } else {
      ctx.logger.info(`unhandled action ${evt.topic}: '${payload.action}'`);
    }
    endMs = Date.now();
    /*
      This exists here to debug cases where the handler hangs and never resolves.
        Any async operations should either resolve / reject or timeout.
    _*/
    ctx.logger.debug({
      log: {
        topic: evt.topic,
        payload: payload,
        elapsed: endMs - startMs,
      }
    }, 'END maisonCtrl.handleMsg()');
  }

  static async init(): Promise<MaisonCtrl> {
    if(ctrlInstance === undefined) {
      ctrlInstance = new MaisonCtrl();
    }
    return ctrlInstance;
  }
}
