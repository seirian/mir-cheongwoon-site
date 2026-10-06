<?php
declare(strict_types=1);
define('SONGBOOK_SEARCH_TEST',true);
require __DIR__.'/../server/api/_songbook_youtube.php';
function yt_check(bool $ok,string $message):void { if(!$ok) throw new Exception($message); }
$key='fixture-YouTube-Api-Key-1234567890';
yt_check(sbp_valid_key($key)===$key,'accept a standard safe key');
foreach(['short', "valid-but-header\r\ninjection-123456",str_repeat('a',201),false] as $bad) yt_check(sbp_valid_key($bad)==='','reject invalid key');
$url=sbp_youtube_search_url('영물이다 이오몽');parse_str(parse_url($url,PHP_URL_QUERY),$q);
yt_check(parse_url($url,PHP_URL_HOST)==='www.googleapis.com'&&$q['q']==='영물이다 이오몽'&&$q['type']==='video'&&$q['maxResults']==='12'&&!isset($q['key']),'fixed host and no key in URL');
foreach(['quotaExceeded'=>'youtube_quota_exceeded','accessNotConfigured'=>'youtube_api_disabled','API_KEY_INVALID'=>'youtube_key_invalid','API_KEY_IP_ADDRESS_BLOCKED'=>'youtube_key_restricted'] as $reason=>$expected) {
 yt_check(sbp_youtube_failure(['data'=>['error'=>['details'=>[['reason'=>$reason,'message'=>$key]]]]])===$expected,'safe diagnostic');
}
yt_check(sbp_youtube_failure(['data'=>['error'=>['message'=>$key]]])==='youtube_search_unavailable','never return upstream errors');
$path=tempnam(sys_get_temp_dir(),'songbook-key-test-');
try {
 file_put_contents($path,"<?php if (!defined('SONGBOOK_PRIVATE_CONFIG')) { http_response_code(404); exit; } return '".$key."';");
 chmod($path,0600);clearstatcache();yt_check(sbp_private_key($path)===$key,'private file readable');
 chmod($path,0644);clearstatcache();yt_check(sbp_private_key($path)==='','reject public permissions');
 chmod($path,0600);clearstatcache();symlink($path,$path.'.link');yt_check(sbp_private_key($path.'.link')==='','reject symlink');
 yt_check(sbp_private_key($path.'.absent')==='','missing stays unconfigured');
} finally { @unlink($path.'.link');@unlink($path); }
putenv('SONGBOOK_YOUTUBE_API_KEY='.$key);yt_check(sbp_youtube_key()===$key,'environment key priority');putenv('SONGBOOK_YOUTUBE_API_KEY');
$source=file_get_contents(__DIR__.'/../server/api/_songbook_youtube.php');
yt_check(str_contains($source,'X-Goog-Api-Key: ')&&!str_contains($source,"'key'=>"),'header credential transport');
echo "PASS: private key format/permissions, no URL secret, safe upstream diagnostics, server-only transport\n";
