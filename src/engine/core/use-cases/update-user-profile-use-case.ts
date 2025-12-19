import {processLogoImage} from '../image-utils';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateUserProfileRequest {
  currentUserEmail: string;
  /** Base64 data URL for new image, null to remove, undefined to keep unchanged */
  image?: string | null;
}

export interface UpdateUserProfileResponse {
  success: boolean;
  image: string | null;
}

export function createUpdateUserProfileUseCase(): TransactionalUseCase<
  UpdateUserProfileRequest,
  UpdateUserProfileResponse
> {
  return async (_ctx, tx, req) => {
    const user = await tx.users.getByEmail(req.currentUserEmail);

    if (!user) {
      throw new Error('User not found');
    }

    // Process image if provided (resize and convert to PNG)
    let processedImage: string | null | undefined = undefined;
    if (req.image !== undefined) {
      processedImage = req.image === null ? null : await processLogoImage(req.image);
    }

    const updatedUser = await tx.users.updateById({
      id: user.id,
      image: processedImage,
    });

    return {
      success: true,
      image: updatedUser?.image ?? null,
    };
  };
}

