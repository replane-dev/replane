import {getAuthOptions} from '@/app/auth-options';
import {getPgPool} from '@/engine/core/pg-pool-cache';
import {getDatabaseUrl} from '@/engine/engine-singleton';
import {getServerSession} from 'next-auth';
import {NextResponse} from 'next/server';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{userId: string}>},
): Promise<Response> {
  const {userId} = await params;
  const userIdNum = parseInt(userId, 10);

  if (isNaN(userIdNum)) {
    return new NextResponse(null, {status: 400});
  }

  // Check authentication - user can only access their own image
  const session = await getServerSession(getAuthOptions());
  const currentUserId = (session?.user as any)?.id;

  if (!currentUserId) {
    return new NextResponse(null, {status: 401});
  }

  if (String(currentUserId) !== String(userIdNum)) {
    return new NextResponse(null, {status: 403});
  }

  try {
    const databaseUrl = getDatabaseUrl();
    const [pool] = getPgPool(databaseUrl);

    const result = await pool.query('SELECT image FROM users WHERE id = $1', [userIdNum]);

    if (!result.rows[0]?.image) {
      return new NextResponse(null, {status: 404});
    }

    const imageDataUrl = result.rows[0].image as string;

    // Parse the data URL to extract the content type and base64 data
    const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return new NextResponse(null, {status: 404});
    }

    const [, contentType, base64Data] = matches;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=60', // Cache for 1 minute
      },
    });
  } catch (error) {
    console.error('Failed to fetch user image:', error);
    return new NextResponse(null, {status: 500});
  }
}
