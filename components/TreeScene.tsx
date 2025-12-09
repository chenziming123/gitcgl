
import React, { useRef, useMemo, useState, useEffect, useLayoutEffect, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointMaterial, Image, Float, OrbitControls, Environment, Stars, Sparkles, Trail, Text } from '@react-three/drei';
import * as THREE from 'three';
import { TreeSettings, GestureState, ThemeMode } from '../types';
import { useVisionStore } from '../store';

interface TreeSceneProps {
  settings: TreeSettings;
  photos: string[];
  manualExplodeFactor: number;
  isGalleryMode: boolean; 
  customWords: string[];
}

const COUNT = 25000; 
const DECO_COUNT = 2000; 
const TREE_HEIGHT = 18;
const TREE_RADIUS = 7.5;

// --- Helper: Tree Shape Math ---
const getTreeRadiusAtHeight = (y: number) => {
    const hNorm = (y + TREE_HEIGHT / 2) / TREE_HEIGHT;
    return Math.pow((1 - hNorm), 0.8) * TREE_RADIUS;
};

// --- Hook: Tree Particles ---
const useTreeParticles = (theme: ThemeMode, color: string) => {
    return useMemo(() => {
        const positions = new Float32Array(COUNT * 3);
        const colors = new Float32Array(COUNT * 3);
        
        const baseColor = new THREE.Color(color); // Uses theme color passed in
        const goldColor = new THREE.Color(theme === 'warm' ? "#FFD700" : "#E0F7FA"); // Gold vs Ice Blue
        const accentColor = new THREE.Color(theme === 'warm' ? "#FF4500" : "#00BFFF"); // Orange-Red vs Deep Sky Blue
        
        for (let i = 0; i < COUNT; i++) {
            const y = (Math.random() - 0.5) * TREE_HEIGHT;
            const rMax = getTreeRadiusAtHeight(y);
            const r = rMax * Math.sqrt(Math.random()); 
            const theta = Math.random() * Math.PI * 2 * 10 + y;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            const rand = Math.random();
            let pColor = baseColor;
            
            if (rand > 0.90) pColor = goldColor;
            else if (rand > 0.85) pColor = accentColor;

            const lightness = 0.5 + Math.random() * 0.8;
            
            colors[i * 3] = pColor.r * lightness;
            colors[i * 3 + 1] = pColor.g * lightness;
            colors[i * 3 + 2] = pColor.b * lightness;
        }
        return { 
            sourcePositions: positions, 
            colors
        };
    }, [theme, color]);
};

// --- COMPONENT: MAGIC WAND (Light Trail & Interactive Spotlight) ---
const MagicWand = ({ theme }: { theme: ThemeMode }) => {
    const wandRef = useRef<THREE.Mesh>(null);
    const { camera, pointer, viewport } = useThree();
    
    // Smooth movement vector
    const targetPos = useRef(new THREE.Vector3(0, 0, 10));

    useFrame((state, delta) => {
        if (!wandRef.current) return;

        const { isHandDetected, handPosition } = useVisionStore.getState();

        if (isHandDetected) {
            // Hand Mode: Map mapped hand position directly
            // handPosition is already roughly World Space from the hook, but let's refine Z
            targetPos.current.set(handPosition.x, handPosition.y, 8); 
        } else {
            // Mouse Mode: Unproject mouse to a plane in front of the tree
            const vec = new THREE.Vector3(pointer.x, pointer.y, 0.5);
            vec.unproject(camera);
            const dir = vec.sub(camera.position).normalize();
            const distance = (10 - camera.position.z) / dir.z; // Project to Z=10 roughly
            const pos = camera.position.clone().add(dir.multiplyScalar(distance));
            targetPos.current.lerp(pos, 0.2); // Smooth follow
        }

        // Apply Position with lerp for butter-smooth trails
        wandRef.current.position.lerp(targetPos.current, delta * 10);
    });

    const trailColor = theme === 'warm' ? "#FFD700" : "#00FFFF";

    return (
        <group>
            {/* The Trail */}
            <Trail 
                width={1.5} 
                length={8} 
                color={trailColor} 
                attenuation={(t) => t * t}
                target={wandRef} // Attach trail to the mesh ref
            >
                {/* The "Tip" of the wand (Invisible or Glowing Orb) */}
                <mesh ref={wandRef} position={[0, 0, 10]}>
                    <sphereGeometry args={[0.2, 16, 16]} />
                    <meshBasicMaterial color={trailColor} toneMapped={false} transparent opacity={0.8} />
                    
                    {/* Dynamic Light that illuminates the tree locally */}
                    <pointLight 
                        intensity={10.0} 
                        distance={15} 
                        color={trailColor} 
                        decay={2}
                    />
                </mesh>
            </Trail>
        </group>
    );
};

