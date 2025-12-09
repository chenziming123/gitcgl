
import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { GestureState } from '../types';

export interface HandTrackingResult {
  isDetected: boolean;
  worldPosition: THREE.Vector3;
  gesture: GestureState;
  gestureFactor: number; // 0 (Fist) to 1 (Open)
}

export const useHandTracking = (
  videoRef: React.RefObject<HTMLVideoElement>, 
  active: boolean
) => {
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Constants for coordinate mapping (Assuming Camera Z=24, FOV=45)
  // Visible Height at Z=0 is approx 20 units.
  const VISIBLE_HEIGHT = 20;
  const VISIBLE_WIDTH = VISIBLE_HEIGHT * (window.innerWidth / window.innerHeight); // Approximate

  // Smoothing & Debouncing Refs
  const smoothPos = useRef(new THREE.Vector3(0, 0, 0));
  const smoothFactor = useRef(0);
  
  // Debounce State
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
          numHands: 1
        });
        recognizerRef.current = recognizer;
        setLoaded(true);
      } catch (e) {
        console.error("Failed to load MediaPipe:", e);
      }
    };
    init();
  }, []);

  // --- Geometric Helpers ---
  const getDistance = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  const isOKGesture = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const indexMCP = landmarks[5]; 

    // Scale reference: Wrist to Index Knuckle
    const handScale = getDistance(wrist, indexMCP);

    // 1. PINCH CHECK: Thumb tip close to Index tip
    const pinchDist = getDistance(thumbTip, indexTip);
    const isPinching = pinchDist < (handScale * 0.5); // Strict threshold

    // 2. FIST GUARD: Middle Finger Tip must be AWAY from wrist
    // If middle finger is close to wrist, it's likely a fist, not an OK sign.
    const middleToWrist = getDistance(middleTip, wrist);
    const isNotFist = middleToWrist > (handScale * 0.9);

    return isPinching && isNotFist;
  };

  const detect = useCallback((): HandTrackingResult | null => {
    if (!recognizerRef.current || !videoRef.current || videoRef.current.readyState !== 4) return null;

    const results = recognizerRef.current.recognizeForVideo(videoRef.current, Date.now());

    if (results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const gestureName = results.gestures[0]?.[0]?.categoryName;

      // 1. Position Mapping
      const palm = landmarks[9]; 
      const targetX = (palm.x - 0.5) * VISIBLE_WIDTH * 1.5; 
      const targetY = -(palm.y - 0.5) * VISIBLE_HEIGHT * 1.2;
      smoothPos.current.lerp(new THREE.Vector3(targetX, targetY, 0), 0.2);

      // 2. Raw Gesture Recognition (Before Debounce)
      let rawState = GestureState.IDLE;

      // Check Geometric OK first (High Priority)
      const isOK = isOKGesture(landmarks);

      if (isOK || gestureName === 'Victory' || gestureName === 'Thumb_Up' || gestureName === 'Pointing_Up') {
        rawState = GestureState.VICTORY;
      } else if (gestureName === 'Open_Palm') {
        rawState = GestureState.OPEN_PALM;
      } else if (gestureName === 'Closed_Fist') {
        rawState = GestureState.CLOSED_FIST;
      } else {
        rawState = GestureState.IDLE;
      }

      // 3. Debouncing Logic (Stability Check)
      if (rawState === lastRawStateRef.current) {
        frameStabilityCounter.current++;
      } else {
        lastRawStateRef.current = rawState;
        frameStabilityCounter.current = 0;
      }

      // Require 4 frames of consistency to change state
      if (frameStabilityCounter.current > 4) {
        confirmedStateRef.current = rawState;
      }

      const finalState = confirmedStateRef.current;

      // 4. Calculate Factor based on CONFIRMED state
      let targetFactor = smoothFactor.current;

      if (finalState === GestureState.CLOSED_FIST) {
        targetFactor = 0.0; // Shrink
      } else if (finalState === GestureState.OPEN_PALM) {
        targetFactor = 1.0; // Explode
      } else if (finalState === GestureState.VICTORY) {
        // For Victory/OK, we want a neutral or slightly expanded state, not full explode
        targetFactor = THREE.MathUtils.lerp(targetFactor, 0.5, 0.1);
      } else {
        // IDLE drift
        targetFactor = THREE.MathUtils.lerp(targetFactor, 0.2, 0.05);
      }

      smoothFactor.current = THREE.MathUtils.lerp(smoothFactor.current, targetFactor, 0.1);

      return {
        isDetected: true,
        worldPosition: smoothPos.current.clone(),
        gesture: finalState,
        gestureFactor: smoothFactor.current
      };
    } else {
        // Decay if lost
        smoothFactor.current = THREE.MathUtils.lerp(smoothFactor.current, 0, 0.1);
        // Reset debounce
        frameStabilityCounter.current = 0;
        
        return {
            isDetected: false,
            worldPosition: smoothPos.current.clone(),
            gesture: GestureState.IDLE,
            gestureFactor: smoothFactor.current
        };
    }
  }, [videoRef]);

  return { loaded, detect };
};
