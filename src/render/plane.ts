// Stylised procedural plane (Assumptions: simple shape, no assets). Three boxes, one material.
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

export function createPlaneMesh(): Group {
  const material = new MeshBasicMaterial({ color: 0x3a3350 });
  const fuselage = new Mesh(new BoxGeometry(1.2, 1.2, 6), material);
  const wing = new Mesh(new BoxGeometry(8, 0.25, 1.6), material);
  wing.position.y = 0.2;
  const tail = new Mesh(new BoxGeometry(2.6, 0.2, 1), material);
  tail.position.set(0, 0.6, -2.6);
  const group = new Group();
  group.add(fuselage, wing, tail);
  return group;
}
