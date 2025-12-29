import type {Observer} from './observable';
import type {ReplicaEvent} from './replica';
import {Subject, type Unsub} from './subject';

export class ReplicaEventBus implements Observer<ReplicaEvent> {
  private readonly subjects = new Map<string, Subject<ReplicaEvent>>();

  constructor() {}

  next(event: ReplicaEvent): void {
    const subject = this.subjects.get(event.entity.projectId);
    if (subject) {
      subject.next(event);
    }
  }

  error(err: unknown): void {
    for (const subject of this.subjects.values()) {
      subject.error(err);
    }
  }

  complete(): void {
    for (const subject of this.subjects.values()) {
      subject.complete();
    }
    this.subjects.clear();
  }

  subscribe(projectId: string, observer: Observer<ReplicaEvent>): Unsub {
    let subject = this.subjects.get(projectId);
    if (!subject) {
      subject = new Subject<ReplicaEvent>();
      this.subjects.set(projectId, subject);
    }
    const unsub = subject.subscribe(observer);

    return () => {
      unsub();
      if (subject.observersCount === 0) {
        this.subjects.delete(projectId);
      }
    };
  }
}
