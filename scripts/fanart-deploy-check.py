"""Offline regression: carry the latest successful cache, not an older copied backup."""
import base64
import hashlib
import json
import stat
from types import SimpleNamespace
import unittest

import mir_shared_root_deploy_ci as deploy

IMAGE = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLVcAAAAASUVORK5CYII=')
RELEASE = 'r20260929152402_12345678'
ROOT = deploy.SITE_WEB + deploy.PREFIX.rstrip('/')
CACHE = ROOT + '/' + RELEASE + '/api/_cache/'
SOURCE = 'https://cafeptthumb-phinf.pstatic.net/20260930/current.png'


def state(value):
    return deploy.base.CACHE_PREFIX + json.dumps({'value': value}).encode()


class FakeRemote:
    def __init__(self, current=True):
        self.s = self
        old_meta = {'id': hashlib.sha256(IMAGE).hexdigest(), 'mime': 'image/png',
                    'articleId': 123, 'articleUrl': 'https://cafe.naver.com/f-e/cafes/31003156/articles/123',
                    'sourceDate': '2026-09-21'}
        self.files = {'fanart-fallback.json': json.dumps(old_meta).encode(), 'fanart-fallback.bin': IMAGE}
        if current:
            self.files['fanart.state.php'] = state({'source': SOURCE, 'public': {
                'status': 'ok', 'articleId': 456, 'sourceDate': '2026-09-30',
                'title': '현재 팬아트', 'author': '테스트 작가',
                'articleUrl': 'https://cafe.naver.com/f-e/cafes/31003156/articles/456'}})
            self.files['image.state.php'] = state({'id': hashlib.sha256(SOURCE.encode()).hexdigest(),
                                                 'mime': 'image/png', 'data': base64.b64encode(IMAGE).decode()})

    def info(self, path):
        return SimpleNamespace(st_mode=stat.S_IFDIR) if path == ROOT else None

    def listdir_attr(self, path):
        assert path == ROOT
        return [SimpleNamespace(filename=RELEASE, st_mode=stat.S_IFDIR)]

    def read(self, path, limit):
        assert path.startswith(CACHE)
        value = self.files.get(path[len(CACHE):])
        assert not value or len(value) <= limit
        return value


class FanartSnapshotTests(unittest.TestCase):
    def test_successful_current_cache_precedes_old_copied_backup(self):
        result = deploy.find_persisted_fanart_fallback(FakeRemote())
        self.assertEqual(result['article_id'], 456)
        self.assertEqual(result['source_date'], '2026-09-30')
        self.assertEqual(result['source_kind'], 'cache-state')
        self.assertEqual(json.loads(result['meta_raw'])['author'], '테스트 작가')

    def test_no_successful_cache_preserves_valid_backup(self):
        result = deploy.find_persisted_fanart_fallback(FakeRemote(current=False))
        self.assertEqual(result['article_id'], 123)
        self.assertEqual(result['source_kind'], 'fallback-files')

    def test_mismatched_image_never_becomes_current_backup(self):
        remote = FakeRemote()
        remote.files['image.state.php'] = state({'id': '0'*64, 'mime': 'image/png',
                                                'data': base64.b64encode(IMAGE).decode()})
        self.assertEqual(deploy.find_persisted_fanart_fallback(remote)['article_id'], 123)

    def test_upstream_error_does_not_overwrite_valid_backup(self):
        remote = FakeRemote()
        remote.files['fanart.state.php'] = state({'source': '', 'public': {'status': 'unavailable'}})
        self.assertEqual(deploy.find_persisted_fanart_fallback(remote)['article_id'], 123)

    def test_corrupt_backup_is_not_accepted(self):
        remote = FakeRemote(current=False)
        remote.files['fanart-fallback.bin'] = b'corrupt'
        self.assertIsNone(deploy.find_persisted_fanart_fallback(remote))


if __name__ == '__main__':
    unittest.main()
