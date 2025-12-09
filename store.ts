import { create } from 'zustand';
import * as THREE from 'three';
import { GestureState } from './types';

interface VisionState {
  // Transient Data (High Frequency)
  isHandDetected: boolean;
  handPosition: THREE.Vector3;
  gesture: GestureState;
  gestureFactor: number; // 0 (Tight/Fist) -> 1 (Open/Explode)

  // Actions
  updateVisionData: (data: Partial<Omit<VisionState, 'updateVisionData'>>) => void;
}

// We use a mutable object pattern for high-performance updates that don't trigger React renders 
// unless components explicitly subscribe to specific slices.
export const useVisionStore = create<VisionState>((set) => ({
  isHandDetected: false,
  handPosition: new THREE.Vector3(0, 0, 0),
  gesture: GestureState.IDLE,
  gestureFactor: 0,

  updateVisionData: (data) => set((state) => ({ ...state, ...data })),
}));
