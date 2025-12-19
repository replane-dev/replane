import {getAuthOptions} from '@/app/auth-options';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {getEngineSingleton} from '@/engine/engine-singleton';
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
  const currentUserEmail = session?.user?.email;

  if (!currentUserId || !currentUserEmail) {
    return new NextResponse(null, {status: 401});
  }

  if (String(currentUserId) !== String(userIdNum)) {
    return new NextResponse(null, {status: 403});
  }

  try {
    const engine = await getEngineSingleton();
    const userProfile = await engine.useCases.getUserProfile(GLOBAL_CONTEXT, {
      currentUserEmail: normalizeEmail(currentUserEmail),
    });

    if (!userProfile?.image) {
      return new NextResponse(null, {status: 404});
    }

    const imageData = userProfile.image;

    // Check if it's a base64 data URL (uploaded image)
    const dataUrlMatches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatches) {
      const [, contentType, base64Data] = dataUrlMatches;
      const imageBuffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=60', // Cache for 1 minute
        },
      });
    }

    // Check if it's an external URL (OAuth provider image like GitHub)
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      // Redirect to the external image URL
      return NextResponse.redirect(imageData, {status: 302});
    }

    // Unknown format
    return new NextResponse(null, {status: 404});
  } catch (error) {
    console.error('Failed to fetch user image:', error);
    return new NextResponse(null, {status: 500});
  }
}
