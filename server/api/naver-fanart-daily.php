<?php
/** Fixed-source daily cache warm-up; bounded retries, no URL/date/force input. */
declare(strict_types=1);
define('YEOP_API', true);
@ini_set('display_errors', '0');
require_once __DIR__.'/_core.php';
require_once __DIR__.'/_cache.php';
\YeopMigration\requireGet();
$config = require __DIR__.'/config.php';
require_once __DIR__.'/_fanart_daily.php';
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
try {
    $store = \YeopMigration\dailyFanartStore($config);
    try { $cache = new \YeopMigration\SharedCache(__DIR__.'/_cache'); }
    catch (\Throwable $error) { $cache = null; }
    $backoff = static fn(): int => \YeopMigration\fanartBackoffUntil($cache, time());
    if (($_GET['status'] ?? '') === '1' && count($_GET) === 1) {
        $status = $store->status();
        $status['retry'] = \YeopMigration\fanartRetryPolicy($status, $backoff(), time());
        \YeopMigration\sendJson($status);
    }
    if ($_GET !== []) \YeopMigration\sendJson(['error'=>'unexpected_parameters'],400);
    // Obsolete/preview releases may read snapshots but must not overwrite them.
    $marker = @file_get_contents(dirname(__DIR__,3).'/.htaccess', false, null, 0, 128);
    if (!is_string($marker) || !str_starts_with($marker, '# MIR-SITE-ROOT-V2 '.$config['release']."\n")) {
        \YeopMigration\sendJson(['error'=>'inactive_release'],409);
    }
    if (!$config['naver_enabled']) \YeopMigration\sendJson(['error'=>'disabled'],503);
    $client = new \YeopMigration\Client(budget:45);
    $run = $store->refresh(
        static fn(): array => \YeopMigration\fanart($client, attempts:3),
        static fn(string $source): array => \YeopMigration\image($client,$source),
        $backoff
    );
    if ($cache && !($run['reused'] ?? false) && preg_match('/^upstream_http_(401|403|429)$/D', $run['error'] ?? '')) {
        try { $cache->remember('fanart-image-denied', static fn()=>[['blocked'=>true],21600]); }
        catch (\Throwable $error) { /* Release-independent backoff is persisted in the daily store. */ }
    }
    $code = match ($run['status']) { 'success'=>200, 'running','deferred','not_due'=>202, default=>503 };
    \YeopMigration\sendJson($run, $code);
} catch (\Throwable $error) {
    \YeopMigration\sendJson(['status'=>'failed','error'=>'daily_store_unavailable'],503);
}
