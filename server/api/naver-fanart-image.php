<?php
declare(strict_types=1);
// Daily image delivery must work even if the live cache is unavailable.
define('YEOP_API', true);
@ini_set('display_errors', '0');
require_once __DIR__.'/_core.php';
\YeopMigration\requireGet();
$config = require __DIR__.'/config.php';
if (array_key_exists('daily', $_GET)) {
    $id = $_GET['daily'];
    if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/D', $id)) \YeopMigration\sendJson(['error'=>'invalid_daily_id'],400);
    require_once __DIR__.'/_fanart_daily.php';
    try { $image = \YeopMigration\dailyFanartStore($config)->image($id); }
    catch (\Throwable $error) { $image = null; }
    if (!$image) \YeopMigration\sendJson(['error'=>'daily_image_unavailable'],404);
    header('Content-Type: '.$image['mime']); header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=3600'); header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $image['body']; exit;
}
require_once __DIR__.'/_cache.php';
try { $cache = new \YeopMigration\SharedCache(__DIR__.'/_cache'); }
catch (\Throwable $error) { \YeopMigration\sendJson(['error'=>'cache_unavailable'],503); }

$fallback=$_GET['fallback']??'';
if (is_string($fallback) && $fallback!=='') {
    if (!preg_match('/^[a-f0-9]{64}$/D',$fallback)) \YeopMigration\sendJson(['error'=>'invalid_fallback_id'],400);
    $metaPath=__DIR__.'/_cache/fanart-fallback.json';
    $imagePath=__DIR__.'/_cache/fanart-fallback.bin';
    if (!is_file($metaPath) || is_link($metaPath) || !is_file($imagePath) || is_link($imagePath)) \YeopMigration\sendJson(['error'=>'fallback_unavailable'],404);
    $raw=@file_get_contents($metaPath);
    $meta=is_string($raw)?json_decode($raw,true):null;
    if (!is_array($meta) || !is_string($meta['id']??null) || !hash_equals($meta['id'],$fallback)) \YeopMigration\sendJson(['error'=>'fallback_invalid'],404);
    $size=@filesize($imagePath);
    if ($size===false || $size<1 || $size>6*1024*1024) \YeopMigration\sendJson(['error'=>'fallback_invalid'],404);
    $body=@file_get_contents($imagePath);
    if (!is_string($body) || !hash_equals(hash('sha256',$body),$fallback)) \YeopMigration\sendJson(['error'=>'fallback_invalid'],404);
    $mime=(new \finfo(FILEINFO_MIME_TYPE))->buffer($body);
    $allowed=['image/jpeg','image/png','image/gif','image/webp','image/avif'];
    if (!in_array($mime,$allowed,true)) \YeopMigration\sendJson(['error'=>'fallback_invalid'],404);
    header('Content-Type: '.$mime); header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=3600'); header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $body; exit;
}

$id=$_GET['id']??'';
if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/D',$id)) \YeopMigration\sendJson(['error'=>'invalid_image_id'],400);
try {
    // Only media belonging to the current selected article, never a caller-supplied URL.
    $feature = $cache->fresh('fanart');
    $sources = array_slice($feature['sources'] ?? [$feature['source'] ?? ''], 0, 12);
    $source = ''; $slot = '';
    if (($feature['public']['status'] ?? '') === 'ok') {
        foreach ($sources as $index => $candidate) {
            if (is_string($candidate) && \YeopMigration\validUrl($candidate, true) && hash_equals(hash('sha256', $candidate), $id)) {
                $source = $candidate; $slot = $index === 0 ? 'image' : 'fanart-image-'.$index; break;
            }
        }
    }
    if ($source === '') \YeopMigration\sendJson(['error'=>'image_not_current'],404);
    // Twelve fixed, size-bounded slots. Identity-aware replacement never serves another slide.
    [$state,$hit]=$cache->remember($slot,static function() use ($source,$id,$cache):array {
        if ($cache->fresh('fanart-image-denied')) return [['id'=>$id,'error'=>'image_unavailable'],300];
        try { $i=\YeopMigration\image(new \YeopMigration\Client(budget:12),$source); return [['id'=>$id,'mime'=>$i['mime'],'data'=>base64_encode($i['body'])],600]; }
        catch (\Throwable $e) {
            // A denial on any slide pauses upstream image requests across the whole gallery.
            if (preg_match('/^upstream_http_(401|403|429)$/D', $e->getMessage())) {
                $cache->remember('fanart-image-denied', static fn()=>[['blocked'=>true],21600]);
            }
            return [['id'=>$id,'error'=>'image_unavailable'],300];
        }
    }, $id);
    if (isset($state['error'])) \YeopMigration\sendJson(['error'=>'image_unavailable'],502);
    $body=base64_decode($state['data'],true);
    if ($body===false) throw new \RuntimeException('image_cache_invalid');
    header('Content-Type: '.$state['mime']); header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=300'); header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $body;
} catch (\Throwable $e) { \YeopMigration\sendJson(['error'=>'image_unavailable'],503); }
