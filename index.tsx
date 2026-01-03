
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- Constants ---
const MAX_WATER = 100;
const MAX_HEALTH = 100;
const GROWTH_SPEED = 0.05;
const WATER_LOSS_RATE = 0.15;
const SUNLIGHT_CHANGE_RATE = 0.4;
const REST_CHANGE_RATE = 0.4;
const NATURAL_DECAY = 0.2;
const HELPER_WATER_BOOST = 40;
const SIDE_GARDEN_FAST_GROWTH = 1.2;

// --- Utilities ---
const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => {
    const res = a.clone();
    res.lerp(b, t);
    return res;
};

// --- Water Well ---
class WaterWell {
    group: THREE.Group;
    constructor() {
        this.group = new THREE.Group();
        this.group.position.set(-4, 0, -2);
        const stoneGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.6, 12);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.9 });
        const base = new THREE.Mesh(stoneGeo, stoneMat);
        base.position.y = 0.3;
        base.castShadow = true;
        base.receiveShadow = true;
        this.group.add(base);
        const waterGeo = new THREE.CircleGeometry(0.7, 12);
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x03a9f4, roughness: 0, metalness: 0.5, emissive: 0x01579b, emissiveIntensity: 0.5 });
        const surface = new THREE.Mesh(waterGeo, waterMat);
        surface.rotation.x = -Math.PI / 2;
        surface.position.y = 0.55;
        this.group.add(surface);
        const postGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
        const postL = new THREE.Mesh(postGeo, postMat); postL.position.set(0.6, 0.9, 0);
        const postR = new THREE.Mesh(postGeo, postMat); postR.position.set(-0.6, 0.9, 0);
        this.group.add(postL, postR);
        const roofGeo = new THREE.ConeGeometry(1, 0.6, 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x4e342e });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 1.6;
        roof.rotation.y = Math.PI / 4;
        this.group.add(roof);
    }
}

// --- Side Garden ---
class SideGarden {
    group: THREE.Group;
    soil: THREE.Mesh;
    plants: Plant[];
    ages: number[];
    healths: number[];

    constructor() {
        this.group = new THREE.Group();
        this.group.position.set(4, 0, -3.5);
        const soilGeo = new THREE.BoxGeometry(2.5, 0.1, 1.5);
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
        this.soil = new THREE.Mesh(soilGeo, soilMat);
        this.soil.position.y = 0.05;
        this.soil.receiveShadow = true;
        this.group.add(this.soil);
        this.plants = [];
        this.ages = [0, 0, 0];
        this.healths = [80, 80, 80];
        for (let i = 0; i < 3; i++) {
            const p = new Plant(true);
            p.group.position.set((i - 1) * 0.7, 0, 0);
            p.group.scale.setScalar(0.5);
            this.group.add(p.group);
            this.plants.push(p);
        }
    }
    update(extAges?: number[], extHealths?: number[]) {
        if (extAges) this.ages = [...extAges];
        if (extHealths) this.healths = [...extHealths];
        this.plants.forEach((p, i) => p.update(this.ages[i], this.healths[i], 80, 0, false));
    }
}

// --- Garden Helper Character ---
class GardenHelper {
    group: THREE.Group;
    targetPosition: THREE.Vector3;
    isSelected: boolean = false;
    hasWater: boolean = false;
    speed: number = 0.08;
    body: THREE.Mesh;
    head: THREE.Mesh;
    waterDroplet: THREE.Mesh;

