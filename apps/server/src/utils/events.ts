type EventListener = (data: any) => void;

export class EventEmitter {
  private listeners: Record<string, EventListener[]> = {};

  on(event: string, listener: EventListener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: EventListener) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
  }

  emit(event: string, data?: any) {
    if (!this.listeners[event]) return;
    for (const listener of this.listeners[event]) {
      listener(data);
    }
  }
}

export const runEvents = new EventEmitter();
