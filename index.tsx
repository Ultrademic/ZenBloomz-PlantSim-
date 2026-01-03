
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- Constants & Types ---
const MAX_WATER = 100;
const MAX_HEALTH = 100;
const MAX_VALUE = 100;
const GROWTH_SPEED = 0.05;
const WATER_LOSS_RATE = 0.15;
const SUNLIGHT_CHANGE_RATE = 0.4;
const REST_CHANGE_RATE = 0.4;
const NATURAL_DECAY = 0.2;
const NUTRIENT_BOOST = 15;
const WATER_BOOST = 25;
const HELPER_WATER_BOOST = 40;
const PEST_HEALTH_DRAIN = 0.3;
const DISEASE_HEALTH_DRAIN = 0.2;
const SIDE_GARDEN_FAST_GROWTH = 1.2;

type GrowthStage = 'Seedling' | 'Young' | 'Mature';

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
    const waterMat = new THREE.MeshStandardMaterial({ 
      color: 0x03a9f4, 
      roughness: 0, 
      metalness: 0.5,
      emissive: 0x01579b,
      emissiveIntensity: 0.5 
    });
    const surface = new THREE.Mesh(waterGeo, waterMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.55;
    this.group.add(surface);

    const postGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(0.6, 0.9, 0);
    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(-0.6, 0.9, 0);
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
  plants: Plant[] = [];
  ages: number[] = [0, 0, 0];
  healths: number[] = [80, 80, 80];

  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(4, 0, -3.5);

    const soilGeo = new THREE.BoxGeometry(2.5, 0.1, 1.5);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    this.soil = new THREE.Mesh(soilGeo, soilMat);
    this.soil.position.y = 0.05;
    this.soil.receiveShadow = true;
    this.group.add(this.soil);

    for (let i = 0; i < 3; i++) {
      const p = new Plant(true);
      p.group.position.set((i - 1) * 0.7, 0, 0);
      p.group.scale.setScalar(0.5);
      this.group.add(p.group);
      this.plants.push(p);
    }
  }

  update() {
    this.plants.forEach((p, i) => {
      p.update(this.ages[i], this.healths[i], 80, 0, false);
    });
  }
}

