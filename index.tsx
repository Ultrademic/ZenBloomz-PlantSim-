
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

// --- Constants & Types ---
const MAX_WATER = 100;
const MAX_HEALTH = 100;
const MAX_VALUE = 100;
const GROWTH_SPEED = 0.06;
const WATER_LOSS_RATE = 0.15;
const SUNLIGHT_CHANGE_RATE = 0.6;
const REST_CHANGE_RATE = 0.6;
const NATURAL_DECAY = 0.2;
const NUTRIENT_BOOST = 15;
const WATER_BOOST = 25;
const HELPER_WATER_BOOST = 40;
const PEST_HEALTH_DRAIN = 0.3;
const DISEASE_HEALTH_DRAIN = 0.2;
const SIDE_GARDEN_FAST_GROWTH = 1.2;
const HARVEST_COOLDOWN_MS = 30000; // 30 seconds

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

const createGrassTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = '#4a7c44';
  ctx.fillRect(0, 0, 512, 512);
  
  for (let i = 0; i < 15000; i++) {
    const g = Math.floor(Math.random() * 60 + 80);
    ctx.fillStyle = `rgba(20, ${g}, 20, ${Math.random() * 0.4})`;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = Math.random() * 3 + 1;
    const h = Math.random() * 10 + 2;
    ctx.fillRect(x, y, w, h);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
};

// --- Sun System ---
class HappySun {
  group: THREE.Group;
  body: THREE.Mesh;
  rays: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(5, 8, -10); // Lowered from 12 to 8

    const bodyGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: 0xffeb3b, 
      emissive: 0xffc107, 
      emissiveIntensity: 0.8 
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.group.add(this.body);

    const faceMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const eyeGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, faceMat);
    leftEye.position.set(0.6, 0.4, 1.3);
    const rightEye = new THREE.Mesh(eyeGeo, faceMat);
    rightEye.position.set(-0.6, 0.4, 1.3);
    this.group.add(leftEye, rightEye);

    const smileGeo = new THREE.TorusGeometry(0.5, 0.05, 8, 16, Math.PI);
    const smile = new THREE.Mesh(smileGeo, faceMat);
    smile.position.set(0, -0.2, 1.3);
    smile.rotation.x = Math.PI;
    this.group.add(smile);

    this.rays = new THREE.Group();
    const rayGeo = new THREE.BoxGeometry(0.2, 1.8, 0.1);
    const rayMat = new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300 });
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(rayGeo, rayMat);
      const angle = (i / 12) * Math.PI * 2;
      ray.position.set(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 0);
      ray.rotation.z = angle + Math.PI / 2;
      this.rays.add(ray);
    }
    this.group.add(this.rays);
  }

  update(isDay: boolean) {
    const targetScale = isDay ? 1 : 0.001;
    this.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);
    this.rays.rotation.z += 0.005;
    const pulse = 1 + Math.sin(Date.now() * 0.002) * 0.05;
    this.body.scale.setScalar(pulse);
  }
}

// --- Cloud System ---
class CloudSystem {
  group: THREE.Group;
  clouds: { group: THREE.Group; speed: number }[] = [];

  constructor(count = 6) {
    this.group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(1, 12, 12);
    const cloudMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      roughness: 1, 
      transparent: true, 
      opacity: 0.9 
    });

    for (let i = 0; i < count; i++) {
      const cloudGroup = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let p = 0; p < numPuffs; p++) {
        const puff = new THREE.Mesh(sphereGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 2.5,
          (Math.random() - 0.5) * 1.0,
          (Math.random() - 0.5) * 1.5
        );
        puff.scale.setScalar(0.7 + Math.random() * 1.2);
        cloudGroup.add(puff);
      }
      cloudGroup.position.set(
        (Math.random() - 0.5) * 40,
        6 + Math.random() * 6,
        -15 - Math.random() * 10
      );
      this.group.add(cloudGroup);
      this.clouds.push({ group: cloudGroup, speed: 0.005 + Math.random() * 0.01 });
    }
  }

  update() {
    this.clouds.forEach(c => {
      c.group.position.x += c.speed;
      if (c.group.position.x > 30) c.group.position.x = -30;
    });
  }
}

// --- Grass Field ---
class GrassField {
  group: THREE.Group;
  blades: { mesh: THREE.Mesh; phase: number; speed: number }[] = [];

