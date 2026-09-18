<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';

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
    // Not a general-purpose URL proxy: only the current successful featured image is accepted.
    $feature=$cache->fresh('fanart');
    $source=$feature['source']??'';
    if (!$feature || ($feature['public']['status']??'')!=='ok' || !$source || !hash_equals(hash('sha256',$source),$id)) \YeopMigration\sendJson(['error'=>'image_not_current'],404);
    $existing=$cache->fresh('image');
    // A new featured image waits for the single bounded image slot to expire; avoids cache churn.
    if ($existing && !hash_equals($existing['id']??'', $id)) \YeopMigration\sendJson(['error'=>'image_refresh_pending'],503);
    [$state,$hit]=$cache->remember('image',static function() use ($source,$id):array {
        try { $i=\YeopMigration\image(new \YeopMigration\Client(budget:12),$source); return [['id'=>$id,'mime'=>$i['mime'],'data'=>base64_encode($i['body'])],600]; }
        catch (\Throwable $e) { return [['id'=>$id,'error'=>'image_unavailable'],300]; }
    });
    if (isset($state['error'])) \YeopMigration\sendJson(['error'=>'image_unavailable'],502);
    $body=base64_decode($state['data'],true);
    if ($body===false) throw new \RuntimeException('image_cache_invalid');
    header('Content-Type: '.$state['mime']); header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=300'); header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $body;
} catch (\Throwable $e) { \YeopMigration\sendJson(['error'=>'image_unavailable'],503); }