// --- Shockwave Effect ---
const Shockwave = ({ explodeRef, theme }: { explodeRef: React.MutableRefObject<number>, theme: ThemeMode }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const prevExplodeRef = useRef(0);
    const activeWaveRef = useRef(0); // 0 = inactive, 1 = full expansion

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // Detect rapid expansion (Opening hand)
        const current = explodeRef.current;
        const deltaExplode = current - prevExplodeRef.current;
        
        if (deltaExplode > 0.05 && activeWaveRef.current < 0.1) {
            activeWaveRef.current = 1.0; // Trigger wave
        }
        prevExplodeRef.current = current;

        // Animate wave
        if (activeWaveRef.current > 0) {
            const progress = 1.0 - activeWaveRef.current; // 0 to 1
            const scale = 5 + (progress * 30);
            
            meshRef.current.scale.set(scale, scale, scale);
            meshRef.current.rotation.x = Math.PI / 2;
            
            // Fade out
            const material = meshRef.current.material as THREE.MeshBasicMaterial;
            material.opacity = activeWaveRef.current * 0.5; // Max opacity 0.5
            
            activeWaveRef.current -= delta * 1.5; // Decay speed
            if (activeWaveRef.current < 0) activeWaveRef.current = 0;
            
            meshRef.current.visible = true;
        } else {
            meshRef.current.visible = false;
        }
    });

    return (
        <mesh ref={meshRef} visible={false}>
            <ringGeometry args={[0.8, 1, 64]} />
            <meshBasicMaterial 
                color={theme === 'warm' ? "#FFD700" : "#00FFFF"} 
                transparent 
                side={THREE.DoubleSide} 
                blending={THREE.AdditiveBlending} 
            />
        </mesh>
    );
};

// --- Floating Words ---
const FloatingWords = ({ theme, customWords }: { theme: ThemeMode, customWords: string[] }) => {
    const groupRef = useRef<THREE.Group>(null);
    
    // Use custom words if available, else use default theme words
    const defaultWords = theme === 'warm' 
        ? ["JOY", "WEALTH", "LUXURY", "2025"] 
        : ["PEACE", "DREAMS", "FUTURE", "NOËL"];
    
    const words = customWords.length > 0 ? customWords : defaultWords;
    
    useFrame((state) => {
        if (groupRef.current) {
            // Slow elegant rotation
            groupRef.current.rotation.y = state.clock.elapsedTime * 0.15;
            
            // Bobbing motion for the whole group
            groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
        }
    });

    return (
        <group ref={groupRef}>
            {words.map((word, i) => {
                const angle = (i / words.length) * Math.PI * 2;
                const radius = 14; // Slightly larger radius to ensure they don't clip inside tree
                const y = (i - (words.length - 1)/2) * 3.5; // More vertical spread
                return (
                    <Float key={`${word}-${i}`} speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
                        <group position={[Math.cos(angle) * radius, y, Math.sin(angle) * radius]} rotation={[0, -angle, 0]}>
                            <Text
                                fontSize={2.5} // Larger text
                                letterSpacing={0.1}
                                color={theme === 'warm' ? "#FFD700" : "#E0F7FA"}
                                anchorX="center"
                                anchorY="middle"
                                outlineWidth={0.05}
                                outlineColor={theme === 'warm' ? "#553300" : "#003344"}
                            >
                                {word}
                                <meshStandardMaterial 
                                    emissive={theme === 'warm' ? "#FFA500" : "#00FFFF"} 
                                    emissiveIntensity={2.0} 
                                    toneMapped={false} 
                                />
                            </Text>
                        </group>
                    </Float>
                )
            })}
        </group>
    )
}

// --- Ornaments Component ---
const DynamicOrnaments: React.FC<{ explodeRef: React.MutableRefObject<number>, theme: ThemeMode }> = ({ explodeRef, theme }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const tempObj = useMemo(() => new THREE.Object3D(), []);
    
    // Generate initial data (positions only)
    const { initialData } = useMemo(() => {
        const data = [];
        for (let i = 0; i < DECO_COUNT; i++) {
             const y = (Math.random() - 0.5) * TREE_HEIGHT;
             const rMax = getTreeRadiusAtHeight(y);
             const r = rMax * (0.8 + Math.random() * 0.2); 
             const theta = Math.random() * Math.PI * 2;
             
             const pos = new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));
             const rot = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0);
             const scale = Math.random() * 0.15 + 0.1;
             const normal = pos.clone().setY(0).normalize();
             
             data.push({ pos, rot, scale, normal });
        }
        return { initialData: data };
    }, []);

    // Update colors when theme changes - Use LayoutEffect to ensure it runs before paint
    useLayoutEffect(() => {
        if(meshRef.current) {
            const c = new THREE.Color();
            // Warm: Gold, Silver, Red, Bronze
            const warmPalette = ['#FFD700', '#E5E4E2', '#B22222', '#CD7F32'];
            // Cool: Cyan, White, DeepBlue, Purple
            const coolPalette = ['#00FFFF', '#FFFFFF', '#1E90FF', '#9370DB'];
            
            const palette = theme === 'warm' ? warmPalette : coolPalette;

            for(let i=0; i<DECO_COUNT; i++) {
                // Use deterministic random based on index to keep patterns stable-ish
                const colorIdx = (i * 1234) % palette.length;
                c.set(palette[colorIdx]);
                meshRef.current.setColorAt(i, c);
            }
            if (meshRef.current.instanceColor) {
                meshRef.current.instanceColor.needsUpdate = true;
            }
        }
    }, [theme]);

    useFrame((state) => {
        if (!meshRef.current) return;
        
        const explodeFactor = explodeRef.current;
        const expansionStrength = 12.0; 

        for (let i = 0; i < DECO_COUNT; i++) {
            const { pos, rot, scale, normal } = initialData[i];
            
            tempObj.position.copy(pos);
            tempObj.rotation.copy(rot);
            tempObj.scale.setScalar(scale);

            if (explodeFactor > 0.001) {
                tempObj.position.addScaledVector(normal, explodeFactor * expansionStrength);
                tempObj.position.y *= (1 + explodeFactor * 0.2);
                
                if (explodeFactor > 0.2) {
                    const time = state.clock.elapsedTime;
                    const floatY = Math.sin(time * 0.5 + i) * 0.2 * explodeFactor;
                    tempObj.position.y += floatY;
                    tempObj.rotation.x += Math.sin(time * 0.2 + i) * 0.05 * explodeFactor;
                    tempObj.rotation.y += Math.cos(time * 0.2 + i) * 0.05 * explodeFactor;
                }
            }

            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(i, tempObj.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, DECO_COUNT]} frustumCulled={false}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshPhysicalMaterial roughness={0.1} metalness={1.0} envMapIntensity={3.0} />
        </instancedMesh>
    );
};

