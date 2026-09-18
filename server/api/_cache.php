<?php
/** Fixed-key, size-bounded cache; no eval/include of cached bytes. */
declare(strict_types=1);
namespace YeopMigration;
if (PHP_SAPI !== 'cli' && !defined('YEOP_API')) { http_response_code(404); exit; }
final class SharedCache {
    public const PREFIX = "<?php http_response_code(404); exit; __halt_compiler();\n";
    private const KEYS = ['soop', 'fanart', 'image', 'health'];
    private const MAX_BYTES = 9 * 1024 * 1024;
    public function __construct(private string $dir, private $clock = null) {
        if (!is_dir($dir) || is_link($dir) || !is_writable($dir)) throw new \RuntimeException('cache_unavailable');
        $this->clock ??= static fn(): int => time();
    }
    private function path(string $key, string $kind): string {
        if (!in_array($key, self::KEYS, true)) throw new \InvalidArgumentException('cache_key_not_allowed');
        return $this->dir . '/' . $key . '.' . $kind . '.php';
    }
    public function peek(string $key): ?array {
        $path = $this->path($key, 'state');
        if (is_link($path)) throw new \RuntimeException('cache_symlink');
        if (!is_file($path)) return null;
        $size = @filesize($path);
        if ($size === false || $size > self::MAX_BYTES) throw new \RuntimeException('cache_invalid_size');
        $raw = @file_get_contents($path);
        if ($raw === false || !str_starts_with($raw, self::PREFIX)) throw new \RuntimeException('cache_invalid_data');
        $x = json_decode(substr($raw, strlen(self::PREFIX)), true);
        if (!is_array($x) || !is_array($x['value'] ?? null) || !is_int($x['expires'] ?? null)) throw new \RuntimeException('cache_invalid_data');
        return $x;
    }
    public function fresh(string $key): ?array {
        $x = $this->peek($key);
        return $x && $x['expires'] > ($this->clock)() ? $x['value'] : null;
    }
    /** Worker returns [payload, TTL]. One upstream call per key, no stale LIVE state. */
    public function remember(string $key, callable $worker): array {
        if (($fresh = $this->fresh($key)) !== null) return [$fresh, true];
        $lockPath = $this->path($key, 'lock');
        if (is_link($lockPath)) throw new \RuntimeException('cache_symlink');
        $lock = @fopen($lockPath, 'c+b');
        if (!$lock) throw new \RuntimeException('cache_lock_failed');
        @chmod($lockPath, 0600);
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); throw new \RuntimeException('cache_busy'); }
        try {
            if (($fresh = $this->fresh($key)) !== null) return [$fresh, true];
            ftruncate($lock, 0); rewind($lock); fwrite($lock, self::PREFIX); fflush($lock);
            [$payload, $ttl] = $worker();
            if (!is_array($payload) || !is_int($ttl) || $ttl < 1 || $ttl > 86400) throw new \RuntimeException('cache_invalid_worker');
            $now = ($this->clock)();
            $raw = self::PREFIX . json_encode(['saved' => $now, 'expires' => $now + $ttl, 'value' => $payload], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            if (strlen($raw) > self::MAX_BYTES) throw new \RuntimeException('cache_too_large');
            $target = $this->path($key, 'state');
            $tmp = $this->path($key, 'next');
            if (is_link($target) || is_link($tmp)) throw new \RuntimeException('cache_symlink');
            // Fixed .next.php path is serialized by this key's lock; never executable data.
            $written = @file_put_contents($tmp, $raw, LOCK_EX);
            if ($written !== strlen($raw)) throw new \RuntimeException('cache_write_failed');
            @chmod($tmp, 0600);
            if (!@rename($tmp, $target)) throw new \RuntimeException('cache_commit_failed');
            return [$payload, false];
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}
