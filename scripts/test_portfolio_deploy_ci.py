#!/usr/bin/env python3
"""Local tests for the shared-root portfolio router, no network and no secrets."""
import unittest

from portfolio_deploy_ci import (
    BEGIN,
    END,
    apply_portfolio_block,
    make_block,
    release_files,
    shared,
)

BRIDGE = (
    b"# MIR-SUBDOMAIN-BRIDGE-V1\n"
    b"RewriteEngine On\n"
    b"RewriteCond %{HTTP_HOST} ^mir\\.yeop\\.net(?::[0-9]+)?$ [NC]\n"
    b"RewriteCond %{REQUEST_URI} !^/_mir_site(?:/|$)\n"
    b"RewriteRule ^(.*)$ _mir_site/$1 [L]\n"
    b"# Keep these original rules.\n"
)
SHA = "f" * 40
RID = SHA[:12]


class PortfolioSafetyTests(unittest.TestCase):
    def test_append_preserves_bridge(self):
        result = apply_portfolio_block(BRIDGE, make_block(SHA, RID))
        self.assertTrue(result.startswith(BRIDGE))
        self.assertEqual(result.count(BEGIN), 1)
        self.assertEqual(result.count(END), 1)
        self.assertIn(b"_portfolio_releases/" + RID.encode(), result)

    def test_updating_only_replaces_portfolio_block(self):
        old = BRIDGE + make_block(SHA, RID) + b"# Unrelated trailing rules\n"
        new = apply_portfolio_block(old, make_block("a" * 40, "a" * 12))
        self.assertTrue(new.startswith(BRIDGE))
        self.assertTrue(new.endswith(b"# Unrelated trailing rules\n"))
        self.assertEqual(new.count(BEGIN), 1)
        self.assertNotIn(b"main " + SHA.encode(), new)

    def test_refuse_root_without_mir_bridge(self):
        with self.assertRaises(shared.Stop):
            apply_portfolio_block(b"RewriteEngine On\n", make_block(SHA, RID))

    def test_refuse_duplicate_blocks(self):
        with self.assertRaises(shared.Stop):
            apply_portfolio_block(BRIDGE + 2 * make_block(SHA, RID), make_block(SHA, RID))

    def test_versioned_assets_are_release_scoped(self):
        original = b'<head><link href="/assets/site.css"><link href="/assets/favicon.svg"><script src="/assets/site.js"></script></head>'
        rid, output = release_files(SHA, {"index.html": original})
        self.assertEqual(rid, RID)
        self.assertEqual(output["index.html"].count(b'"/_portfolio_releases/'), 3)
        self.assertIn(b'name="portfolio-release" content="' + SHA.encode(), output["index.html"])


if __name__ == "__main__":
    unittest.main()
