<?php
/** Fixed-source daily cache warm-up. No URL/date/force input; idempotent once per day. */
declare(strict_types=1);
define('YEOP_API', true);
@ini_set('display_errors', '0');
require_once __DIR__.'/_core.php';
require_once __DIR__.'/_cache.php';
\YeopMigration\requireGet();
$config = require __DIR__.'/config.php';
require_once __DIR__.'/_fanart_daily.php';
header('X-Robots-Tag: noindex, nofollow');
try {
    $store = \YeopMigration\dailyFanartStore($config);
    if (($_GET['status'] ?? '') === '1') \YeopMigration\sendJson($store->status());
    if ($_GET !== []) \YeopMigration\sendJson(['error'=>'unexpected_parameters'],400);
    // Obsolete/preview releases may read snapshots but must not overwrite them.
    $marker = @file_get_contents(dirname(__DIR__,3).'/.htaccess', false, null, 0, 128);
    if (!is_string($marker) || !str_starts_with($marker, '# MIR-SITE-ROOT-V2 '.$config['release']."\n")) {
        \YeopMigration\sendJson(['error'=>'inactive_release'],409);
    }
    if (!$config['naver_enabled']) \YeopMigration\sendJson(['error'=>'disabled'],503);
    // A failed live cache must not disable independent backup collection.
    try { $cache = new \YeopMigration\SharedCache(__DIR__.'/_cache'); }
    catch (\Throwable $error) { $cache = null; }
    $client = new \YeopMigration\Client(budget:45);
    $run = $store->refresh(static function() use ($client,$cache): array {
        try {
            $current = $cache?->fresh('fanart')['public'] ?? [];
            $denied = $cache?->fresh('fanart-image-denied');
        } catch (\Throwable $error) { $current = []; $denied = null; }
        if ($denied || in_array($current['reason'] ?? '', ['upstream_access_restricted','upstream_rate_limited'], true)) {
            throw new \RuntimeException('upstream_backoff_active');
        }
        // Deliberately does not reuse the on-demand 30-minute metadata cache.
        return \YeopMigration\fanart($client, attempts:3);
    }, static fn(string $source): array => \YeopMigration\image($client,$source));
    if ($cache && preg_match('/^upstream_http_(401|403|429)$/D', $run['error'] ?? '')) {
        try { $cache->remember('fanart-image-denied', static fn()=>[['blocked'=>true],21600]); }
        catch (\Throwable $error) { /* Daily run still records the failure and prevents a second attempt. */ }
    }
    \YeopMigration\sendJson($run, $run['status'] === 'success' ? 200 : ($run['status'] === 'running' ? 202 : 503));
} catch (\Throwable $error) {
    \YeopMigration\sendJson(['status'=>'failed','error'=>'daily_store_unavailable'],503);
}
