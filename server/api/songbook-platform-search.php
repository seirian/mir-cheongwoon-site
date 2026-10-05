<?php
/** Preview music discovery. Official Apple/YouTube metadata only; no Melon scraping. */
declare(strict_types=1);
define('SONGBOOK_SEARCH_TEST', true);
require_once __DIR__ . '/songbook-search.php';

function sbp_youtube_url(string $value): ?array {
    if (strlen($value)>1500 || preg_match('/[\\\\\s]/u',$value)) return null;
    $p=parse_url($value);
    if (!$p || ($p['scheme']??'')!=='https' || isset($p['user']) || isset($p['pass']) || isset($p['port'])) return null;
    parse_str($p['query']??'', $args); $id=''; $host=strtolower($p['host']??''); $path=$p['path']??'';
    if ($host==='youtu.be' && preg_match('~^/([\w-]{11})/?$~',$path,$m)) $id=$m[1];
    if (in_array($host,['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'],true)) {
        if ($path==='/watch') $id=is_string($args['v']??null)?$args['v']:'';
        elseif (preg_match('~^/(?:shorts|live|embed)/([\w-]{11})/?$~',$path,$m)) $id=$m[1];
    }
    if (!preg_match('/^[\w-]{11}$/',$id)) return null;
    $raw=$args['t']??$args['start']??''; $seconds=null;
    if (is_string($raw) && preg_match('/^\d+s?$/',$raw)) $seconds=min(604800,(int)$raw);
    elseif (is_string($raw) && preg_match('/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/',$raw,$m) && $raw!=='') $seconds=min(604800,(int)($m[1]??0)*3600+(int)($m[2]??0)*60+(int)($m[3]??0));
    return ['id'=>$id,'url'=>'https://www.youtube.com/watch?v='.$id.($seconds!==null?'&t='.$seconds:'')];
}
function sbp_video(array $video, string $title, string $channel): ?array {
    $title=sb3_text($title); $channel=sb3_text($channel);
    if (!$title) return null;
    return ['provider'=>'youtube','key'=>'youtube:'.$video['id'],'title'=>$title,'artist'=>'','channel'=>$channel,
        'videoUrl'=>$video['url'],'thumbnail'=>'https://i.ytimg.com/vi/'.$video['id'].'/hqdefault.jpg','aliases'=>[]];
}
function sbp_oembed(array $data,array $video): array {
    if (($data['type']??'')!=='video' || ($data['provider_name']??'')!=='YouTube') return [];
    $row=sbp_video($video,(string)($data['title']??''),(string)($data['author_name']??''));
    return $row?[$row]:[]; // Never return or embed upstream HTML; channel is not the singer.
}
function sbp_search_videos(array $data): array {
    $rows=[];$seen=[];
    foreach ($data['items']??[] as $item) {
        if (!is_array($item)||!is_array($item['id']??null)||!is_array($item['snippet']??null)) continue;
        $id=$item['id']['videoId']??null;
        if (!is_string($id) || !preg_match('/^[\w-]{11}$/',$id) || isset($seen[$id])) continue;
        $row=sbp_video(['id'=>$id,'url'=>'https://www.youtube.com/watch?v='.$id],html_entity_decode((string)($item['snippet']['title']??''),ENT_QUOTES|ENT_HTML5,'UTF-8'),html_entity_decode((string)($item['snippet']['channelTitle']??''),ENT_QUOTES|ENT_HTML5,'UTF-8'));
        if ($row) {$rows[]=$row;$seen[$id]=true;} if (count($rows)>=12) break;
    }
    return $rows;
}
function sbp_budget(string $root,string $name,int $limit,int $period): bool {
    $file=fopen($root.'/budget-'.hash('sha256',$name),'c+');
    if (!$file) return false;
    try {
        if (!flock($file,LOCK_EX)) return false;
        $times=json_decode(stream_get_contents($file),true);$now=time();
        $times=is_array($times)?array_values(array_filter($times,fn($t)=>is_int($t)&&$t>$now-$period)):[];
        if (count($times)>=$limit) return false;
        $times[]=$now;ftruncate($file,0);rewind($file);fwrite($file,json_encode($times));return true;
    } finally {flock($file,LOCK_UN);fclose($file);}
}
if (defined('SONGBOOK_PLATFORM_TEST')) return;
header('Content-Type: application/json; charset=utf-8');header('X-Content-Type-Options: nosniff');header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD']??'GET')!=='GET') {header('Allow: GET');sb3_reply(405,['error'=>'method']);}
$provider=$_GET['provider']??'';$q=$_GET['q']??'';$country=$_GET['country']??'AUTO';
if (!is_string($provider)||!in_array($provider,['apple','youtube','melon'],true)||!is_string($q)||!is_string($country)||!in_array($country,['AUTO','KR','US','JP'],true)) sb3_reply(400,['error'=>'query']);
$q=sb3_text($q,300);if (!$q || preg_match_all('/./us',$q)<2) sb3_reply(400,['error'=>'query']);
if ($provider==='melon') sb3_reply(200,['provider'=>'melon','state'=>'external_only','songs'=>[],'message'=>'멜론 자동 검색은 연결하지 않았습니다. 멜론에서 확인한 정보를 직접 입력할 수 있습니다.']);
$video=$provider==='youtube'?sbp_youtube_url($q):null;
$key=trim((string)(getenv('SONGBOOK_YOUTUBE_API_KEY')?:getenv('YOUTUBE_API_KEY')?:''));
if ($provider==='youtube' && !$video && preg_match('~^https?://~i',$q)) sb3_reply(400,['error'=>'unsupported_video_url']);
if ($provider==='youtube' && !$video && !$key) sb3_reply(200,['provider'=>'youtube','state'=>'setup_required','songs'=>[],'message'=>'키워드 검색 API 연결 전입니다. YouTube에서 검색한 뒤 영상 주소를 붙여넣어 가져오세요.']);
$lookup=$provider==='apple'?sb3_lookup_id($q):'';
if ($provider==='apple' && preg_match('~^https?://~i',$q) && !$lookup) sb3_reply(400,['error'=>'unsupported_music_link']);
$root=sys_get_temp_dir().'/mir-songbook-platform-v1';$rateRoot=sys_get_temp_dir().'/mir-songbook-search-v3';
foreach ([$root,$rateRoot] as $dir) if (!is_dir($dir) && !@mkdir($dir,0700,true) && !is_dir($dir)) sb3_reply(503,['error'=>'cache']);
$path=$root.'/'.hash('sha256',$provider.'|'.$country.'|'.$q.'|v1').'.json';
if (is_file($path)) {$cached=json_decode((string)file_get_contents($path),true);if (is_array($cached)&&($cached['expires']??0)>time()) sb3_reply(200,$cached['data']);}
// Fixed per-provider budgets bound unauthenticated preview use. Never log API key values.
if (!sbp_budget($root,'global-'.$provider,20,60)) {header('Retry-After: 60');sb3_reply(429,['error'=>'rate_limit']);}
$urls=[];$songs=[];$partial=false;
if ($provider==='youtube') {
    if ($video) $urls['youtube']='https://www.youtube.com/oembed?'.http_build_query(['url'=>$video['url'],'format'=>'json']);
    else {
        if (!sbp_budget($root,'youtube-search-day',80,86400)) {header('Retry-After: 3600');sb3_reply(429,['error'=>'search_budget']);}
        $urls['youtube']='https://www.googleapis.com/youtube/v3/search?'.http_build_query(['part'=>'snippet','type'=>'video','q'=>$q,'maxResults'=>12,'relevanceLanguage'=>'ko','regionCode'=>'KR','safeSearch'=>'moderate','key'=>$key]);
    }
    $response=sb3_fetch($urls)['youtube'];
    if (!$response['ok']) sb3_reply(502,['error'=>'video_unavailable','provider'=>'youtube','songs'=>[]]);
    $songs=$video?sbp_oembed($response['data'],$video):sbp_search_videos($response['data']);
    if ($video && !$songs) sb3_reply(502,['error'=>'video_unavailable','provider'=>'youtube','songs'=>[]]);
} else {
    $registry=require __DIR__.'/_songbook_korean_titles.php';$regions=$country==='AUTO'?['KR','US','JP']:[$country];
    $ids=(!$lookup&&$country==='AUTO')?sb4_known_ids($q,$registry):[];
    if (!sb3_reserve($rateRoot,'itunes',count($regions)+($ids?1:0))) {header('Retry-After: 60');sb3_reply(429,['error'=>'rate_limit']);}
    if ($ids) $urls['itunes-known']='https://itunes.apple.com/lookup?'.http_build_query(['id'=>implode(',',$ids),'country'=>'US','entity'=>'song']);
    foreach ($regions as $r) $urls['itunes-'.$r]='https://itunes.apple.com/'.($lookup?'lookup?':'search?').http_build_query(($lookup?['id'=>$lookup]:['term'=>$q])+['country'=>$r,'media'=>'music','entity'=>'song','limit'=>20]);
    $groups=[];$ok=0;
    foreach(sb3_fetch($urls) as $name=>$response) {
        if (!$response['ok']||!is_array($response['data']['results']??null)) {$partial=true;continue;}
        $ok++;$groups[]=array_map(fn($r)=>sb4_localize($r,$registry),sb3_itunes($response['data'],substr($name,7)));
    }
    if (!$ok) sb3_reply(502,['error'=>'search_unavailable','provider'=>'apple','songs'=>[]]);
    $songs=array_map(fn($r)=>array_merge($r,['provider'=>'apple']),array_slice(sb4_order(sb4_merge($groups),$q),0,40));
}
$result=['provider'=>$provider,'state'=>$songs?'ok':'empty','songs'=>$songs,'partial'=>$partial,'checkedAt'=>gmdate('c')];
$files=glob($root.'/*.json')?:[];if(count($files)>256){usort($files,fn($a,$b)=>filemtime($a)<=>filemtime($b));foreach(array_slice($files,0,count($files)-200)as $f)@unlink($f);}
$tmp=tempnam($root,'pending-');if($tmp!==false){file_put_contents($tmp,json_encode(['expires'=>time()+($partial?30:($provider==='youtube'?300:3600)),'data'=>$result],JSON_UNESCAPED_UNICODE),LOCK_EX);rename($tmp,$path);}
sb3_reply(200,$result);
