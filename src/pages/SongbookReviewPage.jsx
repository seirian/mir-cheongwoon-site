import {IS_SONGBOOK_PLATFORM_PREVIEW} from '../lib/preview';
import SongbookV2Review from './SongbookV2Review';
import {PlatformReviewNotes} from './SongbookPlatformPreview';
export default IS_SONGBOOK_PLATFORM_PREVIEW ? PlatformReviewNotes : SongbookV2Review;
