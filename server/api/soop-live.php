<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';
try {
    [$payload, $hit] = $cache->remember('soop', static function(): array {
        try { $data = \YeopMigration\live(new \YeopMigration\Client(budget:20)); }
        catch (\Throwable $e) { $data = ['status'=>'unknown','channelId'=>'alice427','error'=>'live_lookup_failed']; }
        $data['checked_at'] = gmdate('c');
        return [$data, ($data['status']??'unknown')==='unknown'?180:90];
    });
    $payload['cached']=$hit;
    \YeopMigration\sendJson($payload,200,30);
} catch (\Throwable $e) { \YeopMigration\sendJson(['status'=>'unknown','channelId'=>'alice427','error'=>'cache_busy_or_unavailable'],503); }
