"""Only synthetic keys and an in-memory filesystem; no host or secret access."""
import importlib.util
from pathlib import Path
import stat
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
spec = importlib.util.spec_from_file_location('key_provision', Path(__file__).resolve().parents[1]/'scripts/provision-songbook-youtube-key.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MemoryRemote:
    def __init__(self): self.files={};self.events=[];self.s=self;self.fail=False
    def info(self,p): return SimpleNamespace(st_mode=stat.S_IFREG|self.files[p][1],st_uid=5048) if p in self.files else None
    def read(self,p,limit=1024): return self.files[p][0]
    def open(self,p,mode):
        self.files[p]=[b'',0o644];self.events.append('create-empty')
        remote=self
        class Handle:
            def __enter__(self): return self
            def __exit__(self,*a): pass
            def write(self,data):
                remote.events.append('write')
                if remote.fail: raise OSError('synthetic write failure')
                remote.files[p][0]=data
            def flush(self): pass
        return Handle()
    def chmod(self,p,mode): self.files[p][1]=mode;self.events.append('chmod-0600')
    def remove(self,p): del self.files[p];self.events.append('remove')

class ProvisionTests(unittest.TestCase):
    def test_production_requires_main_and_all_preview_flags_false(self):
        flags={k:'false' for k in ('VITE_REVIEW_PREVIEW','VITE_SONGBOOK_PREVIEW','VITE_SONGBOOK_PLATFORM_PREVIEW')}
        with patch.dict(module.os.environ,{'GITHUB_REF':'refs/heads/main',**flags},clear=True):
            module.validate_execution_context(production=True)
            with self.assertRaises(module.base.Stop): module.validate_execution_context()
        for ref in ['refs/heads/develop','refs/pull/90/merge','refs/heads/feature/songbook-platform-search']:
            with patch.dict(module.os.environ,{'GITHUB_REF':ref,**flags},clear=True):
                with self.assertRaises(module.base.Stop): module.validate_execution_context(production=True)
        with patch.dict(module.os.environ,{'GITHUB_REF':'refs/heads/main',**flags,'VITE_SONGBOOK_PREVIEW':'true'},clear=True):
            with self.assertRaises(module.base.Stop): module.validate_execution_context(production=True)
    def test_php_guard_and_key_format(self):
        data=module.config_bytes('fixture-key-not-a-real-secret-12345')
        self.assertTrue(data.startswith(b'<?php'))
        self.assertIn(b'http_response_code(404); exit;',data)
        for bad in ["abc'\n?>",'short','x'*201]:
            with self.assertRaises(module.base.Stop): module.config_bytes(bad)
    def test_no_world_readable_key_window(self):
        remote=MemoryRemote();module.new_private_file(remote,'/key.php',b'fixture')
        self.assertEqual(remote.events,['create-empty','chmod-0600','write'])
        self.assertEqual(remote.files['/key.php'][1],0o600)
    def test_existing_files_are_not_replaced_or_deleted(self):
        remote=MemoryRemote();remote.files['/key.php']=[b'existing',0o600]
        with self.assertRaises(module.base.Stop): module.new_private_file(remote,'/key.php',b'fixture')
        self.assertEqual(remote.files['/key.php'][0],b'existing');self.assertEqual(remote.events,[])
    def test_partial_transfer_rolls_back_only_new_file(self):
        remote=MemoryRemote();remote.fail=True
        with self.assertRaises(OSError): module.new_private_file(remote,'/key.php',b'fixture')
        self.assertNotIn('/key.php',remote.files)
    def test_workflow_secret_is_only_passed_to_runtime_step(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/songbook-platform-preview.yml').read_text()
        self.assertEqual(workflow.count('secrets.SONGBOOK_YOUTUBE_API_KEY'),1)
        self.assertLess(workflow.index('Stage only, never activate'),workflow.index('Provision the registered YouTube key'))
        self.assertLess(workflow.index('Provision the registered YouTube key'),workflow.index('Public preview and real metadata verification'))
        self.assertNotIn('VITE_YOUTUBE',workflow)

if __name__=='__main__': unittest.main()