// --- Meteor System ---
const ShootingMeteors = ({ theme }: { theme: ThemeMode }) => {
    const meteorRef = useRef<THREE.Group>(null);
    const [meteors] = useState(() => Array.from({ length: 5 }).map(() => ({
        pos: new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 50 + 20,
            (Math.random() - 0.5) * 50 - 20
        ),
        speed: 0.6 + Math.random() * 0.8,
        delay: Math.random() * 800
    })));

    useFrame((_, delta) => {
        if (!meteorRef.current) return;
        meteorRef.current.children.forEach((child, i) => {
            const m = meteors[i];
            if (m.delay > 0) {
                m.delay -= 1;
                child.visible = false;
                return;
            }
            child.visible = true;
            child.position.x -= m.speed; 
            child.position.y -= m.speed * 0.15;
            if (child.position.x < -80) {
                child.position.set(60 + Math.random() * 40, 20 + Math.random() * 30, (Math.random() - 0.5) * 60);
                m.delay = Math.random() * 500;
            }
        });
    });

    return (
        <group ref={meteorRef}>
            {meteors.map((_, i) => (
                <mesh key={i}>
                    <cylinderGeometry args={[0.05, 0, 8, 4]} />
                    <meshBasicMaterial 
                        color={theme === 'warm' ? "#FFF" : "#00FFFF"} 
                        transparent 
                        opacity={0.6} 
                        blending={THREE.AdditiveBlending} 
                    />
                    <group rotation={[0, 0, Math.PI / 2 + 0.15]} />
                </mesh>
            ))}
        </group>
    );
}

// --- Gold Dust ---
const GoldDust = ({ brightness, explodeRef, theme }: { brightness: number, explodeRef: React.MutableRefObject<number>, theme: ThemeMode }) => {
    const count = 1500;
    const meshRef = useRef<THREE.Points>(null);
    const geometryRef = useRef<THREE.BufferGeometry>(null);
    const { initialPositions, velocities } = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
            pos[i*3] = (Math.random() - 0.5) * 40;
            pos[i*3+1] = (Math.random() - 0.5) * 40;
            pos[i*3+2] = (Math.random() - 0.5) * 30; 
            vel[i*3] = (Math.random() - 0.5) * 0.02;
            vel[i*3+1] = (Math.random() - 0.5) * 0.02;
            vel[i*3+2] = (Math.random() - 0.5) * 0.02;
        }
        return { initialPositions: pos, velocities: vel };
    }, []);
    const renderPositions = useMemo(() => new Float32Array(initialPositions), [initialPositions]);

    // Use a local vec3 to track cursor/hand attraction point
    const attractionPoint = useRef(new THREE.Vector3(0, 0, 0));
    const { camera, pointer } = useThree();

    useFrame((state, delta) => {
        if (!meshRef.current || !geometryRef.current) return;
        const explodeFactor = explodeRef.current;
        const expansionScale = 1.0 + (explodeFactor * 2.5); 
        const driftFactor = explodeFactor;

        // Get Vision Data from Store
        const { isHandDetected, handPosition } = useVisionStore.getState();

        // Calculate Attraction Target
        if (isHandDetected) {
            // Hand Mode: Stronger attraction to hand
            attractionPoint.current.lerp(handPosition, 0.1);
        } else {
            // Mouse Mode: Project mouse to Z=0 plane
            const vec = new THREE.Vector3(pointer.x, pointer.y, 0.5);
            vec.unproject(camera);
            const dir = vec.sub(camera.position).normalize();
            const distance = -camera.position.z / dir.z;
            const pos = camera.position.clone().add(dir.multiplyScalar(distance));
            attractionPoint.current.lerp(pos, 0.1);
        }

        const attrPos = attractionPoint.current;

        for(let i=0; i<count; i++) {
            const ix = i*3;
            const iy = i*3+1;
            const iz = i*3+2;
            let targetX = initialPositions[ix] * expansionScale;
            let targetY = initialPositions[iy] * expansionScale;
            let targetZ = initialPositions[iz] * expansionScale;

            // Base drift logic
            if (driftFactor > 0.1) {
                velocities[ix] += (Math.random() - 0.5) * 0.005;
                velocities[iy] += (Math.random() - 0.5) * 0.005;
                velocities[iz] += (Math.random() - 0.5) * 0.005;
            }

            // Attraction Logic (Magical Gold Dust)
            const currentX = renderPositions[ix];
            const currentY = renderPositions[iy];
            const currentZ = renderPositions[iz];

            // Dist to attraction point
            const dx = attrPos.x - currentX;
            const dy = attrPos.y - currentY;
            const dz = attrPos.z - currentZ;
            const distSq = dx*dx + dy*dy + dz*dz;
            
            // Attract if close enough or if hand detected (stronger pull)
            const attractRange = isHandDetected ? 400 : 100;
            const attractStrength = isHandDetected ? 0.02 : 0.005;

            if (distSq < attractRange) {
                 velocities[ix] += dx * attractStrength;
                 velocities[iy] += dy * attractStrength;
                 velocities[iz] += dz * attractStrength;
            }

            // Return to base shape spring
            const springStrength = 0.02 - (explodeFactor * 0.015); 

            velocities[ix] += (targetX - currentX) * springStrength;
            velocities[iy] += (targetY - currentY) * springStrength;
            velocities[iz] += (targetZ - currentZ) * springStrength;

            renderPositions[ix] += velocities[ix];
            renderPositions[iy] += velocities[iy];
            renderPositions[iz] += velocities[iz];

            const friction = explodeFactor < 0.1 ? 0.92 : 0.96;
            velocities[ix] *= friction;
            velocities[iy] *= friction;
            velocities[iz] *= friction;
        }
        geometryRef.current.attributes.position.needsUpdate = true;
        meshRef.current.rotation.y += delta * 0.02;
    });

    return (
        <points ref={meshRef} frustumCulled={false}>
            <bufferGeometry ref={geometryRef}>
                <bufferAttribute attach="attributes-position" count={count} array={renderPositions} itemSize={3} />
            </bufferGeometry>
            <PointMaterial 
                transparent 
                color={theme === 'warm' ? "#FDB931" : "#E0F7FA"} 
                size={0.2} 
                sizeAttenuation={true} 
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
                opacity={0.6 * brightness} 
                toneMapped={false} 
            />
        </points>
    );
};

