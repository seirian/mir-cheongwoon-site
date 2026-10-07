import SongbookUsabilityPage from './SongbookUsabilityPage.jsx';
import {IS_SONGBOOK_PLATFORM_PREVIEW,IS_REVIEW_PREVIEW} from '../lib/preview';
import SongbookV2Page from './SongbookV2Page';
import SongbookPlatformPreview from './SongbookPlatformPreview';
export default IS_SONGBOOK_PLATFORM_PREVIEW ? SongbookPlatformPreview : IS_REVIEW_PREVIEW ? SongbookV2Page : SongbookUsabilityPage;
