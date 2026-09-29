<?php
declare(strict_types=1);
require __DIR__.'/../server/api/_core.php';
require __DIR__.'/../server/api/_cache.php';
use YeopMigration\Client;
use YeopMigration\SharedCache;
use function YeopMigration\articleImages;
use function YeopMigration\fanart;
$checks=0;
function check(bool $ok,string $name):void { global $checks; if (!$ok) throw new RuntimeException($name); ++$checks; }
$cover='https://cafeptthumb-phinf.pstatic.net/20260930/cover.jpg';
$art='https://cafeptthumb-phinf.pstatic.net/20260930/art.jpg';
$third='https://cafeptthumb-phinf.pstatic.net/20260930/final.png';
$html='<img src="'.$cover.'"><img data-src="'.$art.'?type=w800" src="'.$cover.'"><img src="'.$art.'?type=w200"><img src="'.$third.'">';
$article=['contentHtml'=>$html,'thumbnail'=>$cover,'writer'=>['profileImage'=>'https://phinf.pstatic.net/profile.jpg','nickName'=>'테스트 작가'],'subject'=>'한 게시글의 작품'];
check(articleImages($article)===[$cover,$art.'?type=w800',$third],'body order, preview-cover and real artwork retained, resize duplicates removed');
check(articleImages(['contentHtml'=>'<img src="javascript:alert(1)"><img src="http://127.0.0.1/a"><img src="https://pstatic.net.evil.test/a"><img src="https://x.pstatic.net/profile.png">'])===[],'unsafe URLs and profile image removed');
check(articleImages(['images'=>[['url'=>$art],['src'=>$third]]])===[$art,$third],'structured media fallback');
check(articleImages(['content'=>'<p>no image</p>'])===[],'empty content');
$many='';for($i=0;$i<50;$i++)$many.='<img src="https://phinf.pstatic.net/'.$i.'.png">';
check(count(articleImages(['contentHtml'=>$many]))===12,'bounded images');
$list=['articleList'=>[['type'=>'ARTICLE','item'=>['articleId'=>123,'writeDate'=>'2026-09-30 12:00:00','subject'=>'test']]]];
$sender=static function($url) use ($list, $article): array {
    if (str_contains($url,'cafe-boardlist-api')) return ['code'=>200,'headers'=>[],'body'=>json_encode(['result'=>$list])];
    $expected='https://article.cafe.naver.com/gw/v4/cafes/31003156/articles/123?query=&useCafeId=true&requestFrom=A';
    if ($url!==$expected) return ['code'=>500,'headers'=>[],'body'=>'{"errorCode":"9999"}'];
    return ['code'=>200,'headers'=>[],'body'=>json_encode(['result'=>['article'=>$article]])];
};
$result=fanart(new Client($sender),today:'2026-09-30');
check($result['articleId']===123 && count($result['imageUrls'])===3,'one selected article with multiple images');
check($result['imageUrl']===$result['imageUrls'][0] && $result['author']==='테스트 작가','first-image compatibility and attribution');
foreach([401,403,429] as $status){$calls=0;$denied=new Client(static function()use($status,&$calls){++$calls;return ['code'=>$status,'headers'=>[],'body'=>''];});try{fanart($denied);check(false,'denial must throw');}catch(YeopMigration\UpstreamError $e){check($calls===1,'no retry after upstream denial');}}
check(\YeopMigration\validUrl(\YeopMigration\ARTICLE_API.'123?query=&useCafeId=true&requestFrom=A'),'current public gateway route allowed');
foreach (['https://article.cafe.naver.com.evil.test/gw/v4/cafes/31003156/articles/123', 'https://article.cafe.naver.com/gw/v4/cafes/999/articles/123', 'https://article.cafe.naver.com/gw/v4/cafes/31003156/articles/123/comments', 'https://article.cafe.naver.com/gw/v4/cafes/31003156/articles/../123'] as $url) check(!\YeopMigration\validUrl($url),'new gateway allowance remains narrowly scoped');
foreach ([401,403,429] as $status) {
    $calls=0;
    $sender=static function($url) use ($list,$status,&$calls): array { ++$calls; return str_contains($url,'cafe-boardlist-api')?['code'=>200,'headers'=>[],'body'=>json_encode(['result'=>$list])]:['code'=>$status,'headers'=>[],'body'=>'']; };
    try { fanart(new Client($sender),today:'2026-09-30');check(false,'article denial must fail'); }
    catch(\YeopMigration\UpstreamError $e) { check($calls===2 && $e->getMessage()==='upstream_http_'.$status,'no alternate source or candidate after article denial'); }
}
foreach ([['isReadable'=>false],['isBlind'=>true],['id'=>999]] as $invalid) {
    $sender=static fn($url)=>['code'=>200,'headers'=>[],'body'=>json_encode(['result'=>str_contains($url,'cafe-boardlist-api')?$list:['article'=>array_merge($article,$invalid)]])];
    try { fanart(new Client($sender),today:'2026-09-30');check(false,'restricted or mismatched article must fail'); }
    catch(\YeopMigration\UpstreamError $e) { check(in_array($e->getMessage(),['upstream_http_403','article_identity_mismatch'],true),'restricted or unrelated body rejected'); }
}
$dir=sys_get_temp_dir().'/mir-fanart-test-'.bin2hex(random_bytes(6));mkdir($dir,0700);
try {
 $cache=new SharedCache($dir);$calls=0;
 $a=$cache->remember('image',static function()use(&$calls){++$calls;return [['id'=>'first','data'=>'cover'],600];},'first');
 $b=$cache->remember('image',static function(){throw new RuntimeException('must hit');},'first');
 check($calls===1 && $b[1]===true,'same slide cache hit');
 $c=$cache->remember('image',static fn()=>[['id'=>'new','data'=>'new-art'],600],'new');
 check($c[0]['data']==='new-art' && !$c[1],'changed article does not receive old slot content');
 for($i=1;$i<12;$i++) $cache->remember('fanart-image-'.$i,static fn()=>[['id'=>(string)$i],600],(string)$i);
 check($cache->fresh('image')['id']==='new' && $cache->fresh('fanart-image-11')['id']==='11','fixed gallery slots independent');
 foreach(['../escape','fanart-image-12','https://evil.test'] as $key){try{$cache->fresh($key);check(false,'invalid slot');}catch(InvalidArgumentException){check(true,'arbitrary slot rejected');}}
 $cache->remember('fanart-image-denied',static fn()=>[['blocked'=>true],21600]);check($cache->fresh('fanart-image-denied')['blocked'],'shared denial cooldown');
} finally {foreach(glob($dir.'/*') as $path)unlink($path);rmdir($dir);}
require __DIR__.'/fanart-fallback-check.php';
echo json_encode(['passed'=>$checks]).PHP_EOL;
