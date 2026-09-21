import {
  exportInstance,
  importInstance,
  InvalidInstanceBackupError,
  isInstanceTransferAuthorized,
} from '@/engine/core/instance-transfer';
import {getPgPool} from '@/engine/core/pg-pool-cache';
import {getDatabaseUrl} from '@/environment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.INSTANCE_TRANSFER_TOKEN) return new Response(null, {status: 404});
  if (
    !isInstanceTransferAuthorized(
      request.headers.get('x-instance-transfer-token'),
      process.env.INSTANCE_TRANSFER_TOKEN,
    )
  ) {
    return Response.json({error: 'Invalid instance transfer token.'}, {status: 403});
  }
  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'export' && action !== 'import')
    return Response.json({error: 'Invalid action.'}, {status: 400});
  let backup: unknown;
  if (action === 'import') {
    if (request.headers.get('x-confirm-replace-instance') !== 'replace') {
      return Response.json({error: 'Confirm replacement of all instance data.'}, {status: 400});
    }
    // Bound actual bytes read, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({error: 'Missing backup.'}, {status: 400});
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return Response.json({error: 'Backup exceeds 100 MiB.'}, {status: 413});
      }
      chunks.push(value);
    }
    try {
      backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return Response.json({error: 'Invalid JSON file.'}, {status: 400});
    }
  }
  const [pool, free] = getPgPool(getDatabaseUrl());
  try {
    const schema = process.env.DB_SCHEMA || 'public';
    if (action === 'export') {
      const json = JSON.stringify(await exportInstance(pool, schema));
      if (Buffer.byteLength(json, 'utf8') > MAX_BYTES) {
        return Response.json(
          {
            error:
              'This instance exceeds the 100 MiB JSON transfer limit. Use a PostgreSQL backup to migrate it.',
          },
          {status: 413},
        );
      }
      return new Response(json, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="replane-instance-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }
    await importInstance(pool, backup, schema);
    return Response.json({ok: true}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof InvalidInstanceBackupError
            ? error.message
            : 'Transfer failed. An unsuccessful import leaves the existing data intact.',
      },
      {status: error instanceof InvalidInstanceBackupError ? 400 : 500},
    );
  } finally {
    free();
  }
}
