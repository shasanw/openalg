// The Library Backup file format (issue #26): one file holding every Worksheet
// in the Library, so a teacher can rebuild it in any browser.
//
//   {
//     "kind": "openalg-library-backup",
//     "version": 1,
//     "createdAt": "2026-11-14T22:00:00.000Z",
//     "worksheets": [
//       { "id": "...", "updatedAt": 1731621600000, "worksheet": { ...Worksheet File JSON } }
//     ]
//   }
//
// Each `worksheet` is exactly what a Worksheet File holds: it is written with
// `serializeWorksheet` and read back with `deserializeWorksheet`, so this file
// knows nothing about the Worksheet's fields and keeps working when the
// Worksheet File format changes (old entries are normalized/migrated by
// `engine/persist` like any old `.oalg`).

import { deserializeWorksheet, serializeWorksheet } from "./persist";
import type { Worksheet } from "./worksheet";

export const LIBRARY_BACKUP_KIND = "openalg-library-backup";
export const LIBRARY_BACKUP_VERSION = 1;
/** File extension for Library Backups (distinct from a Worksheet File's `.oalg`). */
export const LIBRARY_BACKUP_EXTENSION = ".oalgbackup";

/** One Worksheet in a Library Backup, with its Library id and last-edited time. */
export interface LibraryBackupEntry {
  id: string;
  /** Last-edited time, ms since the Unix epoch. */
  updatedAt: number;
  worksheet: Worksheet;
}

/** An entry in a Library Backup that couldn't be read. */
export interface LibraryBackupFailure {
  /** Position of the entry in the backup's `worksheets` array. */
  index: number;
  /** The entry's id, when it had one. */
  id?: string;
  /** Why the entry was rejected. */
  reason: string;
}

/** Serialize Library entries into the text of a Library Backup file. */
export function buildLibraryBackup(
  entries: LibraryBackupEntry[],
  createdAt: Date = new Date(),
): string {
  return JSON.stringify(
    {
      kind: LIBRARY_BACKUP_KIND,
      version: LIBRARY_BACKUP_VERSION,
      createdAt: createdAt.toISOString(),
      worksheets: entries.map((e) => ({
        id: e.id,
        updatedAt: e.updatedAt,
        // Round-trip through the Worksheet File serializer so the embedded
        // object is byte-for-byte what a `.oalg` would contain.
        worksheet: JSON.parse(serializeWorksheet(e.worksheet)) as unknown,
      })),
    },
    null,
    2,
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const NOT_A_BACKUP = "Not a Library Backup file";

/**
 * Parse the text of a Library Backup. Throws if the file as a whole isn't a
 * Library Backup we understand; otherwise every entry is checked on its own,
 * so one bad Worksheet is reported in `failed` without losing the rest.
 */
export function parseLibraryBackup(text: string): {
  entries: LibraryBackupEntry[];
  failed: LibraryBackupFailure[];
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${NOT_A_BACKUP}: the file is not valid JSON.`);
  }
  if (!isObject(data) || data.kind !== LIBRARY_BACKUP_KIND) {
    throw new Error(
      `${NOT_A_BACKUP}. To open a single Worksheet File (.oalg), use "Open a file" instead.`,
    );
  }
  if (data.version !== LIBRARY_BACKUP_VERSION) {
    throw new Error(
      `${NOT_A_BACKUP}: unsupported version ${JSON.stringify(data.version)} (expected ${LIBRARY_BACKUP_VERSION}).`,
    );
  }
  if (!Array.isArray(data.worksheets)) {
    throw new Error(`${NOT_A_BACKUP}: missing worksheets list.`);
  }

  const entries: LibraryBackupEntry[] = [];
  const failed: LibraryBackupFailure[] = [];
  data.worksheets.forEach((raw: unknown, index) => {
    if (!isObject(raw)) {
      failed.push({ index, reason: "entry is not an object" });
      return;
    }
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : undefined;
    if (!id) {
      failed.push({ index, reason: "missing id" });
      return;
    }
    if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt)) {
      failed.push({ index, id, reason: "missing updatedAt" });
      return;
    }
    try {
      const worksheet = deserializeWorksheet(JSON.stringify(raw.worksheet ?? null));
      entries.push({ id, updatedAt: raw.updatedAt, worksheet });
    } catch (e) {
      failed.push({ index, id, reason: e instanceof Error ? e.message : String(e) });
    }
  });
  return { entries, failed };
}
