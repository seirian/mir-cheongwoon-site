<?php
/** Explicit anonymous read-only source contract check. Never requests credentials. */
declare(strict_types=1);
require __DIR__.'/../server/api/_core.php';
if (PHP_SAPI !== 'cli' || !in_array('--live', $argv ?? [], true)) exit(2);
$client = new \YeopMigration\Client(budget:20);
$report = ['fresh_source'=>false];
$success = false;
try {
    $data = \YeopMigration\fanart($client, attempts:1);
    $data['imageCount'] = count($data['imageUrls'] ?? []);
    $report = array_merge($report, array_intersect_key($data, array_flip(['status','articleId','sourceDate','title','author','imageCount','articleUrl','isToday'])));
    if (($data['status'] ?? '') !== 'ok' || ($data['imageCount'] ?? 0) < 1) throw new \RuntimeException('current_article_not_available');
    $report['fresh_source'] = true;
    $success = true;
} catch (\Throwable $e) {
    $code = $e->getMessage();
    $report['error'] = preg_match('/^[a-z0-9_]+$/D',$code) ? $code : 'collector_error';
} finally {
    $report['checked_at'] = gmdate('c');
    $report['trace'] = $client->trace;
    file_put_contents('fanart-source-report.json',json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
    echo json_encode($report,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
}
exit($success ? 0 : 1);
