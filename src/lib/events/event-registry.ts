
type RegisteredEventFn<Evt = void> = {
  id: string;
  fn: (evt: Evt) => void;
};

export class EventRegistry<Evt = void> {
  private eventFnMap: Map<string, RegisteredEventFn<Evt>>;
  private evtIdCounter: number;
  constructor() {
    this.eventFnMap = new Map();
    this.evtIdCounter = 0;
  }
  register(fn: (evt: Evt) => void): () => void {
    let evtId = this.getNextEvtId();
    this.eventFnMap.set(evtId, {
      id: evtId,
      fn,
    });
    return () => {
      this.eventFnMap.delete(evtId);
    };
  }
  fire(evt: Evt) {
    let evtIds = [ ...this.eventFnMap.keys() ];
    for(let i = 0; i < evtIds.length; ++i) {
      let currId = evtIds[i];
      let regEvt = this.eventFnMap.get(currId);
      regEvt?.fn(evt);
    }
  }
  eventFnCount(): number {
    return this.eventFnMap.size;
  }
  private getNextEvtId(): string {
    return `${this.evtIdCounter++}`;
  }
}
