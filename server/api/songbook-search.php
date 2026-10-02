<?php
/** Bounded read-only federation of public music metadata APIs. No fan-site data or audio. */
declare(strict_types=1);
function sb3_reply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function sb3_text($value, int $limit = 200): string {
    if (!is_string($value) || !preg_match('//u', $value)) return '';
    $value = trim($value);
    return preg_match_all('/./us', $value) <= $limit ? $value : '';
}
function sb3_artwork($value): string {
    if (!is_string($value) || strlen($value) > 1500 || preg_match('/[\s\\\\]/u', $value)) return '';
    $p = parse_url($value);
    return is_array($p) && ($p['scheme'] ?? '') === 'https' && preg_match('/^is[0-9]+-ssl\.mzstatic\.com$/', $p['host'] ?? '') && str_starts_with($p['path'] ?? '', '/image/thumb/') && !isset($p['user']) && !isset($p['pass']) && !isset($p['port']) && !isset($p['query']) && !isset($p['fragment']) ? $value : '';
}
function sb3_music_url($value): string {
    if (!is_string($value) || strlen($value) > 1500 || preg_match('/[\s\\\\]/u', $value)) return '';
    $p = parse_url($value);
    if (!is_array($p) || ($p['scheme'] ?? '') !== 'https' || !in_array($p['host'] ?? '', ['music.apple.com','itunes.apple.com'], true) || isset($p['user']) || isset($p['pass']) || isset($p['port']) || !preg_match('~^/[a-z]{2}/album/.+/[0-9]+$~', $p['path'] ?? '')) return '';
    parse_str($p['query'] ?? '', $args);
    $id = $args['i'] ?? '';
    return 'https://' . $p['host'] . $p['path'] . (is_string($id) && ctype_digit($id) ? '?i=' . $id : '');
}
function sb3_lookup_id(string $query): string {
    $safe = sb3_music_url($query);
    if (!$safe) return '';
    $p = parse_url($safe); parse_str($p['query'] ?? '', $args);
    return is_string($args['i'] ?? null) && ctype_digit($args['i']) ? $args['i'] : '';
}
function sb3_itunes(array $data, string $region = ''): array {
    $songs = [];
    foreach ($data['results'] ?? [] as $r) {
        if (!is_array($r) || ($r['kind'] ?? '') !== 'song') continue;
        $title = sb3_text($r['trackName'] ?? ''); $artist = sb3_text($r['artistName'] ?? '');
        if (!$title || !$artist || !is_numeric($r['trackId'] ?? null)) continue;
        $music = sb3_music_url($r['trackViewUrl'] ?? '');
        $songs[] = ['key'=>'itunes:' . $r['trackId'], 'catalogRegion'=>$region, 'title'=>$title, 'artist'=>$artist, 'album'=>sb3_text($r['collectionName'] ?? ''), 'aliases'=>[], 'artworkUrl'=>$music ? sb3_artwork($r['artworkUrl100'] ?? '') : '', 'musicUrl'=>$music, 'releaseDate'=>substr(sb3_text($r['releaseDate'] ?? ''),0,10), 'duration'=>(int)($r['trackTimeMillis'] ?? 0)];
    }
    return $songs;
}
require_once __DIR__ . '/_songbook_localization.php';
function sb3_musicbrainz(array $data): array {
    $songs = [];
    foreach ($data['recordings'] ?? [] as $r) {
        if (!is_array($r)) continue;
        $originalTitle = sb3_text($r['title'] ?? '');
        $title = sb4_preferred_alias($r['aliases'] ?? [], $originalTitle, 'Recording name') ?: $originalTitle;
        $artist = ''; $originalArtist = '';
        foreach ($r['artist-credit'] ?? [] as $a) if (is_array($a)) {
            $original = sb3_text($a['name'] ?? $a['artist']['name'] ?? '');
            $localized = sb4_preferred_alias($a['artist']['aliases'] ?? [], $original, 'Artist name');
            $artist .= ($localized ?: $original) . ($a['joinphrase'] ?? '');
            $originalArtist .= $original . ($a['joinphrase'] ?? '');
        }
        $artist = sb3_text($artist);
        if (!$title || !$artist || !preg_match('/^[a-f0-9-]{36}$/', $r['id'] ?? '')) continue;
        $aliases = sb4_aliases(array_merge([$originalTitle], $originalArtist !== $artist ? [$originalArtist] : []), $title);
        $songs[] = ['key'=>'musicbrainz:' . $r['id'], 'title'=>$title, 'artist'=>$artist, 'album'=>sb3_text($r['releases'][0]['title'] ?? ''), 'aliases'=>$aliases, 'artworkUrl'=>'', 'musicUrl'=>'', 'releaseDate'=>sb3_text($r['first-release-date'] ?? ''), 'duration'=>(int)($r['length'] ?? 0), 'titleStatus'=>$title !== $originalTitle ? 'alias-ko' : (sb4_korean($title) ? 'catalog-ko' : 'original')];
    }
    return $songs;
}
function sb3_merge(array $groups): array { return sb4_merge($groups); }
function sb3_reserve(string $root, string $provider, int $count): bool {
    $lock = fopen($root . '/rate-' . $provider, 'c+');
    if (!$lock || !flock($lock, LOCK_EX)) return false;
    $now = microtime(true); $times = json_decode(stream_get_contents($lock), true);
    $times = is_array($times) ? array_values(array_filter($times, fn($n)=>is_numeric($n) && $n>$now-60)) : [];
    $allowed = $provider === 'itunes' ? count($times)+$count<=15 : (!$times || $now-max($times)>=1.1);
    if ($allowed) { for ($i=0;$i<$count;$i++) $times[]=$now; ftruncate($lock,0);rewind($lock);fwrite($lock,json_encode($times)); }
    flock($lock, LOCK_UN); fclose($lock); return $allowed;
}
function sb3_fetch(array $urls): array {
    if (!function_exists('curl_multi_init')) return [];
    $multi=curl_multi_init();$handles=[];$bodies=[];$result=[];
    foreach ($urls as $name=>$url) {
        $bodies[$name]='';$ch=curl_init($url);
        curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>10,CURLOPT_USERAGENT=>'MirSongbook/4.0 (https://mir.yeop.net)',CURLOPT_HTTPHEADER=>['Accept: application/json'],CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$bodies,$name){if(strlen($bodies[$name])+strlen($chunk)>2000000)return 0;$bodies[$name].=$chunk;return strlen($chunk);}]);
        $handles[$name]=$ch;curl_multi_add_handle($multi,$ch);
    }
    do { $code=curl_multi_exec($multi,$running); if($running && curl_multi_select($multi,0.25)===-1)usleep(10000); } while($running && $code===CURLM_OK);
    foreach($handles as $name=>$ch){$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$data=json_decode($bodies[$name],true);$result[$name]=['ok'=>$status===200 && curl_errno($ch)===0 && is_array($data),'data'=>$data,'status'=>$status];curl_multi_remove_handle($multi,$ch);curl_close($ch);}
    curl_multi_close($multi);return $result;
}
if (defined('SONGBOOK_SEARCH_TEST')) return;
header('Content-Type: application/json; charset=utf-8');header('X-Content-Type-Options: nosniff');header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {header('Allow: GET');sb3_reply(405,['error'=>'method']);}
$q=$_GET['q']??'';$country=$_GET['country']??'AUTO';
if(!is_string($q)||!is_string($country)||!in_array($country,['AUTO','KR','US','JP'],true))sb3_reply(400,['error'=>'query']);
$q=sb3_text($q,300);if(!$q||preg_match_all('/./us',$q)<2)sb3_reply(400,['error'=>'query']);
$lookup=sb3_lookup_id($q);if(preg_match('~^https?://~i',$q)&&!$lookup)sb3_reply(400,['error'=>'unsupported_music_link']);
$registry = require __DIR__ . '/_songbook_korean_titles.php';
$root=sys_get_temp_dir().'/mir-songbook-search-v4';
// Share provider quotas with the previous release, but version response caches separately.
$rateRoot=sys_get_temp_dir().'/mir-songbook-search-v3';
if(!is_dir($rateRoot)&&!mkdir($rateRoot,0700,true)&&!is_dir($rateRoot))sb3_reply(503,['error'=>'cache']);
if(!is_dir($root)&&!mkdir($root,0700,true)&&!is_dir($root))sb3_reply(503,['error'=>'cache']);
$path=$root.'/'.hash('sha256','ko-v4|'.hash_file('sha256',__DIR__.'/_songbook_korean_titles.php').'|'.$country.'|'.$q).'.json';
if(is_file($path)){$cached=json_decode((string)file_get_contents($path),true);if(is_array($cached)&&($cached['expires']??0)>time()){sb3_reply(200,$cached['data']);}}
$regions=$country==='AUTO'?['KR','US','JP']:[$country];$urls=[];$states=[];$groups=[];
$knownIds = !$lookup && $country === 'AUTO' ? sb4_known_ids($q, $registry) : [];
if(sb3_reserve($rateRoot,'itunes',count($regions)+($knownIds?1:0))) {
if($knownIds) $urls['itunes-known']='https://itunes.apple.com/lookup?'.http_build_query(['id'=>implode(',',$knownIds),'country'=>'US','entity'=>'song']);
foreach($regions as $r){$urls['itunes-'.$r]='https://itunes.apple.com/'.($lookup?'lookup?':'search?').http_build_query(($lookup?['id'=>$lookup]:['term'=>$q])+['country'=>$r,'media'=>'music','entity'=>'song','limit'=>30]);}
} else $states[]=['service'=>'music catalog','state'=>'rate_limit'];
if(!$lookup){
 if(sb3_reserve($rateRoot,'musicbrainz',1)){$escaped=str_replace(['\\','"'],['\\\\','\\"'],$q);$urls['musicbrainz']='https://musicbrainz.org/ws/2/recording/?'.http_build_query(['query'=>'recording:"'.$escaped.'" OR artist:"'.$escaped.'"','fmt'=>'json','limit'=>20]);}
 else $states[]=['service'=>'supplemental catalog','state'=>'rate_limit'];
}
$ok=0;
foreach(sb3_fetch($urls) as $name=>$response){
 $data=$response['data'];$valid=$response['ok'] && is_array($data[$name==='musicbrainz'?'recordings':'results']??null);
 $rows=$valid?($name==='musicbrainz'?sb3_musicbrainz($data):sb3_itunes($data, substr($name,7))):[];
 $states[]=['service'=>$name,'state'=>$valid?'ok':'unavailable','count'=>count($rows)];
 if($valid){$ok++;$groups[]=array_map(fn($row)=>sb4_localize($row,$registry),$rows);}
}
if(!$ok){header('Retry-After: 60');sb3_reply(!$urls?429:502,['error'=>!$urls?'rate_limit':'search_unavailable','songs'=>[]]);}
$songs=sb4_order(sb4_merge($groups),$q);$partial=count(array_filter($states,fn($s)=>$s['state']!=='ok'))>0;
$result=['songs'=>$songs,'partial'=>$partial,'checkedAt'=>gmdate('c'),'services'=>$states,'displayLocale'=>'ko-KR','titlePolicy'=>'recording-identity-first'];
$ttl=$partial?30:($songs?21600:300);
$files=glob($root.'/*.json')?:[];if(count($files)>256){usort($files,fn($a,$b)=>filemtime($a)<=>filemtime($b));foreach(array_slice($files,0,count($files)-200)as $f)@unlink($f);}
$tmp=tempnam($root,'pending-');if($tmp!==false){file_put_contents($tmp,json_encode(['expires'=>time()+$ttl,'data'=>$result],JSON_UNESCAPED_UNICODE),LOCK_EX);rename($tmp,$path);}
sb3_reply(200,$result);