    constructor() {
        this.group = new THREE.Group();
        this.targetPosition = new THREE.Vector3(3, 0, 3);
        this.group.position.set(3, 0.5, 3);
        
        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.2;
        this.body.castShadow = true;
        this.group.add(this.body);

        const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xa1887f });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 0.5;
        this.head.castShadow = true;
        this.group.add(this.head);

        const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.08, 0.52, 0.15);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.08, 0.52, 0.15);
        this.group.add(eyeL, eyeR);

        const dropletGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const dropletMat = new THREE.MeshStandardMaterial({ color: 0x00b0ff, emissive: 0x0091ea, emissiveIntensity: 0.8 });
        this.waterDroplet = new THREE.Mesh(dropletGeo, dropletMat);
        this.waterDroplet.position.y = 1.0;
        this.waterDroplet.visible = false;
        this.group.add(this.waterDroplet);

        const ringGeo = new THREE.RingGeometry(0.4, 0.45, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, side: THREE.DoubleSide, transparent: true, opacity: 0 });
        const ring = new THREE.Mesh(ringGeo, ringMat); 
        ring.rotation.x = -Math.PI / 2; 
        ring.name = "selectionRing";
        this.group.add(ring);
    }

    updateSelection(selected: boolean) {
        this.isSelected = selected;
        const ring = this.group.getObjectByName("selectionRing") as THREE.Mesh;
        if (ring && ring.material instanceof THREE.Material) {
            ring.material.opacity = selected ? 0.8 : 0;
        }
    }

    setHasWater(val: boolean) { 
        this.hasWater = val; 
        this.waterDroplet.visible = val; 
    }

    update() {
        const hoverY = 0.6 + Math.sin(Date.now() * 0.003) * 0.1;
        this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, hoverY, 0.1);
        if (this.hasWater) { 
            this.waterDroplet.position.y = 1.0 + Math.sin(Date.now() * 0.005) * 0.05; 
            this.waterDroplet.rotation.y += 0.02; 
        }
        const dist = this.group.position.distanceTo(new THREE.Vector3(this.targetPosition.x, this.group.position.y, this.targetPosition.z));
        if (dist > 0.1) {
            const dir = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize(); dir.y = 0;
            this.group.lookAt(this.group.position.clone().add(dir));
            this.group.position.add(dir.multiplyScalar(this.speed));
        }
    }
}

// --- Plant System ---
class Plant {
    group: THREE.Group;
    pestsGroup: THREE.Group;
    stems: THREE.Mesh[] = [];
    leaves: THREE.Mesh[] = [];
    flower: THREE.Mesh | null = null;
    soil: THREE.Mesh | null = null;
    flowerColor: THREE.Color;
    isSmall: boolean;

