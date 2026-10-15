import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { normalizeSearchText, createSortKey, normalizePhoneDigits } from '../server/text.js';
import { nowUtcIso, todayIstanbul } from '../server/time.js';

/**
 * CALL CENTER - 100.000 Sahte Kayıt Üretici (Performans & Stres Testi)
 * Çalıştırma: npx tsx scripts/generate-sample.ts [adet]
 */

const TARGET_COUNT = parseInt(process.argv[2] || '100000', 10);
const DB_PATH = resolve(process.cwd(), './data/callcenter.db');

console.log(`==> Veritabanına bağlanılıyor: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// "Örnek Performans Testi Listesi" listesi oluştur
const now = nowUtcIso();
const today = todayIstanbul();

let list = db.prepare("SELECT id FROM lists WHERE name = 'Performans Test Listesi'").get() as { id: number } | undefined;
if (!list) {
  const res = db.prepare("INSERT INTO lists (name, is_open, created_by, created_at) VALUES ('Performans Test Listesi', 1, NULL, ?)").run(now);
  list = { id: Number(res.lastInsertRowid) };
}
const listId = list.id;

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Gaziantep', 'Diyarbakır', 'Trabzon', 'Berlin', 'Londra', 'Paris'];
const ORG_PREFIXES = ['İyilik', 'Umut', 'Kardeşlik', 'Gönül', 'Hayat', 'Şefkat', 'Dostluk', 'Vefa', 'Hilal', 'Köprü', 'Işık', 'Bereket'];
const ORG_SUFFIXES = ['Derneği', 'Vakfı', 'Platformu', 'Kulübü', 'Topluluğu', 'İnsani Yardım Derneği', 'Dayanışma Vakfı', 'Girişimi'];
const FIRST_NAMES = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Fatma', 'Ayşe', 'Emine', 'Hatice', 'Zeynep', 'Ömer', 'Yusuf', 'İbrahim'];
const LAST_NAMES = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan'];

console.log(`==> ${TARGET_COUNT.toLocaleString()} adet kayıt üretiliyor...`);

const insertStmt = db.prepare(`
  INSERT INTO organizations (
    list_id, organization_name, country, city, whatsapp, phone, contact_person,
    assigned_to, assigned_at, status, note, last_contact_date, last_contact_by,
    follow_up_date, created_at, updated_at, search_text, name_sort, whatsapp_normalized
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, ?, ?, ?, ?, ?
  )
`);

const BATCH_SIZE = 5000;
let inserted = 0;
const startTime = Date.now();

const insertBatch = db.transaction((batchStart: number, batchCount: number) => {
  for (let i = 0; i < batchCount; i++) {
    const idx = batchStart + i + 1;
    const prefix = ORG_PREFIXES[idx % ORG_PREFIXES.length];
    const suffix = ORG_SUFFIXES[(idx * 3) % ORG_SUFFIXES.length];
    const city = CITIES[idx % CITIES.length];
    const country = ['Berlin', 'Londra', 'Paris'].includes(city) ? (city === 'Berlin' ? 'Almanya' : city === 'Londra' ? 'İngiltere' : 'Fransa') : 'Türkiye';
    const contact = `${FIRST_NAMES[idx % FIRST_NAMES.length]} ${LAST_NAMES[(idx * 7) % LAST_NAMES.length]}`;
    const name = `${prefix} ${city} ${suffix} ${idx}`;

    // Benzersiz telefon
    const phone = `+90555${String(idx).padStart(7, '0')}`;
    const whatsappNormalized = normalizePhoneDigits(phone);
    const searchText = normalizeSearchText(`${name} ${contact} ${city} ${country}`);
    const nameSort = createSortKey(name);

    insertStmt.run(
      listId,
      name,
      country,
      city,
      phone,
      phone,
      contact,
      now,
      now,
      searchText,
      nameSort,
      whatsappNormalized
    );
  }
});

while (inserted < TARGET_COUNT) {
  const currentBatch = Math.min(BATCH_SIZE, TARGET_COUNT - inserted);
  insertBatch(inserted, currentBatch);
  inserted += currentBatch;
  process.stdout.write(`\r    İlerleme: ${inserted.toLocaleString()} / ${TARGET_COUNT.toLocaleString()} (%${Math.round((inserted / TARGET_COUNT) * 100)})`);
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\n==> [BAŞARILI] ${TARGET_COUNT.toLocaleString()} kayıt ${duration} saniyede eklendi!`);
db.close();
