<?php
/** Korean-first metadata selection. Never translate the query into an asserted title. */
declare(strict_types=1);
function sb4_normalize(string $text): string {
    if (class_exists('Normalizer')) $text = Normalizer::normalize($text, Normalizer::FORM_KC) ?: $text;
    return preg_replace('/[\p{P}\p{Z}\p{S}\s]+/u', '', strtolower($text));
}
function sb4_korean(string $text): bool { return preg_match('/[가-힣]/u', $text) === 1; }
function sb4_aliases(array $values, string $title = ''): array {
    $result = []; $seen = [sb4_normalize($title) => true];
    foreach ($values as $value) {
        $value = sb3_text($value, 100);
        if (!$value || isset($seen[sb4_normalize($value)])) continue;
        $result[] = $value; $seen[sb4_normalize($value)] = true;
        if (count($result) >= 20) break;
    }
    return $result;
}
function sb4_variant(string $title): string {
    // Only explicit suffixes/parenthetical markers; "Live Your Life" is not a live recording.
    $markers = preg_match_all('/[\(\[（]([^\)\]）]+)[\)\]）]|\s[-–—]\s(.+)$/u', $title, $m) ? implode(' ', array_merge($m[1], $m[2])) : '';
    $types = [];
    foreach (['instrumental'=>'/\b(inst\.?|instrumental|karaoke|MR)\b|반주/iu', 'live'=>'/\blive\b|라이브|실황/iu', 'remix'=>'/\bremix\b|리믹스/iu', 'remaster'=>'/\bremaster(?:ed)?\b|리마스터/iu', 'language'=>'/(?:english|japanese|korean|chinese|한국어|일본어|영어)\s*(?:ver\.?|version|버전)/iu'] as $kind=>$pattern) {
        if (preg_match($pattern, $markers)) $types[] = $kind;
    }
    return $types ? implode('+', $types) : 'original';
}
function sb4_preferred_alias($aliases, string $original, string $type): string {
    if (!is_array($aliases)) return '';
    $names = []; $preferred = [];
    foreach ($aliases as $alias) {
        if (!is_array($alias)) continue;
        $name = sb3_text($alias['name'] ?? '');
        $locale = str_replace('_', '-', strtolower((string)($alias['locale'] ?? '')));
        if (!in_array($locale, ['ko', 'ko-kr'], true) || !sb4_korean($name) || ($alias['type'] ?? '') !== $type) continue;
        if ($type === 'Recording name' && sb4_variant($name) !== sb4_variant($original)) continue;
        $names[$name] = true;
        if (in_array($alias['primary'] ?? false, [true, 'true'], true)) $preferred[$name] = true;
    }
    if (count($preferred) === 1) return array_key_first($preferred);
    return count($preferred) === 0 && count($names) === 1 ? array_key_first($names) : '';
}
function sb4_localize(array $song, array $registry): array {
    $song['aliases'] = sb4_aliases($song['aliases'] ?? [], $song['title']);
    $song['titleStatus'] = $song['titleStatus'] ?? (sb4_korean($song['title']) ? 'catalog-ko' : 'original');
    $song['variant'] = sb4_variant($song['title']);
    $entry = $registry[$song['key']] ?? null;
    if (!is_array($entry)) return $song;
    // A stable track ID is necessary but not sufficient if a provider returns inconsistent metadata.
    $artistMatch = in_array(sb4_normalize($song['artist']), array_map('sb4_normalize', $entry['artists']), true);
    $titleMatch = in_array(sb4_normalize($song['title']), array_map('sb4_normalize', $entry['titles']), true);
    $path = parse_url($song['musicUrl'] ?? '', PHP_URL_PATH) ?: '';
    $albumMatch = preg_match('~/'.preg_quote($entry['albumId'], '~').'$~', $path) === 1;
    if (!$artistMatch || !$titleMatch || !$albumMatch || $song['variant'] !== $entry['variant']) return $song;
    $song['aliases'] = sb4_aliases(array_merge([$song['title']], $song['aliases'], $entry['titles']), $entry['title']);
    $song['title'] = $entry['title']; $song['artist'] = $entry['artist']; $song['album'] = $entry['album'];
    $song['titleStatus'] = 'reviewed-ko';
    return $song;
}
function sb4_known_ids(string $query, array $registry): array {
    // Query aliases only locate IDs for a real API lookup; they never create fictitious result rows.
    $query = sb4_normalize($query); $ids = [];
    foreach ($registry as $key=>$entry) {
        $terms = $entry['titles'];
        foreach ($entry['titles'] as $title) foreach ($entry['artists'] as $artist) {
            $terms[] = $title.' '.$artist; $terms[] = $artist.' '.$title;
        }
        if (in_array($query, array_map('sb4_normalize', $terms), true) && preg_match('/^itunes:([0-9]+)$/', $key, $m)) $ids[] = $m[1];
    }
    return array_slice(array_values(array_unique($ids)), 0, 5);
}
function sb4_title_rank(array $row): int {
    if (($row['titleStatus'] ?? '') === 'reviewed-ko') return 50;
    if (!sb4_korean($row['title'])) return 0;
    return ($row['catalogRegion'] ?? '') === 'KR' ? 40 : (($row['titleStatus'] ?? '') === 'alias-ko' ? 20 : 30);
}
function sb4_merge(array $groups): array {
    $songs = [];
    foreach ($groups as $rows) foreach ($rows as $row) {
        // Different IDs can be different recordings of an identically named song. Do not guess.
        $key = $row['key'];
        if (!isset($songs[$key])) { $songs[$key] = $row; continue; }
        $old = $songs[$key];
        $winner = sb4_title_rank($row) > sb4_title_rank($old) ? $row : $old;
        if (sb4_variant($old['title']) !== sb4_variant($row['title'])) continue;
        $winner['aliases'] = sb4_aliases(array_merge([$old['title'], $row['title']], $old['aliases'] ?? [], $row['aliases'] ?? []), $winner['title']);
        $songs[$key] = $winner;
    }
    return array_values($songs);
}
function sb4_order(array $songs, string $query): array {
    $q = sb4_normalize($query);
    $score = function(array $s) use ($q): int {
        $names = array_map('sb4_normalize', array_merge([$s['title']], $s['aliases'] ?? []));
        $exact = in_array($q, $names, true);
        $combined = false;
        foreach ($names as $n) if (in_array($q, [$n.sb4_normalize($s['artist']), sb4_normalize($s['artist']).$n], true)) $combined = true;
        $match = $exact || $combined ? 1000 : (in_array($q, [sb4_normalize($s['artist'])], true) ? 500 : 0);
        return $match + sb4_title_rank($s) + (($s['variant'] ?? 'original') === 'original' ? 1 : 0);
    };
    usort($songs, fn($a,$b) => $score($b) <=> $score($a));
    return array_slice($songs, 0, 80);
}
