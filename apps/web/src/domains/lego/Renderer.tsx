"use client";
// LEGO renderer (PRD §13.1): procedural bricks instanced from the manual's LDraw transforms.
// Swap `BrickGeometry` for LDrawLoader part geometry later; the placement math stays the same.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { RendererProps } from "@/core/plugin";
import type { LegoPlacement, PartInstance } from "@/core/types";
import { COLORS, dimsOf } from "./dims";

const FLY_IN_LDU = 72; // three bricks above the target
const FLY_IN_S = 0.6;

type Phase = "hidden" | "placed" | "current";

function ldrawMatrix(p: LegoPlacement): THREE.Matrix4 {
  const [a, b, c, d, e, f, g, h, i] = p.rot;
  return new THREE.Matrix4().set(a, b, c, p.pos[0], d, e, f, p.pos[1], g, h, i, p.pos[2], 0, 0, 0, 1);
}

function Brick({ inst, phase, animateKey, order }: { inst: PartInstance<LegoPlacement>; phase: Phase; animateKey: number; order: number }) {
  const [sx, sz, h] = dimsOf(inst.placement.ldrawPart);
  const color = COLORS[inst.placement.ldrawColor] ?? "#888";
  const matrix = useMemo(() => ldrawMatrix(inst.placement), [inst.placement]);
  const outer = useRef<THREE.Group>(null);
  const opacity = useRef(phase === "hidden" ? 0 : 1);
  const t = useRef(1);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  useEffect(() => {
    if (phase === "current") t.current = -(order * 0.08) / FLY_IN_S;
  }, [animateKey, order, phase]);
  useFrame((_, dt) => {
    if (!outer.current) return;
    const targetOpacity = phase === "hidden" ? 0 : 1;
    opacity.current += (targetOpacity - opacity.current) * (1 - Math.exp(-dt * 10));
    for (const material of materials.current) material.opacity = opacity.current;
    outer.current.visible = opacity.current > 0.01;
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / FLY_IN_S);
      const e = t.current < 0 ? 0 : 1 - Math.pow(1 - t.current, 4);
      outer.current.position.y = -FLY_IN_LDU * (1 - e); // LDraw: -Y is up
    } else outer.current.position.y = 0;
  });
  const studs: [number, number][] = [];
  for (let i = 0; i < sx; i++) for (let j = 0; j < sz; j++) studs.push([-sx * 10 + 10 + i * 20, -sz * 10 + 10 + j * 20]);
  return (
    <group ref={outer}>
      <group matrix={matrix} matrixAutoUpdate={false}>
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[sx * 20 - 0.6, h - 0.4, sz * 20 - 0.6]} />
          <meshStandardMaterial ref={(material) => { if (material) materials.current[0] = material; }} color={color} transparent opacity={1} depthWrite roughness={0.45} metalness={0.05} />
          <Edges color={phase === "current" ? "#ffb020" : "#ffffff"} threshold={15} transparent opacity={phase === "current" ? 0.9 : 0.35} />
        </mesh>
        {studs.map(([x, z], k) => (
          <mesh key={k} position={[x, -2, z]}>
            <cylinderGeometry args={[6, 6, 4, 20]} />
            <meshStandardMaterial ref={(material) => { if (material) materials.current[k + 1] = material; }} color={color} transparent opacity={1} depthWrite roughness={0.45} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Smoothly re-targets the orbit controls at the parts placed so far. */
function Framer({ target, size }: { target: THREE.Vector3; size: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const framed = useRef(false);
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const d = Math.max(240, size * 2.2);
    if (!framed.current) {
      framed.current = true;
      c.target.copy(target);
      camera.position.set(target.x + d * 0.7, target.y + d * 0.6, target.z + d * 0.7);
    } else {
      c.target.lerp(target, 0.08);
      const dir = camera.position.clone().sub(c.target).normalize();
      camera.position.lerp(c.target.clone().add(dir.multiplyScalar(d)), 0.06);
    }
    c.update();
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.1} />;
}

function Snapshot({ register }: { register?: (fn: () => Promise<Blob | null>) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    register?.(
      () =>
        new Promise((resolve) => {
          gl.render(scene, camera);
          gl.domElement.toBlob((b) => resolve(b), "image/png");
        }),
    );
  }, [gl, scene, camera, register]);
  return null;
}

export function LegoRenderer({ manual, step, direction, registerSnapshot }: RendererProps<LegoPlacement>) {
  const stepOf = useMemo(() => {
    const m = new Map<string, number>();
    manual.steps.forEach((s) => s.add.forEach((id) => m.set(id, s.n)));
    return m;
  }, [manual]);

  const { target, size } = useMemo(() => {
    const box = new THREE.Box3();
    for (const p of manual.parts) {
      const n = stepOf.get(p.id) ?? 0;
      if (n > step) continue;
      const [sx, sz, h] = dimsOf(p.placement.ldrawPart);
      const m = ldrawMatrix(p.placement);
      const local = new THREE.Box3(new THREE.Vector3(-sx * 10, 0, -sz * 10), new THREE.Vector3(sx * 10, h, sz * 10)).applyMatrix4(m);
      box.union(local);
    }
    if (box.isEmpty()) return { target: new THREE.Vector3(0, 0, 0), size: 160 };
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).length();
    // LDraw → three: the scene group is rotated π about X, so (x, y, z) → (x, -y, -z).
    return { target: new THREE.Vector3(c.x, -c.y, -c.z), size: s };
  }, [manual, step, stepOf]);

  // Fly-in only when moving forward; scrolling back just removes parts.
  const animateKey = direction === "forward" ? step : -1;

  return (
    <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 35, near: 1, far: 5000, position: [300, 260, 300] }} dpr={[1, 2]}>
      <color attach="background" args={["#0f1318"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[300, 500, 200]} intensity={1.4} />
      <directionalLight position={[-200, 200, -300]} intensity={0.4} />
      <gridHelper args={[800, 40, "#2a333d", "#1c232b"]} position={[0, 0, 0]} />
      <group rotation={[Math.PI, 0, 0]}>
        {manual.parts.map((p) => {
          const n = stepOf.get(p.id) ?? 0;
          const phase: Phase = n > step ? "hidden" : n === step ? "current" : "placed";
          const order = n === step ? (manual.steps[n - 1]?.add.indexOf(p.id) ?? 0) : 0;
          return <Brick key={p.id} inst={p} phase={phase} animateKey={animateKey} order={order} />;
        })}
      </group>
      <Framer target={target} size={size} />
      <Snapshot register={registerSnapshot} />
    </Canvas>
  );
}
