export class Semaphore {
  private count: number;
  private queue: Array<(value: void | PromiseLike<void>) => void> = [];

  constructor(maxConcurrency: number) {
    this.count = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) resolve();
    } else {
      this.count++;
    }
  }
}