// --- God Hand Logic ---
const useGodHandControls = (
    ref: React.RefObject<THREE.Group>, 
    visualExplodeFactor: number,
    isGalleryMode: boolean
) => {
    const { camera } = useThree();
    const smoothedHand = useRef(new THREE.Vector2(0, 0));
    
    useFrame((state, delta) => {
        if (!ref.current || isGalleryMode) return; 

        const { isHandDetected, handPosition } = useVisionStore.getState();

        let targetX = 0;
        let targetY = 0;

        if (isHandDetected) {
            targetX = THREE.MathUtils.clamp(handPosition.x / 10, -1, 1);
            targetY = THREE.MathUtils.clamp(handPosition.y / 10, -1, 1);
        } 

        smoothedHand.current.x = THREE.MathUtils.lerp(smoothedHand.current.x, targetX, delta * 5);
        smoothedHand.current.y = THREE.MathUtils.lerp(smoothedHand.current.y, targetY, delta * 5);

        const influence = THREE.MathUtils.lerp(1.0, 0.3, visualExplodeFactor);

        if (isHandDetected) {
            const MAX_ANGLE = Math.PI * 0.5; 
            const targetRotationY = smoothedHand.current.x * MAX_ANGLE * influence;
            ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotationY, delta * 4.0);

            // Subtle parallax on camera Y
            const PARALLAX_HEIGHT = 4.0 * influence; 
            const targetCamY = -(smoothedHand.current.y * PARALLAX_HEIGHT);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, delta * 2.0);
            camera.lookAt(0, 0, 0);
        } else {
            // Idle rotation
            ref.current.rotation.y += delta * 0.05;
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, delta * 1.0);
            camera.lookAt(0, 0, 0);
        }
    });
};

