import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/withdrawal-review-contrast.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/pages/WithdrawalReviewPage.jsx', import.meta.url), 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]+)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));
function hex(selector, property) {
  const rule = rules.find(item => item.selector === selector);
  assert.ok(rule, `Missing rule: ${selector}`);
  const match = rule.body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
  assert.ok(match, `Missing ${property}: ${selector}`);
  return match[1];
}
function luminance(value) {
  const linear = [1, 3, 5].map(offset => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

test('withdrawal review heading, explanation, kicker and links contrast with the explicit dark surface', () => {
  const background = luminance(hex('.withdrawal-review', 'background'));
  for (const selector of [
    '.withdrawal-review .withdrawal-review-heading h1',
    '.withdrawal-review .withdrawal-review-heading p',
    '.withdrawal-review .withdrawal-review-heading .policy-kicker',
    '.withdrawal-review .withdrawal-review-links a',
  ]) {
    const foreground = luminance(hex(selector, 'color'));
    const contrast = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    assert.ok(contrast >= 4.5, `${selector}: ${contrast.toFixed(2)} < 4.5`);
  }
});

test('review contrast overrides are isolated and survive the shared stylesheet specificity', () => {
  assert.match(component, /import '\.\.\/withdrawal-review-contrast\.css';/);
  assert.match(component, /<header className="withdrawal-review-heading">/);
  assert.ok(rules.every(rule => rule.selector.startsWith('.withdrawal-review')));
  assert.match(css, /\.withdrawal-review \.withdrawal-review-links a:focus-visible/);
  assert.doesNotMatch(css, /!important|(^|[},])\s*(?:body|:root|html)\b/);
});
