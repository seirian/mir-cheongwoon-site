import {IS_SONGBOOK_PLATFORM_PREVIEW} from '../lib/preview';
import SongbookV2Page from './SongbookV2Page';
import SongbookPlatformPreview from './SongbookPlatformPreview';
export default IS_SONGBOOK_PLATFORM_PREVIEW ? SongbookPlatformPreview : SongbookV2Page;
