
import EventEmitter from 'node:events';

/*
Same interface as event-registry, but using EventEmitter instead.
References:
  - https://github.com/mqttjs/MQTT.js/blob/main/src/lib/TypedEmitter.ts
  - https://github.com/pinojs/pino/blob/main/lib/worker.js
_*/

const default_evt_name = 'evt';

export class EeRegistry<Evt = void> {
  private ee: EventEmitter;
  private evtName: string;
  constructor() {
    this.ee = new EventEmitter();
    this.evtName = default_evt_name;
  }
  register(fn: (evt: Evt) => void): () => void {
    this.ee.on(this.evtName, fn);
    return () => {
      this.ee.off(this.evtName, fn);
    };
  }
  registerOnce(fn: (evt: Evt) => void): () => void {
    this.ee.once(this.evtName, fn);
    return () => {
      this.ee.off(this.evtName, fn);
    };
  }
  fire(evt: Evt) {
    this.ee.emit(this.evtName, evt);
  }
  eventFnCount(): number {
    return this.ee.listeners(this.evtName).length;
  }
}
