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
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  
  // Separate refs for different track types to manage sync
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

    // Determine Track Index
    let trackIndex = 0; // Default Main
    if (asset.type === MediaType.TEXT) trackIndex = 2; // Text Track
    else if (asset.type === MediaType.AUDIO) trackIndex = 3; // Audio Track
    else if (project.timeline.some(c => c.trackIndex === 0 && c.startOffset < 5)) {
        // Simple logic: If track 0 is busy at start, maybe put in overlay? 
        // For now, let's keep video defaults to 0, user can move later (if we implement drag-y)
        // Or if user explicitly wants overlay, we need UI for that.
        // For MVP: Video/Image -> Track 0. Text -> 2. Audio -> 3.
        // We will allow adding to Track 1 (PIP) via a context menu or just manual logic later.
        // Let's check if track 0 is occupied at the *end* of timeline.
    }

    // Find insertion point (end of specific track)
    const trackClips = project.timeline.filter(c => c.trackIndex === trackIndex);
    const lastClip = trackClips.length > 0 ? trackClips[trackClips.length - 1] : null;
    const startOffset = lastClip ? lastClip.startOffset + lastClip.duration : 0;

    const newClip: TimelineClip = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        startOffset: startOffset,
        mediaStart: 0,
        duration: asset.duration,
        trackIndex: trackIndex
    };

    setProject(prev => ({
        ...prev,
        timeline: [...prev.timeline, newClip]
    }));
  };

  const handleDeleteClip = (clipId: string) => {
    setProject(prev => {
        const newTimeline = prev.timeline.filter(c => c.id !== clipId);
        return { ...prev, timeline: newTimeline };
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
      if (!selectedClipId) return;
      const clipIndex = project.timeline.findIndex(c => c.id === selectedClipId);
      if (clipIndex === -1) return;
      
      const clip = project.timeline[clipIndex];
      
      if (currentTime > clip.startOffset && currentTime < clip.startOffset + clip.duration) {
          const splitPointRelative = currentTime - clip.startOffset;
          const part1: TimelineClip = { ...clip, duration: splitPointRelative };
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
          setSelectedClipId(part2.id);
      }
  };

  // --- Playback Logic ---

  // Get active clips for each track
  const getActiveClip = (trackIndex: number) => {
      return project.timeline.find(
          clip => clip.trackIndex === trackIndex && currentTime >= clip.startOffset && currentTime < clip.startOffset + clip.duration
      );
  };

  const activeMainClip = getActiveClip(0);
  const activePipClip = getActiveClip(1);
  const activeTextClip = getActiveClip(2);
  const activeAudioClip = getActiveClip(3);

  const getAsset = (clip?: TimelineClip) => clip ? project.assets.find(a => a.id === clip.assetId) : null;

  const mainAsset = getAsset(activeMainClip);
  const pipAsset = getAsset(activePipClip);
  const textAsset = getAsset(activeTextClip);
  const audioAsset = getAsset(activeAudioClip);

  // Sync Video/Audio Elements
  const syncMediaElement = (element: HTMLMediaElement | null, clip: TimelineClip | undefined, asset: MediaAsset | undefined | null) => {
      if (!element) return;
      if (!clip || !asset || (asset.type !== MediaType.VIDEO && asset.type !== MediaType.AUDIO)) {
          element.pause();
          return; // No active media for this track
      }

      if (element.getAttribute('src') !== asset.src) {
          element.src = asset.src;
          element.load();
      }

      const targetTime = clip.mediaStart + (currentTime - clip.startOffset);
      
      // Sync tolerance
      if (Math.abs(element.currentTime - targetTime) > 0.3) {
          element.currentTime = targetTime;
      }
      
      if (isPlaying && element.paused) {
          element.play().catch(() => {});
      } else if (!isPlaying && !element.paused) {
          element.pause();
      }
  };

  // Sync Effect
  useEffect(() => {
     syncMediaElement(mainVideoRef.current, activeMainClip, mainAsset);
     syncMediaElement(pipVideoRef.current, activePipClip, pipAsset);
     syncMediaElement(audioRef.current, activeAudioClip, audioAsset);
  }, [currentTime, isPlaying, activeMainClip, activePipClip, activeAudioClip, mainAsset, pipAsset, audioAsset]);


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
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, totalDuration]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      <AssetLibrary 
        assets={project.assets} 
        onAddAsset={handleAddAsset}
        onAddToTimeline={handleAddToTimeline}
      />

      <div className="flex-1 flex flex-col min-w-0">
        
        <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-md"></div>
                <h1 className="font-bold text-sm tracking-wide">VN Clone <span className="text-zinc-500 font-normal">| {project.name}</span></h1>
            </div>
            <Button variant="secondary" size="sm" onClick={() => saveProject(project)}>
                <Save size={14} className="mr-2"/> Save
            </Button>
        </header>

        {/* Preview Player */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
            <div className="aspect-video w-full max-h-[calc(100vh-350px)] max-w-4xl bg-zinc-900 shadow-2xl relative group overflow-hidden">
                
                {/* 1. Main Track (Layer 0) */}
                {mainAsset ? (
                    mainAsset.type === MediaType.VIDEO ? (
                        <video ref={mainVideoRef} className="w-full h-full object-contain" muted />
                    ) : (
                        <img src={mainAsset.src} className="w-full h-full object-contain" alt="main" />
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-950">
                        <p>No Main Media</p>
                    </div>
                )}

                {/* 2. PIP Track (Layer 1) */}
                {pipAsset && activePipClip && (
                    <div className="absolute top-4 right-4 w-1/3 aspect-video border-2 border-white/20 shadow-xl bg-black rounded-lg overflow-hidden z-10">
                         {pipAsset.type === MediaType.VIDEO ? (
                            <video ref={pipVideoRef} className="w-full h-full object-cover" muted />
                        ) : (
                            <img src={pipAsset.src} className="w-full h-full object-cover" alt="pip" />
                        )}
                    </div>
                )}

                {/* 3. Text Track (Layer 2) */}
                {textAsset && activeTextClip && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                        <h2 className="text-4xl font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] stroke-black text-center px-8">
                            {textAsset.textContent}
                        </h2>
                    </div>
                )}

                {/* Hidden Audio Track */}
                <audio ref={audioRef} className="hidden" />

            </div>
        </div>

        {/* Tools */}
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

        {/* Timeline */}
        <div className="h-72 flex-shrink-0">
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