  constructor(count = 2000, radius = 10) {
    this.group = new THREE.Group();
    const bladeGeo = new THREE.PlaneGeometry(0.04, 0.35);
    bladeGeo.translate(0, 0.175, 0);
    
    const colors = [new THREE.Color(0x3a5a40), new THREE.Color(0x588157), new THREE.Color(0xa3b18a)];

    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * radius;
      const theta = Math.random() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      if (Math.sqrt(x*x + z*z) < 1.2) continue; // Pot area
      if (Math.sqrt(Math.pow(x+4,2)+Math.pow(z+2,2)) < 1.5) continue; // Well area
      // Avoid Side Garden Area
      if (Math.abs(x - 4) < 1.6 && Math.abs(z + 3.5) < 1.1) continue; 

      const color = colors[Math.floor(Math.random() * colors.length)].clone();
      color.multiplyScalar(0.8 + Math.random() * 0.4);
      const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 });
      const blade = new THREE.Mesh(bladeGeo, mat);
      blade.position.set(x, 0, z);
      blade.rotation.y = Math.random() * Math.PI;
      blade.rotation.x = (Math.random() - 0.5) * 0.3;
      blade.scale.setScalar(0.6 + Math.random() * 1.6);
      this.group.add(blade);
      this.blades.push({ mesh: blade, phase: Math.random() * Math.PI * 2, speed: 0.001 + Math.random() * 0.002 });
    }
  }

  update() {
    const time = Date.now();
    this.blades.forEach(b => {
      b.mesh.rotation.z = Math.sin(time * b.speed + b.phase) * 0.15;
    });
  }
}

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
    const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.y = 1.6; roof.rotation.y = Math.PI / 4;
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
    
    const soilWidth = 2.5;
    const soilDepth = 1.5;

    const soilGeo = new THREE.BoxGeometry(soilWidth, 0.1, soilDepth);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    this.soil = new THREE.Mesh(soilGeo, soilMat);
    this.soil.position.y = 0.05;
    this.soil.receiveShadow = true;
    this.group.add(this.soil);

    // Add a rustic fence around back and sides
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const postGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
    const railGeoH = new THREE.BoxGeometry(soilWidth + 0.1, 0.05, 0.05);
    const railGeoV = new THREE.BoxGeometry(0.05, 0.05, soilDepth + 0.1);

    // Posts at corners (Back-Left, Back-Right, Front-Left, Front-Right)
    const postPositions = [
      [-soilWidth/2, 0.3, -soilDepth/2], // BL
      [soilWidth/2, 0.3, -soilDepth/2],  // BR
      [-soilWidth/2, 0.3, soilDepth/2],  // FL
      [soilWidth/2, 0.3, soilDepth/2]    // FR
    ];

    postPositions.forEach(p => {
      const post = new THREE.Mesh(postGeo, fenceMat);
      post.position.set(p[0], p[1], p[2]);
      post.castShadow = true;
      this.group.add(post);
    });

    // Back rail
    const backRail = new THREE.Mesh(railGeoH, fenceMat);
    backRail.position.set(0, 0.45, -soilDepth/2);
    this.group.add(backRail);

    // Left rail
    const leftRail = new THREE.Mesh(railGeoV, fenceMat);
    leftRail.position.set(-soilWidth/2, 0.45, 0);
    this.group.add(leftRail);

    // Right rail
    const rightRail = new THREE.Mesh(railGeoV, fenceMat);
    rightRail.position.set(soilWidth/2, 0.45, 0);
    this.group.add(rightRail);

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
      p.update(this.ages[i], this.healths[i], 80, 0, false, false);
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
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.08, 0.52, 0.15);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.08, 0.52, 0.15);
    this.group.add(eyeL, eyeR);
    const dropletGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dropletMat = new THREE.MeshStandardMaterial({ color: 0x00b0ff, emissive: 0x0091ea, emissiveIntensity: 0.8 });
    this.waterDroplet = new THREE.Mesh(dropletGeo, dropletMat);
    this.waterDroplet.position.y = 1.0;
    this.waterDroplet.visible = false;
    this.group.add(this.waterDroplet);
    const selectionRingGeo = new THREE.RingGeometry(0.4, 0.45, 32);
    const selectionRingMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    ring.rotation.x = -Math.PI / 2; ring.name = "selectionRing";
    this.group.add(ring);
  }
  updateSelection(selected: boolean) {
    this.isSelected = selected;
    const ring = this.group.getObjectByName("selectionRing") as THREE.Mesh;
    if (ring) { (ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.8 : 0; }
  }
  setHasWater(val: boolean) { this.hasWater = val; this.waterDroplet.visible = val; }
  update() {
    const hoverY = 0.6 + Math.sin(Date.now() * 0.003) * 0.1;
    this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, hoverY, 0.1);
    if (this.hasWater) { this.waterDroplet.position.y = 1.0 + Math.sin(Date.now() * 0.005) * 0.05; this.waterDroplet.rotation.y += 0.02; }
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
  flower: THREE.Object3D | null = null;
  pot: THREE.Mesh | null = null;
  soil: THREE.Mesh | null = null;
  pestsGroup: THREE.Group;
  isSmall: boolean;
  flowerColor: THREE.Color;
  flowerType: number;
  
  constructor(isSmall: boolean = false) {
    this.isSmall = isSmall;
    this.group = new THREE.Group();
    this.pestsGroup = new THREE.Group();
    this.group.add(this.pestsGroup);
    this.flowerColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
    this.flowerType = Math.floor(Math.random() * 4);
    if (!isSmall) {
      const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.6, 32);
      const potMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8 });
      this.pot = new THREE.Mesh(potGeo, potMat);
      this.pot.position.y = 0.3; this.pot.castShadow = true; this.pot.receiveShadow = true;
      this.group.add(this.pot);
      const soilGeo = new THREE.CircleGeometry(0.55, 32);
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 1 });
      this.soil = new THREE.Mesh(soilGeo, soilMat);
      this.soil.rotation.x = -Math.PI / 2; this.soil.position.y = 0.61;
      this.group.add(this.soil);
    }
  }

  update(age: number, health: number, water: number, pests: number, isDiseased: boolean, isHarvestable: boolean) {
    const stage = this.getStage(age);
    const healthFactor = health / MAX_HEALTH;
    const waterFactor = water / MAX_WATER;
    const droopAmount = Math.max(0, (1 - waterFactor) * 1.2);
    if (this.soil) { (this.soil.material as THREE.MeshStandardMaterial).color.setHex(water < 20 ? 0x5a4636 : 0x2b1e15); }
    
    // Cleanup previous meshes
    this.stems.forEach(s => this.group.remove(s));
    this.leaves.forEach(l => this.group.remove(l));
    if (this.flower) this.group.remove(this.flower);
    this.pestsGroup.clear();
    this.stems = []; 
    this.leaves = [];

    // Define segments for solid stem
    let segments = 1;
    if (this.isSmall) { 
      segments = age < 50 ? 1 : 2; 
    } else {
      if (age < 15) segments = 3;
      else if (age < 40) segments = 8;
      else if (age < 75) segments = 15;
      else segments = 24; // High definition for mature plants
    }

    const totalHeight = mapRange(age, 0, 100, this.isSmall ? 0.2 : 0.4, this.isSmall ? 1.0 : 6.0);
    const segmentHeight = totalHeight / segments;
    const baseThickness = mapRange(age, 0, 100, 0.04, 0.25);
    
    let currentY = this.isSmall ? 0.05 : 0.61;
    const goldenAngle = 2.39996; // Botanical spiral (approx 137.5 degrees)

    for (let i = 0; i < segments; i++) {
      const topT = (i + 1) / segments;
      const bottomT = i / segments;
      const sTopThickness = baseThickness * (1 - topT * 0.8);
      const sBottomThickness = baseThickness * (1 - bottomT * 0.8);
      
      const stemGeo = new THREE.CylinderGeometry(sTopThickness, sBottomThickness, segmentHeight, 12);
      stemGeo.translate(0, segmentHeight / 2, 0);
      
      const healthyColor = new THREE.Color(0x2e7d32).lerp(new THREE.Color(0x8bc34a), topT);
      let stemColor = healthyColor.lerp(new THREE.Color(0x8b7355), (1 - healthFactor) * 0.8);
      
      // Make base more woody
      if (!this.isSmall && i < segments * 0.3) {
          stemColor.lerp(new THREE.Color(0x5d4037), 0.3 * (1 - (i / (segments * 0.3))));
      }
      
      if (isDiseased) stemColor.lerp(new THREE.Color(0x3e2723), 0.6);

      const stemMat = new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.8 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = currentY;
      
      // Organic sway and droop
      const sway = Math.sin(Date.now() * 0.001 + i * 0.3) * 0.02 * (i + 1);
      const segmentDroop = (droopAmount * (i + 1) / segments) + sway;
      const organicCurveX = (Math.sin(i * 0.5) * 0.04) * (age / 100);
      
      stem.rotation.z = segmentDroop; 
      stem.rotation.x = organicCurveX; 
      stem.rotation.y = sway * 0.1;
      
      stem.castShadow = true; 
      this.stems.push(stem); 
      this.group.add(stem);
      
      if (pests > 0 && (i + Math.random()) > (segments - (pests/2))) { 
        this.addPestMarker(stem, segmentHeight, sBottomThickness); 
      }

      // Realistic alternating/spiral leaf placement
      if (age > 10) {
          const leafChance = this.isSmall ? 0.2 : 0.5;
          // Every few segments, place a leaf on an alternating side
          if (i % 2 === 0 && Math.random() < leafChance) {
              const radialOffset = (i * goldenAngle); // Spiral pattern
              const verticalOffset = segmentHeight * 0.5;
              this.addLeaf(stem, verticalOffset, i, healthFactor, age < 20 && i === 0, isDiseased, pests, radialOffset, age);
          }
      }

      // Calculate next segment position based on current rotation
      currentY += segmentHeight * Math.cos(stem.rotation.z) * Math.cos(stem.rotation.x);
    }
    
    if (stage === 'Mature' && health > 60) {
      this.addFlower(currentY, healthFactor, isDiseased, age === 100, isHarvestable);
    }
  }

  addPestMarker(parent: THREE.Object3D, height: number, thickness: number) {
      const pestGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const pestMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.2 });
      const pest = new THREE.Mesh(pestGeo, pestMat);
      pest.position.y = Math.random() * height;
      const angle = Math.random() * Math.PI * 2;
      pest.position.x = Math.cos(angle) * (thickness + 0.02); pest.position.z = Math.sin(angle) * (thickness + 0.02);
      parent.add(pest);
  }

  addLeaf(parent: THREE.Mesh, yPos: number, index: number, healthFactor: number, isCotyledon: boolean, isDiseased: boolean, pests: number, rotationY: number, age: number) {
    const leafShape = new THREE.Shape();
    if (isCotyledon) { 
      leafShape.moveTo(0, 0); 
      leafShape.absellipse(0, 0.2, 0.15, 0.2, 0, Math.PI * 2, false, 0); 
    } else { 
      leafShape.moveTo(0, 0); 
      leafShape.bezierCurveTo(0.2, 0.2, 0.4, 0.5, 0, 0.9); 
      leafShape.bezierCurveTo(-0.4, 0.5, -0.2, 0.2, 0, 0); 
    }
    
    const baseSize = isCotyledon ? 0.4 : mapRange(index, 0, 24, 0.5, 1.8);
    const sizeJitter = baseSize * (0.9 + Math.random() * 0.3) * (this.isSmall ? 0.6 : 1.0);
    const extrudeSettings = { depth: 0.01, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01 };
    const leafGeo = new THREE.ExtrudeGeometry(leafShape, extrudeSettings);
    
    const baseGreen = new THREE.Color(0x1b5e20);
    const lightGreen = new THREE.Color(0x8bc34a);
    let leafColor = lerpColor(baseGreen, lightGreen, Math.min(1, index / 15));
    
    leafColor.lerp(new THREE.Color(0xbf9000), (1 - healthFactor));
    if (isDiseased) leafColor.lerp(new THREE.Color(0x3e2723), 0.7);
    
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, side: THREE.DoubleSide, roughness: 0.6 });
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.scale.set(sizeJitter, sizeJitter, sizeJitter);
    
    leaf.position.y = yPos; 
    leaf.rotation.x = Math.PI / 4 + (Math.random() - 0.5) * 0.2; 
    leaf.rotation.y = rotationY; 
    leaf.castShadow = true; 
    parent.add(leaf);
  }

  addFlower(y: number, healthFactor: number, isDiseased: boolean, isGiant: boolean, isHarvestable: boolean) {
    const c = this.flowerColor.clone();
    if (isDiseased) c.lerp(new THREE.Color(0x4a148c), 0.7);
    const emissiveIntensity = isGiant && isHarvestable ? 1.0 + Math.sin(Date.now() * 0.005) * 0.5 : 0.3;
    const mat = new THREE.MeshStandardMaterial({ 
        color: c, 
        emissive: isDiseased ? 0x100010 : c, 
        emissiveIntensity: emissiveIntensity,
        roughness: 0.3 
    });
    
    let flowerMesh: THREE.Object3D;
    const flowerScale = isGiant ? 4.0 : 1.8;

    switch (this.flowerType) {
        case 1: flowerMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat); break;
        case 2:
            flowerMesh = new THREE.Group();
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xaa8800, emissiveIntensity: isGiant ? 0.5 : 0.1 }));
            flowerMesh.add(core);
            for (let i = 0; i < 8; i++) {
                const petal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
                const angle = (i / 8) * Math.PI * 2;
                petal.position.set(Math.cos(angle) * 0.25, 0, Math.sin(angle) * 0.25);
                petal.scale.set(1, 0.4, 1);
                flowerMesh.add(petal);
            }
            break;
        case 3:
            flowerMesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 12, 32), mat);
            const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 12, 32), mat);
            flowerMesh.add(ring2);
            break;
        default: flowerMesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.08, 64, 8, 2, 3), mat);
    }
    
    this.flower = flowerMesh;
    this.flower.position.y = y + 0.2;
    this.flower.rotation.x = Math.PI / 2;
    this.flower.scale.setScalar(healthFactor * flowerScale);
    if (isGiant && !isHarvestable) {
        this.flower.scale.multiplyScalar(0.7);
        (mat as THREE.MeshStandardMaterial).opacity = 0.5;
        (mat as THREE.MeshStandardMaterial).transparent = true;
    }
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
  count = 200; active = false; color: number;
  constructor(color: number = 0x4fc3f7) {
    this.color = color; this.group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3); this.velocities = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) this.resetParticle(i);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({ color: this.color, size: 0.05, transparent: true, opacity: 0.8 });
    this.points = new THREE.Points(geo, mat); this.group.add(this.points); this.group.visible = false;
  }
  resetParticle(i: number) {
    this.positions[i * 3] = (Math.random() - 0.5) * 1.5; this.positions[i * 3 + 1] = 4 + Math.random() * 2; this.positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    this.velocities[i * 3 + 1] = -0.15 - Math.random() * 0.1;
  }
  trigger() { this.active = true; this.group.visible = true; setTimeout(() => { this.active = false; this.group.visible = false; }, 1500); }
  update() {
    if (!this.active) return;
    const pos = this.points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.count; i++) { pos[i * 3 + 1] += this.velocities[i * 3 + 1]; if (pos[i * 3 + 1] < 0.2) this.resetParticle(i); }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// --- Tooltip Component ---
