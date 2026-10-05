export const IS_REVIEW_PREVIEW = import.meta.env.VITE_REVIEW_PREVIEW === 'true';
export const IS_SONGBOOK_PREVIEW = IS_REVIEW_PREVIEW && import.meta.env.VITE_SONGBOOK_PREVIEW === 'true';

export const IS_SONGBOOK_PLATFORM_PREVIEW = IS_SONGBOOK_PREVIEW && import.meta.env.VITE_SONGBOOK_PLATFORM_PREVIEW === 'true';
