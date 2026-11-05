import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createLaptopModel } from "./createLaptopModel";
import { openingAngle, SOURCE_WIDTH, SOURCE_HEIGHT } from "./laptopMath";

export async function mountLaptopScene(host, signal) {
    if (signal.aborted) return null;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    let environment;
    let texture;
    let laptop;
    let disposed = false;
    function dispose() {
        if (disposed) return;
        disposed = true;
        const geometries = new Set(), materials = new Set();
        scene.traverse(item => {
            item.shadow?.dispose();
            if (item.geometry) geometries.add(item.geometry);
            for (const material of [].concat(item.material || [])) materials.add(material);
        });
        geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
        materials.forEach(material => {
            for (const value of Object.values(material)) if (value?.isTexture && value !== texture) value.dispose();
        });
        texture?.dispose(); environment?.dispose();
        signal.removeEventListener("abort", dispose);
        renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    signal.addEventListener("abort", dispose, { once: true });
    try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    try {
        environment = pmrem.fromScene(room, .04);
        scene.environment = environment.texture;
        scene.environmentIntensity = .7;
    } finally { pmrem.dispose(); room.dispose(); }
        texture = await new THREE.TextureLoader().loadAsync("/images/landing/sunset-hero-images/hero-1672.jpg");
        texture.colorSpace = THREE.SRGBColorSpace;
        if (signal.aborted) { texture.dispose(); dispose(); return null; }
        laptop = createLaptopModel(texture); scene.add(laptop.root);
        scene.add(new THREE.HemisphereLight(0xffe6ba, 0x513729, .95));
        const sun = new THREE.DirectionalLight(0xffd1a0, 2.3);
        sun.position.set(-5, 8, -4); sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.normalBias = .015; sun.shadow.bias = -.0002;
        scene.add(sun);
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(11, 9), new THREE.ShadowMaterial({ color: 0x201309, opacity: .24 }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; shadow.receiveShadow = true; scene.add(shadow);
        const contactCanvas = document.createElement("canvas"); contactCanvas.width = 256; contactCanvas.height = 256;
        const ctx = contactCanvas.getContext("2d"), gradient = ctx.createRadialGradient(128, 128, 38, 128, 128, 128);
        gradient.addColorStop(0, "rgba(19,12,6,.5)"); gradient.addColorStop(1, "rgba(19,12,6,0)");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
        const contact = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }));
        contact.rotation.x = -Math.PI / 2; contact.position.y = .004; scene.add(contact);
        const camera = new THREE.PerspectiveCamera(31.1, SOURCE_WIDTH / SOURCE_HEIGHT, .1, 50);
        const azimuth = 31.6 * Math.PI / 180, elevation = 13 * Math.PI / 180, distance = 13;
        camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance);
        camera.lookAt(0, 0, 0);
        camera.setViewOffset(SOURCE_WIDTH, SOURCE_HEIGHT, -440, -120, SOURCE_WIDTH, SOURCE_HEIGHT);
        host.append(renderer.domElement);
        function render(progress) {
            if (disposed || signal.aborted) return;
            const angle = openingAngle(progress);
            laptop.hinge.rotation.x = -angle;
            renderer.shadowMap.needsUpdate = true;
            renderer.render(scene, camera);
            host.dataset.progress = progress.toFixed(4);
            host.dataset.angle = angle.toFixed(5);
        }
        function resize() {
            if (!disposed) renderer.setSize(host.clientWidth, host.clientHeight, false);
        }
        resize(); render(0);
        return { render, resize, dispose };
    } catch (error) { dispose(); throw error; }
}
