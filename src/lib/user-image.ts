/**
 * Constructs the URL for a user's profile image.
 * User images are served via the /api/users/[userId]/image endpoint.
 */
export function getUserImageUrl(userId: string | number | null | undefined): string | undefined {
  if (!userId) return undefined;
  return `/api/users/${userId}/image`;
}
