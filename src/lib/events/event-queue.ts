
/* borrows from prior art like async.queue */

type QueueItem<Evt = void> = {
  evt: Evt;
  doneCb?: (err?: unknown) => void;
};

export class EventQueue<Evt = void> {
  queueItems: QueueItem<Evt>[];
  _running: boolean;
  runningTask: QueueItem<Evt> | undefined;
  private _drainFn?: () => void;
  private taskFn: (evt: Evt, doneCb: (err?: unknown) => void) => void;
  private constructor(taskFn: (evt: Evt, doneCb: (err?: unknown) => void) => void) {
    this.queueItems = [];
    this._running = true;
    this.runningTask = undefined;

    this.taskFn = taskFn;
  }
  push(evt: Evt, cb?: (err?: unknown) => void) {
    this.queueItems.push({
      evt,
      doneCb: cb,
    });
    this.runNext();
  }

  drain(drainCb?: () => void) {
    this._drainFn = drainCb;
  }

  private runNext() {
    let nextTask: QueueItem<Evt>;
    if(!this._running) {
      return;
    }
    if(this.runningTask !== undefined) {
      return;
    }
    if(this.queueItems.length < 1) {
      /* drain ? */
      this._drainFn?.();
      return;
    }
    nextTask = this.queueItems.shift()!;
    this.runningTask = nextTask;
    let doneCb = (err?: unknown) => {
      /* clean up and run the next task */
      nextTask.doneCb?.(err);
      this.runningTask = undefined;
      this.runNext();
    };
    this.taskFn(nextTask.evt, doneCb);
  }

  static init<T>(taskFn: (evt: T, doneCb: (err?: unknown) => void) => void): EventQueue<T> {
    let eventQueue: EventQueue<T>;
    eventQueue = new EventQueue(taskFn);
    return eventQueue;
  }
}
