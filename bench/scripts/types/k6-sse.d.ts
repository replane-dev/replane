declare module "k6/x/sse" {
  import { RefinedResponse, ResponseType } from "k6/http";

  export interface SSEParams {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    tags?: Record<string, string>;
  }

  export interface SSEEvent {
    id: string;
    name: string;
    data: string;
    origin: string;
    lastEventId: string;
  }

  export interface SSEError {
    error(): string;
  }

  export interface SSEClient {
    on(event: "open", callback: () => void): void;
    on(event: "event", callback: (event: SSEEvent) => void): void;
    on(event: "error", callback: (error: SSEError) => void): void;
    close(): void;
  }

  export interface SSEResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
    error: string;
  }

  export function open(
    url: string,
    params: SSEParams,
    callback: (client: SSEClient) => void
  ): SSEResponse;

  const sse: {
    open: typeof open;
  };

  export default sse;
}
