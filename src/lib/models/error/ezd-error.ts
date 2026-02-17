
import { prim } from '../../util/validate-primitives';

const default_err_code = 'MQ_0.1';

/*
Intended as a superclass, but can be used without extending
_*/
export class EzdError extends Error {
  public readonly code: string;
  public readonly ezdMsg: string;
  constructor(message?: string, code?: string)
  constructor(message?: string, options?: ErrorOptions)
  constructor(message?: string, code?: string, options?: ErrorOptions)
  constructor(message?: string, code?: string | ErrorOptions, options?: ErrorOptions) {
    if(prim.isObject(code)) {
      options = code;
      code = undefined;
    } else if(!prim.isString(code)) {
      code = default_err_code;
    }
    super(message, options);
    this.name = 'EzdError';
    Object.setPrototypeOf(this, EzdError.prototype);
    this.code = code ?? default_err_code;
    this.ezdMsg = this.message;
    /* for logging: include code and message _*/
    this.message = `${this.code}: ${this.ezdMsg}`;
  }
}
