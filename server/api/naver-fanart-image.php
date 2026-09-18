<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';
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
