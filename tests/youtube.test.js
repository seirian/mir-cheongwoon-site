import assert from 'node:assert/strict';
import test from 'node:test';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from '../src/lib/youtube.js';

test('extracts video IDs from supported YouTube URL formats', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=example',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ',
    'https://youtube.com/embed/dQw4w9WgXcQ',
    '  https://youtu.be/dQw4w9WgXcQ  ',
  ]) assert.equal(getYouTubeVideoId(url), 'dQw4w9WgXcQ', url);
});

test('rejects missing, unsupported and lookalike-host URLs', () => {
  for (const value of [undefined, null, 42, {}, '', 'not a URL',
    'https://example.com/watch?v=abc', 'https://youtube.com.evil.example/watch?v=abc',
    'https://youtube.com/playlist?list=abc', 'https://youtube.com/watch',
    'https://youtu.be/', 'https://youtube.com/shorts/']) {
    assert.equal(getYouTubeVideoId(value), '');
    assert.equal(getYouTubeEmbedUrl(value), '');
  }
});

test('uses the privacy-enhanced embed domain', () => {
  assert.equal(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});

test('encodes URL query characters before embedding', () => {
  assert.equal(getYouTubeEmbedUrl('https://youtube.com/watch?v=abc%3Fautoplay%3D1'),
    'https://www.youtube-nocookie.com/embed/abc%3Fautoplay%3D1');
});
