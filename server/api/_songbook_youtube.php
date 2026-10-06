<?php
/** Server-only YouTube credentials and fixed-origin transport. No client key exposure. */
declare(strict_types=1);
if (!defined('SONGBOOK_SEARCH_TEST')) { http_response_code(404); exit; }

function sbp_valid_key($value): string {
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{20,200}$/D', trim($value)) ? trim($value) : '';
}
function sbp_private_key(string $file): string {
    if (@is_link($file) || !@is_file($file) || !@is_readable($file)) return '';
    $mode = fileperms($file);
    if ($mode === false || ($mode & 0077) !== 0 || filesize($file) > 1024) return '';
    if (!defined('SONGBOOK_PRIVATE_CONFIG')) define('SONGBOOK_PRIVATE_CONFIG', true);
    return sbp_valid_key(include $file);
}
function sbp_youtube_key(): string {
    foreach (['SONGBOOK_YOUTUBE_API_KEY', 'YOUTUBE_API_KEY'] as $name) {
        $key = sbp_valid_key(getenv($name));
        if ($key !== '') return $key;
    }
    // Prefer the SFTP home outside /web. Each staged release has its own key file.
    $release = basename(dirname(__DIR__));
    if (preg_match('/^r[0-9]{14}_[a-f0-9]{8}$/D', $release)) {
        $key = sbp_private_key(dirname(__DIR__, 5) . '/.mir_songbook_keys/' . $release . '.php');
        if ($key !== '') return $key;
    }
    // Shared hosting fallback, only provisioned after actual HTTP denial checks.
    // The release htaccess denies api/_*; the PHP file also refuses direct execution.
    return sbp_private_key(__DIR__ . '/_songbook_youtube_key.php');
}
function sbp_youtube_search_url(string $query): string {
    return 'https://www.googleapis.com/youtube/v3/search?' . http_build_query([
        'part'=>'snippet', 'type'=>'video', 'q'=>$query, 'maxResults'=>12,
        'relevanceLanguage'=>'ko', 'regionCode'=>'KR', 'safeSearch'=>'moderate',
    ]);
}
function sbp_youtube_failure(array $response): string {
    $data = $response['data'] ?? [];
    $reasons = [];
    foreach (($data['error']['errors'] ?? []) as $item) {
        if (is_array($item) && is_string($item['reason'] ?? null)) $reasons[] = $item['reason'];
    }
    foreach (($data['error']['details'] ?? []) as $item) {
        if (is_array($item) && is_string($item['reason'] ?? null)) $reasons[] = $item['reason'];
    }
    if (array_intersect($reasons, ['quotaExceeded','dailyLimitExceeded','rateLimitExceeded','RESOURCE_EXHAUSTED'])) return 'youtube_quota_exceeded';
    if (array_intersect($reasons, ['accessNotConfigured','SERVICE_DISABLED'])) return 'youtube_api_disabled';
    if (array_intersect($reasons, ['keyInvalid','API_KEY_INVALID','API_KEY_EXPIRED'])) return 'youtube_key_invalid';
    if (array_intersect($reasons, ['ipRefererBlocked','API_KEY_IP_ADDRESS_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_SERVICE_BLOCKED'])) return 'youtube_key_restricted';
    return 'youtube_search_unavailable'; // Never return Google's raw error text or request headers.
}
function sbp_youtube_search(string $query, string $key): array {
    if (!function_exists('curl_init') || sbp_valid_key($key) === '') return ['ok'=>false,'data'=>[],'status'=>0];
    $body = '';
    $ch = curl_init(sbp_youtube_search_url($query));
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION=>false, CURLOPT_CONNECTTIMEOUT=>3, CURLOPT_TIMEOUT=>10,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS, CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,
        CURLOPT_USERAGENT=>'MirSongbook/5.0 (https://mir.yeop.net)',
        CURLOPT_HTTPHEADER=>['Accept: application/json', 'X-Goog-Api-Key: ' . $key],
        CURLOPT_WRITEFUNCTION=>function($ch, $chunk) use (&$body) {
            if (strlen($body) + strlen($chunk) > 2000000) return 0;
            $body .= $chunk; return strlen($chunk);
        },
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $data = json_decode($body, true);
    $ok = $status === 200 && curl_errno($ch) === 0 && is_array($data) && is_array($data['items'] ?? null);
    curl_close($ch);
    return ['ok'=>$ok, 'status'=>$status, 'data'=>is_array($data)?$data:[]];
}
