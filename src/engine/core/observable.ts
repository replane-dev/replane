export interface Observer<T> {
  next: (data: T) => void;
  error: (err: unknown) => void;
  complete: () => void;
}

export interface Observable<T> {
  subscribe(observer: Observer<T>): () => void;
}
