"""Exercise sharing-image generation against the real build with isolated data."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('share_capture', Path(__file__).with_name('generate-home-share-image.py'))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)

parser = argparse.ArgumentParser()
parser.add_argument('--dist', default='dist')
parser.add_argument('--asset-base', default='/_yeop_releases/r20000101000000_12345678/')
parser.add_argument('--out', default='share-regression-report')
parser.add_argument('--executable')
args = parser.parse_args()
dist, out = Path(args.dist), Path(args.out)
out.mkdir(parents=True, exist_ok=True)
checks = []


def check(name, ok):
    checks.append({'check': name, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(name)


try:
    for mode in ['empty', 'saved']:
        report = capture.generate(dist, args.asset_base, out / mode, mode, args.executable)
        check(mode + ': PNG dimensions and raw metadata verified', report['width'] == 1200 and report['height'] == 630)
        check(mode + ': source selection verified', report['saved_image'] == (mode == 'saved'))
        check(mode + ': all other build assets unchanged', report['other_build_files_unchanged'])
        check(mode + ': release-scoped image reference', report['image_url'].endswith(args.asset_base + 'og/home.png'))
    before = hashlib.sha256((dist / 'og/home.png').read_bytes()).hexdigest()
    for mode in ['outage', 'image-error']:
        try:
            capture.generate(dist, args.asset_base, out / mode, mode, args.executable)
        except RuntimeError:
            check(mode + ': rejected instead of capturing old fallback', True)
        else:
            check(mode + ': rejected instead of capturing old fallback', False)
        check(mode + ': prior thumbnail preserved', hashlib.sha256((dist / 'og/home.png').read_bytes()).hexdigest() == before)
    for bad in ['https://example.invalid/', '/../', '/_yeop_releases/../../']:
        try:
            capture.generate(dist, bad, out / 'bad', 'saved', args.executable)
        except ValueError:
            check('unsafe asset base rejected: ' + bad, True)
        else:
            check('unsafe asset base rejected: ' + bad, False)
finally:
    (out / 'results.json').write_text(json.dumps({'checks': checks}, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks)}))
