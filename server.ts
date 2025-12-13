import './sentry.server.config';

import {sdkApi} from '@/sdk-api';
import * as Sentry from '@sentry/nextjs';
import {createServer, IncomingMessage, ServerResponse} from 'http';
import next from 'next';
import type {TLSSocket} from 'tls';
import {parse} from 'url';

if (!process.env.BASE_URL) {
  throw new Error('BASE_URL is not defined');
}
if (!process.env.SECRET_KEY_BASE) {
  throw new Error('SECRET_KEY_BASE is not defined');
}

process.env.NEXTAUTH_SECRET = process.env.SECRET_KEY_BASE;
process.env.NEXTAUTH_URL = process.env.BASE_URL;

const PORT = parseInt(process.env.PORT || '8080', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({dev});
const handle = app.getRequestHandler();

function getClientIp(req: IncomingMessage): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0]?.trim();
  if (Array.isArray(xf)) return xf[0]?.split(',')[0]?.trim();
  const ipFromAny: string | undefined = (req as any).ip;
  return ipFromAny || req.socket.remoteAddress || undefined;
}

function isSensitivePath(pathname: string): boolean {
  return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/v1/auth/');
}

function logRequestStart(req: IncomingMessage) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const search = isSensitivePath(pathname) ? '<REDACTED>' : url.search;
  const ua = (req.headers['user-agent'] as string) || '';
  const ip = getClientIp(req);
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'request_start',
      method: req.method,
      pathname,
      search,
      ip,
      ua,
    }),
  );
}

function logRequestEnd(req: IncomingMessage, res: ServerResponse, startedAt: number) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const search = isSensitivePath(pathname) ? '<REDACTED>' : url.search;
  const durationMs = Date.now() - startedAt;
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'request_end',
      method: req.method,
      pathname,
      search,
      status: res.statusCode,
      duration_ms: durationMs,
    }),
  );
}

function toSdkRequest(req: IncomingMessage): Request {
  const isEncrypted = (req.socket as TLSSocket).encrypted;
  const proto = isEncrypted ? 'https' : 'http';
  const url = new URL(req.url!, `${proto}://${req.headers.host}`);
  if (url.pathname.startsWith('/api/v1')) {
    url.pathname = url.pathname.slice('/api/v1'.length); // Remove /api/v1 prefix
  } else if (url.pathname.startsWith('/api/sdk/v1')) {
    url.pathname = url.pathname.slice('/api/sdk/v1'.length); // Remove /api/sdk/v1 prefix
  } else {
    throw new Error('Invalid SDK path');
  }

  return new Request(url, {
    method: req.method,
    headers: req.headers as any,
    body:
      req.method !== 'GET' && req.method !== 'HEAD'
        ? (req as any) // Node body stream
        : undefined,
  });
}

async function sendResponse(res: ServerResponse, honoRes: Response) {
  res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers));
  if (honoRes.body) {
    for await (const chunk of honoRes.body as any) {
      res.write(chunk);
    }
  }
  res.end();
}

const SDK_PATH_REGEX = [/^\/api\/v\d+\/.*$/, /^\/api\/sdk\/v\d+\/.*$/];
const SENTRY_TUNNEL_PATH = '/api/internal/monitoring';
const HEALTHCHECK_PATH = (() => {
  const path = process.env.HEALTHCHECK_PATH;
  if (!path) {
    return undefined;
  }
  return path.startsWith('/') ? path : `/${path}`;
})();

async function handleSentryTunnel(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  // Read the request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);

  // Parse the envelope header to extract the DSN
  const bodyText = body.toString('utf-8');
  const headerEnd = bodyText.indexOf('\n');
  if (headerEnd === -1) {
    res.statusCode = 400;
    res.end('Invalid envelope');
    return;
  }

  let envelopeHeader: {dsn?: string};
  try {
    envelopeHeader = JSON.parse(bodyText.slice(0, headerEnd));
  } catch {
    res.statusCode = 400;
    res.end('Invalid envelope header');
    return;
  }

  const dsn = envelopeHeader.dsn;
  if (!dsn) {
    res.statusCode = 400;
    res.end('Missing DSN in envelope');
    return;
  }

  // Parse the DSN to get the Sentry ingest URL
  const dsnUrl = new URL(dsn);
  const projectId = dsnUrl.pathname.replace('/', '');
  const sentryIngestUrl = `https://${dsnUrl.host}/api/${projectId}/envelope/`;

  // Forward the envelope to Sentry
  try {
    const sentryResponse = await fetch(sentryIngestUrl, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
    });

    res.statusCode = sentryResponse.status;
    res.end();
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        method: req.method,
        url: req.url,
        sentryIngestUrl,
      },
    });
    console.error('Failed to forward to Sentry:', error);
    res.statusCode = 500;
    res.end('Failed to forward to Sentry');
  }
}

app.prepare().then(() => {
  createServer(async (req, res) => {
    const startedAt = Date.now();
    logRequestStart(req);
    res.on('finish', () => logRequestEnd(req, res, startedAt));
    const parsedUrl = parse(req.url!, true);

    try {
      // Sentry tunnel route - forward browser events to Sentry (bypasses ad-blockers)
      if (parsedUrl.pathname === SENTRY_TUNNEL_PATH) {
        await handleSentryTunnel(req, res);
        return;
      }

      if (parsedUrl.pathname && SDK_PATH_REGEX.some(regex => regex.test(parsedUrl.pathname!))) {
        const honoReq = toSdkRequest(req);
        const honoRes = await sdkApi.fetch(honoReq);
        await sendResponse(res, honoRes);
        return;
      }

      if (HEALTHCHECK_PATH && parsedUrl.pathname === HEALTHCHECK_PATH) {
        const nextHealth = await Promise.all([
          healthcheckAwareSelfFetch('/health')
            .then(res => ({healthy: !res || res.status === 200}))
            .catch(() => ({healthy: false})),
          healthcheckAwareSelfFetch('/api/internal/health')
            .then(res => ({healthy: !res || res.status === 200}))
            .catch(() => ({healthy: false})),
        ]).then(([nextHealth, internalHealth]) => {
          return {
            healthy: nextHealth.healthy && internalHealth.healthy,
          };
        });

        res.statusCode = nextHealth.healthy ? 200 : 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({}));
        return;
      }

      handle(req, res, parsedUrl);
    } catch (error) {
      // Report error to Sentry if enabled
      Sentry.captureException(error, {
        extra: {
          method: req.method,
          url: req.url,
          pathname: parsedUrl.pathname,
        },
      });

      console.error('Server error:', error);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({msg: 'Internal server error'}));
      }
    }
  }).listen(PORT);

  console.log(
    `> Server listening at http://localhost:${PORT} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`,
  );
});

function healthcheckAwareSelfFetch(path: string): Promise<Response | undefined> {
  if (HEALTHCHECK_PATH && path === HEALTHCHECK_PATH) {
    return Promise.resolve(undefined);
  }
  return fetch(`http://localhost:${PORT}${path}`);
}
