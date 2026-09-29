import mir_shared_root_deploy_ci as deploy
import yeop_deploy_ci as base
from pathlib import Path
rid='r20260930160000_12345678'
text=deploy.site_root_htaccess(rid).decode()
assert '^_fanart_daily(?:/|$) - [F,L]' in text
assert f'_yeop_releases/{rid}/api/$1 [L,QSA]' in text
for name in ['_fanart_daily.php','naver-fanart-daily.php','naver-fanart-backup.php']:
    assert 'api/'+name in base.API_FILES
    assert Path('server/api/'+name).is_file()
payload,_,_=base.server_payload(rid)
assert all('api/'+n in payload for n in ['_fanart_daily.php','naver-fanart-daily.php','naver-fanart-backup.php'])
print('Daily endpoints, protected shared storage and stable current-release route verified')
