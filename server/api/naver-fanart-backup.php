<?php
/** Read-only fallback path, independent of upstream/live cache availability. */
declare(strict_types=1);
define('YEOP_API', true);
@ini_set('display_errors','0');
require_once __DIR__.'/_core.php';
require_once __DIR__.'/_fanart_daily.php';
\YeopMigration\requireGet();
$config = require __DIR__.'/config.php';
header('X-Robots-Tag: noindex, nofollow');
$snapshot = \YeopMigration\dailyFanartSnapshot($config);
\YeopMigration\sendJson($snapshot ?? ['status'=>'unavailable','reason'=>'daily_backup_unavailable','boardUrl'=>\YeopMigration\BOARD], $snapshot ? 200 : 503);
