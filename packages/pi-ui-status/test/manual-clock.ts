interface ScheduledTask {
  callback: () => void;
  dueAt: number;
  interval?: number;
}

export class ManualClock {
  private currentTime = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, ScheduledTask>();

  readonly intervals: number[] = [];
  readonly timeouts: number[] = [];

  now = (): number => this.currentTime;

  setInterval = (callback: () => void, milliseconds: number): unknown => {
    const id = this.nextId;
    this.nextId += 1;
    this.intervals.push(milliseconds);
    this.tasks.set(id, {
      callback,
      dueAt: this.currentTime + milliseconds,
      interval: milliseconds,
    });
    return id;
  };

  clearInterval = (handle: unknown): void => {
    this.tasks.delete(handle as number);
  };

  setTimeout = (callback: () => void, milliseconds: number): unknown => {
    const id = this.nextId;
    this.nextId += 1;
    this.timeouts.push(milliseconds);
    this.tasks.set(id, {
      callback,
      dueAt: this.currentTime + milliseconds,
    });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.tasks.delete(handle as number);
  };

  activeTimers = (): number => this.tasks.size;

  private readonly nextTaskBefore = (
    target: number
  ): [number, ScheduledTask] | undefined => {
    const [next] = [...this.tasks.entries()]
      .filter(([, candidate]) => candidate.dueAt <= target)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    return next;
  };

  advance = (milliseconds: number): void => {
    const target = this.currentTime + milliseconds;
    let next = this.nextTaskBefore(target);
    while (next) {
      const [id, scheduled] = next;
      this.currentTime = scheduled.dueAt;
      if (scheduled.interval === undefined) {
        this.tasks.delete(id);
      } else {
        scheduled.dueAt += scheduled.interval;
      }
      scheduled.callback();
      next = this.nextTaskBefore(target);
    }
    this.currentTime = target;
  };
}
