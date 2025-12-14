import React, { useState } from 'react';
import { MediaAsset, MediaType } from '../types';
import { Button } from './Button';
import { generateAIAsset } from '../services/geminiService';
import { Loader2, Plus, Image as ImageIcon, Video, Sparkles } from 'lucide-react';

interface AssetLibraryProps {
  assets: MediaAsset[];
  onAddAsset: (asset: MediaAsset) => void;
  onAddToTimeline: (assetId: string) => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ assets, onAddAsset, onAddToTimeline }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showGenModal, setShowGenModal] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('image') ? MediaType.IMAGE : MediaType.VIDEO;
    
    // Create a temp video element to get duration if video
    let duration = 5; // default for image
    
    if (type === MediaType.VIDEO) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const newAsset: MediaAsset = {
                id: crypto.randomUUID(),
                type,
                src: url,
                name: file.name,
                duration: video.duration,
            };
            onAddAsset(newAsset);
        };
        video.src = url;
    } else {
        const newAsset: MediaAsset = {
            id: crypto.randomUUID(),
            type,
            src: url,
            name: file.name,
            duration: 5, // Default image duration
        };
        onAddAsset(newAsset);
    }
    
    // Reset input
    event.target.value = '';
  };

  const handleGenerateAI = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
        const base64Image = await generateAIAsset(prompt);
        const newAsset: MediaAsset = {
            id: crypto.randomUUID(),
            type: MediaType.IMAGE,
            src: base64Image,
            name: `AI: ${prompt.slice(0, 15)}...`,
            duration: 5
        };
        onAddAsset(newAsset);
        setShowGenModal(false);
        setPrompt('');
    } catch (e) {
        alert("Failed to generate image. Please check API key.");
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-bold text-zinc-100 mb-4 uppercase tracking-wider">Media Library</h2>
        
        <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center h-20 border border-dashed border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition-all">
                <input type="file" className="hidden" accept="video/*,image/*" onChange={handleFileUpload} />
                <Plus className="w-5 h-5 text-zinc-400 mb-1" />
                <span className="text-xs text-zinc-400">Import Media</span>
            </label>

            <button 
                onClick={() => setShowGenModal(true)}
                className="flex flex-col items-center justify-center h-20 border border-zinc-700 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-lg cursor-pointer hover:from-indigo-900/40 hover:to-purple-900/40 border-indigo-500/30 transition-all"
            >
                <Sparkles className="w-5 h-5 text-indigo-400 mb-1" />
                <span className="text-xs text-indigo-300">AI Gen</span>
            </button>
        </div>
      </div>

      {/* Asset List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {assets.length === 0 && (
            <div className="text-center mt-10 text-zinc-600 text-sm">
                No media imported.
            </div>
        )}
        {assets.map(asset => (
            <div key={asset.id} className="group relative flex items-center p-2 rounded-md bg-zinc-950/50 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-all">
                <div className="w-16 h-12 bg-black rounded overflow-hidden flex-shrink-0 relative">
                    {asset.type === MediaType.VIDEO ? (
                         <video src={asset.src} className="w-full h-full object-cover" />
                    ) : (
                        <img src={asset.src} alt={asset.name} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute bottom-0 right-0 p-0.5 bg-black/60 rounded-tl">
                        {asset.type === MediaType.VIDEO ? <Video size={10} /> : <ImageIcon size={10} />}
                    </div>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{asset.name}</p>
                    <p className="text-xs text-zinc-500">{asset.duration.toFixed(1)}s</p>
                </div>
                <button 
                    onClick={() => onAddToTimeline(asset.id)}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 bg-blue-600 p-1.5 rounded-full text-white shadow-lg hover:scale-105 transition-all"
                    title="Add to Timeline"
                >
                    <Plus size={14} />
                </button>
            </div>
        ))}
      </div>

      {/* AI Generation Modal Overlay */}
      {showGenModal && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <Sparkles className="text-indigo-500" size={18} />
                    Generate AI Asset
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                    Describe an image to generate using Gemini Flash.
                </p>
                <textarea 
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-4 resize-none h-24"
                    placeholder="E.g., A cyberpunk city street at night with neon rain..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowGenModal(false)}>Cancel</Button>
                    <Button 
                        onClick={handleGenerateAI} 
                        disabled={isGenerating || !prompt.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {isGenerating ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                        {isGenerating ? 'Dreaming...' : 'Generate'}
                    </Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
