import type {Observable, Observer} from './observable';

export class Subject<T> implements Observable<T> {
  private observers: Set<Observer<T>> = new Set();
  private isCompleted: boolean = false;

  subscribe(observer: Observer<T>): () => void {
    this.ensureNotCompleted();

    // Wrap the observer to create a unique reference
    const observerWrapper: Observer<T> = {
      next: (data: T) => {
        observer.next(data);
      },
      error: (err: unknown) => {
        observer.error(err);
      },
      complete: () => {
        observer.complete();
      },
    };
    this.observers.add(observerWrapper);
    return () => {
      this.observers.delete(observerWrapper);
    };
  }

  next(data: T): void {
    this.ensureNotCompleted();

    for (const observer of this.observers) {
      observer.next(data);
    }
  }

  error(err: unknown): void {
    this.ensureNotCompleted();

    for (const observer of this.observers) {
      observer.error(err);
    }
  }

  complete(): void {
    this.ensureNotCompleted();
    this.isCompleted = true;

    for (const observer of this.observers) {
      observer.complete();
    }
    this.observers.clear();
  }

  private ensureNotCompleted(): void {
    if (this.isCompleted) {
      throw new Error('Operation not allowed on a completed Subject');
    }
  }
}
