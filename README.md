# 4 Bereiche – meine Life App

Persönliche Web App (PWA) für Körper, Reflexion & Sinn, Leistung und Contact.
Läuft im Browser, lässt sich auf dem iPhone wie eine App installieren und funktioniert offline.

## Wo liegen meine Daten?

- **Auf jedem Gerät lokal** im Speicher der installierten App (IndexedDB). Nicht in diesem Repository.
- **Sync (optional):** verschlüsselt (AES-256) in einem *privaten* zweiten Repository, z. B. `life-app-daten`.
  Das Sync-Passwort verlässt nie das Gerät. Ohne Passwort ist die Datei unlesbar.
- **Backup:** Datei `life-app-backup-JJJJ-MM-TT.json`, die du selbst speicherst (z. B. iCloud Drive).

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html` | Startseite |
| `css/app.css` | Design und Farben |
| `js/app.js` | Navigation, automatischer Sync |
| `js/store.js` | Lokaler Speicher |
| `js/sync.js` | Verschlüsselter Sync über GitHub |
| `js/areas.js` | Die vier Bereiche |
| `js/views/` | Die einzelnen Seiten |
| `sw.js` | Offline-Modus |

Kein Build-Schritt nötig: Dateien ändern, hochladen, fertig.
Nach Änderungen die Version in `js/version.js` und `CACHE` in `sw.js` erhöhen.
