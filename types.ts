
import { Vector3, Euler } from 'three';

export type ThemeMode = 'warm' | 'cool';

export interface TreeSettings {
  theme: ThemeMode; // New
  treeColor: string;
  lightColor: string;
  bloomStrength: number;
  bloomThreshold: number;
  rotationSpeed: number;
  gestureSensitivity: number; // New: 0.5 to 3.0
  particleBrightness: number; // New: 0.0 to 2.0
}

export interface PhotoData {
  id: string;
  url: string;
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
}

export enum GestureState {
  IDLE = 'IDLE',
  OPEN_PALM = 'OPEN_PALM', // Explode / Reset Photo
  CLOSED_FIST = 'CLOSED_FIST', // Assemble Tree
  ROTATE = 'ROTATE', // Active Rotation
  VICTORY = 'VICTORY', // Peace Sign: Grab Photo
  OK_PINCH = 'OK_PINCH', // OK Gesture: Grab Photo (New)
  DUAL_PINCH = 'DUAL_PINCH' // Legacy/Backup
}

export interface GestureData {
  state: GestureState;
  rotationVelocity: number; // -1.0 (Left) to 1.0 (Right)
  pinchDistance: number; // For dual hand
  handCenter: { x: number, y: number };
}

export interface VisionData {
  isHandDetected: boolean;
  handPosition: Vector3; // World Space
  gesture: GestureState;
  gestureFactor: number; // 0.0 (Fist) to 1.0 (Open)
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}