// --- Garden Helper Character ---
class GardenHelper {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  waterDroplet: THREE.Mesh;
  targetPosition: THREE.Vector3;
  isSelected: boolean = false;
  hasWater: boolean = false;
  speed: number = 0.08;

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
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.08, 0.52, 0.15);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(-0.08, 0.52, 0.15);
    this.group.add(eyeL, eyeR);

    const dropletGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dropletMat = new THREE.MeshStandardMaterial({ 
      color: 0x00b0ff, 
      emissive: 0x0091ea, 
      emissiveIntensity: 0.8 
    });
    this.waterDroplet = new THREE.Mesh(dropletGeo, dropletMat);
    this.waterDroplet.position.y = 1.0;
    this.waterDroplet.visible = false;
    this.group.add(this.waterDroplet);

    const selectionRingGeo = new THREE.RingGeometry(0.4, 0.45, 32);
    const selectionRingMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.name = "selectionRing";
    this.group.add(ring);
  }

  updateSelection(selected: boolean) {
    this.isSelected = selected;
    const ring = this.group.getObjectByName("selectionRing") as THREE.Mesh;
    if (ring) {
      (ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.8 : 0;
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

    const distance = this.group.position.distanceTo(new THREE.Vector3(this.targetPosition.x, this.group.position.y, this.targetPosition.z));
    if (distance > 0.1) {
      const direction = new THREE.Vector3().subVectors(this.targetPosition, this.group.position).normalize();
      direction.y = 0;
      const lookTarget = this.group.position.clone().add(direction);
      this.group.lookAt(lookTarget.x, this.group.position.y, lookTarget.z);
      this.group.position.add(direction.multiplyScalar(this.speed));
    }
  }
}

// --- Plant System ---
class Plant {
  group: THREE.Group;
  stems: THREE.Mesh[] = [];
  leaves: THREE.Mesh[] = [];
  flower: THREE.Mesh | null = null;
  pot: THREE.Mesh | null = null;
  soil: THREE.Mesh | null = null;
  pestsGroup: THREE.Group;
  isSmall: boolean;
  flowerColor: THREE.Color;
  
  constructor(isSmall: boolean = false) {
    this.isSmall = isSmall;
    this.group = new THREE.Group();
    this.pestsGroup = new THREE.Group();
    this.group.add(this.pestsGroup);
    
    this.flowerColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);

    if (!isSmall) {
      const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.6, 32);
      const potMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
      this.pot = new THREE.Mesh(potGeo, potMat);
      this.pot.position.y = 0.3;
      this.pot.castShadow = true;
      this.pot.receiveShadow = true;
      this.group.add(this.pot);

      const soilGeo = new THREE.CircleGeometry(0.55, 32);
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 1 });
      this.soil = new THREE.Mesh(soilGeo, soilMat);
      this.soil.rotation.x = -Math.PI / 2;
      this.soil.position.y = 0.61;
      this.group.add(this.soil);
    }
  }

  update(age: number, health: number, water: number, pests: number, isDiseased: boolean) {
    const stage = this.getStage(age);
    const healthFactor = health / MAX_HEALTH;
    const waterFactor = water / MAX_WATER;
    const droopAmount = Math.max(0, (1 - waterFactor) * 0.8);

    if (this.soil) {
      (this.soil.material as THREE.MeshStandardMaterial).color.setHex(water < 20 ? 0x5a4636 : 0x2b1e15);
    }

    this.stems.forEach(s => this.group.remove(s));
    this.leaves.forEach(l => this.group.remove(l));
    if (this.flower) this.group.remove(this.flower);
    this.pestsGroup.clear();
    
    this.stems = [];
    this.leaves = [];

    let segments = 1;
    if (age > 10) segments = 2;
    if (age > 30) segments = 4;
    if (age > 70) segments = 6;

    const totalHeight = mapRange(age, 0, 100, 0.2, 3.5);
    const segmentHeight = totalHeight / segments;
    const baseThickness = mapRange(age, 0, 100, 0.04, 0.18);

    let currentY = this.isSmall ? 0.05 : 0.61;

    for (let i = 0; i < segments; i++) {
      const topT = (i + 1) / segments;
      const sTopThickness = baseThickness * (1 - topT * 0.6);
      const sBottomThickness = baseThickness * (1 - (i/segments) * 0.6);

      const stemGeo = new THREE.CylinderGeometry(sTopThickness, sBottomThickness, segmentHeight, 12);
      stemGeo.translate(0, segmentHeight / 2, 0);
      
      const healthyColor = new THREE.Color(0x4caf50).lerp(new THREE.Color(0x8bc34a), topT);
      let stemColor = healthyColor.lerp(new THREE.Color(0x8b7355), 1 - healthFactor);
      if (isDiseased) stemColor.lerp(new THREE.Color(0x5d4037), 0.5);
      
      const stemMat = new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.7 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = currentY;
      
      const sway = Math.sin(Date.now() * 0.001 + i * 0.5) * 0.02 * (i + 1);
      const segmentDroop = (droopAmount * (i + 1) / segments) + sway;
      const organicCurve = (age < 30) ? 0.1 * Math.sin(i) : 0;
      
      stem.rotation.z = segmentDroop + organicCurve;
      stem.castShadow = true;
      this.stems.push(stem);
      this.group.add(stem);

      if (pests > 0 && (i + Math.random()) > (segments - (pests/2))) {
          this.addPestMarker(stem, segmentHeight, sBottomThickness);
      }

      if (age > 5 && age < 20 && i === 0) {
          this.addLeaf(stem, segmentHeight * 0.8, 0, healthFactor, true, isDiseased, pests, 0);
          this.addLeaf(stem, segmentHeight * 0.8, 1, healthFactor, true, isDiseased, pests, Math.PI);
      } else if (age >= 15) {
          const leafProbability = 0.4 + (healthFactor * 0.4);
          if (Math.random() < leafProbability) {
              const leafCount = Math.floor(Math.random() * 2) + 1;
              for(let l=0; l<leafCount; l++) {
                  const verticalOffset = Math.random() * segmentHeight;
                  const radialOffset = Math.random() * Math.PI * 2;
                  this.addLeaf(stem, verticalOffset, i + l, healthFactor, false, isDiseased, pests, radialOffset);
              }
          }
      }
      currentY += segmentHeight * Math.cos(stem.rotation.z);
    }

    if (stage === 'Mature' && health > 60) {
      this.addFlower(currentY, healthFactor, isDiseased);
    }
  }

  addPestMarker(parent: THREE.Object3D, height: number, thickness: number) {
      const pestGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const pestMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.2 });
      const pest = new THREE.Mesh(pestGeo, pestMat);
      pest.position.y = Math.random() * height;
      const angle = Math.random() * Math.PI * 2;
      pest.position.x = Math.cos(angle) * thickness;
      pest.position.z = Math.sin(angle) * thickness;
      parent.add(pest);
  }

  addLeaf(parent: THREE.Mesh, yPos: number, index: number, healthFactor: number, isCotyledon: boolean, isDiseased: boolean, pests: number, rotationY: number) {
    const leafShape = new THREE.Shape();
    if (isCotyledon) {
        leafShape.moveTo(0, 0);
        leafShape.absellipse(0, 0.2, 0.15, 0.2, 0, Math.PI * 2, false, 0);
    } else {
        leafShape.moveTo(0, 0);
        leafShape.bezierCurveTo(0.2, 0.2, 0.3, 0.5, 0, 0.8);
        leafShape.bezierCurveTo(-0.3, 0.5, -0.2, 0.2, 0, 0);
    }
    const baseSize = isCotyledon ? 0.4 : mapRange(index, 0, 10, 0.4, 1.2);
    const sizeJitter = baseSize * (0.8 + Math.random() * 0.4);
    const extrudeSettings = { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01 };
    const leafGeo = new THREE.ExtrudeGeometry(leafShape, extrudeSettings);
    const baseGreen = new THREE.Color(0x2e7d32);
    const lightGreen = new THREE.Color(0x8bc34a);
    let leafColor = lerpColor(baseGreen, lightGreen, Math.min(1, index / 6));
    leafColor.lerp(new THREE.Color(0xd4a017), 1 - healthFactor);
    if (isDiseased) leafColor.lerp(new THREE.Color(0x795548), 0.6);
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, side: THREE.DoubleSide, roughness: 0.6 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.set(sizeJitter, sizeJitter, sizeJitter);
    leaf.position.y = yPos;
    leaf.rotation.x = Math.PI / 4 + (Math.random() - 0.5) * 0.2;
    leaf.rotation.y = rotationY + (Math.random() - 0.5) * 0.5;
    leaf.castShadow = true;
    parent.add(leaf);
  }

  addFlower(y: number, healthFactor: number, isDiseased: boolean) {
    const flowerGeo = new THREE.TorusKnotGeometry(0.2, 0.05, 64, 8, 2, 3);
    let flowerColor = this.flowerColor.clone();
    if (isDiseased) flowerColor.lerp(new THREE.Color(0x4a148c), 0.7);
    const flowerMat = new THREE.MeshStandardMaterial({ 
      color: flowerColor, 
      emissive: isDiseased ? 0x100010 : 0x300010,
      roughness: 0.3 
    });
    this.flower = new THREE.Mesh(flowerGeo, flowerMat);
    this.flower.position.y = y + 0.1;
    this.flower.rotation.x = Math.PI / 2;
    this.flower.scale.setScalar(healthFactor * 1.2);
    this.group.add(this.flower);
  }

  getStage(age: number): GrowthStage {
    if (age < 30) return 'Seedling';
    if (age < 70) return 'Young';
    return 'Mature';
  }
}

