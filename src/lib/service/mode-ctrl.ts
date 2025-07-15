import { RemoteMode, RemoteSubMode } from '../models/remote-mode';

type ModeCtrlCtorParams = {
  defaultMode: RemoteMode;
  subModes: RemoteSubMode[];
} & {};

export class ModeCtrl {
  private _defaultMode: RemoteMode;
  private subModes: RemoteSubMode[];
  private _currMode: RemoteSubMode;
  private currModeIdx: number;
  private constructor(params: ModeCtrlCtorParams) {
    this._defaultMode = params.defaultMode;
    this.subModes = params.subModes;
    this._currMode = this._defaultMode;
    this.currModeIdx = 0;
  }
  defaultMode() {
    return this._defaultMode;
  }
  currMode(): RemoteSubMode {
    return this._currMode;
  }
  selectNext() {
    this.select(1);
  }
  selectPrev() {
    this.select(-1);
  }
  private select(incVal: number) {
    let nextIdx: number;
    if(incVal > 0) {
      incVal = 1;
    } else if(incVal < 0) {
      incVal = -1;
    } else {
      return; // 0 case, no selection. Invalid.
    }
    if(this.currModeIdx === 0 && this.subModes.length < 1) {
      return; // no submodes, do nothing
    }
    nextIdx = this.currModeIdx + incVal;
    if(nextIdx > this.subModes.length) {
      nextIdx = 0;
    } else if(nextIdx < 0) {
      nextIdx = this.subModes.length;
    }
    this.currModeIdx = nextIdx;
    if(this.currModeIdx === 0) {
      this._currMode = this._defaultMode;
    } else {
      this._currMode = this.subModes[this.currModeIdx - 1];
    }
  }

  static init(params: ModeCtrlCtorParams): ModeCtrl {
    let modeCtrl: ModeCtrl;
    modeCtrl = new ModeCtrl(params);
    return modeCtrl;
  }
}
