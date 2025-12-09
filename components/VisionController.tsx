import React, { useEffect, useRef } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { useVisionStore } from '../store';

interface VisionControllerProps {
  active: boolean;
}

const VisionController: React.FC<VisionControllerProps> = ({ active }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const updateVisionData = useVisionStore((state) => state.updateVisionData);
  
  const { loaded, detect } = useHandTracking(videoRef, active);

  // Camera stream setup
  useEffect(() => {
    if (active && loaded && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        })
        .catch((err) => console.error("Camera denied:", err));
    } else {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }
  }, [active, loaded]);

  // Detection Loop
  const loop = () => {
    if (active && loaded) {
        const result = detect();
        if (result) {
            updateVisionData({
                isHandDetected: result.isDetected,
                handPosition: result.worldPosition,
                gesture: result.gesture,
                gestureFactor: result.gestureFactor
            });
        }
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [active, loaded, detect]);

  return (
    <div className={`absolute bottom-6 right-6 w-48 h-36 transition-all duration-500 z-50 pointer-events-none ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        {/* Gold Border Container */}
        <div className="relative w-full h-full rounded-lg overflow-hidden border-2 border-amber-500/80 shadow-[0_0_20px_rgba(255,215,0,0.3)] bg-black/90">
            {!loaded && <div className="absolute inset-0 flex items-center justify-center text-xs text-amber-500/50 font-serif">INITIALIZING VISION...</div>}
            
            <video 
                ref={videoRef} 
                className="w-full h-full object-cover transform -scale-x-100 opacity-80" 
                playsInline 
                muted 
            />
            
            {/* Overlay Grid for "Tech" feel */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,215,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,215,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>
            
            {/* Status Indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${loaded ? 'bg-amber-500 animate-pulse' : 'bg-red-900'}`}></div>
                <span className="text-[9px] text-amber-500/80 tracking-widest font-mono">VISION_AI</span>
            </div>
        </div>
    </div>
  );
};

export default VisionController;
