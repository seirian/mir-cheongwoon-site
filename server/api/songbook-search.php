<?php
// Read-only song metadata search; no lyrics, artwork, account data or media downloads.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
function sb2_reply(int $status,array $data): void {http_response_code($status);echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='GET') {header('Allow: GET');sb2_reply(405,['error'=>'method']);}
$q=$_GET['q']??'';$country=$_GET['country']??'KR';
if(!is_string($q)||!is_string($country))sb2_reply(400,['error'=>'query']);
$q=trim($q);
if(strlen($q)<2||strlen($q)>300||!preg_match('//u',$q)||!in_array($country,['KR','JP','US'],true))sb2_reply(400,['error'=>'query']);
$root=sys_get_temp_dir().'/mir-songbook-search-v2';
if(!is_dir($root)&&!mkdir($root,0700,true)&&!is_dir($root))sb2_reply(503,['error'=>'cache']);
$slot=hash('sha256',$country.'|'.$q);
$path=$root.'/'.$slot.'.json';
if(is_file($path)&&time()-filemtime($path)<86400){$body=file_get_contents($path);if(is_string($body)&&strlen($body)<100000){echo $body;exit;}}
// Bound outbound calls globally to less than the provider's documented limit.
$lock=fopen($root.'/rate','c+');if(!$lock||!flock($lock,LOCK_EX))sb2_reply(503,['error'=>'busy']);
$times=json_decode(stream_get_contents($lock),true);$times=is_array($times)?array_values(array_filter($times,fn($t)=>is_numeric($t)&&$t>time()-60)):[];
if(count($times)>=15){flock($lock,LOCK_UN);fclose($lock);header('Retry-After: 60');sb2_reply(429,['error'=>'rate_limit']);}
$times[]=time();ftruncate($lock,0);rewind($lock);fwrite($lock,json_encode($times));flock($lock,LOCK_UN);fclose($lock);
$url='https://itunes.apple.com/search?'.http_build_query(['term'=>$q,'country'=>$country,'media'=>'music','entity'=>'song','limit'=>20]);
if(!function_exists('curl_init'))sb2_reply(503,['error'=>'search_unavailable']);
$ch=curl_init($url);$body='';curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>8,CURLOPT_USERAGENT=>'MIRSongbook/2.0',CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$body){if(strlen($body)+strlen($chunk)>2000000)return 0;$body.=$chunk;return strlen($chunk);}]);
$ok=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
if($ok===false||$status!==200)sb2_reply(502,['error'=>'search_unavailable']);
$data=json_decode($body,true);if(!is_array($data['results']??null))sb2_reply(502,['error'=>'invalid_response']);
$songs=[];$seen=[];
foreach($data['results'] as $r){$title=$r['trackName']??null;$artist=$r['artistName']??null;if(!is_string($title)||!is_string($artist)||strlen($title)>600||strlen($artist)>600)continue;$id=$title.'|'.$artist;if(isset($seen[$id]))continue;$seen[$id]=true;$songs[]=['title'=>$title,'artist'=>$artist];if(count($songs)>=20)break;}
$result=['songs'=>$songs];$json=json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
$files=glob($root.'/*.json')?:[];if(count($files)>256){usort($files,fn($a,$b)=>filemtime($a)<=>filemtime($b));foreach(array_slice($files,0,count($files)-200)as $f)@unlink($f);}
$tmp=tempnam($root,'pending-');if($tmp!==false){file_put_contents($tmp,$json,LOCK_EX);rename($tmp,$path);}
sb2_reply(200,$result);
