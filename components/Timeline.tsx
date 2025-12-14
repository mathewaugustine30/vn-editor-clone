import React, { useRef, useEffect, useState } from 'react';
import { TimelineClip, MediaAsset, MediaType } from '../types';
import { Video, Type, Music, Layers } from 'lucide-react';

interface TimelineProps {
  clips: TimelineClip[];
  assets: MediaAsset[];
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
  onClipSelect: (clipId: string | null) => void;
  selectedClipId: string | null;
  onDeleteClip: (clipId: string) => void;
  onUpdateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
}

const PIXELS_PER_SECOND = 40;
const MIN_CLIP_DURATION = 0.5;
const SNAP_THRESHOLD_PX = 15;
const TRACK_HEIGHT = 56;
const HEADER_WIDTH = 100;

// Use explicit classes to ensure Tailwind generates them (interpolation doesn't work well with JIT/CDN)
const TRACK_DEFINITIONS = [
    { 
        id: 2, 
        label: 'Text', 
        icon: Type, 
        iconClass: 'text-emerald-400', 
        clipClass: 'bg-emerald-900/40 border-emerald-800/50' 
    },
    { 
        id: 1, 
        label: 'PIP', 
        icon: Layers, 
        iconClass: 'text-purple-400', 
        clipClass: 'bg-purple-900/40 border-purple-800/50' 
    },
    { 
        id: 0, 
        label: 'Main', 
        icon: Video, 
        iconClass: 'text-blue-400', 
        clipClass: 'bg-blue-900/40 border-blue-800/50' 
    },
    { 
        id: 3, 
        label: 'Audio', 
        icon: Music, 
        iconClass: 'text-orange-400', 
        clipClass: 'bg-orange-900/40 border-orange-800/50' 
    },
];