    constructor(isSmall = false) {
        this.isSmall = isSmall;
        this.group = new THREE.Group();
        this.pestsGroup = new THREE.Group();
        this.group.add(this.pestsGroup);
        this.flowerColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
        
        if (!isSmall) {
            const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.6, 32);
            const potMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
            const pot = new THREE.Mesh(potGeo, potMat); pot.position.y = 0.3; pot.castShadow = true;
            this.group.add(pot);
            const soilGeo = new THREE.CircleGeometry(0.55, 32);
            const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 1 });
            this.soil = new THREE.Mesh(soilGeo, soilMat); this.soil.rotation.x = -Math.PI / 2; this.soil.position.y = 0.61;
            this.group.add(this.soil);
        }
    }

    update(age: number, health: number, water: number, pests: number, isDiseased: boolean) {
        const healthFactor = health / MAX_HEALTH;
        if (this.soil && this.soil.material instanceof THREE.MeshStandardMaterial) {
            this.soil.material.color.setHex(water < 20 ? 0x5a4636 : 0x2b1e15);
        }
        
        this.stems.forEach(s => this.group.remove(s)); 
        this.leaves.forEach(l => this.group.remove(l));
        if (this.flower) this.group.remove(this.flower); 
        this.pestsGroup.clear();
        this.stems = []; 
        this.leaves = [];

        let segments = age < 10 ? 1 : age < 30 ? 2 : age < 70 ? 4 : 6;
        const totalHeight = mapRange(age, 0, 100, 0.2, 3.5);
        const segmentHeight = totalHeight / segments;
        const baseThickness = mapRange(age, 0, 100, 0.04, 0.18);
        let currentY = this.isSmall ? 0.05 : 0.61;

        for (let i = 0; i < segments; i++) {
            const topT = (i + 1) / segments;
            const stemGeo = new THREE.CylinderGeometry(baseThickness * (1 - topT * 0.6), baseThickness * (1 - (i/segments) * 0.6), segmentHeight, 12);
            stemGeo.translate(0, segmentHeight / 2, 0);
            let stemColor = new THREE.Color(0x4caf50).lerp(new THREE.Color(0x8bc34a), topT).lerp(new THREE.Color(0x8b7355), 1 - healthFactor);
            if (isDiseased) stemColor.lerp(new THREE.Color(0x5d4037), 0.5);
            const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.7 }));
            stem.position.y = currentY; 
            stem.rotation.z = Math.sin(Date.now() * 0.001 + i * 0.5) * 0.02 * (i + 1) + (Math.max(0, (1 - water/100) * 0.8) * (i+1)/segments);
            stem.castShadow = true; 
            this.stems.push(stem); 
            this.group.add(stem);
            
            if (pests > 0 && (i + Math.random()) > (segments - (pests/2))) {
                this.addPestMarker(stem, segmentHeight, baseThickness * (1 - (i/segments) * 0.6));
            }
            if (age >= 15 && Math.random() < (0.4 + healthFactor * 0.4)) {
                this.addLeaf(stem, Math.random() * segmentHeight, i, healthFactor, isDiseased, Math.random() * Math.PI * 2);
            }
            currentY += segmentHeight * Math.cos(stem.rotation.z);
        }
        if (age >= 70 && health > 60) this.addFlower(currentY, healthFactor, isDiseased);
    }

    addPestMarker(p: THREE.Mesh, h: number, t: number) {
        const pest = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshStandardMaterial({ color: 0x212121 }));
        const ang = Math.random() * Math.PI * 2; 
        pest.position.set(Math.cos(ang) * t, Math.random() * h, Math.sin(ang) * t); 
        p.add(pest);
    }

    addLeaf(p: THREE.Mesh, y: number, i: number, hf: number, isD: boolean, ry: number) {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.2, 0.2, 0.3, 0.5, 0, 0.8); s.bezierCurveTo(-0.3, 0.5, -0.2, 0.2, 0, 0);
        const size = mapRange(i, 0, 10, 0.4, 1.2) * (0.8 + Math.random() * 0.4);
        let lc = lerpColor(new THREE.Color(0x2e7d32), new THREE.Color(0x8bc34a), Math.min(1, i / 6)).lerp(new THREE.Color(0xd4a017), 1 - hf);
        if (isD) lc.lerp(new THREE.Color(0x795548), 0.6);
        const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01 }), new THREE.MeshStandardMaterial({ color: lc, side: THREE.DoubleSide }));
        leaf.scale.setScalar(size); leaf.position.y = y; leaf.rotation.set(Math.PI/4, ry, 0); leaf.castShadow = true; p.add(leaf);
    }

    addFlower(y: number, hf: number, isD: boolean) {
        const c = this.flowerColor.clone(); if (isD) c.lerp(new THREE.Color(0x4a148c), 0.7);
        this.flower = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.05, 64, 8, 2, 3), new THREE.MeshStandardMaterial({ color: c, emissive: isD ? 0x100010 : 0x300010, roughness: 0.3 }));
        this.flower.position.y = y + 0.1; this.flower.rotation.x = Math.PI / 2; this.flower.scale.setScalar(hf * 1.2); this.group.add(this.flower);
    }
}

// --- Particle System ---
class ParticleEffect {
    group: THREE.Group;
    positions: Float32Array;
    velocities: Float32Array;
    pts: THREE.Points;
    active: boolean = false;

