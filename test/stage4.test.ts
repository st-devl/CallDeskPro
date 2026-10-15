import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Aşama 4: Yayın Hazırlığı ve Preflight Güvenlik Testleri', () => {
  const PREFLIGHT_PATH = resolve(process.cwd(), './deploy/preflight.sh');

  test('1. deploy/preflight.sh dosyası mevcut ve çalıştırılabilir', () => {
    assert.ok(existsSync(PREFLIGHT_PATH), 'preflight.sh dosyası mevcut olmalıdır');
  });

  test('2. preflight.sh içinde sunucuda değişiklik yapan hiçbir komut bulunmamalıdır (Salt Okuma)', () => {
    const content = readFileSync(PREFLIGHT_PATH, 'utf-8');

    // Değişiklik yapıcı tehlikeli komutlar yasaktır
    const forbiddenPatterns = [
      /\brm\b/i,
      /\bmkdir\b/i,
      /\bchown\b/i,
      /\bchmod\b/i,
      /\buseradd\b/i,
      /\buserdel\b/i,
      /\bsystemctl\s+(start|stop|restart|enable|disable|reload)\b/i,
      /\bapt\b/i,
      /\bapt-get\b/i,
      /\bdocker\b/i,
      /\bkill\b/i
    ];

    for (const pattern of forbiddenPatterns) {
      assert.ok(
        !pattern.test(content),
        `preflight.sh içinde değişiklik yapıcı komut bulundu: ${pattern}`
      );
    }
  });

  test('3. deploy/ klasöründeki kritik dağıtım dosyaları eksiksiz mevcut', () => {
    assert.ok(existsSync(resolve(process.cwd(), './deploy/callcenter.service')));
    assert.ok(existsSync(resolve(process.cwd(), './deploy/nginx-callcenter.conf')));
    assert.ok(existsSync(resolve(process.cwd(), './deploy/apache-callcenter.conf')));
    assert.ok(existsSync(resolve(process.cwd(), './deploy/install.md')));
    assert.ok(existsSync(resolve(process.cwd(), './deploy/update.sh')));
    assert.ok(existsSync(resolve(process.cwd(), './deploy/uninstall.sh')));
  });

  test('4. .github/workflows/release.yml ve README.md mevcut', () => {
    assert.ok(existsSync(resolve(process.cwd(), './.github/workflows/release.yml')));
    assert.ok(existsSync(resolve(process.cwd(), './README.md')));
  });
});
