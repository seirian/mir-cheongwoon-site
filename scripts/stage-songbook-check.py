#!/usr/bin/env python3
"""Upload only new immutable preview files; no production activation, PHP, auth or database changes."""
import json,os,re,stat
from pathlib import Path
import yeop_deploy_ci as base
ROOT='/web/_mir_site/_yeop_releases'
GUARDS=('/web/.htaccess','/web/_mir_site/.htaccess')
def main():
 if os.environ.get('GITHUB_REF')!='refs/heads/feature/songbook_check':raise SystemExit('Exact review branch required')
 rid=os.environ.get('RELEASE_ID','')
 if not re.fullmatch(r'r\d{14}_[a-f0-9]{8}',rid):raise SystemExit('Invalid preview release ID')
 dist=Path('dist-songbook-check');files={p.relative_to(dist).as_posix():p.read_bytes() for p in dist.rglob('*') if p.is_file() and not p.is_symlink()}
 if not all(p in files for p in ['index.html','songbook/index.html','songbook-check-snapshot.json','check-version.json']):raise SystemExit('Incomplete preview')
 if sum(map(len,files.values()))>10*1024*1024:raise SystemExit('Preview exceeds bounded upload size')
 for rel,data in files.items():
  if not re.fullmatch(r'(?:\.htaccess|assets/[\w.-]+\.(?:js|css)|songbook/index\.html|(?:index|songbook-check)\.html|icon_img\.png|songbook-check-snapshot\.json|check-version\.json)',rel):raise SystemExit('Unexpected preview file: '+rel)
  if rel.endswith('.html') and b'noindex, nofollow' not in data:raise SystemExit('Missing noindex')
 target=ROOT+'/'+rid
 with base.Remote() as remote:
  before={p:base.sha(remote.read(p) or b'') for p in GUARDS}
  info=remote.info(ROOT)
  if info is None or not stat.S_ISDIR(info.st_mode) or info.st_uid!=base.OWNER_UID:raise SystemExit('Unexpected release root')
  remote.mkdir(target)
  for rel,data in sorted(files.items()):
   parent=Path(rel).parent.as_posix()
   if parent!='.':remote.mkdir(target+'/'+parent,existing=True)
   remote.new_file(target+'/'+rel,data)
  after={p:base.sha(remote.read(p) or b'') for p in GUARDS}
  if before!=after:raise SystemExit('Production routing changed concurrently; inspect before proceeding')
 url='https://mir.yeop.net/_yeop_releases/'+rid+'/'
 code,html,_=base.http(url+'songbook/')
 if code!=200 or rid.encode() not in html or b'noindex, nofollow' not in html:raise SystemExit('Preview HTTP verification failed')
 report={'phase':'staged','preview_url':url+'songbook/','admin_url':url+'songbook/?mode=admin','release':rid,'commit':os.environ['SOURCE_COMMIT'],'files':len(files),'production_routing_unchanged':True,'production_activated':False}
 Path('songbook-check-deploy.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print('PREVIEW:',report['preview_url'])
 if os.environ.get('GITHUB_STEP_SUMMARY'):
  with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:f.write('### Songbook UX review 1\n\n'+report['preview_url']+'\n\n'+report['admin_url']+'\n\nStage only. Production routing unchanged.\n')
if __name__=='__main__':main()