// --- PHOTO ITEM ---
const PhotoItem: React.FC<{ 
    url: string; 
    index: number;
    total: number;
    parentRef: React.RefObject<THREE.Group>;
    explodeRef: React.MutableRefObject<number>; 
    isSnapRef: React.MutableRefObject<boolean>;
    galleryLerpRef: React.MutableRefObject<number>; // 0 = Tree, 1 = Gallery
    galleryRotationRef: React.MutableRefObject<number>;
    theme: ThemeMode;
}> = ({ url, index, total, parentRef, explodeRef, isSnapRef, galleryLerpRef, galleryRotationRef, theme }) => {
    const meshRef = useRef<THREE.Group>(null);
    const [hovered, setHover] = useState(false);

    // Calculate TREE position (Spiral)
    const { initialPos, initialRot, surfaceNormal } = useMemo(() => {
        const t = index / Math.max(total - 1, 1);
        const y = THREE.MathUtils.lerp(TREE_HEIGHT/2 - 2, -TREE_HEIGHT/2 + 2, t);
        const rSurface = getTreeRadiusAtHeight(y);
        const r = rSurface + 0.8; 
        const loops = 5; 
        const theta = t * loops * Math.PI * 2;
        const pos = new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));

        const dummy = new THREE.Object3D();
        dummy.position.copy(pos);
        dummy.lookAt(0, y, 0); 
        dummy.rotateY(Math.PI); 
        dummy.rotateX(THREE.MathUtils.lerp(-0.3, 0.1, t));
        dummy.updateMatrix();

        return { 
            initialPos: pos, 
            initialRot: dummy.quaternion.clone(),
            surfaceNormal: pos.clone().normalize().setY(0).normalize() 
        };
    }, [index, total]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        const visualExplodeFactor = explodeRef.current;
        const galleryFactor = galleryLerpRef.current;
        const isSnap = isSnapRef.current;
        const lerpSpeed = isSnap ? 0.3 : 0.08;

        // --- 1. Calculate TREE MODE Target ---
        const treeTargetPos = initialPos.clone();
        // Scatter for Tree Explode
        const pushDist = 18.0 * visualExplodeFactor; 
        treeTargetPos.add(surfaceNormal.clone().multiplyScalar(pushDist));
        treeTargetPos.y *= (1.0 + visualExplodeFactor * 0.4); 
        if (visualExplodeFactor > 0.1) {
             const time = state.clock.elapsedTime;
             const bob = Math.sin(time * 0.5 + index) * 0.5 * visualExplodeFactor;
             treeTargetPos.y += bob;
        }

        // --- 2. Calculate GALLERY MODE Target ---
        const galleryRadius = 14.0;
        const anglePerPhoto = (Math.PI * 2) / Math.max(total, 8);
        const baseAngle = index * anglePerPhoto + galleryRotationRef.current; // Apply drag rotation
        
        const galleryX = Math.sin(baseAngle) * galleryRadius;
        const galleryZ = Math.cos(baseAngle) * galleryRadius;
        const galleryY = Math.sin(baseAngle * 3 + state.clock.elapsedTime * 0.5) * 2.5; 
        
        const galleryTargetPos = new THREE.Vector3(galleryX, galleryY, galleryZ);

        // --- 3. BLEND (Tree vs Gallery) ---
        const finalPos = new THREE.Vector3().lerpVectors(treeTargetPos, galleryTargetPos, galleryFactor);
        meshRef.current.position.lerp(finalPos, lerpSpeed);

        // --- 4. Rotation & Scale ---
        if (galleryFactor > 0.5) {
            meshRef.current.lookAt(0, galleryY, 0); // Look at center spine
            meshRef.current.rotateY(Math.PI); // Flip to face inward/camera

            const normalizedAngle = (baseAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            const distFromFocus = Math.min(Math.abs(normalizedAngle), Math.abs(normalizedAngle - Math.PI*2));
            const isFocused = distFromFocus < 0.5;
            
            const scale = isFocused ? 1.8 : 1.2;
            meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);

        } else if (visualExplodeFactor > 0.5) {
            const targetRot = state.camera.position.clone();
            meshRef.current.lookAt(targetRot);
            
            const baseScale = 0.6; 
            const explodeBoost = 1.2 * visualExplodeFactor; 
            const breathe = Math.sin(state.clock.elapsedTime * 1.5 + index) * 0.05;
            const hoverScale = hovered ? 1.1 : 1.0;
            const s = (baseScale + explodeBoost + breathe) * hoverScale;
            meshRef.current.scale.lerp(new THREE.Vector3(s,s,s), lerpSpeed);
            meshRef.current.rotation.z += Math.sin(state.clock.elapsedTime * 0.5 + index) * 0.002;
        } else {
            meshRef.current.quaternion.slerp(initialRot, lerpSpeed);
            meshRef.current.scale.lerp(new THREE.Vector3(0.6, 0.6, 0.6), lerpSpeed);
        }
    });

    return (
        <group ref={meshRef}>
            <mesh position={[0, 0, -0.02]}>
                <boxGeometry args={[1.4, 1.7, 0.05]} />
                <meshPhysicalMaterial 
                    color={theme === 'warm' ? "#FFFFFF" : "#E0F7FA"} 
                    roughness={0.4} 
                    metalness={0.0} 
                />
            </mesh>
            <Image url={url} position={[0, 0, 0.03]} scale={[1.2, 1.5]} transparent opacity={1} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} />
        </group>
    );
};

