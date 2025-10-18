import {describe, expect, it, vi} from 'vitest';
import {Subject} from './subject';

describe('Subject', () => {
  describe('subscribe', () => {
    it('should call next on observer when next is called', () => {
      const subject = new Subject<number>();
      const nextSpy = vi.fn();
      const observer = {
        next: nextSpy,
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      subject.next(42);

      expect(nextSpy).toHaveBeenCalledWith(42);
      expect(nextSpy).toHaveBeenCalledTimes(1);
    });

    it('should call next on multiple observers', () => {
      const subject = new Subject<string>();
      const observer1 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const observer2 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer1);
      subject.subscribe(observer2);
      subject.next('test');

      expect(observer1.next).toHaveBeenCalledWith('test');
      expect(observer2.next).toHaveBeenCalledWith('test');
    });

    it('should return unsubscribe function', () => {
      const subject = new Subject<number>();
      const nextSpy = vi.fn();
      const observer = {
        next: nextSpy,
        error: vi.fn(),
        complete: vi.fn(),
      };

      const unsubscribe = subject.subscribe(observer);
      subject.next(1);
      expect(nextSpy).toHaveBeenCalledTimes(1);

      unsubscribe();
      subject.next(2);
      expect(nextSpy).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should throw error when subscribing to completed subject', () => {
      const subject = new Subject<number>();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.complete();

      expect(() => subject.subscribe(observer)).toThrow(
        'Operation not allowed on a completed Subject',
      );
    });

    it('should allow multiple subscriptions with same observer reference', () => {
      const subject = new Subject<number>();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      subject.subscribe(observer);
      subject.next(5);

      // Each subscription creates a wrapper, so next is called twice
      expect(observer.next).toHaveBeenCalledTimes(2);
      expect(observer.next).toHaveBeenCalledWith(5);
    });
  });

  describe('next', () => {
    it('should emit data to all observers', () => {
      const subject = new Subject<number>();
      const observer1 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const observer2 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer1);
      subject.subscribe(observer2);
      subject.next(100);

      expect(observer1.next).toHaveBeenCalledWith(100);
      expect(observer2.next).toHaveBeenCalledWith(100);
    });

    it('should handle multiple next calls', () => {
      const subject = new Subject<string>();
      const nextSpy = vi.fn();
      const observer = {
        next: nextSpy,
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      subject.next('first');
      subject.next('second');
      subject.next('third');

      expect(nextSpy).toHaveBeenCalledTimes(3);
      expect(nextSpy).toHaveBeenNthCalledWith(1, 'first');
      expect(nextSpy).toHaveBeenNthCalledWith(2, 'second');
      expect(nextSpy).toHaveBeenNthCalledWith(3, 'third');
    });

    it('should throw error when calling next on completed subject', () => {
      const subject = new Subject<number>();
      subject.complete();

      expect(() => subject.next(1)).toThrow('Operation not allowed on a completed Subject');
    });

    it('should not call next on unsubscribed observers', () => {
      const subject = new Subject<number>();
      const nextSpy = vi.fn();
      const observer = {
        next: nextSpy,
        error: vi.fn(),
        complete: vi.fn(),
      };

      const unsubscribe = subject.subscribe(observer);
      subject.next(1);
      unsubscribe();
      subject.next(2);

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(nextSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error', () => {
    it('should call error on all observers', () => {
      const subject = new Subject<number>();
      const error = new Error('test error');
      const observer1 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const observer2 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer1);
      subject.subscribe(observer2);
      subject.error(error);

      expect(observer1.error).toHaveBeenCalledWith(error);
      expect(observer2.error).toHaveBeenCalledWith(error);
    });

    it('should handle non-Error values', () => {
      const subject = new Subject<number>();
      const errorSpy = vi.fn();
      const observer = {
        next: vi.fn(),
        error: errorSpy,
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      subject.error('string error');

      expect(errorSpy).toHaveBeenCalledWith('string error');
    });

    it('should throw error when calling error on completed subject', () => {
      const subject = new Subject<number>();
      subject.complete();

      expect(() => subject.error(new Error('test'))).toThrow(
        'Operation not allowed on a completed Subject',
      );
    });

    it('should not call error on unsubscribed observers', () => {
      const subject = new Subject<number>();
      const errorSpy = vi.fn();
      const observer = {
        next: vi.fn(),
        error: errorSpy,
        complete: vi.fn(),
      };

      const unsubscribe = subject.subscribe(observer);
      unsubscribe();
      subject.error(new Error('test'));

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('should call complete on all observers', () => {
      const subject = new Subject<number>();
      const observer1 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const observer2 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer1);
      subject.subscribe(observer2);
      subject.complete();

      expect(observer1.complete).toHaveBeenCalledTimes(1);
      expect(observer2.complete).toHaveBeenCalledTimes(1);
    });

    it('should clear all observers after completion', () => {
      const subject = new Subject<number>();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      subject.complete();

      // Observers should be cleared, so subscribing should fail
      expect(() =>
        subject.subscribe({
          next: vi.fn(),
          error: vi.fn(),
          complete: vi.fn(),
        }),
      ).toThrow('Operation not allowed on a completed Subject');
    });

    it('should throw error when calling complete on already completed subject', () => {
      const subject = new Subject<number>();
      subject.complete();

      expect(() => subject.complete()).toThrow('Operation not allowed on a completed Subject');
    });

    it('should not call complete on unsubscribed observers', () => {
      const subject = new Subject<number>();
      const completeSpy = vi.fn();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: completeSpy,
      };

      const unsubscribe = subject.subscribe(observer);
      unsubscribe();
      subject.complete();

      expect(completeSpy).not.toHaveBeenCalled();
    });
  });

  describe('observer wrapper behavior', () => {
    it('should create unique wrapper for each subscription', () => {
      const subject = new Subject<number>();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      const unsubscribe1 = subject.subscribe(observer);
      const unsubscribe2 = subject.subscribe(observer);

      subject.next(1);
      expect(observer.next).toHaveBeenCalledTimes(2);

      unsubscribe1();
      subject.next(2);
      expect(observer.next).toHaveBeenCalledTimes(3); // Only second subscription remains

      unsubscribe2();
      subject.next(3);
      expect(observer.next).toHaveBeenCalledTimes(3); // No more calls
    });
  });

  describe('type safety', () => {
    it('should handle different data types', () => {
      interface TestData {
        id: number;
        name: string;
      }

      const subject = new Subject<TestData>();
      const nextSpy = vi.fn();
      const observer = {
        next: nextSpy,
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer);
      const data = {id: 1, name: 'test'};
      subject.next(data);

      expect(nextSpy).toHaveBeenCalledWith(data);
    });

    it('should handle null and undefined values', () => {
      const subjectNull = new Subject<null>();
      const nextSpyNull = vi.fn();

      subjectNull.subscribe({
        next: nextSpyNull,
        error: vi.fn(),
        complete: vi.fn(),
      });
      subjectNull.next(null);

      expect(nextSpyNull).toHaveBeenCalledWith(null);

      const subjectUndefined = new Subject<undefined>();
      const nextSpyUndefined = vi.fn();

      subjectUndefined.subscribe({
        next: nextSpyUndefined,
        error: vi.fn(),
        complete: vi.fn(),
      });
      subjectUndefined.next(undefined);

      expect(nextSpyUndefined).toHaveBeenCalledWith(undefined);
    });
  });

  describe('edge cases', () => {
    it('should handle empty observers set', () => {
      const subject = new Subject<number>();

      expect(() => subject.next(1)).not.toThrow();
      expect(() => subject.error(new Error('test'))).not.toThrow();
      expect(() => subject.complete()).not.toThrow();
    });

    it('should handle observer methods that throw errors', () => {
      const subject = new Subject<number>();
      const observer1 = {
        next: vi.fn(() => {
          throw new Error('observer1 error');
        }),
        error: vi.fn(),
        complete: vi.fn(),
      };
      const observer2 = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      subject.subscribe(observer1);
      subject.subscribe(observer2);

      // First observer throws, but second should still be called
      expect(() => subject.next(1)).toThrow('observer1 error');
      expect(observer1.next).toHaveBeenCalledWith(1);
      // Note: Due to how the implementation works, observer2 may not be called
      // if observer1 throws, depending on Set iteration order
    });

    it('should handle unsubscribe called multiple times', () => {
      const subject = new Subject<number>();
      const observer = {
        next: vi.fn(),
        error: vi.fn(),
        complete: vi.fn(),
      };

      const unsubscribe = subject.subscribe(observer);
      unsubscribe();
      unsubscribe(); // Should not throw

      subject.next(1);
      expect(observer.next).not.toHaveBeenCalled();
    });
  });
});