    constructor(color = 0x4fc3f7) {
        this.group = new THREE.Group(); 
        this.positions = new Float32Array(600); 
        this.velocities = new Float32Array(600);
        const geo = new THREE.BufferGeometry();
        for (let i = 0; i < 200; i++) this.resetP(i);
        geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.05, transparent: true, opacity: 0.8 }));
        this.group.add(this.pts); 
        this.group.visible = false;
    }
    resetP(i: number) {
        this.positions[i*3] = (Math.random()-0.5)*1.5; 
        this.positions[i*3+1] = 4+Math.random()*2; 
        this.positions[i*3+2] = (Math.random()-0.5)*1.5;
        this.velocities[i*3+1] = -0.15-Math.random()*0.1;
    }
    trigger() { 
        this.active = true; 
        this.group.visible = true; 
        setTimeout(() => { 
            this.active = false; 
            this.group.visible = false; 
        }, 1500); 
    }
    update() {
        if (!this.active) return;
        const pos = this.pts.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < 200; i++) { 
            pos[i*3+1] += this.velocities[i*3+1]; 
            if (pos[i*3+1] < 0.2) this.resetP(i); 
        }
        this.pts.geometry.attributes.position.needsUpdate = true;
    }
}

// --- App ---
const App = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [age, setAge] = useState(0); 
    const [health, setHealth] = useState(100); 
    const [water, setWater] = useState(100);
    const [sunlight, setSunlight] = useState(80); 
    const [rest, setRest] = useState(80); 
    const [pests, setPests] = useState(0);
    const [isDiseased, setIsDiseased] = useState(false); 
    const [isDay, setIsDay] = useState(true);
    const [zenPoints, setZenPoints] = useState(0); 
    const [helperStatus, setHelperStatus] = useState("Empty");
    const [isHelperSelected, setIsHelperSelected] = useState(false);
    const [isTreating, setIsTreating] = useState(false);
    
    // Add reactive state for side garden stats to fix render-access issues
    const [sideGardenAges, setSideGardenAges] = useState([0, 0, 0]);
    const [sideGardenHealths, setSideGardenHealths] = useState([80, 80, 80]);

    const plantRef = useRef<Plant>(null); 
    const helperRef = useRef<GardenHelper>(null); 
    const sideGardenRef = useRef<SideGarden>(null); 
    const waterPartRef = useRef<ParticleEffect>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf0f4f0);
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(8, 8, 8); camera.lookAt(0, 1.5, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.shadowMap.enabled = true;
        containerRef.current.appendChild(renderer.domElement);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dL = new THREE.DirectionalLight(0xffffff, 1.2); dL.position.set(5, 10, 5); dL.castShadow = true; scene.add(dL);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshStandardMaterial({ color: 0xe0e0e0 })); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
        
        const well = new WaterWell(); scene.add(well.group);
        const side = new SideGarden(); scene.add(side.group); 
        (sideGardenRef as any).current = side;

        const plant = new Plant(); scene.add(plant.group); 
        (plantRef as any).current = plant;

        const helper = new GardenHelper(); scene.add(helper.group); 
        (helperRef as any).current = helper;

        const wPart = new ParticleEffect(); scene.add(wPart.group); 
        (waterPartRef as any).current = wPart;

        const animate = () => {
            requestAnimationFrame(animate);
            if (waterPartRef.current) waterPartRef.current.update();
            if (helperRef.current) helperRef.current.update();
            if (plantRef.current) plantRef.current.group.rotation.y += 0.001;
            renderer.render(scene, camera);
        };
        animate();

        const resize = () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
        window.addEventListener('resize', resize);
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const handleClick = (e: MouseEvent) => {
            if (e.button !== 0) return;
            mouse.x = (e.clientX/window.innerWidth)*2-1; mouse.y = -(e.clientY/window.innerHeight)*2+1;
            raycaster.setFromCamera(mouse, camera);
            const intersectsH = raycaster.intersectObject(helper.group, true);
            if (intersectsH.length > 0) { 
                setIsHelperSelected(s => { 
                    const n = !s; 
                    helper.updateSelection(n); 
                    return n; 
                }); 
                return; 
            }
            if (helper.isSelected) {
                const intersectsG = raycaster.intersectObject(ground);
                if (intersectsG.length > 0) { 
                    helper.targetPosition.copy(intersectsG[0].point); 
                    setIsTreating(false); 
                }
            }
        };
        window.addEventListener('pointerdown', handleClick);

        return () => { 
            window.removeEventListener('resize', resize); 
            window.removeEventListener('pointerdown', handleClick); 
            renderer.dispose();
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setWater(w => Math.max(0, w - WATER_LOSS_RATE));
            if (isDay) { 
                setSunlight(s => Math.min(100, s + SUNLIGHT_CHANGE_RATE)); 
                setRest(r => Math.max(0, r - NATURAL_DECAY)); 
            } else { 
                setRest(r => Math.min(100, r + REST_CHANGE_RATE)); 
                setSunlight(s => Math.max(0, s - NATURAL_DECAY)); 
            }
            
            if (helperRef.current && sideGardenRef.current) {
                const h = helperRef.current; const side = sideGardenRef.current;
                const dWell = h.group.position.distanceTo(new THREE.Vector3(-4, 0.5, -2));
                const dPlant = h.group.position.distanceTo(new THREE.Vector3(0, 0.5, 0));
                const dSide = h.group.position.distanceTo(side.group.position);
                
                if (dWell < 1 && !h.hasWater) { h.setHasWater(true); setHelperStatus("Carrying Water"); }
                if (dPlant < 1.2 && h.hasWater) { h.setHasWater(false); setHelperStatus("Empty"); setWater(w => Math.min(100, w+HELPER_WATER_BOOST)); waterPartRef.current?.trigger(); }
                if (isTreating) { h.targetPosition.set(0, 0.5, 0); setHelperStatus("Treating Plant"); if (dPlant < 1.2) { setPests(0); setIsDiseased(false); setIsTreating(false); setHelperStatus("Empty"); } }
                if (dSide < 1.5 && !h.hasWater && !isTreating) {
                    setHelperStatus("Working Side Garden");
                    setSideGardenHealths(prev => prev.map(hv => Math.min(100, hv+0.6)));
                    setSideGardenAges(prev => prev.map(a => { 
                        let na = Math.min(100, a + GROWTH_SPEED * SIDE_GARDEN_FAST_GROWTH); 
                        if (a < 100 && na >= 100) setZenPoints(p => p+50); 
                        return na; 
                    }));
                }
            }

            // Natural side garden decay
            setSideGardenHealths(prev => prev.map(hv => Math.max(0, hv-0.05)));
            setSideGardenAges(prev => prev.map(a => Math.min(100, a+0.005)));
            
            setHealth(h => {
                let d = 0; if (water < 15) d -= 0.2; else if (water > 30) d += 0.05;
                if (sunlight < 20) d -= 0.15; if (rest < 20) d -= 0.15; d -= pests * 0.03; if (isDiseased) d -= 0.2;
                return Math.min(100, Math.max(0, h + d));
            });
            setAge(a => { 
                let da = health > 50 ? (isDay ? GROWTH_SPEED : GROWTH_SPEED * 0.2) : 0; 
                if (sunlight > 60 && rest > 60) da *= 1.5; 
                return Math.min(100, a + da); 
            });
            if (Math.random() < 0.003) setPests(p => Math.min(10, p+1));
        }, 100);
        return () => clearInterval(interval);
    }, [isDay, isTreating, water, sunlight, rest, pests, isDiseased, health]);

    useEffect(() => {
        if (plantRef.current) plantRef.current.update(age, health, water, pests, isDiseased);
        if (sideGardenRef.current) sideGardenRef.current.update(sideGardenAges, sideGardenHealths);
    }, [age, health, water, pests, isDiseased, sideGardenAges, sideGardenHealths]);

    return (
        <div className="relative w-full h-full select-none" onContextMenu={(e) => { e.preventDefault(); setIsHelperSelected(false); helperRef.current?.updateSelection(false); }}>
            <div ref={containerRef} className="absolute inset-0 z-0" />
            
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass px-8 py-2 border-b-4 border-yellow-500 shadow-xl">
                <span className="text-[10px] uppercase font-black text-gray-400 block text-center tracking-widest">Zen Points</span>
                <span className="text-3xl font-black text-yellow-600 block text-center">{(zenPoints || 0).toLocaleString()}</span>
            </div>

            <div className="absolute top-8 left-8 z-10 space-y-4 max-w-xs w-full">
                <div className="glass p-6 shadow-xl border-t-4 border-green-400">
                    <h1 className="text-2xl font-bold text-green-800">Zen Bloom</h1>
                    <p className="text-[10px] uppercase font-bold text-green-600 mb-4">{age < 30 ? 'Seedling' : age < 70 ? 'Young' : 'Mature'}</p>
                    <div className="space-y-3 text-xs font-bold uppercase text-gray-500">
                        <div>💧 Water: {Math.round(water)}% <div className="bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1"><div className="bg-blue-400 h-full transition-all" style={{width:`${water}%`}}/></div></div>
                        <div>☀️ Light: {Math.round(sunlight)}% <div className="bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1"><div className="bg-yellow-400 h-full transition-all" style={{width:`${sunlight}%`}}/></div></div>
                        <div>🌱 Health: {Math.round(health)}% <div className="bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1"><div className="bg-green-500 h-full transition-all" style={{width:`${health}%`}}/></div></div>
                    </div>
                </div>
                <div className="glass p-4 border-l-4 border-emerald-500 text-[10px] font-bold">
                    <div className="flex justify-between mb-1"><span>Bot Patch</span><span>{helperStatus === "Working Side Garden" ? "BONUS" : "IDLE"}</span></div>
                    <div className="flex gap-1 h-1">
                        {(sideGardenAges || []).map((a, i) => (
                            <div key={i} className="flex-1 bg-gray-200">
                                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${a}%` }} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
                <div className={`glass p-4 w-44 shadow-lg border-t-4 transition-all ${isHelperSelected ? 'border-green-500 scale-105' : 'border-transparent'}`}>
                    <h2 className="text-[10px] font-bold text-gray-400 uppercase mb-1">Bot-Z</h2>
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                        <div className={`w-2 h-2 rounded-full ${helperStatus !== 'Empty' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`}/>
                        {helperStatus}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-3">
                <button onClick={() => { setWater(w => Math.min(100, w+25)); waterPartRef.current?.trigger(); }} className="glass px-6 py-3 font-bold text-blue-700 hover:scale-105 transition-transform flex flex-col items-center">💧<span className="text-[10px] mt-1">Water</span></button>
                <button onClick={() => { setAge(a => Math.min(100, a+5)); setHealth(h => Math.min(100, h+15)); }} className="glass px-6 py-3 font-bold text-green-700 hover:scale-105 transition-transform flex flex-col items-center">✨<span className="text-[10px] mt-1">Grow</span></button>
                {(pests > 0 || isDiseased) && <button onClick={() => setIsTreating(true)} className="glass px-6 py-3 font-bold text-red-700 animate-bounce flex flex-col items-center">🧪<span className="text-[10px] mt-1">Bot Treat</span></button>}
                <button onClick={() => setIsDay(!isDay)} className="glass px-6 py-3 font-bold text-yellow-700 hover:scale-105 transition-transform flex flex-col items-center">{isDay ? '☀️' : '🌙'}<span className="text-[10px] mt-1">{isDay ? 'Day' : 'Night'}</span></button>
            </div>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<App />);
}
