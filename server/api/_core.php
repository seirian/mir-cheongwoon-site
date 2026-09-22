<?php
/** PHP port for the user's site. No shell, database, login or credential access.
 * Public upstream data only. Bounded shared cache is provided by _cache.php.
 */
declare(strict_types=1);
namespace YeopMigration;
if (PHP_SAPI !== 'cli' && !defined('YEOP_API')) { http_response_code(404); exit; }

final class UpstreamError extends \RuntimeException {}

const BOARD = 'https://cafe.naver.com/f-e/cafes/31003156/menus/10?viewType=I';
const SOOP_PAGE = 'https://play.sooplive.com/alice427';
const SOOP_API = 'https://live.sooplive.com/afreeca/player_live_api.php';
const LIST_API = 'https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/31003156/menus/10/articles';
const ARTICLE_API = 'https://apis.naver.com/cafe-web/cafe-articleapi/v3/cafes/31003156/articles/';
const UA = 'YeopMirMigration/0.3 (+https://mir.yeop.net)';

function validUrl(string $url, bool $image = false): bool {
    if (strlen($url) > 4096 || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) return false;
    $p = parse_url($url);
    if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || isset($p['user']) || isset($p['pass']) || isset($p['fragment'])) return false;
    if (isset($p['port']) && $p['port'] !== 443) return false;
    $host = strtolower($p['host'] ?? '');
    if ($image) return (bool) preg_match('/(?:^|\.)(pstatic\.net|naver\.net|naver\.com)$/D', $host);
    return in_array($host, ['play.sooplive.com', 'live.sooplive.com', 'apis.naver.com'], true);
}

/** Only HTTPS absolute or root-relative redirects to the approved hosts. */
function redirectUrl(string $current, string $location, bool $image): string {
    if (str_starts_with($location, '/') && !str_starts_with($location, '//')) {
        $location = 'https://' . parse_url($current, PHP_URL_HOST) . $location;
    }
    if (!validUrl($location, $image)) throw new UpstreamError('redirect_not_allowed');
    return $location;
}

/** Return HTTP metadata without returning an upstream body in diagnostic reports. */
function curlRequest(string $url, string $method, array $headers, string $body, int $limit, int $timeout): array {
    if (!function_exists('curl_init')) throw new UpstreamError('curl_unavailable');
    $host = (string) parse_url($url, PHP_URL_HOST);
    $ips = gethostbynamel($host);
    if (!$ips) throw new UpstreamError('dns_unavailable');
    // Validate every returned IPv4 address and pin the connection (including redirects).
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new UpstreamError('nonpublic_address');
        }
    }
    $ch = curl_init($url);
    if ($ch === false) throw new UpstreamError('curl_init_failed');
    $buffer = ''; $responseHeaders = []; $tooLarge = false;
    curl_setopt_array($ch, [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_PROXY => '',
        CURLOPT_RESOLVE => [$host . ':443:' . $ips[0]],
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_CONNECTTIMEOUT => min(3, $timeout),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => UA,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_ENCODING => '',
        CURLOPT_WRITEFUNCTION => static function ($unused, string $chunk) use (&$buffer, &$tooLarge, $limit): int {
            if (strlen($buffer) + strlen($chunk) > $limit) { $tooLarge = true; return 0; }
            $buffer .= $chunk; return strlen($chunk);
        },
        CURLOPT_HEADERFUNCTION => static function ($unused, string $line) use (&$responseHeaders): int {
            if (str_starts_with($line, 'HTTP/')) $responseHeaders = [];
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            return strlen($line);
        },
    ]);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $ok = curl_exec($ch); $errno = curl_errno($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($tooLarge) throw new UpstreamError('response_too_large');
    // Do not expose remote HTML, internal paths, cookies or cURL error text.
    if ($ok === false) throw new UpstreamError('curl_error_' . $errno);
    return ['code' => $status, 'headers' => $responseHeaders, 'body' => $buffer];
}

