import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Project, MediaAsset, TimelineClip, MediaType } from './types';
import { AssetLibrary } from './components/AssetLibrary';
import { Timeline } from './components/Timeline';
import { Button } from './components/Button';
import { Play, Pause, SkipBack, SkipForward, Save, Scissors, Trash2 } from 'lucide-react';
import { saveProject } from './services/storageService';

const App: React.FC = () => {
  // --- State ---
  const [project, setProject] = useState<Project>({
    id: 'default-project',
    name: 'Untitled Project',
    lastModified: Date.now(),
    assets: [],
    timeline: []
  });
  
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
  // --- Refs ---
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const imagePreviewRef = useRef<HTMLImageElement>(null);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // --- Computed ---
  const totalDuration = project.timeline.reduce((max, clip) => 
    Math.max(max, clip.startOffset + clip.duration), 0);

  // --- Handlers ---

  const handleAddAsset = (asset: MediaAsset) => {
    setProject(prev => ({
      ...prev,
      assets: [...prev.assets, asset]
    }));
  };

  const handleAddToTimeline = (assetId: string) => {
    const asset = project.assets.find(a => a.id === assetId);
    if (!asset) return;

    // Find the end of the last clip to append
    let startOffset = 0;
    if (project.timeline.length > 0) {
        const lastClip = project.timeline[project.timeline.length - 1];
        startOffset = lastClip.startOffset + lastClip.duration;
    }

    const newClip: TimelineClip = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        startOffset: startOffset,
        mediaStart: 0,
        duration: asset.duration,
        trackIndex: 0
    };

    setProject(prev => ({
        ...prev,
        timeline: [...prev.timeline, newClip]
    }));
  };

  const handleDeleteClip = (clipId: string) => {
    setProject(prev => {
        const newTimeline = prev.timeline.filter(c => c.id !== clipId);
        // Optional: Shift subsequent clips back? For simplicity in MVP, we won't shift automatically to simulate "gap" behavior, 
        // or we could shift. Let's not shift to allow gaps.
        return {
            ...prev,
            timeline: newTimeline
        };
    });
    if (selectedClipId === clipId) setSelectedClipId(null);
  };

  const handleUpdateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    setProject(prev => ({
        ...prev,
        timeline: prev.timeline.map(c => 
            c.id === clipId ? { ...c, ...updates } : c
        )
    }));
  };

  const handleSplit = () => {
      // MVP Split logic: If playhead is over selected clip, split it into two
      if (!selectedClipId) return;
      
      const clipIndex = project.timeline.findIndex(c => c.id === selectedClipId);
      if (clipIndex === -1) return;
      
      const clip = project.timeline[clipIndex];
      
      // Check if playhead is inside clip
      if (currentTime > clip.startOffset && currentTime < clip.startOffset + clip.duration) {
          const splitPointRelative = currentTime - clip.startOffset;
          
          const part1: TimelineClip = {
              ...clip,
              duration: splitPointRelative
          };
          
          const part2: TimelineClip = {
              ...clip,
              id: crypto.randomUUID(),
              startOffset: clip.startOffset + splitPointRelative,
              mediaStart: clip.mediaStart + splitPointRelative,
              duration: clip.duration - splitPointRelative
          };
          
          setProject(prev => {
              const newTimeline = [...prev.timeline];
              newTimeline.splice(clipIndex, 1, part1, part2);
              return { ...prev, timeline: newTimeline };
          });
          
          setSelectedClipId(part2.id); // Select the second part
      }
  };

  // --- Playback Logic ---

  // Determine what to show on screen based on currentTime
  const activeClip = project.timeline.find(
      clip => currentTime >= clip.startOffset && currentTime < clip.startOffset + clip.duration
  );
  
  const activeAsset = activeClip ? project.assets.find(a => a.id === activeClip.assetId) : null;

  // Sync Video Element
  useEffect(() => {
    const video = videoPlayerRef.current;
    if (!video || !activeClip || !activeAsset || activeAsset.type !== MediaType.VIDEO) return;

    // If source changed
    const currentSrc = video.getAttribute('src');
    if (currentSrc !== activeAsset.src) {
        video.src = activeAsset.src;
        // Wait for metadata then seek
        video.onloadedmetadata = () => {
             video.currentTime = activeClip.mediaStart + (currentTime - activeClip.startOffset);
             if (isPlaying) video.play().catch(() => {});
        };
    } else {
        // Source is same, check sync drift
        const targetMediaTime = activeClip.mediaStart + (currentTime - activeClip.startOffset);
        if (Math.abs(video.currentTime - targetMediaTime) > 0.3) {
            video.currentTime = targetMediaTime;
        }
    }
  }, [activeClip, activeAsset, currentTime, isPlaying]);

  // Main Loop
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      
      const loop = (time: number) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        
        setCurrentTime(prev => {
            const next = prev + delta;
            if (next >= totalDuration && totalDuration > 0) {
                setIsPlaying(false);
                return totalDuration;
            }
            return next;
        });
        
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        // Pause underlying video
        if (videoPlayerRef.current) videoPlayerRef.current.pause();
    }

    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration]);

  // Handle Play/Pause
  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* Left Sidebar: Library */}
      <AssetLibrary 
        assets={project.assets} 
        onAddAsset={handleAddAsset}
        onAddToTimeline={handleAddToTimeline}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top: Header */}
        <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-md"></div>
                <h1 className="font-bold text-sm tracking-wide">VN Clone <span className="text-zinc-500 font-normal">| {project.name}</span></h1>
            </div>
            <Button variant="secondary" size="sm" onClick={() => saveProject(project)}>
                <Save size={14} className="mr-2"/> Save
            </Button>
        </header>

        {/* Middle: Preview Player */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
            {/* Aspect Ratio Container (16:9) */}
            <div className="aspect-video w-full max-h-[calc(100vh-350px)] max-w-4xl bg-zinc-900 shadow-2xl relative group">
                {activeAsset ? (
                    activeAsset.type === MediaType.VIDEO ? (
                        <video 
                            ref={videoPlayerRef}
                            className="w-full h-full object-contain pointer-events-none"
                            muted={false} // Enable sound for demo
                        />
                    ) : (
                        <img 
                            ref={imagePreviewRef}
                            src={activeAsset.src} 
                            alt="preview" 
                            className="w-full h-full object-contain animate-in fade-in duration-300" 
                        />
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <p>No Media</p>
                    </div>
                )}
                
                {/* Overlay Controls */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                     {/* Can add on-preview controls here */}
                </div>
            </div>
        </div>

        {/* Middle Bar: Tools */}
        <div className="h-12 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center gap-4 px-4 z-10">
            <Button variant="ghost" size="icon" onClick={() => setCurrentTime(0)}>
                <SkipBack size={18} fill="currentColor" />
            </Button>
            <Button variant="primary" size="icon" className="rounded-full w-12 h-12" onClick={togglePlay}>
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" ml-1 />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentTime(totalDuration)}>
                <SkipForward size={18} fill="currentColor" />
            </Button>
            
            <div className="w-px h-6 bg-zinc-700 mx-2"></div>
            
            <Button 
                variant="ghost" 
                size="sm" 
                disabled={!selectedClipId} 
                onClick={handleSplit}
                title="Split Clip (K)"
            >
                <Scissors size={16} className="mr-2" /> Split
            </Button>
            <Button 
                variant="danger" 
                size="sm" 
                disabled={!selectedClipId} 
                onClick={() => selectedClipId && handleDeleteClip(selectedClipId)}
                title="Delete Clip (Del)"
            >
                <Trash2 size={16} className="mr-2" /> Delete
            </Button>
            
            <div className="flex-1"></div>
            <div className="text-sm font-mono text-zinc-400">
                {new Date(currentTime * 1000).toISOString().substr(14, 5)} / {new Date(totalDuration * 1000).toISOString().substr(14, 5)}
            </div>
        </div>

        {/* Bottom: Timeline */}
        <div className="h-64 flex-shrink-0">
            <Timeline 
                clips={project.timeline}
                assets={project.assets}
                currentTime={currentTime}
                totalDuration={Math.max(totalDuration, 30)}
                onSeek={(t) => {
                    setCurrentTime(t);
                    setIsPlaying(false);
                }}
                onClipSelect={setSelectedClipId}
                selectedClipId={selectedClipId}
                onDeleteClip={handleDeleteClip}
                onUpdateClip={handleUpdateClip}
            />
        </div>

      </div>
    </div>
  );
};

export default App;