// --- Particle System ---
class ParticleEffect {
  group: THREE.Group;
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  count = 200;
  active = false;
  color: number;

  constructor(color: number = 0x4fc3f7) {
    this.color = color;
    this.group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) this.resetParticle(i);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({ color: this.color, size: 0.05, transparent: true, opacity: 0.8 });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.group.visible = false;
  }

  resetParticle(i: number) {
    this.positions[i * 3] = (Math.random() - 0.5) * 1.5;
    this.positions[i * 3 + 1] = 4 + Math.random() * 2;
    this.positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    this.velocities[i * 3 + 1] = -0.15 - Math.random() * 0.1;
  }

  trigger() {
    this.active = true;
    this.group.visible = true;
    setTimeout(() => { this.active = false; this.group.visible = false; }, 1500);
  }

  update() {
    if (!this.active) return;
    const pos = this.points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      pos[i * 3 + 1] += this.velocities[i * 3 + 1];
      if (pos[i * 3 + 1] < 0.2) this.resetParticle(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// --- Main App Component ---
const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [age, setAge] = useState(0);
  const [health, setHealth] = useState(100);
  const [water, setWater] = useState(100);
  const [sunlight, setSunlight] = useState(80);
  const [rest, setRest] = useState(80);
  const [pests, setPests] = useState(0);
  const [isDiseased, setIsDiseased] = useState(false);
  const [isDay, setIsDay] = useState(true);
  const [isHelperSelected, setIsHelperSelected] = useState(false);
  const [helperStatus, setHelperStatus] = useState<"Empty" | "Gathering" | "Carrying Water" | "Working Side Garden" | "Treating Main Plant">("Empty");
  const [message, setMessage] = useState("Welcome to your Garden.");
  const [zenPoints, setZenPoints] = useState(0);
  const [isTreatingRequested, setIsTreatingRequested] = useState(false);

  const plantRef = useRef<Plant | null>(null);
  const helperRef = useRef<GardenHelper | null>(null);
  const wellRef = useRef<WaterWell | null>(null);
  const sideGardenRef = useRef<SideGarden | null>(null);
  const waterRef = useRef<ParticleEffect | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f0);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 8, 8);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(5, 10, 5);
    directional.castShadow = true;
    scene.add(directional);

    const groundGeo = new THREE.CircleGeometry(10, 64);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const well = new WaterWell();
    scene.add(well.group);
    wellRef.current = well;

    const sideGarden = new SideGarden();
    scene.add(sideGarden.group);
    sideGardenRef.current = sideGarden;

    const plant = new Plant();
    scene.add(plant.group);
    plantRef.current = plant;

    const helper = new GardenHelper();
    scene.add(helper.group);
    helperRef.current = helper;

    const waterPart = new ParticleEffect(0x4fc3f7);
    scene.add(waterPart.group);
    waterRef.current = waterPart;

    const animate = () => {
      requestAnimationFrame(animate);
      if (waterRef.current) waterRef.current.update();
      if (helperRef.current) helperRef.current.update();
      if (plant.group) plant.group.rotation.y += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!cameraRef.current || !sceneRef.current || !helperRef.current || !groundRef.current) return;
    
    // Check if it's left click (0)
    if (event.button !== 0) return;

    mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);

    const helperIntersects = raycaster.current.intersectObject(helperRef.current.group, true);
    if (helperIntersects.length > 0) {
      const newSelected = !isHelperSelected;
      setIsHelperSelected(newSelected);
      helperRef.current.updateSelection(newSelected);
      setMessage(newSelected ? "Helper Bot-Z Targeted! Move him to the well, plant, or side garden." : "Helper Bot-Z Deselected.");
      return;
    }

    if (isHelperSelected) {
      const groundIntersects = raycaster.current.intersectObject(groundRef.current);
      if (groundIntersects.length > 0) {
        helperRef.current.targetPosition.copy(groundIntersects[0].point);
        setIsTreatingRequested(false); // Stop treating request if manually moved
        setMessage("Bot-Z heading to new location.");
      }
    }
  };

  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (isHelperSelected && helperRef.current) {
      setIsHelperSelected(false);
      helperRef.current.updateSelection(false);
      setMessage("Helper Bot-Z Deselected.");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setWater(w => Math.max(0, w - WATER_LOSS_RATE));
      
      if (isDay) {
        setSunlight(s => Math.min(MAX_VALUE, s + SUNLIGHT_CHANGE_RATE));
        setRest(r => Math.max(0, r - NATURAL_DECAY));
      } else {
        setRest(r => Math.min(MAX_VALUE, r + REST_CHANGE_RATE));
        setSunlight(s => Math.max(0, s - NATURAL_DECAY));
      }

      if (helperRef.current && wellRef.current && sideGardenRef.current) {
        const hPos = helperRef.current.group.position;
        const distWell = hPos.distanceTo(wellRef.current.group.position);
        const distPlant = hPos.distanceTo(new THREE.Vector3(0, 0, 0));
        const distSideGarden = hPos.distanceTo(sideGardenRef.current.group.position);

        // Gathering
        if (distWell < 1.0 && !helperRef.current.hasWater) {
            helperRef.current.setHasWater(true);
            setHelperStatus("Carrying Water");
            setMessage("Bot-Z gathered water from the well!");
        }

        // Delivery
        if (distPlant < 1.2 && helperRef.current.hasWater) {
            helperRef.current.setHasWater(false);
            setHelperStatus("Empty");
            setWater(w => Math.min(MAX_WATER, w + HELPER_WATER_BOOST));
            setHealth(h => Math.min(MAX_HEALTH, h + 5));
            waterRef.current?.trigger();
            setMessage("Bot-Z is watering the plant!");
        }

        // Treatment logic
        if (isTreatingRequested) {
          helperRef.current.targetPosition.set(0, 0.5, 0);
          setHelperStatus("Treating Main Plant");
          if (distPlant < 1.2) {
            setPests(0);
            setIsDiseased(false);
            setIsTreatingRequested(false);
            setHelperStatus("Empty");
            setMessage("Bot-Z has treated the plant! It's clean now.");
          }
        }

        // Working Side Garden
        if (distSideGarden < 1.5 && !helperRef.current.hasWater && !isTreatingRequested) {
          setHelperStatus("Working Side Garden");
          
          sideGardenRef.current.healths = sideGardenRef.current.healths.map(h => Math.min(100, h + 0.6));
          sideGardenRef.current.ages = sideGardenRef.current.ages.map((a, i) => {
             const nextA = Math.min(100, a + GROWTH_SPEED * SIDE_GARDEN_FAST_GROWTH);
             if (a < 100 && nextA >= 100) {
                setZenPoints(pts => pts + 50);
                setMessage("A side plant reached full bloom! +50 Zen Points");
             }
             return nextA;
          });

          if (Math.random() < 0.02) setMessage("Bot-Z is working his magic in the side garden...");
        } else if (helperStatus === "Working Side Garden" && distSideGarden >= 1.5) {
          setHelperStatus("Empty");
        }
      }

      // Natural Side Garden Decay/Growth
      if (sideGardenRef.current) {
        sideGardenRef.current.healths = sideGardenRef.current.healths.map(h => Math.max(0, h - 0.05));
        sideGardenRef.current.ages = sideGardenRef.current.ages.map(a => Math.min(100, a + 0.005));
      }

      setHealth(h => {
        let hDelta = 0;
        setWater(w => { if (w < 15) hDelta -= 0.2; else if (w > 30) hDelta += 0.05; return w; });
        setSunlight(s => { if (s < 20) hDelta -= 0.15; return s; });
        setRest(r => { if (r < 20) hDelta -= 0.15; return r; });
        setPests(p => { if (p > 0) hDelta -= (p * PEST_HEALTH_DRAIN * 0.1); return p; });
        if (isDiseased) hDelta -= DISEASE_HEALTH_DRAIN;
        return Math.min(MAX_HEALTH, Math.max(0, h + hDelta));
      });

      setAge(a => {
        let aDelta = 0;
        setHealth(h => { 
          if (h > 50) {
            aDelta = GROWTH_SPEED * (isDay ? 1 : 0.2);
            setSunlight(s => { setRest(r => { if (s > 60 && r > 60) aDelta *= 1.5; return r; }); return s; });
          }
          return h; 
        });
        return Math.min(100, a + aDelta);
      });

      if (Math.random() < 0.003) {
          setPests(p => Math.min(10, p + 1));
          setMessage("Warning: Some pests were spotted!");
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isDay, isDiseased, isHelperSelected, helperStatus, isTreatingRequested]);

  useEffect(() => {
    if (plantRef.current) plantRef.current.update(age, health, water, pests, isDiseased);
    if (sideGardenRef.current) sideGardenRef.current.update();
  }, [age, health, water, pests, isDiseased]);

  const resetGarden = () => {
    setAge(0);
    setHealth(100);
    setWater(100);
    setSunlight(80);
    setRest(80);
    setPests(0);
    setZenPoints(0);
    setIsDiseased(false);
    setIsTreatingRequested(false);
    if(sideGardenRef.current) {
        sideGardenRef.current.ages = [0, 0, 0];
        sideGardenRef.current.healths = [80, 80, 80];
    }
    setMessage("Garden reset. A fresh start!");
  };

  const handleTreat = () => {
    setIsTreatingRequested(true);
    setMessage("Bot-Z is dropping everything to treat the plant!");
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden" onPointerDown={onPointerDown} onContextMenu={onContextMenu}>
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* ZEN POINTS */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="glass px-8 py-2 border-b-4 border-yellow-500 shadow-2xl">
          <span className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 block text-center">Zen Points</span>
          <span className="text-3xl font-black text-yellow-600 block text-center tabular-nums">{zenPoints.toLocaleString()}</span>
        </div>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-8 left-8 z-10 space-y-4 max-w-xs w-full pointer-events-none">
        <div className="glass p-6 shadow-xl pointer-events-auto border-t-4 border-green-400">
          <h1 className="text-2xl font-bold text-green-800 mb-1">Zen Bloom</h1>
          <p className="text-xs text-green-600 tracking-wider uppercase font-semibold mb-4">
             {age < 30 ? 'Seedling' : age < 70 ? 'Young Plant' : 'Mature Bloom'}
          </p>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase tracking-tighter">
                <span>💧 Hydration</span>
                <span>{Math.round(water)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="progress-bar bg-blue-400" style={{ width: `${water}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase tracking-tighter">
                <span>☀️ Sunlight</span>
                <span>{Math.round(sunlight)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="progress-bar bg-yellow-400" style={{ width: `${sunlight}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase tracking-tighter">
                <span>🌱 Vitality</span>
                <span>{Math.round(health)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="progress-bar bg-green-500" style={{ width: `${health}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Side Garden Mini Info */}
        <div className="glass p-4 pointer-events-auto border-l-4 border-emerald-500 transition-all hover:scale-105">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Bot's Patch</span>
            <span className="text-[10px] font-bold text-emerald-600">Growth Bonus: {helperStatus === "Working Side Garden" ? "ACTIVE" : "OFF"}</span>
          </div>
          <div className="flex gap-1 h-1">
             {sideGardenRef.current?.ages.map((a, i) => (
                <div key={i} className="flex-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${a}%` }} />
                </div>
             ))}
          </div>
          <p className="text-[9px] text-gray-500 mt-2 italic">Mature plants award Zen Points!</p>
        </div>

        <div className="glass p-4 text-center pointer-events-auto shadow-sm">
          <p className="text-sm italic text-gray-600">"{message}"</p>
        </div>
      </div>

      {/* Helper Status Card */}
      <div className="absolute top-8 right-8 flex flex-col items-end gap-2 pointer-events-none">
         <div className={`glass p-4 w-48 shadow-lg pointer-events-auto border-t-4 transition-all duration-500 ${isHelperSelected ? 'border-green-500 scale-105' : 'border-transparent'}`}>
            <h2 className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Helper Bot-Z</h2>
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full transition-colors ${helperStatus !== 'Empty' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-sm font-bold text-gray-700 leading-tight">{helperStatus}</span>
            </div>
            <p className="text-[9px] text-gray-400 mt-2 italic leading-tight">
                {isHelperSelected ? "Commanded - Click ground to re-direct" : "Right-click to deselect Bot-Z"}
            </p>
         </div>
         <button onClick={resetGarden} className="glass px-4 py-2 text-xs font-bold text-gray-400 hover:text-red-400 transition-colors pointer-events-auto shadow-sm">
            RESET GARDEN
         </button>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex space-x-4">
        <button onClick={() => { setWater(w => Math.min(MAX_WATER, w + WATER_BOOST)); waterRef.current?.trigger(); }} className="glass px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-all active:scale-95 flex flex-col items-center shadow-md">
          <span className="text-xl">💧</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Water</span>
        </button>
        <button onClick={() => { setAge(a => Math.min(100, a + 5)); setHealth(h => Math.min(MAX_HEALTH, h + NUTRIENT_BOOST)); }} className="glass px-6 py-3 font-semibold text-green-700 hover:bg-green-50 transition-all active:scale-95 flex flex-col items-center shadow-md">
          <span className="text-xl">✨</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Fertilize</span>
        </button>
        {(pests > 0 || isDiseased) && (
            <button onClick={handleTreat} className="glass px-6 py-3 font-semibold text-red-700 hover:bg-red-50 transition-all active:scale-95 flex flex-col items-center shadow-lg animate-bounce group">
              <span className="text-xl group-hover:rotate-12 transition-transform">🧪</span>
              <span className="text-xs mt-1 uppercase tracking-widest font-bold">Bot-Z Treat</span>
              {isTreatingRequested && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] rounded-full px-1">BUSY</span>}
            </button>
        )}
        <button onClick={() => setIsDay(!isDay)} className="glass px-6 py-3 font-semibold text-yellow-700 hover:bg-yellow-50 transition-all active:scale-95 flex flex-col items-center shadow-md">
          <span className="text-xl">{isDay ? '☀️' : '🌙'}</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">{isDay ? 'Day' : 'Night'}</span>
        </button>
      </div>

      <div className="absolute bottom-4 right-8 pointer-events-none text-right">
        <p className="text-[10px] text-gray-400 opacity-40 uppercase tracking-widest">Zen Bloom v1.7.1 - Right-click Deselect</p>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
