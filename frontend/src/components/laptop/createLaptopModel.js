import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { screenHomography } from "./laptopMath";

// Original procedural model, calibrated against the supplied silver laptop.
// All geometry/material source is included; no external model/license needed.
export function createLaptopModel(screenTexture) {
    const root = new THREE.Group();
    const base = new THREE.Group();
    const hinge = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x777772, metalness: .82, roughness: .4 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x4b4d49, metalness: .75, roughness: .4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x121515, metalness: .1, roughness: .55 });
    const keyMaterial = new THREE.MeshStandardMaterial({ color: 0x101211, roughness: .7, envMapIntensity: .3 });
    const mesh = (w, h, d, material, radius = .025) => {
        const item = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
        item.castShadow = true; item.receiveShadow = true;
        return item;
    };
    const chassis = mesh(3.5, .065, 2.12, metal, .027);
    chassis.position.y = .0325;
    base.add(chassis);
    const lowerEdge = mesh(3.4, .018, 2.03, edge, .008);
    lowerEdge.position.y = .009; base.add(lowerEdge);
    const keyboardWell = mesh(3.13, .009, 1.01, black, .025);
    keyboardWell.position.set(0, .069, -.34); base.add(keyboardWell);

    // Individual beveled keycaps remain fixed with the keyboard/base.
    const keyGeometry = new RoundedBoxGeometry(.183, .01, .126, 2, .007);
    const keys = new THREE.InstancedMesh(keyGeometry, keyMaterial, 70);
    const transform = new THREE.Object3D();
    let index = 0;
    for (let row = 0; row < 5; row += 1) for (let col = 0; col < 14; col += 1) {
        transform.position.set((col - 6.5) * .217, .078, -.73 + row * .17);
        transform.updateMatrix(); keys.setMatrixAt(index++, transform.matrix);
    }
    keys.castShadow = true; keys.receiveShadow = true; base.add(keys);
    const space = mesh(1.24, .01, .13, keyMaterial, .007);
    space.position.set(0, .078, .12); base.add(space);
    const padEdge = mesh(1.36, .006, .66, edge, .035);
    padEdge.position.set(0, .068, .61); base.add(padEdge);
    const pad = mesh(1.34, .006, .64, metal, .03);
    pad.position.set(0, .071, .61); base.add(pad);
    const notch = mesh(.44, .02, .012, edge, .006);
    notch.position.set(0, .052, 1.057); base.add(notch);

    const legendsCanvas = document.createElement("canvas");
    legendsCanvas.width = 2048; legendsCanvas.height = 640;
    const ink = legendsCanvas.getContext("2d");
    ink.fillStyle = "#b8b7ad"; ink.font = "22px monospace"; ink.textAlign = "center"; ink.textBaseline = "middle";
    const rows = ["esc · · · · · · · · · · · · ⌫", "` 1 2 3 4 5 6 7 8 9 0 - = ⌫", "⇥ Q W E R T Y U I O P [ ] \\", "⇪ A S D F G H J K L ; ' ↵ ·", "⇧ Z X C V B N M , . / ⇧ · ·"];
    rows.forEach((row, r) => row.split(" ").forEach((label, c) => {
        const x = (((c - 6.5) * .217 + 1.565) / 3.13) * 2048;
        const y = ((-.73 + r * .17 + .845) / 1.01) * 640;
        ink.fillText(label, x, y);
    }));
    const legends = new THREE.CanvasTexture(legendsCanvas);
    legends.colorSpace = THREE.SRGBColorSpace;
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(3.13, 1.01), new THREE.MeshBasicMaterial({ map: legends, transparent: true, depthWrite: false }));
    letters.rotation.x = -Math.PI / 2; letters.position.set(0, .084, -.34); base.add(letters);

    // Lid coordinates: hinge at z=0, lid extends towards +z while closed.
    // Rotation about local X lifts it into the photographed open position.
    hinge.position.set(0, .112, -1.02);
    const lid = mesh(3.48, .035, 2.04, metal, .024);
    lid.position.z = 1.02; hinge.add(lid);
    const bezel = mesh(3.37, .008, 1.94, black, .02);
    bezel.position.set(0, -.022, 1.02); hinge.add(bezel);
    const mapping = screenHomography();
    const matrix = new THREE.Matrix3().set(...mapping);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.19, 1.77), new THREE.ShaderMaterial({
        uniforms: { image: { value: screenTexture }, screenMap: { value: matrix } },
        vertexShader: `varying vec2 screenUv; void main(){screenUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform sampler2D image; uniform mat3 screenMap; varying vec2 screenUv;
            void main(){vec3 q=screenMap*vec3(screenUv,1.0);gl_FragColor=texture2D(image,q.xy/q.z);
            #include <colorspace_fragment>
            }`,
        toneMapped: false,
    }));
    screen.rotation.x = Math.PI / 2;
    screen.position.set(0, -.027, 1.02); hinge.add(screen);
    const cameraDot = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), black);
    cameraDot.position.set(0, -.027, 1.973); hinge.add(cameraDot);
    const hingeBar = new THREE.Mesh(new THREE.CylinderGeometry(.032, .032, 3.12, 12), black);
    hingeBar.rotation.z = Math.PI / 2; hingeBar.position.set(0, .09, -1.02); base.add(hingeBar);
    root.add(base, hinge);
    return { root, base, hinge, screen };
}
