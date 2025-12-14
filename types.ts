export enum MediaType {
  VIDEO = 'video',
  IMAGE = 'image',
}

export interface MediaAsset {
  id: string;
  type: MediaType;
  src: string; // Blob URL or Data URL
  name: string;
  duration: number; // In seconds. Images have a default duration.
  thumbnail?: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  startOffset: number; // Where in the global timeline this clip starts
  mediaStart: number; // Where in the source media this clip starts (trimming)
  duration: number; // How long this clip plays
  trackIndex: number; // 0 for main video, 1 for overlays (simplified to 0 for this MVP)
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  assets: MediaAsset[];
  timeline: TimelineClip[];
}
