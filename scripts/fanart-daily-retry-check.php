<?php
/** Offline retry tests: controlled clock, isolated metadata, never calls Naver. */
declare(strict_types=1);
require __DIR__.'/../server/api/_fanart_daily.php';
$count = 0;
function checkRetry(bool $ok, string $label): void { global $count; if (!$ok) throw new RuntimeException($label); $count++; }
$now = strtotime('2026-10-10T01:00:00+09:00');
$until = strtotime('2026-10-10T06:16:03+09:00');
$legacy = ['status'=>'failed','batchDate'=>'2026-10-10','error'=>'upstream_backoff_active','finishedAt'=>gmdate('c',$now)];
$p = \YeopMigration\fanartRetryPolicy(['lastRun'=>$legacy,'history'=>[$legacy]],$until,$now);
checkRetry($p['state']==='waiting' && $p['attemptsToday']===0 && strtotime($p['nextAttemptAt'])===$until,'legacy backoff is not a consumed attempt');
checkRetry(\YeopMigration\fanartRetryPolicy([], $until, $until)['state']==='ready','expiry equality allows retry');
$dir = sys_get_temp_dir().'/fanart-retry-'.bin2hex(random_bytes(6));
mkdir($dir,0700); file_put_contents($dir.'/.htaccess',"Require all denied\nOptions -Indexes\n");
$store = new \YeopMigration\DailyFanartStore($dir, static function()use(&$now){return $now;});
$calls = 0;
$collect = static function()use(&$calls){$calls++;throw new RuntimeException('upstream_http_403');};
$download = static function(){throw new RuntimeException('must_not_download');};
$gate = static function()use(&$until){return $until;};
try {
    for($i=0;$i<12;$i++) {
        $run = $store->refresh($collect,$download,$gate);
        checkRetry($run['status']==='deferred' && $run['attemptsToday']===0,'waiting does not consume attempts');
        $now+=900;
    }
    checkRetry($calls===0 && count($store->status()['history'])===0,'waiting never calls source or fills history');
    $now=$until;
    $run=$store->refresh($collect,$download,$gate);
    checkRetry($calls===1 && $run['status']==='failed' && $run['attemptsToday']===1,'first actual failure counts once');
    checkRetry(strtotime($run['backoffUntil'])===$now+21600,'403 persists six hour backoff');
    $until=0; $now+=1800;
    checkRetry($store->refresh($collect,$download,$gate)['status']==='deferred' && $calls===1,'release cache loss cannot erase persisted backoff');
    $now=strtotime($run['backoffUntil']);
    $ordinary=static function()use(&$calls){$calls++;throw new RuntimeException('upstream_timeout');};
    checkRetry($store->refresh($ordinary,$download,$gate)['attemptsToday']===2,'retry after six hours');
    $now+=1799;
    checkRetry($store->refresh($ordinary,$download,$gate)['status']==='deferred' && $calls===2,'minimum retry spacing');
    $now++;
    checkRetry($store->refresh($ordinary,$download,$gate)['attemptsToday']===3,'waiting checks never extend retry interval');
    $now+=1800;
    checkRetry($store->refresh($ordinary,$download,$gate)['attemptsToday']===4,'fourth real collection allowed');
    $now+=1800;
    checkRetry($store->refresh($ordinary,$download,$gate)['retryExhausted'] && $calls===4,'fifth collection prevented');
    checkRetry(count($store->status()['history'])===4,'bounded attempt ledger excludes deferrals');
    $now=strtotime('2026-10-11T00:59:59+09:00');
    checkRetry($store->refresh($ordinary,$download,$gate)['status']==='not_due','KST midnight reset still waits until 01:00');
    $now++;
    checkRetry($store->refresh($ordinary,$download,$gate)['attemptsToday']===1,'next KST date resets attempt budget');
    $now=strtotime('2026-10-11T23:50:00+09:00');
    checkRetry($store->refresh($ordinary,$download,$gate)['status']==='not_due','no new collection after daily cutoff');
    $running=['status'=>'running','batchDate'=>'2026-10-11','startedAt'=>'2026-10-11T01:00:00+09:00','attemptsToday'=>2];
    $now=strtotime('2026-10-11T01:01:00+09:00');
    checkRetry(\YeopMigration\fanartRetryPolicy(['lastRun'=>$running],0,$now)['state']==='running','active run respected');
    $now+=120;
    $p=\YeopMigration\fanartRetryPolicy(['lastRun'=>$running],0,$now);
    checkRetry($p['state']==='waiting' && $p['attemptsToday']===2,'interrupted running state has bounded lease');
    $now=strtotime('2026-10-11T01:30:00+09:00');
    checkRetry(\YeopMigration\fanartRetryPolicy(['lastRun'=>$running],0,$now)['state']==='ready','interrupted run eventually recoverable');
    $success=['status'=>'success','batchDate'=>'2026-10-11'];
    checkRetry(\YeopMigration\fanartRetryPolicy(['lastRun'=>$success],$now+21600,$now)['state']==='success','success never recollected even with new live denial');
    echo json_encode(['retry_assertions_passed'=>$count])."\n";
} finally {
    foreach(glob($dir.'/*') as $path) unlink($path);
    unlink($dir.'/.htaccess'); rmdir($dir);
}
