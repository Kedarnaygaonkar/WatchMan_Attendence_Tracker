/**
 * Offline attendance queue using IndexedDB.
 *
 * When the watchman marks attendance but has no internet,
 * we store the record locally and sync it when connection is restored.
 *
 * Each record contains everything needed to submit to the server:
 * - Assignment details
 * - GPS coordinates
 * - Timestamp (the true check-in time)
 * - Selfie (as base64 for offline storage)
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export interface OfflineAttendanceRecord {
  id: string;               // Local UUID
  assignmentId: string;
  latitude: number;
  longitude: number;
  gpsAccuracy: number;
  clientTimestamp: string;  // ISO string — real time of marking
  selfieDataUrl?: string;   // Base64 selfie for local storage
  deviceInfo?: Record<string, unknown>;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'failed';
  failureReason?: string;
}

interface WatchmanDB extends DBSchema {
  offlineAttendance: {
    key: string;
    value: OfflineAttendanceRecord;
    indexes: { 'by-status': string };
  };
}

let db: IDBPDatabase<WatchmanDB> | null = null;

async function getDB(): Promise<IDBPDatabase<WatchmanDB>> {
  if (!db) {
    db = await openDB<WatchmanDB>('watchman-tracker', 1, {
      upgrade(database) {
        const store = database.createObjectStore('offlineAttendance', { keyPath: 'id' });
        store.createIndex('by-status', 'syncStatus');
      },
    });
  }
  return db;
}

export const offlineQueue = {
  /** Save an offline attendance record to IndexedDB */
  async add(record: OfflineAttendanceRecord): Promise<void> {
    const database = await getDB();
    await database.put('offlineAttendance', record);
  },

  /** Get all pending records */
  async getPending(): Promise<OfflineAttendanceRecord[]> {
    const database = await getDB();
    return database.getAllFromIndex('offlineAttendance', 'by-status', 'pending');
  },

  /** Get count of pending records */
  async getPendingCount(): Promise<number> {
    const database = await getDB();
    return (await database.getAllFromIndex('offlineAttendance', 'by-status', 'pending')).length;
  },

  /** Update sync status */
  async updateStatus(
    id: string,
    status: OfflineAttendanceRecord['syncStatus'],
    failureReason?: string
  ): Promise<void> {
    const database = await getDB();
    const record = await database.get('offlineAttendance', id);
    if (record) {
      await database.put('offlineAttendance', { ...record, syncStatus: status, failureReason });
    }
  },

  /** Remove a synced record */
  async remove(id: string): Promise<void> {
    const database = await getDB();
    await database.delete('offlineAttendance', id);
  },

  /** Get all records (for display) */
  async getAll(): Promise<OfflineAttendanceRecord[]> {
    const database = await getDB();
    return database.getAll('offlineAttendance');
  },
};
