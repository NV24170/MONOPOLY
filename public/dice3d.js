import * as THREE from "/vendor/three/three.module.js";

const faceValues = [2, 5, 1, 6, 3, 4];
const faceNormals = {
  1: new THREE.Vector3(0, 1, 0),
  2: new THREE.Vector3(1, 0, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
  5: new THREE.Vector3(-1, 0, 0),
  6: new THREE.Vector3(0, -1, 0),
};
const pipLayouts = {
  1: [[64, 64]],
  2: [[32, 32], [96, 96]],
  3: [[32, 32], [64, 64], [96, 96]],
  4: [[32, 32], [96, 32], [32, 96], [96, 96]],
  5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
  6: [[32, 28], [96, 28], [32, 64], [96, 64], [32, 100], [96, 100]],
};

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function makeFaceTexture(value) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f5ef";
  roundedRect(context, 3, 3, 122, 122, 18);
  context.fill();
  context.strokeStyle = "#d6d2c7";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#242128";
  for (const [x, y] of pipLayouts[value]) {
    context.beginPath();
    context.arc(x, y, 10, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function orientationFor(value, yaw) {
  const up = new THREE.Vector3(0, 1, 0);
  const alignFace = new THREE.Quaternion().setFromUnitVectors(faceNormals[value], up);
  const turn = new THREE.Quaternion().setFromAxisAngle(up, yaw);
  return turn.multiply(alignFace);
}

export function createDiceAnimator(container) {
  if (!container || !window.WebGLRenderingContext) return null;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50);
  camera.position.set(0, 2.45, 5.65);
  camera.lookAt(0, 0, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  container.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.setAttribute("aria-busy", "false");

  scene.add(new THREE.HemisphereLight(0xe7edff, 0x41304e, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.3);
  keyLight.position.set(-3, 5, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9a76ff, 1.5);
  rimLight.position.set(3, 2, -4);
  scene.add(rimLight);

  const faceMaterials = faceValues.map(value => new THREE.MeshStandardMaterial({
    map: makeFaceTexture(value),
    roughness: 0.3,
    metalness: 0.02,
  }));
  const dice = [-0.58, 0.58].map((x, index) => {
    const geometry = new THREE.BoxGeometry(0.88, 0.88, 0.88);
    const mesh = new THREE.Mesh(geometry, faceMaterials);
    mesh.position.set(x, 0, index === 0 ? 0.06 : -0.06);
    mesh.quaternion.copy(orientationFor(index === 0 ? 2 : 5, index * 0.32));
    mesh.rotateZ(index === 0 ? -0.16 : 0.16);
    mesh.rotateX(index === 0 ? 0.08 : -0.08);
    scene.add(mesh);
    return mesh;
  });

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
  let rollAnimation = null;
  let frameId = 0;
  const clock = new THREE.Clock();

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function renderFrame() {
    frameId = requestAnimationFrame(renderFrame);
    const elapsed = clock.getElapsedTime();
    if (rollAnimation) {
      const progress = Math.min(1, (performance.now() - rollAnimation.start) / rollAnimation.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      dice.forEach((mesh, index) => {
        const roll = rollAnimation.dice[index];
        mesh.rotation.set(
          roll.from.x + (roll.to.x - roll.from.x) * eased,
          roll.from.y + (roll.to.y - roll.from.y) * eased,
          roll.from.z + (roll.to.z - roll.from.z) * eased,
        );
        mesh.position.y = Math.sin(progress * Math.PI) * (index ? 0.48 : 0.34);
      });
      if (progress >= 1) {
        dice.forEach((mesh, index) => {
          mesh.rotation.copy(rollAnimation.dice[index].target);
          mesh.position.y = 0;
        });
        rollAnimation = null;
        container.setAttribute("aria-busy", "false");
      }
    } else if (!reduceMotion) {
      dice.forEach((mesh, index) => {
        mesh.position.y = Math.sin(elapsed * 1.4 + index) * 0.035;
        mesh.rotation.z += Math.sin(elapsed * 0.8 + index) * 0.00025;
      });
    }
    renderer.render(scene, camera);
  }

  frameId = requestAnimationFrame(renderFrame);

  return {
    rollTo(values) {
      if (!Array.isArray(values) || values.length !== 2 || values.some(value => value < 1 || value > 6)) return;
      container.setAttribute("aria-busy", reduceMotion ? "false" : "true");
      const targetRotations = values.map((value, index) => {
        const target = new THREE.Euler().setFromQuaternion(orientationFor(value, index * 0.38), "XYZ");
        target.x += (index ? -1 : 1) * Math.PI * 4;
        target.y += Math.PI * 4;
        target.z += (index ? 1 : -1) * Math.PI * 2;
        return target;
      });
      if (reduceMotion) {
        dice.forEach((mesh, index) => {
          mesh.rotation.copy(targetRotations[index]);
          mesh.position.y = 0;
        });
        return;
      }
      rollAnimation = {
        start: performance.now(),
        duration: 940,
        dice: dice.map((mesh, index) => ({
          from: mesh.rotation.clone(),
          to: targetRotations[index],
          target: new THREE.Euler().setFromQuaternion(orientationFor(values[index], index * 0.38), "XYZ"),
        })),
      };
    },
    dispose() {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scene.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
