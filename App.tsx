
import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Loader, Stats } from '@react-three/drei';
import { Settings, Camera, Upload, X, Activity, Sun, Gauge, Film, Snowflake, Flame, Type } from 'lucide-react';
import TreeScene from './components/TreeScene';
import VisionController from './components/VisionController';
import { TreeSettings, ThemeMode } from './types';
import * as THREE from 'three';

const App: React.FC = () => {
  // State - Defaults tuned for "Trump-style" Luxury (Deep Emerald & Gold)
  const [settings, setSettings] = useState<TreeSettings>({
    theme: 'warm',
    treeColor: '#02260e', // Deep Emerald
    lightColor: '#FFD700', // Rich Gold
    bloomStrength: 1.5,   // Movie-grade glow
    bloomThreshold: 0.6,  // Only glow the really bright stuff
    rotationSpeed: 0.0,   // Manual control takes over
    gestureSensitivity: 1.5, // Default high sensitivity
    particleBrightness: 1.1 // Default sparkle intensity
  });

  const [photos, setPhotos] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  
  const [showUI, setShowUI] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [galleryMode, setGalleryMode] = useState(false); 
  
  // Interactive Controls
  const [manualExplode, setManualExplode] = useState(0); // 0 to 1

  // Handle Photo Upload
  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newPhotos = Array.from(event.target.files).map(file => URL.createObjectURL(file as unknown as Blob));
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const toggleTheme = () => {
      setSettings(prev => {
          const isWarm = prev.theme === 'warm';
          return {
              ...prev,
              theme: isWarm ? 'cool' : 'warm',
              treeColor: isWarm ? '#0f172a' : '#02260e', // Midnight Blue vs Emerald
              lightColor: isWarm ? '#00ffff' : '#FFD700', // Cyan vs Gold
          };
      });
  };

  return (
    <div className="relative w-full h-screen bg-[#000] text-white overflow-hidden font-serif">
      {/* Background Radial Gradient for Depth - Dynamic based on Theme */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-colors duration-1000 ease-in-out"
        style={{
            background: settings.theme === 'warm' 
                ? 'radial-gradient(circle at center, #1a1a1a 0%, #000000 100%)'
                : 'radial-gradient(circle at center, #0f172a 0%, #000000 100%)'
        }}
      />

      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas
          dpr={[1, 2]} // Handle high DPI
          gl={{ 
            antialias: false, 
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
            alpha: true
          }}
          camera={{ position: [0, 0, 24], fov: 45 }}
        >
          {showDebug && <Stats />}
          
          <Suspense fallback={null}>
            <TreeScene 
              key={settings.theme} // Force remount on theme change to rebuild buffers cleanly
              settings={settings} 
              photos={photos} 
              manualExplodeFactor={manualExplode}
              isGalleryMode={galleryMode}
              customWords={customText.split(',').map(s => s.trim()).filter(s => s.length > 0)}
            />
          </Suspense>

          <EffectComposer enableNormalPass={false}>
            <Bloom 
              luminanceThreshold={settings.bloomThreshold} 
              mipmapBlur 
              intensity={settings.bloomStrength} 
              radius={0.6}
              levels={9}
            />
            <Vignette eskil={false} offset={0.2} darkness={0.7} />
          </EffectComposer>
        </Canvas>
      </div>

      <Loader 
        containerStyles={{ background: '#000000' }} 
        innerStyles={{ width: '40vw', height: '2px', background: '#333' }}
        barStyles={{ height: '100%', background: '#FFD700' }}
        dataInterpolation={(p) => `正在打磨金饰 ${p.toFixed(0)}%`} 
      />

      {/* Vision Controller (New Feature) */}
      <VisionController active={showCamera && !galleryMode} />

      {/* Main UI */}
      <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-700 ${showUI ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* Controls Panel (Bottom Left) */}
        <div className="absolute bottom-8 left-8 w-80 bg-black/40 backdrop-blur-md border-l border-amber-500/40 p-6 pointer-events-auto transition-all hover:bg-black/60">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-white/10">
            <h2 className="text-amber-500 font-bold flex items-center gap-2 uppercase tracking-widest text-[11px]">
              <Settings size={12} /> 系统设置
            </h2>
            <div className="flex gap-2">
               {/* Theme Toggle */}
               <button 
                  onClick={toggleTheme}
                  className={`p-2 transition-all duration-500 rounded-sm border ${settings.theme === 'warm' ? 'border-amber-500/20 text-amber-500 hover:bg-amber-500/10' : 'border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10'}`}
                  title={settings.theme === 'warm' ? "切换至极地钻光" : "切换至皇家金绿"}
                >
                  {settings.theme === 'warm' ? <Flame size={14} /> : <Snowflake size={14} />}
               </button>

               {/* Gallery Mode Toggle */}
               <button 
                  onClick={() => {
                      const next = !galleryMode;
                      setGalleryMode(next);
                      if (next) setManualExplode(1.0); // Explode for gallery
                      else setManualExplode(0.0);
                  }}
                  className={`p-2 transition-all duration-300 rounded-sm border border-amber-500/20 ${galleryMode ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(255,160,0,0.5)]' : 'text-amber-500 hover:bg-amber-500/10'}`}
                  title="一键艺术轮播"
                >
                  <Film size={14} />
               </button>

               <button 
                  onClick={() => setShowCamera(!showCamera)}
                  disabled={galleryMode}
                  className={`p-2 transition-all duration-300 rounded-sm border border-amber-500/20 ${showCamera && !galleryMode ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(255,160,0,0.5)]' : 'text-amber-500 hover:bg-amber-500/10'} ${galleryMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="切换手势控制"
                >
                  <Camera size={14} />
               </button>
               <button 
                  onClick={() => setShowDebug(!showDebug)}
                  className={`p-2 transition-all duration-300 rounded-sm border border-amber-500/20 ${showDebug ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(255,160,0,0.5)]' : 'text-amber-500 hover:bg-amber-500/10'}`}
                  title="切换调试器"
                >
                  <Activity size={14} />
               </button>
            </div>
          </div>

          <div className="space-y-6">
            
            {/* Custom Text Input */}
            <div className={galleryMode ? 'opacity-30 pointer-events-none' : ''}>
               <div className="flex justify-between text-[10px] uppercase tracking-widest text-amber-100/50 mb-2">
                 <span className="flex items-center gap-2 font-bold"><Type size={12} className="text-white" /> 3D 祝福语 (逗号分隔)</span>
               </div>
               <input 
                  type="text" 
                  value={customText}
                  placeholder="JOY, LOVE, 2025"
                  onChange={(e) => setCustomText(e.target.value)}
                  className={`w-full bg-white/10 border-b-2 ${settings.theme === 'warm' ? 'border-amber-500 text-amber-400 placeholder-amber-500/30' : 'border-cyan-500 text-cyan-300 placeholder-cyan-500/30'} text-sm py-2 px-2 focus:outline-none focus:bg-white/20 transition-all font-bold tracking-widest rounded-t-sm`}
               />
            </div>

            {/* Gesture Sensitivity */}
            <div className={galleryMode ? 'opacity-30 pointer-events-none' : ''}>
               <div className="flex justify-between text-[10px] uppercase tracking-widest text-amber-100/50 mb-2">
                 <span className="flex items-center gap-2"><Gauge size={10} /> 手势灵敏度</span>
                 <span>{(settings.gestureSensitivity).toFixed(1)}x</span>
               </div>
               <input 
                  type="range" min="0.5" max="3.0" step="0.1"
                  value={settings.gestureSensitivity}
                  onChange={(e) => setSettings({...settings, gestureSensitivity: parseFloat(e.target.value)})}
                  className={`w-full h-[1px] bg-white/20 appearance-none cursor-pointer ${settings.theme === 'warm' ? 'accent-amber-500' : 'accent-cyan-400'}`}
               />
            </div>

            {/* Particle Brightness */}
            <div>
               <div className="flex justify-between text-[10px] uppercase tracking-widest text-amber-100/50 mb-2">
                 <span className="flex items-center gap-2"><Sun size={10} /> 星尘光耀</span>
                 <span>{(settings.particleBrightness * 100).toFixed(0)}%</span>
               </div>
               <input 
                  type="range" min="0.0" max="2.0" step="0.1"
                  value={settings.particleBrightness}
                  onChange={(e) => setSettings({...settings, particleBrightness: parseFloat(e.target.value)})}
                  className={`w-full h-[1px] bg-white/20 appearance-none cursor-pointer ${settings.theme === 'warm' ? 'accent-amber-500' : 'accent-cyan-400'}`}
               />
            </div>

            {/* Bloom Intensity */}
            <div>
               <div className="flex justify-between text-[10px] uppercase tracking-widest text-amber-100/50 mb-2">
                 <span>梦幻光晕</span>
                 <span>{(settings.bloomStrength * 10).toFixed(0)}</span>
               </div>
               <input 
                  type="range" min="0" max="3" step="0.1"
                  value={settings.bloomStrength}
                  onChange={(e) => setSettings({...settings, bloomStrength: parseFloat(e.target.value)})}
                  className={`w-full h-[1px] bg-white/20 appearance-none cursor-pointer ${settings.theme === 'warm' ? 'accent-amber-500' : 'accent-cyan-400'}`}
               />
            </div>

             {/* Manual Explode Slider */}
             <div className={galleryMode ? 'opacity-30 pointer-events-none' : ''}>
               <div className="flex justify-between text-[10px] uppercase tracking-widest text-amber-100/50 mb-2">
                 <span>全景展开 (鼠标)</span>
                 <span>{(manualExplode * 100).toFixed(0)}%</span>
               </div>
               <input 
                  type="range" min="0" max="1" step="0.01"
                  value={manualExplode}
                  onChange={(e) => setManualExplode(parseFloat(e.target.value))}
                  className={`w-full h-[1px] bg-white/20 appearance-none cursor-pointer ${settings.theme === 'warm' ? 'accent-amber-500' : 'accent-cyan-400'}`}
               />
            </div>

            {/* Photo Upload */}
            <label className={`group flex items-center justify-center w-full py-3 mt-4 border border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-black cursor-pointer transition-all duration-300 gap-2 text-[10px] uppercase tracking-[0.2em] font-bold ${settings.theme === 'cool' ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500' : ''}`}>
              <Upload size={12} className="group-hover:scale-110 transition-transform" />
              上传记忆照片
              <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Floating UI Toggles */}
      <div className="absolute top-8 right-8 z-20 flex flex-col gap-4 pointer-events-auto">
         <button 
           onClick={() => setShowUI(!showUI)}
           className={`w-10 h-10 border bg-black/20 backdrop-blur flex items-center justify-center transition-all duration-500 rounded-full ${settings.theme === 'warm' ? 'border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black hover:shadow-[0_0_20px_rgba(255,180,0,0.6)]' : 'border-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-black hover:shadow-[0_0_20px_rgba(0,255,255,0.6)]'}`}
         >
            {showUI ? <X size={16} /> : <Settings size={16} />}
         </button>
      </div>
    </div>
  );
};

export default App;
