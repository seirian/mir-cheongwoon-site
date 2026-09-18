<?php
declare(strict_types=1);
define('YEOP_API', true);
@ini_set('display_errors', '0');
require_once __DIR__ . '/_core.php';
require_once __DIR__ . '/_cache.php';
\YeopMigration\requireGet();
$config = require __DIR__ . '/config.php';
try { $cache = new \YeopMigration\SharedCache(__DIR__ . '/_cache'); }
catch (\Throwable $e) { \YeopMigration\sendJson(['status'=>'unknown','error'=>'cache_unavailable'],503); }
