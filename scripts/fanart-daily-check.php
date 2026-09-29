<?php
/** Offline tests use an isolated folder and synthetic raster images; no production writes. */
declare(strict_types=1);
require __DIR__.'/../server/api/_core.php';
require __DIR__.'/../server/api/_cache.php';
require __DIR__.'/../server/api/_fanart_daily.php';
$count=0;
function verify(bool $ok,string $name): void { global $count; if (!$ok) throw new RuntimeException($name); $count++; }
$dir=sys_get_temp_dir().'/mir-daily-test-'.bin2hex(random_bytes(5));mkdir($dir,0700);
file_put_contents($dir.'/.htaccess',"Require all denied\nOptions -Indexes\n");
$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLVcAAAAASUVORK5CYII=');
$gif=base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
$now=strtotime('2026-09-30T00:59:59+09:00');$calls=0;$downloads=0;
$store=new \YeopMigration\DailyFanartStore($dir,static function()use(&$now){return $now;});
$record=['status'=>'ok','articleId'=>222,'articleUrl'=>'https://cafe.naver.com/f-e/cafes/31003156/articles/222','title'=>'일배치 팬아트','author'=>'작가','sourceDate'=>'2026-09-30','imageUrls'=>['/api/naver-fanart-image.php?url='.rawurlencode('https://phinf.pstatic.net/a.png'),'/api/naver-fanart-image.php?url='.rawurlencode('https://phinf.pstatic.net/b.gif')]];
$collect=static function()use(&$calls,&$record){$calls++;return $record;};
$download=static function($url)use(&$downloads,$png,$gif){$downloads++;return str_ends_with($url,'.gif')?['body'=>$gif,'mime'=>'image/gif']:['body'=>$png,'mime'=>'image/png'];};
try {
    verify($store->publicSnapshot('/api/')===null,'no backup before first success');
    verify($store->refresh($collect,$download)['status']==='not_due'&&$calls===0,'never runs before 01:00 KST');
    $held=fopen($dir.'/batch.lock.php','c+b');flock($held,LOCK_EX);$now++;
    verify($store->refresh($collect,$download)['status']==='running'&&$calls===0,'concurrent batch never starts a second collection');
    flock($held,LOCK_UN);fclose($held);
    $run=$store->refresh($collect,$download);
    verify($run['status']==='success'&&$run['batchDate']==='2026-09-30'&&$calls===1&&$downloads===2,'one real independent collection at 01:00');
    $saved=$store->publicSnapshot('/api/');
    verify($saved['fallbackKind']==='daily_batch'&&$saved['imageCount']===2&&$saved['articleId']===222,'multi image backup metadata');
    verify($store->image(hash('sha256',$png))['body']===$png&&$store->image(hash('sha256',$gif))['body']===$gif,'both downloaded bytes available without upstream');
    verify($store->refresh($collect,$download)['reused']&&$calls===1,'same-day idempotence');
    verify($store->image(str_repeat('f',64))===null&&$store->image('../')===null,'unknown or traversal image rejected');
    $now+=86400;$record['articleId']=333;$record['articleUrl']='https://cafe.naver.com/f-e/cafes/31003156/articles/333';
    $failing=static function($url)use($png){ if(str_ends_with($url,'.gif'))throw new RuntimeException('upstream_http_403');return ['body'=>$png,'mime'=>'image/png'];};
    verify($store->refresh($collect,$failing)['status']==='failed','failed image aborts complete daily publication');
    verify($store->publicSnapshot('/api/')['articleId']===222&&$store->image(hash('sha256',$gif))['body']===$gif,'partial failure never corrupts last good snapshot');
    verify($store->refresh($collect,$download)['reused']&&$calls===2,'denial not retried same day');
    $now+=86400;verify($store->refresh($collect,$download)['status']==='success','next day can recover');
    verify($store->publicSnapshot('/api/')['articleId']===333,'next success replaces prior record');
    $second=new \YeopMigration\DailyFanartStore($dir);
    verify($second->publicSnapshot('/_yeop_releases/r20261002160000_12345678/api/')['imageUrls'][0]!==$saved['imageUrls'][0],'same backup maps to another release without copying');
    verify(count($store->status()['history'])===3&&$store->status()['lastRun']['status']==='success','success and failure logs retained');
    // Real PHP endpoints with a failed live cache and the same shared daily directory.
    $api=$dir.'/api';mkdir($api);mkdir($api.'/_cache');
    foreach(glob(__DIR__.'/../server/api/*.php') as $path)copy($path,$api.'/'.basename($path));
    file_put_contents($api.'/config.php',"<?php return ['release'=>'fixture','api_base'=>'/api/','naver_enabled'=>true,'fanart_daily_dir'=>".var_export($dir,true)."]; ");
    $cache=new \YeopMigration\SharedCache($api.'/_cache');
    $cache->remember('fanart',static fn()=>[['public'=>['status'=>'unavailable','reason'=>'upstream_unavailable']],3600]);
    $invoke=static function($file,$query='')use($api){$p=proc_open([PHP_BINARY,'-r','$_SERVER["REQUEST_METHOD"]="GET";parse_str($argv[2],$_GET);require $argv[1];',$api.'/'.$file,$query],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($p)!==0||$err!=='')throw new RuntimeException('endpoint_error '.$err);return $out;};
    file_put_contents($api.'/_cache/fanart-fallback.json',json_encode(['id'=>hash('sha256',$png),'articleId'=>111,'articleUrl'=>'https://cafe.naver.com/f-e/cafes/31003156/articles/111','sourceDate'=>'2026-09-21']));
    file_put_contents($api.'/_cache/fanart-fallback.bin',$png);
    $response=json_decode($invoke('naver-fanart.php'),true);
    verify($response['articleId']===333&&$response['fallbackKind']==='daily_batch','upstream API failure returns daily not the old emergency record');
    verify(json_decode($invoke('naver-fanart-backup.php'),true)['imageCount']===2,'independent read-only metadata endpoint');
    unlink($api.'/_cache/fanart.state.php');
    $cache->remember('fanart',static fn()=>[['public'=>['status'=>'ok','articleId'=>999,'articleUrl'=>'https://cafe.naver.com/f-e/cafes/31003156/articles/999','imageUrl'=>'/api/naver-fanart-image.php?id='.str_repeat('c',64)]],3600]);
    verify(json_decode($invoke('naver-fanart.php'),true)['articleId']===999,'normal live success always wins over daily and emergency backups');
    foreach(glob($api.'/_cache/*')as $p)unlink($p);rmdir($api.'/_cache');
    verify(json_decode($invoke('naver-fanart-backup.php'),true)['articleId']===333,'backup does not depend on live cache health');
    verify($invoke('naver-fanart-image.php','daily='.hash('sha256',$gif))===$gif,'daily image does not depend on live cache health');
    verify(json_decode($invoke('naver-fanart-image.php','daily[]=bad'),true)['error']==='invalid_daily_id','array input rejected');
    foreach(glob($api.'/*')as $p)unlink($p);rmdir($api);
    $now+=86400;$record['articleUrl']='https://evil.test/333';
    verify($store->refresh($collect,$download)['status']==='failed','foreign attribution rejected');
    verify($store->publicSnapshot('/api/')['articleUrl']!=='https://evil.test/333','failed snapshot cannot replace published attribution');
    $now+=86400;$record['articleUrl']='https://cafe.naver.com/f-e/cafes/31003156/articles/333';
    verify($store->refresh($collect, static fn($url)=>['body'=>$png,'mime'=>'image/png'])['status']==='success','duplicate source bytes can be saved safely');
    verify($store->publicSnapshot('/api/')['imageCount']===1,'duplicate image bytes count agrees with frontend slides');
    $current=json_decode(substr(file_get_contents($dir.'/snapshot.php'),strlen(\YeopMigration\SharedCache::PREFIX)),true)['current'];
    file_put_contents($dir.'/'.$current['slot'].'-0.bin',str_repeat('x',strlen($png)));
    verify(!is_file($dir.'/'.$current['slot'].'-1.bin'),'inactive slot leftover images removed');
    verify($store->image(hash('sha256',$png))===null,'same-length tampered image fails hash validation');
    echo json_encode(['passed'=>$count])."\n";
} finally {
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($it as $item){if($item->isDir())rmdir($item->getPathname());else unlink($item->getPathname());}rmdir($dir);
}