final class Client {
    private $sender;
    private float $deadline;
    public array $trace = [];
    public function __construct(?callable $sender = null, int $budget = 25) {
        $this->sender = $sender ?? __NAMESPACE__ . '\\curlRequest';
        $this->deadline = microtime(true) + $budget;
    }
    public function request(string $url, string $method = 'GET', array $headers = [], string $body = '', bool $image = false): array {
        if (!in_array($method, ['GET', 'POST'], true) || !validUrl($url, $image)) throw new UpstreamError('request_not_allowed');
        $limit = $image ? 6 * 1024 * 1024 : 2 * 1024 * 1024;
        for ($i = 0; $i < 4; ++$i) {
            $remaining = (int) floor($this->deadline - microtime(true));
            if ($remaining < 1) throw new UpstreamError('time_budget_exceeded');
            $r = ($this->sender)($url, $method, $headers, $body, $limit, min(8, $remaining));
            $this->trace[] = ['host' => parse_url($url, PHP_URL_HOST), 'http_status' => $r['code']];
            // No reattempt, identity change, login or challenge bypass on denial.
            if (in_array($r['code'], [401, 403, 429], true)) throw new UpstreamError('upstream_http_' . $r['code']);
            if ($r['code'] >= 300 && $r['code'] < 400) {
                if ($method !== 'GET') throw new UpstreamError('post_redirect_not_followed');
                $url = redirectUrl($url, $r['headers']['location'] ?? '', $image);
                continue;
            }
            if ($r['code'] < 200 || $r['code'] >= 300) throw new UpstreamError('upstream_http_' . $r['code']);
            return $r;
        }
        throw new UpstreamError('redirect_limit');
    }
}

function parseJson(string $body): array {
    try { $x = json_decode($body, true, 64, JSON_THROW_ON_ERROR); }
    catch (\JsonException $e) { throw new UpstreamError('invalid_json'); }
    if (!is_array($x)) throw new UpstreamError('unexpected_json_shape');
    return $x;
}
function unwrap(array $x): array {
    $value = $x['message']['result'] ?? $x['result'] ?? $x;
    return is_array($value) ? $value : [];
}
function firstText(...$values): string {
    foreach ($values as $v) if (is_string($v) && trim($v) !== '') return trim($v);
    return '';
}
function kstDate(?float $milliseconds = null): string {
    $date = new \DateTimeImmutable('@' . (string) (int) floor(($milliseconds ?? microtime(true) * 1000) / 1000));
    return $date->setTimezone(new \DateTimeZone('Asia/Seoul'))->format('Y-m-d');
}
function timestampMs($value): float {
    if ((is_int($value) || is_float($value) || (is_string($value) && ctype_digit($value))) && (float) $value > 0) {
        $x = (float) $value; return $x >= 1_000_000_000_000 ? $x : $x * 1000;
    }
    if (is_string($value) && trim($value) !== '') {
        try { return (float) (new \DateTimeImmutable($value, new \DateTimeZone('Asia/Seoul')))->getTimestamp() * 1000; }
        catch (\Exception $e) {}
    }
    return 0;
}

function live(Client $client): array {
    $unknown = ['status' => 'unknown', 'channelId' => 'alice427'];
    $r = $client->request(SOOP_PAGE, headers: ['Accept: text/html,application/xhtml+xml']);
    if (!preg_match('/window\.nBroadNo\s*=\s*(\d+)\s*;/', $r['body'], $m) || (int) $m[1] === 0) {
        $offline = str_contains($r['body'], '스트리머가 오프라인입니다') || preg_match('/window\.nBroadNo\s*=\s*(?:0|null|undefined)\s*;/', $r['body']);
        return ['status' => $offline ? 'offline' : 'unknown', 'channelId' => 'alice427'];
    }
    $bno = $m[1];
    $r = $client->request(SOOP_API, 'POST', [
        'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
        'Origin: https://play.sooplive.com', 'Referer: ' . SOOP_PAGE,
    ], http_build_query(['from_api' => '0', 'mode' => 'landing', 'player_type' => 'html5', 'stream_type' => 'common', 'type' => 'live', 'bid' => 'alice427', 'bno' => $bno, 'pwd' => '']));
    $ch = parseJson($r['body'])['CHANNEL'] ?? [];
    if (!is_array($ch) || (int) ($ch['RESULT'] ?? 0) !== 1) return $unknown;
    return ['status' => 'live', 'channelId' => 'alice427', 'broadcastNo' => $ch['BNO'] ?? $bno,
        'title' => $ch['TITLE'] ?? '', 'streamer' => $ch['BJNICK'] ?? '미르_MIR', 'watchUrl' => SOOP_PAGE];
}