const Tooltip: React.FC<{ text: string; x: number; y: number }> = ({ text, x, y }) => {
  return (
    <div className="fixed z-[100] glass px-4 py-2 text-xs font-semibold text-gray-700 pointer-events-none shadow-xl transform -translate-x-1/2 -translate-y-[120%] animate-in fade-in zoom-in duration-200" style={{ left: x, top: y }}>
      <div className="relative"> {text} <div className="absolute left-1/2 -bottom-[12px] -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/70" /> </div>
    </div>
  );
};

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
  const [hoverTip, setHoverTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [lastHarvestTime, setLastHarvestTime] = useState(0);

  const plantRef = useRef<Plant | null>(null);
  const helperRef = useRef<GardenHelper | null>(null);
  const wellRef = useRef<WaterWell | null>(null);
  const sideGardenRef = useRef<SideGarden | null>(null);
  const waterRef = useRef<ParticleEffect | null>(null);
  const grassRef = useRef<GrassField | null>(null);
  const cloudsRef = useRef<CloudSystem | null>(null);
  const sunRef = useRef<HappySun | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const isHarvestable = age >= 99 && (Date.now() - lastHarvestTime > HARVEST_COOLDOWN_MS);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa8d8ea); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.set(12, 12, 12); camera.lookAt(0, 3, 0); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directional = new THREE.DirectionalLight(0xffffff, 1.2); directional.position.set(5, 10, 5); directional.castShadow = true; scene.add(directional);
    const groundGeo = new THREE.CircleGeometry(10, 64); const grassTexture = createGrassTexture();
    const groundMat = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1.0, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); groundRef.current = ground;
    const grassField = new GrassField(); scene.add(grassField.group); grassRef.current = grassField;
    const clouds = new CloudSystem(); scene.add(clouds.group); cloudsRef.current = clouds;
    const sun = new HappySun(); scene.add(sun.group); sunRef.current = sun;
    const well = new WaterWell(); scene.add(well.group); wellRef.current = well;
    const sideGarden = new SideGarden(); scene.add(sideGarden.group); sideGardenRef.current = sideGarden;
    const plant = new Plant(); scene.add(plant.group); plantRef.current = plant;
    const helper = new GardenHelper(); scene.add(helper.group); helperRef.current = helper;
    const waterPart = new ParticleEffect(0x4fc3f7); scene.add(waterPart.group); waterRef.current = waterPart;
    const animate = () => {
      requestAnimationFrame(animate);
      if (waterRef.current) waterRef.current.update();
      if (helperRef.current) helperRef.current.update();
      if (grassRef.current) grassRef.current.update();
      if (cloudsRef.current) cloudsRef.current.update();
      if (sunRef.current) sunRef.current.update(isDay);
      if (plant.group) plant.group.rotation.y += 0.0006;
      const targetSkyColor = isDay ? 0xa8d8ea : 0x2b3d4f;
      scene.background = (scene.background as THREE.Color).lerp(new THREE.Color(targetSkyColor), 0.05);
      renderer.render(scene, camera);
    };
    animate();
    const handleResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); containerRef.current?.removeChild(renderer.domElement); };
  }, [isDay]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!cameraRef.current || !sceneRef.current || !helperRef.current || !groundRef.current) return;
    if (event.button !== 0) return;
    mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1; mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const helperIntersects = raycaster.current.intersectObject(helperRef.current.group, true);
    if (helperIntersects.length > 0) { const newSelected = !isHelperSelected; setIsHelperSelected(newSelected); helperRef.current.updateSelection(newSelected); setMessage(newSelected ? "Helper Bot-Z Targeted!" : "Helper Bot-Z Deselected."); return; }
    if (isHelperSelected) {
      const groundIntersects = raycaster.current.intersectObject(groundRef.current);
      if (groundIntersects.length > 0) { helperRef.current.targetPosition.copy(groundIntersects[0].point); setIsTreatingRequested(false); setMessage("Bot-Z heading to new location."); }
    }
  };

  const onContextMenu = (event: React.MouseEvent) => { event.preventDefault(); if (isHelperSelected && helperRef.current) { setIsHelperSelected(false); helperRef.current.updateSelection(false); setMessage("Helper Bot-Z Deselected."); } };

  useEffect(() => {
    const timer = setInterval(() => {
      setWater(w => Math.max(0, w - WATER_LOSS_RATE));
      if (isDay) { setSunlight(s => Math.min(MAX_VALUE, s + SUNLIGHT_CHANGE_RATE)); setRest(r => Math.max(0, r - NATURAL_DECAY)); } 
      else { setRest(r => Math.min(MAX_VALUE, r + REST_CHANGE_RATE)); setSunlight(s => Math.max(0, s - NATURAL_DECAY)); }
      if (helperRef.current && wellRef.current && sideGardenRef.current) {
        const hPos = helperRef.current.group.position;
        const distWell = hPos.distanceTo(wellRef.current.group.position);
        const distPlant = hPos.distanceTo(new THREE.Vector3(0, 0, 0));
        const distSideGarden = hPos.distanceTo(sideGardenRef.current.group.position);
        if (distWell < 1.0 && !helperRef.current.hasWater) { helperRef.current.setHasWater(true); setHelperStatus("Carrying Water"); setMessage("Bot-Z gathered water!"); }
        if (distPlant < 1.2 && helperRef.current.hasWater) { helperRef.current.setHasWater(false); setHelperStatus("Empty"); setWater(w => Math.min(MAX_WATER, w + HELPER_WATER_BOOST)); setHealth(h => Math.min(MAX_HEALTH, h + 5)); waterRef.current?.trigger(); setMessage("Bot-Z is watering the plant!"); }
        if (isTreatingRequested) {
          helperRef.current.targetPosition.set(0, 0.5, 0); setHelperStatus("Treating Main Plant");
          if (distPlant < 1.2) { setPests(0); setIsDiseased(false); setIsTreatingRequested(false); setHelperStatus("Empty"); setMessage("Bot-Z has treated the plant!"); }
        }
        if (distSideGarden < 1.5 && !helperRef.current.hasWater && !isTreatingRequested) {
          setHelperStatus("Working Side Garden");
          sideGardenRef.current.healths = sideGardenRef.current.healths.map(h => Math.min(100, h + 0.6));
          sideGardenRef.current.ages = sideGardenRef.current.ages.map((a, i) => {
             const nextA = Math.min(100, a + GROWTH_SPEED * SIDE_GARDEN_FAST_GROWTH);
             if (a < 100 && nextA >= 100) { setZenPoints(pts => pts + 50); setMessage("Side bloom achieved! +50 Zen Points"); }
             return nextA;
          });
        } else if (helperStatus === "Working Side Garden" && distSideGarden >= 1.5) { setHelperStatus("Empty"); }
      }
      if (sideGardenRef.current) { sideGardenRef.current.healths = sideGardenRef.current.healths.map(h => Math.max(0, h - 0.05)); sideGardenRef.current.ages = sideGardenRef.current.ages.map(a => Math.min(100, a + 0.005)); }
      setHealth(h => {
        let hDelta = 0; setWater(w => { if (w < 15) hDelta -= 0.2; return w; }); if (isDiseased) hDelta -= DISEASE_HEALTH_DRAIN;
        if (sunlight > 70 && rest > 70) hDelta += 0.05; return Math.min(MAX_HEALTH, Math.max(0, h + hDelta));
      });
      setAge(a => {
        let aDelta = 0; if (health > 50) { aDelta = GROWTH_SPEED * (isDay ? 1 : 0.2); if (sunlight > 60 && rest > 60) aDelta *= 1.8; }
        return Math.min(100, a + aDelta);
      });
      if (Math.random() < 0.003) { setPests(p => Math.min(10, p + 1)); setMessage("Warning: Pests spotted!"); }
    }, 100);
    return () => clearInterval(timer);
  }, [isDay, isDiseased, isHelperSelected, helperStatus, isTreatingRequested, health, water, sunlight, rest, pests]);

  useEffect(() => {
    if (plantRef.current) plantRef.current.update(age, health, water, pests, isDiseased, isHarvestable);
    if (sideGardenRef.current) sideGardenRef.current.update();
  }, [age, health, water, pests, isDiseased, isHarvestable]);

  const resetGarden = () => {
    setAge(0); setHealth(100); setWater(100); setPests(0); setZenPoints(0); setIsDiseased(false); setIsTreatingRequested(false); setLastHarvestTime(0);
    if(sideGardenRef.current) { sideGardenRef.current.ages = [0, 0, 0]; sideGardenRef.current.healths = [80, 80, 80]; }
    if(plantRef.current) { plantRef.current.flowerColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6); plantRef.current.flowerType = Math.floor(Math.random() * 4); }
    setMessage("Garden reset.");
  };

  const harvestFlower = () => {
    if (isHarvestable) {
        setZenPoints(p => p + 500);
        setLastHarvestTime(Date.now());
        setMessage("Giant Bloom Harvested! +500 Zen Points");
        if (plantRef.current) {
            plantRef.current.flowerColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
            plantRef.current.flowerType = Math.floor(Math.random() * 4);
        }
    }
  };

  const handleStatHover = (event: React.MouseEvent, text: string) => { setHoverTip({ text, x: event.clientX, y: event.clientY }); };
  const handleStatLeave = () => { setHoverTip(null); };

  return (
    <div className="relative w-full h-full select-none overflow-hidden" onPointerDown={onPointerDown} onContextMenu={onContextMenu}>
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {hoverTip && <Tooltip {...hoverTip} />}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto cursor-help" onMouseEnter={(e) => handleStatHover(e, "Grow your garden to earn Zen Points. Side garden blooms reward +50 points! Giant blooms reward +500!")} onMouseLeave={handleStatLeave}>
        <div className="glass px-8 py-2 border-b-4 border-yellow-500 shadow-2xl">
          <span className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400 block text-center">Zen Points</span>
          <span className="text-3xl font-black text-yellow-600 block text-center tabular-nums">{zenPoints.toLocaleString()}</span>
        </div>
      </div>
      <div className="absolute top-8 left-8 z-10 space-y-4 max-w-xs w-full pointer-events-none">
        <div className="glass p-6 shadow-xl pointer-events-auto border-t-4 border-green-400">
          <h1 className="text-2xl font-bold text-green-800 mb-1">Zen Bloom</h1>
          <p className="text-xs text-green-600 tracking-wider uppercase font-semibold mb-4">{age < 30 ? 'Seedling' : age < 70 ? 'Young Plant' : 'Mature Bloom'}</p>
          <div className="space-y-4">
            <div onMouseEnter={(e) => handleStatHover(e, "Hydration: Plants need water! Low water reduces vitality. Use the 💧 button or Bot-Z.")} onMouseLeave={handleStatLeave} className="cursor-help">
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase"><span>💧 Hydration</span><span>{Math.round(water)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="progress-bar bg-blue-400" style={{ width: `${water}%` }} /></div>
            </div>
            <div onMouseEnter={(e) => handleStatHover(e, "Sunlight: Boosts growth during the day. It depletes slowly at night.")} onMouseLeave={handleStatLeave} className="cursor-help">
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase"><span>☀️ Sunlight</span><span>{Math.round(sunlight)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="progress-bar bg-amber-400" style={{ width: `${sunlight}%` }} /></div>
            </div>
            <div onMouseEnter={(e) => handleStatHover(e, "Rest: Plants recover during the night cycle. High rest synergizes with sunlight for super growth!")} onMouseLeave={handleStatLeave} className="cursor-help">
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase"><span>💤 Rest</span><span>{Math.round(rest)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="progress-bar bg-indigo-400" style={{ width: `${rest}%` }} /></div>
            </div>
            <div onMouseEnter={(e) => handleStatHover(e, "Vitality: The overall health of your plant. If it falls to 0, the plant stops growing.")} onMouseLeave={handleStatLeave} className="cursor-help">
              <div className="flex justify-between text-xs mb-1 text-gray-600 font-bold uppercase"><span>🌱 Vitality</span><span>{Math.round(health)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="progress-bar bg-green-500" style={{ width: `${health}%` }} /></div>
            </div>
          </div>
        </div>
        <div className="glass p-4 text-center pointer-events-auto shadow-sm"><p className="text-sm italic text-gray-600">"{message}"</p></div>
      </div>
      <div className="absolute top-8 right-8 flex flex-col items-end gap-2 pointer-events-none">
         <div className={`glass p-4 w-48 shadow-lg pointer-events-auto border-t-4 transition-all duration-500 cursor-help ${isHelperSelected ? 'border-green-500 scale-105' : 'border-transparent'}`} onMouseEnter={(e) => handleStatHover(e, "Bot-Z: Automated gardener. Click to select, click ground to move. Fetches water and kills pests!")} onMouseLeave={handleStatLeave}>
            <h2 className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Helper Bot-Z</h2>
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full transition-colors ${helperStatus !== 'Empty' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-sm font-bold text-gray-700 leading-tight">{helperStatus}</span>
            </div>
         </div>
         <button onClick={resetGarden} className="glass px-4 py-2 text-xs font-bold text-gray-400 hover:text-red-400 pointer-events-auto shadow-sm transition-colors">RESET GARDEN</button>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex space-x-4">
        {isHarvestable && (
            <button onClick={harvestFlower} className="glass px-6 py-3 font-semibold text-yellow-800 bg-yellow-400/30 hover:bg-yellow-400/50 transition-all active:scale-95 flex flex-col items-center shadow-lg border-2 border-yellow-500 animate-bounce" onMouseEnter={(e) => handleStatHover(e, "Harvest the giant bloom for 500 Zen Points!")} onMouseLeave={handleStatLeave}>
                <span className="text-xl">🌸</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Harvest</span>
            </button>
        )}
        <button onClick={() => { setWater(w => Math.min(MAX_WATER, w + WATER_BOOST)); waterRef.current?.trigger(); }} className="glass px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 transition-all active:scale-95 flex flex-col items-center shadow-md" onMouseEnter={(e) => handleStatHover(e, "Hydrate the plant immediately.")} onMouseLeave={handleStatLeave}><span className="text-xl">💧</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Water</span></button>
        <button onClick={() => { setAge(a => Math.min(100, a + 5)); setHealth(h => Math.min(MAX_HEALTH, h + NUTRIENT_BOOST)); }} className="glass px-6 py-3 font-semibold text-green-700 hover:bg-green-50 transition-all active:scale-95 flex flex-col items-center shadow-md" onMouseEnter={(e) => handleStatHover(e, "Instantly grow and heal the plant using nutrients.")} onMouseLeave={handleStatLeave}><span className="text-xl">✨</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Fertilize</span></button>
        {(pests > 0 || isDiseased) && (<button onClick={() => setIsTreatingRequested(true)} className="glass px-6 py-3 font-semibold text-red-700 hover:bg-red-50 transition-all active:scale-95 flex flex-col items-center shadow-lg animate-bounce group" onMouseEnter={(e) => handleStatHover(e, "Send Bot-Z to treat pest infestation and disease.")} onMouseLeave={handleStatLeave}><span className="text-xl group-hover:rotate-12 transition-transform">🧪</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">Bot-Z Treat</span></button>)}
        <button onClick={() => setIsDay(!isDay)} className="glass px-6 py-3 font-semibold text-yellow-700 hover:bg-yellow-50 transition-all active:scale-95 flex flex-col items-center shadow-md" onMouseEnter={(e) => handleStatHover(e, "Toggle Day/Night. Sunlight increases in day, Rest increases at night.")} onMouseLeave={handleStatLeave}><span className="text-xl">{isDay ? '☀️' : '🌙'}</span><span className="text-xs mt-1 uppercase tracking-widest font-bold">{isDay ? 'Day' : 'Night'}</span></button>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) { const root = createRoot(container); root.render(<App />); }
