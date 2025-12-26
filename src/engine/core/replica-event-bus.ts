import {Gauge} from 'prom-client';
import type {Observer} from './observable';
import type {ReplicaEvent} from './replica';
import {Subject, type Unsub} from './subject';

// Prometheus gauge for total observers across all projects
const replicaEventBusObservers = new Gauge({
  name: 'replane_replica_event_bus_observers',
  help: 'Number of current observers across all projects in the replica event bus',
  collect() {
    // This will be set by the ReplicaEventBus instance
    // The gauge is updated on subscribe/unsubscribe
  },
});

export class ReplicaEventBus implements Observer<ReplicaEvent> {
  private readonly subjects = new Map<string, Subject<ReplicaEvent>>();

  constructor() {}

  /**
   * Get the total number of observers across all projects
   */
  get totalObserversCount(): number {
    let total = 0;
    for (const subject of this.subjects.values()) {
      total += subject.observersCount;
    }
    return total;
  }

  private updateObserversMetric(): void {
    replicaEventBusObservers.set(this.totalObserversCount);
  }

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
    this.updateObserversMetric();
  }

  subscribe(projectId: string, observer: Observer<ReplicaEvent>): Unsub {
    let subject = this.subjects.get(projectId);
    if (!subject) {
      subject = new Subject<ReplicaEvent>();
      this.subjects.set(projectId, subject);
    }
    const unsub = subject.subscribe(observer);
    this.updateObserversMetric();

    return () => {
      unsub();
      if (subject.observersCount === 0) {
        this.subjects.delete(projectId);
      }
      this.updateObserversMetric();
    };
  }
}