export const Timeline: React.FC<TimelineProps> = ({
  clips,
  assets,
  currentTime,
  totalDuration,
  onSeek,
  onClipSelect,
  selectedClipId,
  onDeleteClip,
  onUpdateClip
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);
  const [snapLineX, setSnapLineX] = useState<number | null>(null);

  const [dragState, setDragState] = useState<{
    clipId: string;
    handle: 'left' | 'right' | 'body';
    startX: number;
    originalClip: TimelineClip;
  } | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current && !isDraggingHeader && !dragState) {
      const playheadPos = currentTime * PIXELS_PER_SECOND;
      const container = containerRef.current;
      const scrollPos = playheadPos - (container.clientWidth / 2) + HEADER_WIDTH;
      
      if (Math.abs(container.scrollLeft - scrollPos) > 200) {
         // Only auto-scroll if significantly off to avoid fighting user
         // Simplified: Just keep it roughly in view
      }
    }
  }, [currentTime, isDraggingHeader, dragState]);

  // Cursor handling
  useEffect(() => {
    if (dragState) {
        if (dragState.handle === 'body') document.body.style.cursor = 'grabbing';
        else document.body.style.cursor = dragState.handle === 'left' ? 'w-resize' : 'e-resize';
    } else {
        document.body.style.cursor = '';
    }
    return () => { document.body.style.cursor = ''; };
  }, [dragState]);

  // Snap Logic
  const getSnapTime = (proposedTime: number, excludeClipId: string): { time: number; snapped: boolean } => {
    const snapThresholdTime = SNAP_THRESHOLD_PX / PIXELS_PER_SECOND;
    const snapPoints = [0, currentTime];
    
    clips.forEach(c => {
        if (c.id === excludeClipId) return;
        snapPoints.push(c.startOffset);
        snapPoints.push(c.startOffset + c.duration);
    });

    let bestSnap = proposedTime;
    let minDiff = Infinity;
    let snapped = false;

    for (const point of snapPoints) {
        const diff = Math.abs(proposedTime - point);
        if (diff < snapThresholdTime && diff < minDiff) {
            minDiff = diff;
            bestSnap = point;
            snapped = true;
        }
    }
    return { time: bestSnap, snapped };
  };

  // Drag Handlers
  useEffect(() => {
    if (!dragState) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
        const { clipId, handle, startX, originalClip } = dragState;
        const deltaPixels = e.clientX - startX;
        const deltaTime = deltaPixels / PIXELS_PER_SECOND;
        
        const asset = assets.find(a => a.id === originalClip.assetId);
        if (!asset) return;

        let newUpdates: Partial<TimelineClip> = {};
        let activeSnapX: number | null = null;

        if (handle === 'body') {
            let newStartOffset = originalClip.startOffset + deltaTime;
            
            // Snapping
            const snapLeft = getSnapTime(newStartOffset, clipId);
            const snapRight = getSnapTime(newStartOffset + originalClip.duration, clipId);

            if (snapLeft.snapped) {
                newStartOffset = snapLeft.time;
                activeSnapX = snapLeft.time * PIXELS_PER_SECOND;
            } else if (snapRight.snapped) {
                newStartOffset = snapRight.time - originalClip.duration;
                activeSnapX = snapRight.time * PIXELS_PER_SECOND;
            }

            if (newStartOffset < 0) newStartOffset = 0;
            newUpdates = { startOffset: newStartOffset };
        } 
        else if (handle === 'left') {
            let newStartOffset = originalClip.startOffset + deltaTime;
            const snapResult = getSnapTime(newStartOffset, clipId);
            
            let finalStart = snapResult.snapped ? snapResult.time : newStartOffset;
            if(snapResult.snapped) activeSnapX = finalStart * PIXELS_PER_SECOND;

            const actualDelta = finalStart - originalClip.startOffset;
            
            let newMediaStart = originalClip.mediaStart + actualDelta;
            let newDuration = originalClip.duration - actualDelta;
            
            // Constraints
            if (newMediaStart < 0) {
                 const correction = 0 - newMediaStart;
                 newMediaStart = 0;
                 finalStart += correction;
                 newDuration -= correction;
            }
            if (newDuration < MIN_CLIP_DURATION) {
                newDuration = MIN_CLIP_DURATION;
                finalStart = (originalClip.startOffset + originalClip.duration) - MIN_CLIP_DURATION;
                newMediaStart = (originalClip.mediaStart + originalClip.duration) - MIN_CLIP_DURATION;
            }

            newUpdates = {
                startOffset: finalStart,
                mediaStart: newMediaStart,
                duration: newDuration
            };
        } else {
            // Right Handle
            let proposedEnd = originalClip.startOffset + originalClip.duration + deltaTime;
            const snapResult = getSnapTime(proposedEnd, clipId);
            
            let newDuration = snapResult.snapped 
                ? snapResult.time - originalClip.startOffset 
                : originalClip.duration + deltaTime;
            
            if(snapResult.snapped) activeSnapX = snapResult.time * PIXELS_PER_SECOND;

            if (newDuration < MIN_CLIP_DURATION) newDuration = MIN_CLIP_DURATION;
            if (asset.type === MediaType.VIDEO || asset.type === MediaType.AUDIO) {
                 if (originalClip.mediaStart + newDuration > asset.duration) {
                     newDuration = asset.duration - originalClip.mediaStart;
                 }
            }
            newUpdates = { duration: newDuration };
        }
        
        setSnapLineX(activeSnapX);
        onUpdateClip(clipId, newUpdates);
    };

    const handleGlobalMouseUp = () => {
        setDragState(null);
        setSnapLineX(null);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, assets, onUpdateClip, currentTime, clips]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current || isDraggingHeader || dragState) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    // Account for header width
    const clickX = e.clientX - rect.left + scrollLeft - HEADER_WIDTH;
    const newTime = Math.max(0, clickX / PIXELS_PER_SECOND);
    onSeek(newTime);
  };

  const renderRuler = () => {
    const markers = [];
    const width = Math.max(window.innerWidth, totalDuration * PIXELS_PER_SECOND + 500);
    
    for (let i = 0; i < width; i += PIXELS_PER_SECOND) {
      const seconds = i / PIXELS_PER_SECOND;
      markers.push(
        <div key={i} className="absolute top-0 bottom-0 border-l border-zinc-700 pointer-events-none" style={{ left: i }}>
          <span className="text-[10px] text-zinc-500 ml-1 block mt-1 select-none">
            {new Date(seconds * 1000).toISOString().substr(14, 5)}
          </span>
        </div>
      );
    }
    return markers;
  };

  const getAssetForClip = (clip: TimelineClip) => assets.find(a => a.id === clip.assetId);

  return (
    <div className="flex flex-row h-full bg-zinc-950 border-t border-zinc-800 select-none overflow-hidden">
      
      {/* Track Headers */}
      <div className="w-[100px] flex-shrink-0 bg-zinc-900 border-r border-zinc-800 z-20 flex flex-col pt-8">
        {TRACK_DEFINITIONS.map(track => {
            const Icon = track.icon;
            return (
                <div key={track.id} className="h-14 flex items-center px-3 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
                    <Icon size={14} className={`mr-2 ${track.iconClass}`} />
                    {track.label}
                </div>
            );
        })}
      </div>

      {/* Timeline Content */}
      <div 
        ref={containerRef}
        className="relative flex-1 overflow-x-auto overflow-y-hidden"
        onMouseMove={(e) => isDraggingHeader && handleTimelineClick(e)}
        onMouseUp={() => setIsDraggingHeader(false)}
        onMouseLeave={() => setIsDraggingHeader(false)}
      >
        <div 
            className="relative h-full"
            style={{ width: Math.max(window.innerWidth - HEADER_WIDTH, totalDuration * PIXELS_PER_SECOND + 800) }}
        >
             {/* Playhead & Ruler Container */}
             <div 
                className="absolute top-0 bottom-0 left-0 right-0"
                onClick={handleTimelineClick}
             >
                 {/* Ruler */}
                <div 
                    className="h-8 border-b border-zinc-800 relative cursor-pointer hover:bg-zinc-900/50 z-10 bg-zinc-950/80 backdrop-blur-sm"
                    onMouseDown={(e) => {
                        if(dragState) return;
                        setIsDraggingHeader(true);
                        handleTimelineClick(e);
                    }}
                >
                    {renderRuler()}
                </div>

                {/* Snap Indicator */}
                {snapLineX !== null && (
                    <div 
                        className="absolute top-8 bottom-0 w-px bg-yellow-400 z-30 pointer-events-none shadow-[0_0_10px_rgba(250,204,21,0.8)]"
                        style={{ left: snapLineX }}
                    />
                )}
                
                {/* Playhead */}
                <div 
                    className="absolute top-0 bottom-0 w-px bg-white z-40 pointer-events-none"
                    style={{ left: currentTime * PIXELS_PER_SECOND }}
                >
                    <div className="w-3 h-3 -ml-1.5 bg-white rotate-45 transform -mt-1.5 rounded-sm shadow-md" />
                </div>

                {/* Tracks */}
                <div className="relative">
                    {TRACK_DEFINITIONS.map((track) => (
                        <div key={track.id} className="h-14 border-b border-zinc-800/50 relative w-full">
                            {clips.filter(c => c.trackIndex === track.id).map(clip => {
                                const asset = getAssetForClip(clip);
                                const isSelected = selectedClipId === clip.id;
                                
                                const clipBaseClass = track.clipClass || 'bg-zinc-700';

                                return (
                                    <div
                                        key={clip.id}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            if (e.button !== 0) return;
                                            onClipSelect(clip.id);
                                            setDragState({
                                                clipId: clip.id,
                                                handle: 'body',
                                                startX: e.clientX,
                                                originalClip: clip
                                            });
                                        }}
                                        className={`absolute top-1 bottom-1 rounded-md overflow-hidden border cursor-grab active:cursor-grabbing transition-colors group
                                            ${isSelected ? 'border-yellow-500 z-10 shadow-lg' : `border-transparent hover:border-zinc-500 ${clipBaseClass}`}
                                        `}
                                        style={{
                                            left: clip.startOffset * PIXELS_PER_SECOND,
                                            width: clip.duration * PIXELS_PER_SECOND,
                                        }}
                                    >
                                        <div className="absolute inset-0 flex items-center px-2 opacity-80 pointer-events-none overflow-hidden">
                                            {asset?.type === MediaType.IMAGE && <img src={asset.src} className="h-full w-auto aspect-square object-cover opacity-50 mr-2 rounded-sm" alt="" />}
                                            <span className="text-[10px] truncate font-medium text-white/90 drop-shadow-md">
                                                {asset?.name}
                                            </span>
                                        </div>

                                        {/* Handles */}
                                        {isSelected && (
                                            <>
                                                <div 
                                                    className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-w-resize z-20 group/handle flex items-center justify-center"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setDragState({ clipId: clip.id, handle: 'left', startX: e.clientX, originalClip: clip });
                                                    }}
                                                >
                                                    <div className="w-1 h-full bg-yellow-500 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"/>
                                                </div>
                                                <div 
                                                    className="absolute right-0 top-0 bottom-0 w-3 -mr-1.5 cursor-e-resize z-20 group/handle flex items-center justify-center"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setDragState({ clipId: clip.id, handle: 'right', startX: e.clientX, originalClip: clip });
                                                    }}
                                                >
                                                    <div className="w-1 h-full bg-yellow-500 rounded-full opacity-0 group-hover/handle:opacity-100 transition-opacity"/>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteClip(clip.id);
                                                    }}
                                                    className="absolute -top-1 right-0 text-white bg-red-600 rounded-bl-md p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-auto"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};