
type RegisteredEvent<Evt = void> = {
  id: string;
  fn: (evt: Evt) => void;
};

export class EventRegistry<Evt = void> {
  private eventMap: Map<string, RegisteredEvent<Evt>>;
  private evtIdCounter: number;
  constructor() {
    this.eventMap = new Map();
    this.evtIdCounter = 0;
  }
  register(fn: (evt: Evt) => void): () => void {
    let evtId = this.getNextEvtId();
    this.eventMap.set(evtId, {
      id: evtId,
      fn,
    });
    return () => {
      this.eventMap.delete(evtId);
    };
  }
  fire(evt: Evt) {
    let evtIds = [ ...this.eventMap.keys() ];
    for(let i = 0; i < evtIds.length; ++i) {
      let currId = evtIds[i];
      let regEvt = this.eventMap.get(currId);
      regEvt?.fn(evt);
    }
  }
  eventCount(): number {
    return this.eventMap.size;
  }
  private getNextEvtId(): string {
    return `${this.evtIdCounter++}`;
  }
}