// --- Active Photo Overlay (Bi-directional Animation) ---
const ActivePhotoOverlay: React.FC<{ 
    url: string; 
    startPos: THREE.Vector3; 
    theme: ThemeMode;
    isVisible: boolean; // Controls In/Out
    onExited: () => void; // Triggered when animation completes 'Out'
}> = ({ url, startPos, theme, isVisible, onExited }) => {
    const meshRef = useRef<THREE.Group>(null);
    const progress = useRef(0); // 0 = at Tree, 1 = at Screen
    const { camera } = useThree();

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        // Target: 1 if visible, 0 if hidden
        const target = isVisible ? 1.0 : 0.0;
        // Faster out, smoother in
        const speed = isVisible ? 3.0 : 4.0;
        
        progress.current = THREE.MathUtils.lerp(progress.current, target, delta * speed);

        // If we are effectively zero and wanted to be zero, tell parent we exited
        if (!isVisible && progress.current < 0.01) {
            onExited();
            return;
        }

        const t = progress.current;
        const easeT = 1 - Math.pow(1 - t, 3); // Cubic ease out

        // 1. Calculate Path
        const treeCenter = new THREE.Vector3(0, -2, 0);
        const relStart = startPos.clone().sub(treeCenter);
        const r0 = Math.sqrt(relStart.x*relStart.x + relStart.z*relStart.z);
        const theta0 = Math.atan2(relStart.z, relStart.x);
        
        // Final position: In front of camera
        const pFinal = state.camera.position.clone().add(state.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
        const relEnd = pFinal.clone().sub(treeCenter);
        const r1 = Math.sqrt(relEnd.x*relEnd.x + relEnd.z*relEnd.z);
        const theta1 = Math.atan2(relEnd.z, relEnd.x);
        
        // Find shortest rotation path
        let targetTheta = theta1;
        while(targetTheta < theta0 - Math.PI) targetTheta += Math.PI * 2;
        while(targetTheta > theta0 + Math.PI) targetTheta -= Math.PI * 2;
        
        const curTheta = THREE.MathUtils.lerp(theta0, targetTheta, easeT);
        const curR = THREE.MathUtils.lerp(r0, r1, easeT);
        const yLinear = THREE.MathUtils.lerp(relStart.y, relEnd.y, easeT);
        const yArc = Math.sin(easeT * Math.PI) * 2.0; 
        const curY = yLinear + yArc;
        
        const x = curR * Math.cos(curTheta);
        const z = curR * Math.sin(curTheta);
        
        meshRef.current.position.set(x + treeCenter.x, curY + treeCenter.y, z + treeCenter.z);
        
        // 2. Rotation & Scale
        const startRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, curTheta + Math.PI, 0)); // Face outward initially
        const targetRot = camera.quaternion.clone();
        
        meshRef.current.quaternion.slerpQuaternions(startRot, targetRot, easeT);
        
        // Scale down when returning
        const scale = 0.1 + (0.9 * easeT);
        meshRef.current.scale.setScalar(scale);
    });

    return (
        <group renderOrder={999}>
            <group ref={meshRef}>
                 {/* Trail that appears during flight */}
                 <Trail width={1.2} length={6} color={theme === 'warm' ? "#FFD700" : "#00FFFF"} attenuation={(t) => t * t}>
                    <mesh><sphereGeometry args={[0.05, 8, 8]} /><meshBasicMaterial color={theme === 'warm' ? "gold" : "cyan"} transparent opacity={0} depthTest={false} /></mesh>
                 </Trail>
                 <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2} floatingRange={[-0.1, 0.1]}>
                    <mesh position={[0, 0, 0.05]} renderOrder={999}>
                        <boxGeometry args={[1.0, 1.25, 0.05]} />
                        <meshPhysicalMaterial 
                            color="#FFF" 
                            roughness={0.2} 
                            metalness={0.1} 
                            emissive={theme === 'warm' ? "#FFD700" : "#00FFFF"} 
                            emissiveIntensity={0.1 * (isVisible ? 1 : 0)} 
                            depthTest={false} 
                        />
                        <Image url={url} position={[0, 0, 0.06]} scale={[0.9, 1.15]} toneMapped={false} renderOrder={1000} />
                    </mesh>
                </Float>
            </group>
        </group>
    );
};

// --- PHOTO GALLERY COMPONENT (ISOLATED SUSPENSE) ---
const PhotoGallery: React.FC<{
    photos: string[];
    parentRef: React.RefObject<THREE.Group>;
    visualExplodeRef: React.MutableRefObject<number>;
    isSnapRef: React.MutableRefObject<boolean>;
    galleryLerpRef: React.MutableRefObject<number>;
    galleryRotationRef: React.MutableRefObject<number>;
    theme: ThemeMode;
}> = ({ photos, parentRef, visualExplodeRef, isSnapRef, galleryLerpRef, galleryRotationRef, theme }) => {
    return (
        <group>
           {photos.length === 0 && Array.from({ length: 24 }).map((_, i) => (
               <PhotoItem 
                  key={`p-${i}`}
                  url={`https://picsum.photos/seed/${i + 900}/400/500`} 
                  index={i}
                  total={24}
                  parentRef={parentRef}
                  explodeRef={visualExplodeRef}
                  isSnapRef={isSnapRef}
                  galleryLerpRef={galleryLerpRef}
                  galleryRotationRef={galleryRotationRef}
                  theme={theme}
               />
           ))}
           {photos.map((url, i) => (
               <PhotoItem 
                  key={`u-${i}`}
                  url={url} 
                  index={i}
                  total={photos.length}
                  parentRef={parentRef}
                  explodeRef={visualExplodeRef}
                  isSnapRef={isSnapRef}
                  galleryLerpRef={galleryLerpRef}
                  galleryRotationRef={galleryRotationRef}
                  theme={theme}
               />
           ))}
        </group>
    );
}

