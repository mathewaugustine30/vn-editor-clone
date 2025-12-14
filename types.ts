export enum MediaType {
  VIDEO = 'video',
  IMAGE = 'image',
  AUDIO = 'audio',
  TEXT = 'text',
}

export interface MediaAsset {
  id: string;
  type: MediaType;
  src: string; // Blob URL or Data URL. For Text, this might be empty or a placeholder.
  name: string;
  duration: number; // In seconds. Images/Text have a default duration.
  thumbnail?: string;
  textContent?: string; // Specific for Text type
}

export interface TimelineClip {
  id: string;
  assetId: string;
  startOffset: number; // Where in the global timeline this clip starts
  mediaStart: number; // Where in the source media this clip starts (trimming)
  duration: number; // How long this clip plays
  trackIndex: number; // 0: Main, 1: Overlay, 2: Text, 3: Audio
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  assets: MediaAsset[];
  timeline: TimelineClip[];
}