function imageUrl($value): string {
    if (!is_string($value)) return '';
    $value = html_entity_decode(trim($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (str_starts_with($value, '//')) $value = 'https:' . $value;
    if (!validUrl($value, true) || preg_match('/profile|emoticon|sticker|cafe_icon|default|banner|sp_|ico_/i', $value)) return '';
    return $value;
}
function htmlImages(string $html): array {
    $out = [];
    preg_match_all('/<img\b[^>]*>/iu', $html, $tags);
    foreach ($tags[0] as $tag) {
        foreach (['data-lazy-src', 'data-src', 'src'] as $attr) {
            if (preg_match('/(?:^|\s)' . preg_quote($attr, '/') . '\s*=\s*["\']([^"\']+)["\']/iu', $tag, $m)) {
                $u = imageUrl($m[1]);
                if ($u !== '') { $out[] = $u; break; }
            }
        }
    }
    return array_values(array_unique($out));
}
function objectImages($value, string $key = '', int $depth = 0, array &$out = []): array {
    if ($depth > 7 || count($out) >= 12) return $out;
    if (is_string($value) && preg_match('/image|photo|thumb|src|url/i', $key)) {
        $u = imageUrl($value); if ($u !== '' && !in_array($u, $out, true)) $out[] = $u;
    } elseif (is_array($value)) {
        foreach ($value as $k => $v) objectImages($v, is_int($k) ? $key : (string) $k, $depth + 1, $out);
    }
    return $out;
}
function fnv(string $s): int {
    // Inputs are ISO date, list length and numeric article id (ASCII), matching JS FNV-1a.
    $h = 2166136261;
    foreach (unpack('C*', $s) as $c) $h = (($h ^ $c) * 16777619) & 0xffffffff;
    return $h;
}
function naverHeaders(): array {
    return ['Accept: application/json, text/plain, */*', 'Origin: https://cafe.naver.com', 'Referer: ' . BOARD, 'X-Cafe-Product: pc'];
}
function fanart(Client $client, string $imageEndpoint = '/api/naver-fanart-image.php', ?string $today = null, int $attempts = 12): array {
    $today ??= kstDate();
    if ($imageEndpoint === '' || preg_match('/[\r\n]/', $imageEndpoint)) throw new \InvalidArgumentException('Invalid image endpoint');
    $query = http_build_query(['page' => 1, 'pageSize' => 50, 'sortBy' => 'TIME', 'viewType' => 'L']);
    $result = unwrap(parseJson($client->request(LIST_API . '?' . $query, headers: naverHeaders())['body']));
    $raw = $result['articleList'] ?? $result['articles'] ?? null;
    if (!is_array($raw)) throw new UpstreamError('article_list_shape_changed');
    $items = [];
    foreach ($raw as $entry) {
        if (!is_array($entry) || (isset($entry['type']) && $entry['type'] !== 'ARTICLE')) continue;
        $node = $entry['item'] ?? $entry;
        if (!is_array($node)) continue;
        $id = (int) ($node['articleId'] ?? $node['articleid'] ?? 0); $ms = 0;
        foreach (['writeDateTimestamp', 'writeDate', 'addDate', 'menuArticleWriteDate'] as $k) {
            $ms = timestampMs($node[$k] ?? null); if ($ms > 0) break;
        }
        if ($id < 1 || $ms <= 0) continue;
        $items[] = ['id' => $id, 'title' => firstText($node['subject'] ?? '', $node['title'] ?? ''), 'ms' => $ms, 'date' => kstDate($ms), 'node' => $node];
    }
    if ($items === []) return ['status' => 'empty', 'boardUrl' => BOARD];
    usort($items, static fn($a, $b) => $b['ms'] <=> $a['ms']);
    $todays = array_values(array_filter($items, static fn($x) => $x['date'] === $today));
    $lastDate = $items[0]['date'];
    $pool = $todays ?: array_values(array_filter($items, static fn($x) => $x['date'] === $lastDate));
    $seed = $today . ':' . count($pool);
    usort($pool, static fn($a, $b) => fnv($seed . ':' . $a['id']) <=> fnv($seed . ':' . $b['id']));
    foreach (array_slice($pool, 0, min(12, max(1, $attempts))) as $candidate) {
        $query = http_build_query(['query' => '', 'useCafeId' => 'true', 'requestFrom' => 'A']);
        $r = $client->request(ARTICLE_API . $candidate['id'] . '?' . $query, headers: naverHeaders());
        $a = unwrap(parseJson($r['body']))['article'] ?? null;
        // A denied or structurally changed response is not silently treated as an empty board.
        if (!is_array($a)) throw new UpstreamError('article_unavailable');
        $images = htmlImages(firstText($a['contentHtml'] ?? '', $a['content'] ?? ''));
        $structured = objectImages($a);
        $source = $images[0] ?? $structured[0] ?? '';
        if ($source === '') continue;
        $w = $a['writer'] ?? $a['member'] ?? $a['author'] ?? [];
        if (!is_array($w)) $w = [];
        $wi = $candidate['node']['writerInfo'] ?? [];
        if (!is_array($wi)) $wi = [];
        $names = [];
        foreach ([$w, $wi, $a, $candidate['node']] as $n) {
            foreach (['nickName','nick','nickname','name','memberNickname','writerNickname','writerName'] as $k) $names[] = $n[$k] ?? '';
        }
        return ['status' => 'ok', 'isToday' => $candidate['date'] === $today, 'today' => $today, 'boardUrl' => BOARD,
            'articleId' => $candidate['id'], 'title' => firstText($a['subject'] ?? '', $candidate['title'], '팬아트'),
            'author' => firstText(...$names) ?: '작성자', 'imageUrl' => $imageEndpoint . '?url=' . rawurlencode($source),
            'articleUrl' => 'https://cafe.naver.com/f-e/cafes/31003156/articles/' . $candidate['id'], 'sourceDate' => $candidate['date']];
    }
    return ['status' => 'empty', 'today' => $today, 'sourceDate' => $pool[0]['date'], 'boardUrl' => BOARD, 'error' => 'no_image_post_found'];
}
function image(Client $client, string $source): array {
    if (!validUrl($source, true)) throw new \InvalidArgumentException('invalid_image_url');
    $r = $client->request($source, headers: ['Accept: image/avif,image/webp,image/png,image/jpeg,image/gif', 'Referer: ' . BOARD], image: true);
    $declared = strtolower(explode(';', $r['headers']['content-type'] ?? '')[0]);
    $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($r['body']);
    $allowed = ['image/jpeg','image/png','image/gif','image/webp','image/avif'];
    // Reject SVG/XML/HTML, including mislabeled upstream content.
    if (!in_array($mime, $allowed, true) || !str_starts_with($declared, 'image/')) throw new UpstreamError('unsupported_image_response');
    return ['body' => $r['body'], 'mime' => $mime];
}
function sendJson(array $payload, int $status = 200, int $maxAge = 0): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: ' . ($maxAge ? 'public, max-age=' . $maxAge : 'no-store'));
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function requireGet(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        header('Allow: GET'); sendJson(['status' => 'error', 'error' => 'method_not_allowed'], 405);
    }
}
