<?php
define('SONGBOOK_SEARCH_TEST',true);require __DIR__.'/../server/api/songbook-search.php';
function ensure($value,$message){if(!$value)throw new RuntimeException($message);}
$image='https://is1-ssl.mzstatic.com/image/thumb/Music/test.jpg/100x100bb.jpg';
$link='https://music.apple.com/us/album/wisp/1858796278?i=1858796279';
$rows=sb3_itunes(['results'=>[['kind'=>'song','trackId'=>1858796279,'trackName'=>'Wisp!','artistName'=>'이오몽','artworkUrl100'=>$image,'trackViewUrl'=>$link],['kind'=>'song','trackName'=>'Missing identity','artistName'=>'x']]]);
ensure(count($rows)===1,'invalid rows');ensure($rows[0]['artworkUrl']===$image,'artwork extraction');
$other=$rows[0];$other['title']='영물이다';ensure(count(sb3_merge([$rows,[$other]]))===1,'international ID dedup');ensure(sb3_merge([$rows,[$other]])[0]['aliases']===['Wisp!'],'alternate title');
foreach(['https://u@is1-ssl.mzstatic.com/image/thumb/a','https://is1-ssl.mzstatic.com.evil.test/image/thumb/a','data:image/png,x'] as $u)ensure(sb3_artwork($u)==='','unsafe image');
foreach(['https://169.254.169.254/','https://music.apple.com.evil.test/us/album/a/123?i=456','https://music.apple.com/us/album/a/123'] as $u)ensure(sb3_lookup_id($u)==='','unsafe/nontrack lookup');
ensure(sb3_lookup_id($link)==='1858796279','track lookup');
ensure(sb3_text(str_repeat('가',301),300)==='','Unicode length');
$d=sys_get_temp_dir().'/sb3-test-'.bin2hex(random_bytes(6));mkdir($d,0700);
for($i=0;$i<5;$i++)ensure(sb3_reserve($d,'itunes',3),'rate reservation');ensure(!sb3_reserve($d,'itunes',1),'rate limit');
ensure(sb3_reserve($d,'musicbrainz',1),'MB first');ensure(!sb3_reserve($d,'musicbrainz',1),'MB one per second');foreach(glob($d.'/*') as $f)unlink($f);rmdir($d);
echo "PASS: music metadata, international dedup, artwork, lookup safety, rate limits\n";
