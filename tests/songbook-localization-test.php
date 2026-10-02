<?php
/** Deterministic identity/locale tests; does not call external services. */
define('SONGBOOK_SEARCH_TEST', true);
require __DIR__.'/../server/api/songbook-search.php';
function check4($ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$registry = require __DIR__.'/../server/api/_songbook_korean_titles.php';
$base = ['key'=>'itunes:1858796279','title'=>'Wisp!','artist'=>'이오몽','album'=>'Wisp! - Single','aliases'=>[], 'musicUrl'=>'https://music.apple.com/us/album/wisp/1858796278?i=1858796279'];
$ko = sb4_localize($base,$registry);
check4($ko['title']==='영물이다' && $ko['album']==='영물이다' && $ko['aliases']===['Wisp!'],'approved recording gets Korean title and English alias');
$inst = $base; $inst['key']='itunes:1858796280'; $inst['title']='Wisp! (inst)';$inst['musicUrl']=str_replace('1858796279','1858796280',$inst['musicUrl']);
check4(sb4_localize($inst,$registry)['title']==='영물이다 (inst)','instrumental retains version');
foreach (['artist'=>'다른 가수','key'=>'itunes:999999','title'=>'Wisp! (Live)','musicUrl'=>'https://music.apple.com/us/album/wisp/999999?i=1858796279'] as $field=>$value) {
 $bad=$base;$bad[$field]=$value;
 check4(sb4_localize($bad,$registry)['title']===$bad['title'],'inconsistent '.$field.' must not be renamed');
}
check4(sb4_known_ids('이오몽-영물이다',$registry)===['1858796279'],'artist and title query resolves approved ID');
check4(sb4_known_ids('Wisp!',$registry)===['1858796279'],'foreign title resolves approved ID');
check4(sb4_known_ids('영물이다 다른가수',$registry)===[],'unrelated combined query is not injected');
$raw=$base;$raw['key']='itunes:1000';$raw['title']='Foreign title';$raw['catalogRegion']='US';
$kr=$raw;$kr['title']='한국 제목';$kr['catalogRegion']='KR';
$merged=sb4_merge([[$raw],[$kr]]);
check4(count($merged)===1 && $merged[0]['title']==='한국 제목' && $merged[0]['aliases']===['Foreign title'],'Korean same-ID result wins regardless of provider response order');
check4(sb4_merge([[$kr],[$raw]])[0]['title']==='한국 제목','Korean first remains Korean');
$alternate=$raw;$alternate['key']='itunes:1001';
check4(count(sb4_merge([[$raw,$alternate]]))===2,'distinct recordings not merged by name alone');
$aliases=[['name'=>'밤의 노래','locale'=>'ko','type'=>'Recording name','primary'=>true],['name'=>'잘못된 표기','locale'=>'ko','type'=>'Search hint','primary'=>true]];
check4(sb4_preferred_alias($aliases,'Night Song','Recording name')==='밤의 노래','Korean name aliases can localize; search hints cannot');
check4(sb4_preferred_alias($aliases,'Night Song (Live)','Recording name')==='','versionless alias cannot erase a live suffix');
$aliases[]=['name'=>'다른 이름','locale'=>'ko','type'=>'Recording name','primary'=>true];
check4(sb4_preferred_alias($aliases,'Night Song','Recording name')==='','conflicting primary names require review');
check4(sb4_variant('Live Your Life')==='original' && sb4_variant('Song (Live)')==='live','do not mistake title words for version markers');
$mb=sb3_musicbrainz(['recordings'=>[['id'=>'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','title'=>'Night Song','aliases'=>[$aliases[0]],'artist-credit'=>[['name'=>'Singer','artist'=>['aliases'=>[['name'=>'가수','locale'=>'ko','type'=>'Artist name','primary'=>true]]]]]]]]);
check4($mb[0]['title']==='밤의 노래' && $mb[0]['artist']==='가수' && in_array('Night Song',$mb[0]['aliases']),'MusicBrainz title/artist aliases supported');
check4(sb4_order([$raw,$ko],'영물이다')[0]['title']==='영물이다','query match takes priority over unrelated Korean results');
echo "PASS: v4 reviewed identity, Korean priority, aliases, distinct variants, no query translation, stable title ordering\n";
