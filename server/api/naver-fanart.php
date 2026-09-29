<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';

function loadFanartFallback(array $config): ?array {
    $metaPath = __DIR__ . '/_cache/fanart-fallback.json';
    $imagePath = __DIR__ . '/_cache/fanart-fallback.bin';
    if (!is_file($metaPath) || is_link($metaPath) || !is_file($imagePath) || is_link($imagePath)) return null;
    $size = @filesize($imagePath);
    if ($size === false || $size < 1 || $size > 6 * 1024 * 1024) return null;
    $raw = @file_get_contents($metaPath);
    if (!is_string($raw) || strlen($raw) > 16384) return null;
    $meta = json_decode($raw, true);
    if (!is_array($meta)) return null;
    $id = $meta['id'] ?? '';
    $articleUrl = $meta['articleUrl'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/D', $id)) return null;
    if (!is_string($articleUrl) || !preg_match('#^https://cafe\.naver\.com/f-e/cafes/31003156/articles/[0-9]+$#D', $articleUrl)) return null;
    return [
        'status' => 'ok',
        'isToday' => false,
        'boardUrl' => \YeopMigration\BOARD,
        'articleId' => (int)($meta['articleId'] ?? 0),
        'title' => is_string($meta['title'] ?? null) ? $meta['title'] : '오늘의 팬아트',
        'author' => is_string($meta['author'] ?? null) ? $meta['author'] : '작성자',
        'imageUrl' => $config['api_base'] . 'naver-fanart-image.php?fallback=' . $id,
        'imageUrls' => [$config['api_base'] . 'naver-fanart-image.php?fallback=' . $id],
        'imageCount' => 1,
        'sourceDate' => is_string($meta['sourceDate'] ?? null) ? $meta['sourceDate'] : '',
        'fallback' => true,
        'stale' => true,
    ];
}

if (!$config['naver_enabled']) \YeopMigration\sendJson(['status'=>'unavailable','reason'=>'disabled','boardUrl'=>\YeopMigration\BOARD]);
try {
    [$state, $hit] = $cache->remember('fanart', static function() use ($config): array {
        try {
            // At most three accessible candidates; immediately stops on any 401/403/429.
            $data = \YeopMigration\fanart(new \YeopMigration\Client(budget:20), $config['api_base'].'naver-fanart-image.php', attempts:3);
            $source = ''; $sources = [];
            if (($data['status']??'')==='ok') {
                foreach (array_slice($data['imageUrls'] ?? [$data['imageUrl']], 0, 12) as $url) {
                    parse_str((string)parse_url($url, PHP_URL_QUERY), $query);
                    $candidate = is_string($query['url'] ?? null) ? $query['url'] : '';
                    if (!\YeopMigration\validUrl($candidate, true)) throw new \RuntimeException('image_not_allowed');
                    if (!in_array($candidate, $sources, true)) $sources[] = $candidate;
                }
                $source = $sources[0] ?? '';
                $data['imageUrls'] = array_map(static fn($url) => $config['api_base'].'naver-fanart-image.php?id='.hash('sha256', $url), $sources);
                $data['imageUrl'] = $data['imageUrls'][0];
                $data['imageCount'] = count($sources);
            }
            $data['checked_at']=gmdate('c');
            return [['public'=>$data,'source'=>$source,'sources'=>$sources],1800];
        } catch (\Throwable $e) {
            $denied = preg_match('/^upstream_http_(401|403|429)$/D',$e->getMessage(),$match)===1;
            $reason = $denied ? ($match[1]==='429'?'upstream_rate_limited':'upstream_access_restricted'):'upstream_unavailable';
            return [['public'=>['status'=>'unavailable','reason'=>$reason,'boardUrl'=>\YeopMigration\BOARD,'checked_at'=>gmdate('c')],'source'=>''], $denied?21600:300];
        }
    });
    $public = $state['public'];
    if (($public['status'] ?? '') === 'ok') {
        $public['imageUrls'] ??= [$public['imageUrl']];
        $public['imageCount'] = count($public['imageUrls']);
    }
    if (($public['status'] ?? '') !== 'ok' && ($fallback = loadFanartFallback($config))) {
        $fallback['reason'] = $public['reason'] ?? 'upstream_unavailable';
        $fallback['cached'] = $hit;
        \YeopMigration\sendJson($fallback,200,300);
    }
    $public['cached']=$hit;
    \YeopMigration\sendJson($public,200,120);
} catch (\Throwable $e) {
    if ($fallback = loadFanartFallback($config)) {
        $fallback['reason'] = 'cache_busy_or_unavailable';
        \YeopMigration\sendJson($fallback,200,300);
    }
    \YeopMigration\sendJson(['status'=>'unavailable','reason'=>'cache_busy_or_unavailable','boardUrl'=>\YeopMigration\BOARD],503);
}
