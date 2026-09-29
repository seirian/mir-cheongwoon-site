<?php
/** Included by fanart-php-check.php. A temporary, offline copy tests the real endpoint. */
declare(strict_types=1);
(function (): void {
    $dir = sys_get_temp_dir().'/mir-fanart-fallback-'.bin2hex(random_bytes(6));
    mkdir($dir, 0700); mkdir($dir.'/_cache', 0700);
    try {
        foreach (['_fanart_daily.php','_core.php','_cache.php','_entry.php','naver-fanart.php','naver-fanart-image.php'] as $name) {
            copy(__DIR__.'/../server/api/'.$name, $dir.'/'.$name);
        }
        file_put_contents($dir.'/config.php', "<?php return ['api_base'=>'/api/','naver_enabled'=>true];");
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLVcAAAAASUVORK5CYII=', true);
        $id = hash('sha256', $png);
        $articleUrl = 'https://cafe.naver.com/f-e/cafes/31003156/articles/123';
        $meta = ['id'=>$id, 'articleId'=>123, 'articleUrl'=>$articleUrl, 'title'=>'저장된 팬아트', 'author'=>'테스트 작가', 'sourceDate'=>'2026-09-21'];
        file_put_contents($dir.'/_cache/fanart-fallback.json', json_encode($meta));
        file_put_contents($dir.'/_cache/fanart-fallback.bin', $png);
        // Seed a denied response: no request to Naver is made by this fixture.
        $cache = new \YeopMigration\SharedCache($dir.'/_cache');
        $cache->remember('fanart', static fn()=>[['public'=>['status'=>'unavailable','reason'=>'upstream_access_restricted','checked_at'=>'2026-09-30T00:00:00Z']],21600]);
        $invoke = static function(string $file, string $query='') use ($dir): string {
            $process = proc_open([PHP_BINARY, '-r', '$_SERVER["REQUEST_METHOD"]="GET"; parse_str($argv[2], $_GET); require $argv[1];', $dir.'/'.$file, $query], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
            if (!is_resource($process)) throw new RuntimeException('fixture_process_failed');
            fclose($pipes[0]); $body = stream_get_contents($pipes[1]); fclose($pipes[1]);
            $error = stream_get_contents($pipes[2]); fclose($pipes[2]);
            if (proc_close($process) !== 0 || $error !== '') throw new RuntimeException('fixture_endpoint_failed');
            return $body;
        };
        $data = json_decode($invoke('naver-fanart.php'), true, 64, JSON_THROW_ON_ERROR);
        check(($data['articleUrl'] ?? '') === $articleUrl, 'persisted fallback keeps original article link');
        check(($data['imageUrls'] ?? []) === [$data['imageUrl']] && $data['imageCount'] === 1, 'persisted fallback exposes compatible single slide');
        check($data['author'] === $meta['author'] && $data['title'] === $meta['title'] && $data['fallback'] && $data['stale'], 'fallback keeps attribution and stale flags');
        check($data['reason'] === 'upstream_access_restricted', 'fallback preserves upstream restriction reason');
        check($data['checked_at'] === '2026-09-30T00:00:00Z', 'fallback reports latest lookup separately from original article date');
        check($invoke('naver-fanart-image.php', 'fallback='.$id) === $png, 'real fallback image endpoint returns exact cached raster');
        file_put_contents($dir.'/_cache/fanart-fallback.json', json_encode([...$meta, 'articleUrl'=>'https://evil.test/123']));
        $invalid = json_decode($invoke('naver-fanart.php'), true, 64, JSON_THROW_ON_ERROR);
        check(($invalid['status'] ?? '') === 'unavailable' && !isset($invalid['articleUrl']), 'invalid fallback article link is rejected');
    } finally {
        foreach (glob($dir.'/_cache/*') as $path) unlink($path);
        rmdir($dir.'/_cache'); foreach (glob($dir.'/*') as $path) unlink($path); rmdir($dir);
    }
})();
