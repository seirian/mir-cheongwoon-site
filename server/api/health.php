<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';
try {
    [$value, $hit] = $cache->remember('health', static fn()=>[['write_read_ok'=>true],300]);
    $stored = $cache->fresh('health');
    $ready = ($stored['write_read_ok'] ?? false) === true && function_exists('curl_init') && class_exists('finfo');
    \YeopMigration\sendJson(['status'=>$ready?'ready':'not_ready','release'=>$config['release'], 'php'=>PHP_VERSION, 'cache_read_write'=>$stored['write_read_ok']??false], $ready?200:503);
} catch (\Throwable $e) { \YeopMigration\sendJson(['status'=>'not_ready','error'=>'cache_test_failed'],503); }
