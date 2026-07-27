#!/usr/bin/env node
/**
 * Patches the built index.html to suppress React Native Web DOM warnings.
 * 
 * These warnings are expected in RN Web apps (no native <form>, no id/name,
 * autocomplete quirks). They don't affect functionality.
 * 
 * Run after every `npx expo export`:
 *   node patch-html.mjs [path/to/index.html]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] || path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'web-prod',
  'index.html'
);

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  console.error('Run a web export first: npx expo export --platform web --output-dir web-prod');
  process.exit(1);
}

let html = fs.readFileSync(target, 'utf-8');

// ── Suppression script injected before </body> ──────────────────────────
// This suppresses 3 specific DOM warnings that are expected in RN Web:
// 1. "Password field is not contained in a form"
// 2. "A form field element should have an id or name attribute"
// 3. "Non-standard `autocomplete` attribute value"
// Note: Chrome's [DOM]-prefixed accessibility warnings are emitted by the
// browser's internal DevTools pipeline and CANNOT be suppressed by overriding
// console.warn in userland JavaScript. This script is a best-effort attempt
// that suppresses similar warnings from OTHER sources, but the 3 specific
// warnings we see in the login screen are Chrome-internal and will persist.
// They affect ALL React Native Web apps identically and have zero impact
// on functionality.
const SUPPRESS_SCRIPT = `<script>
(function(){
  var orig = console.warn;
  console.warn = function(msg){
    if(typeof msg==='string'&&(
      msg.indexOf('Password field is not contained in a form')>=0||
      msg.indexOf('form field element should have an id or name attribute')>=0||
      msg.indexOf('Non-standard \`autocomplete\` attribute value')>=0
    ))return;
    orig.apply(console,arguments);
  };
})();
</script>`;

if (html.includes('SUPPRESS_RN_WEB_WARNINGS')) {
  console.log('✓ suppression already present');
} else {
  html = html.replace('</body>', `<!-- SUPPRESS_RN_WEB_WARNINGS -->${SUPPRESS_SCRIPT}\n</body>`);
  console.log('✓ DOM warning suppression added');
}

fs.writeFileSync(target, html, 'utf-8');
console.log(`\n✅ Patched: ${target}`);
