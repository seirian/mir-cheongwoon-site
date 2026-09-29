<?php
/** Shared daily backup. Never include cached bytes or accept caller-chosen sources. */
declare(strict_types=1);
namespace YeopMigration;
if (PHP_SAPI !== 'cli' && !defined('YEOP_API')) { http_response_code(404); exit; }

final class DailyFanartStore {
    private const PREFIX = "<?php http_response_code(404); exit; __halt_compiler();\n";
    private const MIMES = ['image/jpeg','image/png','image/gif','image/webp','image/avif'];
    public function __construct(private string $dir, private $clock = null) {
        if (!is_dir($dir) || is_link($dir)
            || @file_get_contents($dir.'/.htaccess') !== "Require all denied\nOptions -Indexes\n") {
            throw new \RuntimeException('daily_store_unavailable');
        }
        $this->clock ??= static fn(): int => time();
    }
    private function read(string $name): array {
        $path = $this->dir.'/'.$name;
        clearstatcache(true, $path);
        if (is_link($path)) throw new \RuntimeException('daily_symlink');
        if (!is_file($path)) return [];
        if (filesize($path) > 65536) throw new \RuntimeException('daily_metadata_size');
        $raw = file_get_contents($path);
        if (!is_string($raw) || !str_starts_with($raw, self::PREFIX)) throw new \RuntimeException('daily_metadata_invalid');
        $value = json_decode(substr($raw, strlen(self::PREFIX)), true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($value)) throw new \RuntimeException('daily_metadata_invalid');
        return $value;
    }
    private function write(string $name, string $bytes): void {
        $path = $this->dir.'/'.$name; $tmp = $path.'.next';
        if (is_link($path) || is_link($tmp)) throw new \RuntimeException('daily_symlink');
        if (file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) throw new \RuntimeException('daily_write_failed');
        @chmod($tmp, 0600);
        if (!rename($tmp, $path)) throw new \RuntimeException('daily_commit_failed');
    }
    private function json(string $name, array $value): void {
        $this->write($name, self::PREFIX.json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }
    private function validRecord($record): bool {
        if (!is_array($record) || !in_array($record['slot'] ?? '', ['a','b'], true)) return false;
        if (!is_int($record['articleId'] ?? null) || $record['articleId'] < 1
            || ($record['articleUrl'] ?? '') !== 'https://cafe.naver.com/f-e/cafes/31003156/articles/'.$record['articleId']
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $record['sourceDate'] ?? '')
            || !is_string($record['collectedAt'] ?? null)
            || !is_string($record['title'] ?? null) || strlen($record['title']) > 2000
            || !is_string($record['author'] ?? null) || strlen($record['author']) > 800
            || !is_array($record['images'] ?? null) || count($record['images']) < 1 || count($record['images']) > 12) return false;
        foreach ($record['images'] as $index => $image) {
            if (!is_int($index) || $index < 0 || $index > 11 || !is_array($image)
                || !preg_match('/^[a-f0-9]{64}$/D', $image['id'] ?? '')
                || !in_array($image['mime'] ?? '', self::MIMES, true)
                || !is_int($image['size'] ?? null) || $image['size'] < 1 || $image['size'] > 6*1024*1024) return false;
            $path = $this->dir.'/'.$record['slot'].'-'.$index.'.bin';
            clearstatcache(true, $path);
            if (!is_file($path) || is_link($path) || filesize($path) !== $image['size']) return false;
        }
        return true;
    }
    public function publicSnapshot(string $apiBase): ?array {
        $record = $this->read('snapshot.php')['current'] ?? null;
        if (!$this->validRecord($record)) return null;
        $urls = array_map(static fn($image) => $apiBase.'naver-fanart-image.php?daily='.$image['id'], $record['images']);
        return [
            'status'=>'ok', 'boardUrl'=>BOARD, 'articleId'=>$record['articleId'],
            'articleUrl'=>$record['articleUrl'], 'title'=>$record['title'], 'author'=>$record['author'],
            'sourceDate'=>$record['sourceDate'], 'imageUrl'=>$urls[0], 'imageUrls'=>$urls, 'imageCount'=>count($urls),
            'isToday'=>false, 'fallback'=>true, 'stale'=>true, 'fallbackKind'=>'daily_batch',
            'batchDate'=>$record['batchDate'], 'batchCollectedAt'=>$record['collectedAt'],
        ];
    }
    public function image(string $id): ?array {
        if (!preg_match('/^[a-f0-9]{64}$/D', $id)) return null;
        $state = $this->read('snapshot.php');
        foreach (['current','previous'] as $key) {
            $record = $state[$key] ?? null;
            if (!$this->validRecord($record)) continue;
            foreach ($record['images'] as $index => $image) {
                if (!hash_equals($image['id'], $id)) continue;
                $body = file_get_contents($this->dir.'/'.$record['slot'].'-'.$index.'.bin');
                if (!is_string($body) || !hash_equals($id, hash('sha256', $body))
                    || (new \finfo(FILEINFO_MIME_TYPE))->buffer($body) !== $image['mime']) return null;
                return ['body'=>$body, 'mime'=>$image['mime']];
            }
        }
        return null;
    }
    public function status(): array {
        $run = $this->read('runs.php');
        $snapshot = $this->publicSnapshot('/api/');
        return ['lastRun'=>$run['lastRun'] ?? null, 'history'=>$run['history'] ?? [],
            'snapshot'=>$snapshot ? array_intersect_key($snapshot, array_flip(['articleId','sourceDate','imageCount','batchDate','batchCollectedAt'])) : null];
    }
    /** Fixed daily warm-up, once per KST date after 01:00; independent of live cache TTL. */
    public function refresh(callable $collect, callable $download): array {
        if (!is_writable($this->dir)) throw new \RuntimeException('daily_store_readonly');
        $now = ($this->clock)();
        $kst = (new \DateTimeImmutable('@'.$now))->setTimezone(new \DateTimeZone('Asia/Seoul'));
        if ((int)$kst->format('H') < 1) return ['status'=>'not_due','batchDate'=>$kst->format('Y-m-d')];
        $date = $kst->format('Y-m-d');
        $lockPath = $this->dir.'/batch.lock.php';
        if (is_link($lockPath)) throw new \RuntimeException('daily_symlink');
        $lock = fopen($lockPath, 'c+b');
        if (!$lock) throw new \RuntimeException('daily_lock_failed');
        @chmod($lockPath, 0600);
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return ['status'=>'running','batchDate'=>$date]; }
        try {
            $runs = $this->read('runs.php');
            if (($runs['lastRun']['batchDate'] ?? '') === $date) return $runs['lastRun'] + ['reused'=>true];
            $run = ['status'=>'running','batchDate'=>$date,'startedAt'=>gmdate('c', $now)];
            $this->json('runs.php', ['lastRun'=>$run,'history'=>$runs['history'] ?? []]);
            try {
                $data = $collect();
                if (($data['status'] ?? '') !== 'ok' || ($data['fallback'] ?? false) || ($data['stale'] ?? false)) throw new \RuntimeException('daily_source_unavailable');
                $urls = $data['imageUrls'] ?? [$data['imageUrl'] ?? ''];
                if (!is_array($urls) || count($urls) < 1 || count($urls) > 12) throw new \RuntimeException('daily_image_count');
                $old = $this->read('snapshot.php')['current'] ?? null;
                $slot = ($old['slot'] ?? '') === 'a' ? 'b' : 'a';
                // Reuse only the inactive fixed slot; the current successful slot is untouched.
                for ($i = 0; $i < 12; $i++) {
                    foreach (['.bin','.bin.next'] as $suffix) {
                        $path = $this->dir.'/'.$slot.'-'.$i.$suffix;
                        if (is_link($path)) throw new \RuntimeException('daily_symlink');
                        if (is_file($path) && !unlink($path)) throw new \RuntimeException('daily_slot_cleanup_failed');
                    }
                }
                $images = []; $bytes = 0;
                foreach ($urls as $url) {
                    parse_str((string)parse_url($url, PHP_URL_QUERY), $query);
                    $source = $query['url'] ?? '';
                    if (!is_string($source) || !validUrl($source, true)) throw new \RuntimeException('daily_source_invalid');
                    $image = $download($source);
                    $size = strlen($image['body']); $bytes += $size;
                    if ($size < 1 || $size > 6*1024*1024 || $bytes > 24*1024*1024
                        || !in_array($image['mime'], self::MIMES, true)
                        || (new \finfo(FILEINFO_MIME_TYPE))->buffer($image['body']) !== $image['mime']) throw new \RuntimeException('daily_image_invalid');
                    $id = hash('sha256', $image['body']);
                    if (in_array($id, array_column($images, 'id'), true)) continue;
                    $this->write($slot.'-'.count($images).'.bin', $image['body']);
                    $images[] = ['id'=>$id,'mime'=>$image['mime'],'size'=>$size];
                }
                $record = ['slot'=>$slot,'batchDate'=>$date,'collectedAt'=>gmdate('c', ($this->clock)()),
                    'articleId'=>$data['articleId'],'articleUrl'=>$data['articleUrl'],
                    'title'=>(string)($data['title'] ?? '팬아트'),
                    'author'=>(string)($data['author'] ?? '작성자'),
                    'sourceDate'=>$data['sourceDate'],'images'=>$images];
                if (!$this->validRecord($record)) throw new \RuntimeException('daily_record_invalid');
                // Only after every image is downloaded and checked, atomically promote the complete record.
                $this->json('snapshot.php', ['current'=>$record,'previous'=>$old]);
                $run += ['articleId'=>$record['articleId'],'sourceDate'=>$record['sourceDate'],'imageCount'=>count($images)];
                $run['status'] = 'success';
            } catch (\Throwable $error) {
                $run['status'] = 'failed';
                $message = $error->getMessage();
                $run['error'] = preg_match('/^[a-z0-9_]{1,80}$/D', $message) ? $message : 'daily_collection_failed';
            }
            $run['finishedAt'] = gmdate('c', ($this->clock)());
            $history = array_slice(array_merge([$run], $runs['history'] ?? []), 0, 31);
            $this->json('runs.php', ['lastRun'=>$run,'history'=>$history]);
            return $run;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}

function dailyFanartStore(array $config): DailyFanartStore {
    // Release-independent folder, provisioned/protected by deployment, not a request parameter.
    return new DailyFanartStore($config['fanart_daily_dir'] ?? dirname(__DIR__, 3).'/_fanart_daily');
}
function dailyFanartSnapshot(array $config): ?array {
    try { return dailyFanartStore($config)->publicSnapshot($config['api_base']); }
    catch (\Throwable $error) { return null; }
}