// --- Main Tree Scene ---
const TreeScene: React.FC<TreeSceneProps> = ({ settings, photos, manualExplodeFactor, isGalleryMode, customWords }) => {
  const { sourcePositions, colors } = useTreeParticles(settings.theme, settings.treeColor);
  const renderPositions = useMemo(() => new Float32Array(sourcePositions), [sourcePositions]);
  const particleSystemRef = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const visualExplodeRef = useRef(0);
  const isSnapRef = useRef(false);

  // Gallery Mode Refs
  const galleryLerpRef = useRef(0);
  const galleryRotationRef = useRef(0);
  
  // Drag Control Logic
  const isDragging = useRef(false);
  const prevPointerX = useRef(0);
  const { gl } = useThree();

  useEffect(() => {
      // Simple Drag Handler
      const handleDown = (e: PointerEvent) => {
          if (!isGalleryMode) return;
          isDragging.current = true;
          prevPointerX.current = e.clientX;
      };
      const handleMove = (e: PointerEvent) => {
          if (!isDragging.current || !isGalleryMode) return;
          const deltaX = e.clientX - prevPointerX.current;
          galleryRotationRef.current += deltaX * 0.005; // Adjust sensitivity
          prevPointerX.current = e.clientX;
      };
      const handleUp = () => {
          isDragging.current = false;
      };

      gl.domElement.addEventListener('pointerdown', handleDown);
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);

      return () => {
          gl.domElement.removeEventListener('pointerdown', handleDown);
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
      }
  }, [isGalleryMode, gl]);

  // Animation Loop
  useFrame((state, delta) => {
      // 1. Gallery Mode Transition
      const targetGalleryLerp = isGalleryMode ? 1 : 0;
      galleryLerpRef.current = THREE.MathUtils.lerp(galleryLerpRef.current, targetGalleryLerp, delta * 2.0);

      // Auto Rotate Gallery if not dragging
      if (isGalleryMode && !isDragging.current) {
          galleryRotationRef.current += delta * 0.1;
      }

      // 2. Explode Logic - BLEND HAND + MANUAL
      const { isHandDetected, gestureFactor } = useVisionStore.getState();
      
      // If hand detected, gesture factor dominates (0=Fist/Tree, 1=Open/Explode)
      // If not, manual slider dominates
      let effectiveTargetExplode = manualExplodeFactor;
      if (isHandDetected) {
          effectiveTargetExplode = Math.max(manualExplodeFactor, gestureFactor);
      }
      
      const currentVal = visualExplodeRef.current;
      const isClosing = effectiveTargetExplode < currentVal;
      isSnapRef.current = isClosing;
      const lerpSpeed = isClosing ? 5.0 * delta : 0.6 * delta; 
      visualExplodeRef.current = THREE.MathUtils.lerp(currentVal, effectiveTargetExplode, lerpSpeed);
      const vFactor = visualExplodeRef.current;

      // 3. Particles Update
      if (geometryRef.current) {
          const expansionStrength = 9.0; 
          for(let i=0; i<COUNT; i++) {
              const ix = i*3; const iy = i*3+1; const iz = i*3+2;
              const ox = sourcePositions[ix]; const oy = sourcePositions[iy]; const oz = sourcePositions[iz];
              const dist = Math.sqrt(ox*ox + oz*oz);
              const nx = ox / (dist || 1); const nz = oz / (dist || 1);
              renderPositions[ix] = ox + (nx * vFactor * expansionStrength);
              renderPositions[iy] = oy * (1 + vFactor * 0.3); 
              renderPositions[iz] = oz + (nz * vFactor * expansionStrength);
          }
          geometryRef.current.attributes.position.needsUpdate = true;
      }
  });

  const groupRef = useRef<THREE.Group>(null);
  const [featuredIndex, setFeaturedIndex] = useState<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  
  const sequenceCounter = useRef(0);
  const lastActionTime = useRef(0);
  const wasGesturing = useRef(false);
  const idleTimer = useRef(0);
  const [summonStartPos, setSummonStartPos] = useState<THREE.Vector3>(new THREE.Vector3(0,0,0));

  useFrame((state, delta) => {
      if (isGalleryMode) {
          if (featuredIndex !== null) setFeaturedIndex(null);
          return;
      }

      const now = Date.now();
      const { gesture, isHandDetected } = useVisionStore.getState(); 
      const isVictory = gesture === GestureState.VICTORY;
      const isFist = gesture === GestureState.CLOSED_FIST;
      const isOpen = gesture === GestureState.OPEN_PALM;
      
      // --- TRIGGER SUMMON (Victory) ---
      if (isVictory && !wasGesturing.current && (now - lastActionTime.current > 1000)) {
          // Only trigger if not already showing one, OR if we want to switch
          if (!overlayVisible) {
              const displayCount = photos.length > 0 ? photos.length : 24;
              const nextIdx = sequenceCounter.current % displayCount;
              setFeaturedIndex(nextIdx);
              
              if (groupRef.current) {
                  // Calculate spawn position
                  const t = nextIdx / Math.max(displayCount - 1, 1);
                  const y = THREE.MathUtils.lerp(TREE_HEIGHT/2 - 2, -TREE_HEIGHT/2 + 2, t);
                  const rSurface = getTreeRadiusAtHeight(y);
                  const r = rSurface + 0.8;
                  const theta = t * 5 * Math.PI * 2;
                  const localPos = new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));
                  const vFactor = visualExplodeRef.current;
                  const expansionStrength = 9.0; 
                  const normal = localPos.clone().setY(0).normalize();
                  localPos.addScaledVector(normal, vFactor * expansionStrength);
                  localPos.y *= (1 + vFactor * 0.3);
                  localPos.applyMatrix4(groupRef.current.matrixWorld); 
                  setSummonStartPos(localPos);
              }
              sequenceCounter.current += 1;
              lastActionTime.current = now;
              setOverlayVisible(true);
              idleTimer.current = 0; // Reset idle timer
          }
      }

      // --- TRIGGER DISMISS (Fist / Open / Time) ---
      if (overlayVisible) {
          // 1. Explicit Dismissal
          if (isFist || isOpen) {
               setOverlayVisible(false);
          }
          // 2. Timeout Dismissal
          if (!isVictory) {
               idleTimer.current += delta;
               if (idleTimer.current > 4.0) { // 4 Seconds timeout if not holding gesture
                   setOverlayVisible(false);
               }
          } else {
              idleTimer.current = 0; // Reset if user does Victory again
          }
      }

      wasGesturing.current = isVictory;
  });

  useGodHandControls(groupRef, visualExplodeRef.current, isGalleryMode);

  const activePhotoUrl = useMemo(() => {
      if (featuredIndex === null) return null;
      if (photos.length === 0) return `https://picsum.photos/seed/${featuredIndex + 900}/400/500`;
      return photos[featuredIndex];
  }, [featuredIndex, photos]);

  return (
    <>
      <Environment preset={settings.theme === 'warm' ? "city" : "dawn"} />
      <Stars radius={80} depth={50} count={8000} factor={6} saturation={0} fade speed={0.5} />
      <ShootingMeteors theme={settings.theme} />
      <Sparkles 
        count={500} 
        scale={40} 
        size={4} 
        speed={0.4} 
        opacity={0.5} 
        color={settings.theme === 'warm' ? "#FFF" : "#A5F2F3"} 
      />

      {/* NEW: Magic Wand / Interactive Light Cursor */}
      <MagicWand theme={settings.theme} />

      <OrbitControls 
          enablePan={false} 
          enableZoom={true} 
          enableRotate={!isGalleryMode} 
          minDistance={10} 
          maxDistance={50} 
      />
      
      <ambientLight intensity={0.2} color={settings.theme === 'warm' ? "#001100" : "#000022"} />
      <pointLight 
        position={[20, 10, 20]} 
        intensity={3.0} 
        color={settings.theme === 'warm' ? "#FFD700" : "#00FFFF"} 
        distance={60} 
        decay={2} 
      />
      <pointLight 
        position={[-20, 5, 15]} 
        intensity={2.0} 
        color={settings.theme === 'warm' ? "#00ff88" : "#9370DB"} 
        distance={50} 
        decay={2} 
      />
      <spotLight position={[0, 40, 0]} angle={0.5} penumbra={1} intensity={5} color="#fff" castShadow />

      <group ref={groupRef} position={[0, -2, 0]}>
        {/* 1. Foliage - Renders Immediately */}
        <points ref={particleSystemRef} frustumCulled={false}>
             <bufferGeometry ref={geometryRef}>
                <bufferAttribute attach="attributes-position" count={COUNT} array={renderPositions} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={COUNT} array={colors} itemSize={3} />
             </bufferGeometry>
             <PointMaterial 
                transparent 
                vertexColors 
                size={0.25} 
                sizeAttenuation={true} 
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
                toneMapped={false} 
                opacity={0.8 * settings.particleBrightness} 
             />
        </points>

        {/* 2. Ornaments - Renders Immediately */}
        <DynamicOrnaments explodeRef={visualExplodeRef} theme={settings.theme} />
        
        {/* 3. Photos - Suspended to prevent blocking */}
        <Suspense fallback={null}>
             <PhotoGallery 
                photos={photos}
                parentRef={groupRef}
                visualExplodeRef={visualExplodeRef}
                isSnapRef={isSnapRef}
                galleryLerpRef={galleryLerpRef}
                galleryRotationRef={galleryRotationRef}
                theme={settings.theme}
             />
        </Suspense>
        
        {/* 4. Topper */}
        <mesh position={[0, TREE_HEIGHT / 2 + 0.6, 0]}>
            <octahedronGeometry args={[1.5, 0]} />
            <meshBasicMaterial color={settings.theme === 'warm' ? "#FFD700" : "#00FFFF"} toneMapped={false} />
            <Sparkles count={20} scale={3} size={10} speed={2} color={settings.theme === 'warm' ? "#FFD700" : "#FFFFFF"} />
            <pointLight intensity={5} distance={20} color={settings.theme === 'warm' ? "#FFD700" : "#00FFFF"} decay={2} />
        </mesh>
      </group>
      
      {/* 5. Shockwave Ring on Explode */}
      <Shockwave explodeRef={visualExplodeRef} theme={settings.theme} />
      
      {/* 6. Floating Words - Suspended & Font Removed */}
      <Suspense fallback={null}>
         <FloatingWords theme={settings.theme} customWords={customWords} />
      </Suspense>

      <Suspense fallback={null}>
        {featuredIndex !== null && activePhotoUrl && !isGalleryMode && (
            <ActivePhotoOverlay 
               key={featuredIndex} 
               url={activePhotoUrl} 
               // Only unmount when animation completes
               onExited={() => setFeaturedIndex(null)}
               isVisible={overlayVisible}
               startPos={summonStartPos}
               theme={settings.theme}
            />
        )}
      </Suspense>
      
      {/* 7. Gold/Ice Dust */}
      <GoldDust brightness={settings.particleBrightness} explodeRef={visualExplodeRef} theme={settings.theme} />
    </>
  );
};

export default TreeScene;
