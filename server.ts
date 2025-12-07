import {honoApi} from '@/api';
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

const port = parseInt(process.env.PORT || '3000', 10);
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

function toRequest(req: IncomingMessage): Request {
  const isEncrypted = (req.socket as TLSSocket).encrypted;
  const proto = isEncrypted ? 'https' : 'http';
  const url = new URL(req.url!, `${proto}://${req.headers.host}`);
  url.pathname = url.pathname.slice('/api/v1'.length); // Remove /api/v1 prefix

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

app.prepare().then(() => {
  createServer(async (req, res) => {
    const startedAt = Date.now();
    logRequestStart(req);
    res.on('finish', () => logRequestEnd(req, res, startedAt));
    const parsedUrl = parse(req.url!, true);

    if (parsedUrl.pathname?.startsWith('/api/v1')) {
      const honoReq = toRequest(req);
      const honoRes = await honoApi.fetch(honoReq);
      await sendResponse(res, honoRes);
      return;
    }

    const healthPath = process.env.HEALTHCHECK_PATH;
    if (healthPath) {
      const normalized = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
      if (parsedUrl.pathname === normalized) {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({}));
        return;
      }
    }

    handle(req, res, parsedUrl);
  }).listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`,
  );
});
