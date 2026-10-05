<?php
declare(strict_types=1);
define('SONGBOOK_PLATFORM_TEST',true);
require __DIR__.'/../server/api/songbook-platform-search.php';
function check(bool $value,string $name):void{if(!$value)throw new Exception($name);}
$v=sbp_youtube_url('https://youtu.be/abcdefghijk?t=1m2s');
check($v['url']==='https://www.youtube.com/watch?v=abcdefghijk&t=62','preserve offset');
foreach(['javascript:alert(1)','https://u@youtube.com/watch?v=abcdefghijk','https://youtube.com:8443/watch?v=abcdefghijk','https://127.0.0.1/watch?v=abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com/redirect?q=x']as $url)check(sbp_youtube_url($url)===null,'reject URL');
foreach(['https://www.youtube.com/shorts/abcdefghijk','https://m.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/live/abcdefghijk']as $url)check(sbp_youtube_url($url)['id']==='abcdefghijk','supported public shape');
$rows=sbp_oembed(['type'=>'video','provider_name'=>'YouTube','title'=>'검토 영상','author_name'=>'채널명','html'=>'<script>bad</script>'],$v);
check(count($rows)===1&&$rows[0]['artist']===''&&$rows[0]['channel']==='채널명'&&!isset($rows[0]['html']),'no artist guessing or HTML');
check(sbp_oembed(['type'=>'link','provider_name'=>'Wrong','title'=>'invalid'],$v)===[],'invalid oembed');
$rows=sbp_search_videos(['items'=>[['id'=>['videoId'=>'abcdefghijk'],'snippet'=>['title'=>'A &amp; B','channelTitle'=>'영상 채널']],['id'=>['channelId'=>'UC123'],'snippet'=>[]]]]);
check(count($rows)===1&&$rows[0]['title']==='A & B'&&$rows[0]['artist']==='','official search mapping');
$source=file_get_contents(__DIR__.'/../server/api/songbook-platform-search.php');
check(!str_contains($source,'www.melon.com/search'),'no unapproved Melon requests');
check(str_contains($source,"'setup_required'"),'missing key is not an empty result');
echo "PASS: platform URL validation, metadata mapping, missing-key state, no Melon scraping\n";
