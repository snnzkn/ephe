/**
 * Snapshot management utilities
 */

import { saveSnapshot, getSnapshots, getSnapshotById, deleteSnapshot } from './snapshot-storage';

/**
 * Create a snapshot of the current editor content
 */
export const createSnapshot = (
  content: string, 
  title: string, 
  description = "",
): void => {
  saveSnapshot({
    content,
    title,
    description,
    charCount: content.length,
  });
};

/**
 * Create an automatic snapshot of the current editor content
 */
export const createAutoSnapshot = ({
  content, 
  title, 
  description = "",
}: {
  content: string;
  title: string;
  description?: string;
}): void => {
  // Limit the number of snapshots (keep only the latest 10)
  const snapshots = getSnapshots();
  
  // If there are more than 10, delete the oldest ones
  if (snapshots.length >= 10) {
    // Sort by date to find the oldest ones
    const sortedSnapshots = [...snapshots].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Calculate the number of snapshots to delete
    const toDelete = sortedSnapshots.slice(0, snapshots.length - 9);
    
    // Delete the oldest snapshots
    for (const snapshot of toDelete) {
      deleteSnapshot(snapshot.id);
    }
  }
  
  saveSnapshot({
    content,
    title,
    description,
    charCount: content.length,
  });
};

/**
 * Compare two snapshots and return the differences
 */
export const compareSnapshots = (
  snapshotId1: string, 
  snapshotId2: string
): { additions: string[], deletions: string[] } | null => {
  const snapshot1 = getSnapshotById(snapshotId1);
  const snapshot2 = getSnapshotById(snapshotId2);
  
  if (!snapshot1 || !snapshot2) return null;
  
  const lines1 = snapshot1.content.split('\n');
  const lines2 = snapshot2.content.split('\n');
  
  // Simple line-by-line diff
  const additions = lines2.filter(line => !lines1.includes(line));
  const deletions = lines1.filter(line => !lines2.includes(line));
  
  return { additions, deletions };
}; 