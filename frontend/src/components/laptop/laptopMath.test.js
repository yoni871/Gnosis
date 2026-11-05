import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createLaptopModel } from './createLaptopModel';
import { OPEN_ANGLE, openingAngle, scrollProgress, screenHomography, SOURCE_WIDTH, SOURCE_HEIGHT } from './laptopMath';

describe('scroll-driven laptop geometry', () => {
    it('starts open, closes proportionally, clamps, and reverses', () => {
        expect(openingAngle(scrollProgress(0, 0, 1000))).toBe(OPEN_ANGLE);
        expect(openingAngle(scrollProgress(275, 0, 1000))).toBeCloseTo(OPEN_ANGLE / 2);
        expect(openingAngle(scrollProgress(550, 0, 1000))).toBe(0);
        expect(openingAngle(scrollProgress(900, 0, 1000))).toBe(0);
        expect(openingAngle(scrollProgress(0, 0, 1000))).toBe(OPEN_ANGLE);
        expect(scrollProgress(-100, 0, 0)).toBe(0);
    });
    it('maps all screen corners to the original Gnosis image', () => {
        const h = screenHomography();
        [[0,0], [1,0], [1,1], [0,1]].forEach(([u,v], i) => {
            const expected = [[1167,532], [1536,548], [1580,330], [1207,327]][i];
            const w = h[6]*u+h[7]*v+1;
            expect((h[0]*u+h[1]*v+h[2])/w*SOURCE_WIDTH).toBeCloseTo(expected[0]);
            expect((1-(h[3]*u+h[4]*v+h[5])/w)*SOURCE_HEIGHT).toBeCloseTo(expected[1]);
        });
    });
    it('keeps the base and hinge fixed while moving the lid', () => {
        const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillText: vi.fn() });
        const model = createLaptopModel(new THREE.Texture());
        model.hinge.rotation.x = -OPEN_ANGLE;
        model.root.updateMatrixWorld(true);
        const base = model.base.matrixWorld.clone();
        const pivot = model.hinge.getWorldPosition(new THREE.Vector3());
        const screen = model.screen.getWorldPosition(new THREE.Vector3());
        model.hinge.rotation.x = 0;
        model.root.updateMatrixWorld(true);
        expect(model.base.matrixWorld.equals(base)).toBe(true);
        expect(model.hinge.getWorldPosition(new THREE.Vector3()).equals(pivot)).toBe(true);
        expect(model.screen.getWorldPosition(new THREE.Vector3()).equals(screen)).toBe(false);
        context.mockRestore();
    });
});
