import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import type { Database } from 'better-sqlite3';
import { todayIstanbul } from './time.js';

/**
 * CALL CENTER - Otomatik Yedekleme Servisi
 * Her gün saat 03:30'da (Türkiye saati) better-sqlite3 backup() API'siyle
 * veritabanı yedeğini alır ve son 14 yedeği saklar. Sistem cron'una dokunulmaz.
 */

export function startBackupScheduler(db: Database, dataDir: string): void {
  const backupsDir = resolve(dataDir, 'backups');
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
  }

  async function performBackup(): Promise<string> {
    const today = todayIstanbul();
    const backupFileName = `callcenter-${today}.db`;
    const targetPath = join(backupsDir, backupFileName);

    try {
      await db.backup(targetPath);
      cleanupOldBackups(backupsDir, 14);
      return targetPath;
    } catch (err) {
      console.error('[Yedekleme Hatası]:', err);
      throw err;
    }
  }

  // Eski yedekleri temizle (son N yedeği tut)
  function cleanupOldBackups(dir: string, keepCount: number) {
    try {
      const files = readdirSync(dir)
        .filter(f => f.startsWith('callcenter-') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: join(dir, f),
          time: statSync(join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > keepCount) {
        const toDelete = files.slice(keepCount);
        for (const file of toDelete) {
          try {
            unlinkSync(file.path);
          } catch {}
        }
      }
    } catch {}
  }

  // Türkiye saatine (UTC+3) göre sonraki 03:30'a kalan süreyi hesapla
  function getMsUntilNext0330(): number {
    const now = new Date();
    // Istanbul için geçerli saat/dakika
    const istanbulParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);

    const get = (type: string) => parseInt(istanbulParts.find(p => p.type === type)?.value || '0', 10);
    const hour = get('hour');
    const minute = get('minute');
    const second = get('second');

    let targetHour = 3;
    let targetMinute = 30;

    // Şu anki saniye cinsinden günün anı
    const currentSeconds = hour * 3600 + minute * 60 + second;
    const targetSeconds = targetHour * 3600 + targetMinute * 60;

    let diffSeconds = targetSeconds - currentSeconds;
    if (diffSeconds <= 0) {
      // Bugünün 03:30'u geçtiyse, yarınki 03:30 (24 saat ekle)
      diffSeconds += 24 * 3600;
    }

    return diffSeconds * 1000;
  }

  function scheduleNext() {
    const delay = getMsUntilNext0330();
    setTimeout(async () => {
      try {
        await performBackup();
      } catch {}
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}
