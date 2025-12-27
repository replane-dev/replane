import {requireUserEmail, type Identity} from '../identity';
import {processLogoImage} from '../image-utils';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateUserProfileRequest {
  identity: Identity;
  /** New user name, null to clear, undefined to keep unchanged */
  name?: string | null;
  /** Base64 data URL for new image, null to remove, undefined to keep unchanged */
  image?: string | null;
}

export interface UpdateUserProfileResponse {
  success: boolean;
  name: string | null;
  image: string | null;
}

export function createUpdateUserProfileUseCase(): TransactionalUseCase<
  UpdateUserProfileRequest,
  UpdateUserProfileResponse
> {
  return async (_ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const user = await tx.users.getByEmail(currentUserEmail);

    if (!user) {
      throw new Error('User not found');
    }

    // Normalize name if provided
    let normalizedName: string | null | undefined = undefined;
    if (req.name !== undefined) {
      if (req.name === null) {
        normalizedName = null;
      } else {
        const trimmed = req.name.trim();
        if (!trimmed) {
          throw new Error('Name cannot be empty');
        }
        normalizedName = trimmed;
      }
    }

    // Process image if provided (resize and convert to PNG)
    let processedImage: string | null | undefined = undefined;
    if (req.image !== undefined) {
      processedImage = req.image === null ? null : await processLogoImage(req.image);
    }

    const updatedUser = await tx.users.updateById({
      id: user.id,
      name: normalizedName,
      image: processedImage,
    });

    return {
      success: true,
      name: updatedUser?.name ?? null,
      image: updatedUser?.image ?? null,
    };
  };
}
