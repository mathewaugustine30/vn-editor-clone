import { Project } from '../types';

const STORAGE_KEY = 'vn-editor-projects';

export const saveProject = (project: Project): void => {
  try {
    const existing = getProjects();
    const index = existing.findIndex((p) => p.id === project.id);
    
    // We cannot store Blob URLs in localStorage as they expire.
    // In a real app, we would use IndexedDB.
    // For this simulation, we will warn the user or only store metadata if we can't store base64.
    // However, to make this functional for the demo session, we will attempt to store minimal data.
    // NOTE: This demo primarily relies on runtime state. Refreshing will lose Blob URLs.
    
    if (index >= 0) {
      existing[index] = { ...project, lastModified: Date.now() };
    } else {
      existing.push({ ...project, lastModified: Date.now() });
    }
    
    // Filter out heavy assets for local storage limitation in this demo to prevent quota errors
    // We only save the structure, losing actual media on refresh is expected for a pure localStorage text demo
    // without IndexedDB implementation.
    const safeToSave = existing.map(p => ({
      ...p,
      assets: [] // Intentionally not saving huge blobs to localStorage to avoid crash
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeToSave));
  } catch (e) {
    console.error("Failed to save project structure", e);
  }
};

export const getProjects = (): Project[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};
