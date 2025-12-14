import React, { useRef, useEffect, useState } from 'react';
import { TimelineClip, MediaAsset } from '../types';

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
  const [dragState, setDragState] = useState<{
    clipId: string;
    handle: 'left' | 'right';
    startX: number;
    originalClip: TimelineClip;
  } | null>(null);

  // Auto-scroll timeline to keep playhead in view during playback
  useEffect(() => {
    if (containerRef.current && !isDraggingHeader && !dragState) {
      const playheadPos = currentTime * PIXELS_PER_SECOND;
      const container = containerRef.current;
      
      // Simple follow logic
      if (playheadPos > container.scrollLeft + container.clientWidth - 100) {
        container.scrollTo({ left: playheadPos - 100, behavior: 'smooth' });
      }
    }
  }, [currentTime, isDraggingHeader, dragState]);

  // Set cursor style during drag
  useEffect(() => {
    if (dragState) {
        document.body.style.cursor = dragState.handle === 'left' ? 'w-resize' : 'e-resize';
    } else {
        document.body.style.cursor = '';
    }
    return () => { document.body.style.cursor = ''; };
  }, [dragState]);

  // Global Mouse Handlers for Dragging
  useEffect(() => {
    if (!dragState) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
        const { clipId, handle, startX, originalClip } = dragState;
        const deltaPixels = e.clientX - startX;
        const deltaTime = deltaPixels / PIXELS_PER_SECOND;
        
        const asset = assets.find(a => a.id === originalClip.assetId);
        if (!asset) return;

        let newUpdates: Partial<TimelineClip> = {};

        if (handle === 'left') {
            // Dragging left handle:
            // Moving right (positive delta): Start later, duration shorter, media start later
            // Moving left (negative delta): Start earlier, duration longer, media start earlier
            
            let newStartOffset = originalClip.startOffset + deltaTime;
            let newMediaStart = originalClip.mediaStart + deltaTime;
            let newDuration = originalClip.duration - deltaTime;

            // Constraints
            // 1. Media Start cannot be < 0
            if (newMediaStart < 0) {
                const correction = 0 - newMediaStart;
                newMediaStart = 0;
                newStartOffset += correction; 
                newDuration -= correction;
            }
            
            // 2. Duration cannot be < MIN_CLIP_DURATION
            if (newDuration < MIN_CLIP_DURATION) {
                const correction = MIN_CLIP_DURATION - newDuration;
                newDuration = MIN_CLIP_DURATION;
                newStartOffset -= correction; 
                newMediaStart -= correction;
            }

            newUpdates = {
                startOffset: newStartOffset,
                mediaStart: newMediaStart,
                duration: newDuration
            };

        } else {
            // Dragging right handle:
            // Moving right: Duration longer
            // Moving left: Duration shorter
            
            let newDuration = originalClip.duration + deltaTime;
            
            // Constraints
            // 1. Duration >= MIN_CLIP_DURATION
            if (newDuration < MIN_CLIP_DURATION) newDuration = MIN_CLIP_DURATION;

            // 2. Media End (mediaStart + duration) <= Asset Total Duration (for videos)
            if (asset.type === 'video') {
                 if (originalClip.mediaStart + newDuration > asset.duration) {
                     newDuration = asset.duration - originalClip.mediaStart;
                 }
            }

            newUpdates = {
                duration: newDuration
            };
        }
        
        onUpdateClip(clipId, newUpdates);
    };

    const handleGlobalMouseUp = () => {
        setDragState(null);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, assets, onUpdateClip]);


  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current || isDraggingHeader || dragState) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, clickX / PIXELS_PER_SECOND);
    onSeek(newTime);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingHeader) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const clickX = e.clientX - rect.left + scrollLeft;
      const newTime = Math.max(0, clickX / PIXELS_PER_SECOND);
      onSeek(newTime);
    }
  };

  const renderRuler = () => {
    const markers = [];
    const width = Math.max(window.innerWidth, totalDuration * PIXELS_PER_SECOND + 500);
    
    for (let i = 0; i < width; i += PIXELS_PER_SECOND) {
      const seconds = i / PIXELS_PER_SECOND;
      markers.push(
        <div key={i} className="absolute top-0 bottom-0 border-l border-zinc-700" style={{ left: i }}>
          <span className="text-[10px] text-zinc-500 ml-1 block mt-1">
            {new Date(seconds * 1000).toISOString().substr(14, 5)}
          </span>
        </div>
      );
    }
    return markers;
  };

  const getAssetForClip = (clip: TimelineClip) => assets.find(a => a.id === clip.assetId);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-t border-zinc-800 select-none">
      {/* Scrollable Timeline Area */}
      <div 
        ref={containerRef}
        className="relative flex-1 overflow-x-auto overflow-y-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={() => setIsDraggingHeader(false)}
        onMouseLeave={() => setIsDraggingHeader(false)}
      >
        <div 
          className="relative h-full"
          style={{ width: Math.max(window.innerWidth, totalDuration * PIXELS_PER_SECOND + 800) }}
        >
          {/* Ruler */}
          <div 
            className="h-8 border-b border-zinc-800 relative cursor-pointer hover:bg-zinc-900/50"
            onMouseDown={(e) => {
                if(dragState) return;
                setIsDraggingHeader(true);
                // Call seek immediately
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const scrollLeft = containerRef.current.scrollLeft;
                const clickX = e.clientX - rect.left + scrollLeft;
                onSeek(Math.max(0, clickX / PIXELS_PER_SECOND));
            }}
          >
            {renderRuler()}
          </div>

          {/* Tracks Container */}
          <div className="py-4 relative" onClick={handleTimelineClick}>
            
            {/* Playhead Line */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-white z-20 pointer-events-none"
              style={{ left: currentTime * PIXELS_PER_SECOND }}
            >
              <div className="w-3 h-3 -ml-1.5 bg-white rotate-45 transform -mt-1.5 rounded-sm shadow-md" />
            </div>

            {/* Main Video Track */}
            <div className="h-16 relative mt-2">
              {clips.map((clip) => {
                const asset = getAssetForClip(clip);
                const isSelected = selectedClipId === clip.id;
                
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if(!dragState) onClipSelect(clip.id);
                    }}
                    className={`absolute top-0 h-full rounded-md overflow-hidden border-2 cursor-pointer transition-colors group
                      ${isSelected ? 'border-yellow-500 z-10' : 'border-transparent hover:border-zinc-500'}
                      ${asset?.type === 'video' ? 'bg-blue-900/30' : 'bg-purple-900/30'}
                    `}
                    style={{
                      left: clip.startOffset * PIXELS_PER_SECOND,
                      width: clip.duration * PIXELS_PER_SECOND,
                    }}
                  >
                    {/* Clip Content Visuals */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-50 pointer-events-none">
                       {asset?.type === 'image' && <img src={asset.src} className="h-full w-full object-cover opacity-30" alt="" />}
                       <span className="text-xs truncate px-2 font-medium text-white drop-shadow-md z-10 relative">
                        {asset?.name}
                       </span>
                    </div>

                    {/* Trim Handles */}
                    {isSelected && (
                        <>
                            <div 
                                className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 bg-yellow-500/50 cursor-w-resize hover:bg-yellow-500 z-20 flex items-center justify-center group-hover/handle:opacity-100"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDragState({
                                        clipId: clip.id,
                                        handle: 'left',
                                        startX: e.clientX,
                                        originalClip: clip
                                    });
                                }}
                            >
                                <div className="w-0.5 h-4 bg-black/50" />
                            </div>

                            <div 
                                className="absolute right-0 top-0 bottom-0 w-3 -mr-1.5 bg-yellow-500/50 cursor-e-resize hover:bg-yellow-500 z-20 flex items-center justify-center"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDragState({
                                        clipId: clip.id,
                                        handle: 'right',
                                        startX: e.clientX,
                                        originalClip: clip
                                    });
                                }}
                            >
                                <div className="w-0.5 h-4 bg-black/50" />
                            </div>

                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteClip(clip.id);
                                }}
                                className="absolute top-1 right-2 text-white bg-black/50 hover:bg-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};