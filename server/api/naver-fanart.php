<?php
declare(strict_types=1);
require __DIR__ . '/_entry.php';
if (!$config['naver_enabled']) \YeopMigration\sendJson(['status'=>'unavailable','reason'=>'disabled','boardUrl'=>\YeopMigration\BOARD]);
try {
    [$state, $hit] = $cache->remember('fanart', static function() use ($config): array {
        try {
            // At most three accessible candidates; immediately stops on any 401/403/429.
            $data = \YeopMigration\fanart(new \YeopMigration\Client(budget:20), $config['api_base'].'naver-fanart-image.php', attempts:3);
            $source = '';
            if (($data['status']??'')==='ok') {
                parse_str((string)parse_url($data['imageUrl'],PHP_URL_QUERY),$query);
                $source = is_string($query['url']??null)?$query['url']:'';
                if (!\YeopMigration\validUrl($source,true)) throw new \RuntimeException('image_not_allowed');
                $data['imageUrl']=$config['api_base'].'naver-fanart-image.php?id='.hash('sha256',$source);
            }
            $data['checked_at']=gmdate('c');
            return [['public'=>$data,'source'=>$source],1800];
        } catch (\Throwable $e) {
            $denied = preg_match('/^upstream_http_(401|403|429)$/D',$e->getMessage(),$match)===1;
            $reason = $denied ? ($match[1]==='429'?'upstream_rate_limited':'upstream_access_restricted'):'upstream_unavailable';
            return [['public'=>['status'=>'unavailable','reason'=>$reason,'boardUrl'=>\YeopMigration\BOARD,'checked_at'=>gmdate('c')],'source'=>''], $denied?21600:300];
        }
    });
    $public = $state['public']; $public['cached']=$hit;
    \YeopMigration\sendJson($public,200,120);
} catch (\Throwable $e) { \YeopMigration\sendJson(['status'=>'unavailable','reason'=>'cache_busy_or_unavailable','boardUrl'=>\YeopMigration\BOARD],503); }
