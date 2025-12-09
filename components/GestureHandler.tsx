
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { GestureState, GestureData } from '../types';

interface GestureHandlerProps {
  onGestureDetected: (data: GestureData) => void;
  active: boolean;
  sensitivity: number;
  className?: string;
}

const GestureHandler: React.FC<GestureHandlerProps> = ({ onGestureDetected, active, sensitivity, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number>(0);
  const [loaded, setLoaded] = useState(false);

  // Debouncing Refs
  const lastRawStateRef = useRef<GestureState>(GestureState.IDLE);
  const frameStabilityCounter = useRef<number>(0);
  const confirmedStateRef = useRef<GestureState>(GestureState.IDLE);

  // Initialize MediaPipe
  useEffect(() => {
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        recognizerRef.current = recognizer;
        setLoaded(true);
      } catch (e) {
        console.error("Failed to load MediaPipe:", e);
      }
    };
    init();
  }, []);

  // Handle Webcam Stream
  useEffect(() => {
    if (active && loaded && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
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

  // --- GEOMETRIC HELPERS ---

  const getDistance = (p1: any, p2: any) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Detect Fist (Geometric Backup)
  const isHandClosedGeometric = (landmarks: any[]) => {
      const wrist = landmarks[0];
      const tips = [8, 12, 16, 20]; 
      let avgDist = 0;
      tips.forEach(idx => avgDist += getDistance(landmarks[idx], wrist));
      avgDist /= tips.length;
      
      const handSize = getDistance(landmarks[5], wrist);
      return avgDist < handSize * 1.0; 
  };

  // Detect OK / Pinch Gesture (Geometric - ROBUST VERSION)
  const isOKGesture = (landmarks: any[]) => {
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const indexMCP = landmarks[5]; 

      // Scale reference: Wrist to Index Knuckle
      const scale = getDistance(wrist, indexMCP);

      // 1. PINCH CHECK: Thumb tip close to Index tip
      const pinchDist = getDistance(thumbTip, indexTip);
      const isPinching = pinchDist < (scale * 0.5); // Relaxed threshold

      // 2. FIST GUARD: Middle Finger Tip must be AWAY from wrist
      // If middle finger is close to wrist, it's likely a fist, not an OK sign.
      const middleToWrist = getDistance(middleTip, wrist);
      const isNotFist = middleToWrist > (scale * 0.9);

      return isPinching && isNotFist;
  };

  // Prediction Loop
  const predict = () => {
    if (recognizerRef.current && videoRef.current && videoRef.current.readyState === 4) {
      const results = recognizerRef.current.recognizeForVideo(videoRef.current, Date.now());

      let rawState = GestureState.IDLE;
      let rotationVel = 0;
      let pinchDist = 0;
      let handX = 0.5;
      let handY = 0.5;

      if (results.landmarks.length > 0) {
        const hand = results.landmarks[0];
        const gesture = results.gestures[0]?.[0]?.categoryName;
        
        handX = hand[9].x; 
        handY = hand[9].y;

        // --- GESTURE PRIORITY LOGIC ---
        
        // 1. SUMMON PHOTO: 
        // Checks: Geometric OK/Pinch OR AI Victory/ThumbUp/Pointing
        if (isOKGesture(hand) || gesture === 'Victory' || gesture === 'Thumb_Up' || gesture === 'Pointing_Up') {
             rawState = GestureState.VICTORY; 
        }
        // 2. EXPLODE: Open Palm
        else if (gesture === 'Open_Palm') {
             rawState = GestureState.OPEN_PALM;
        } 
        // 3. ASSEMBLE: Fist
        else if (gesture === 'Closed_Fist' || isHandClosedGeometric(hand)) {
             rawState = GestureState.CLOSED_FIST;
        } 
        // 4. Fallback: Rotate
        else {
             rawState = GestureState.ROTATE;
             
             // Simple rotation velocity calculation
             const deadzone = Math.max(0.1, 0.2 / sensitivity); 
             const center = 0.5;
             if (handX < (center - deadzone)) {
                 const dist = (center - deadzone) - handX;
                 rotationVel = -1 * Math.min(1, dist * 3.0 * sensitivity);
             } else if (handX > (center + deadzone)) {
                 const dist = handX - (center + deadzone);
                 rotationVel = Math.min(1, dist * 3.0 * sensitivity);
             }
        }
      }

      // --- DEBOUNCING / STABILIZATION ---
      if (rawState === lastRawStateRef.current) {
          frameStabilityCounter.current++;
      } else {
          lastRawStateRef.current = rawState;
          frameStabilityCounter.current = 0;
      }

      // 4 frames @ 60fps ~= 66ms delay
      if (frameStabilityCounter.current > 4) {
          confirmedStateRef.current = rawState;
      }

      onGestureDetected({
          state: confirmedStateRef.current,
          rotationVelocity: rotationVel,
          pinchDistance: pinchDist,
          handCenter: { x: handX, y: handY }
      });
    }
    requestRef.current = requestAnimationFrame(predict);
  };

  useEffect(() => {
    if (active && loaded) {
      requestRef.current = requestAnimationFrame(predict);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [active, loaded, onGestureDetected, sensitivity]);

  return (
    <div className={className}>
      {!loaded && <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">AI 模型加载中...</div>}
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover transform -scale-x-100" // Mirror effect
        playsInline 
        muted 
      />
      {active && loaded && (
          <div className="absolute top-2 left-2 flex gap-1 items-center">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[10px] text-white font-mono uppercase tracking-widest">实时信号</span>
          </div>
      )}
    </div>
  );
};

export default GestureHandler;
