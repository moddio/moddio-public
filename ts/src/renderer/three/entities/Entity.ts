namespace Renderer {
	export namespace Three {
		export class Entity extends Node {
			castShadow = false;
			zOffset = 0;
			layer = 3;

			protected rotationOffset = new THREE.Vector3();

			constructor(public taroEntity: TaroEntityPhysics) {
				super();

				taroEntity.on('show', () => (this.visible = true));
				taroEntity.on('hide', () => (this.visible = false));
				taroEntity.on('scale', (data: { x: number; y: number }) => this.scale.set(data.x, 1, data.y));
				taroEntity.on('layer', (layer) => this.setLayer(layer));
				taroEntity.on('z-offset', (offset) => this.setZOffset(Utils.pixelToWorld(offset)));
				taroEntity.on('destroy', () => this.destroy());
				taroEntity.on('rotate', (x: number, y: number, z: number) => {
					this.rotation.order = 'YXZ';

					if (taroEntity._stats.rotation) {
						this.rotationOffset.set(
							-Utils.deg2rad(x + (taroEntity._stats.rotation?.x ? 360 - taroEntity._stats.rotation?.x : 0)),
							0,
							-Utils.deg2rad(y + (taroEntity._stats.rotation?.z ? 360 - taroEntity._stats.rotation?.z : 0))
						);
					} else {
						this.rotationOffset.set(-Utils.deg2rad(x), -Utils.deg2rad(z), -Utils.deg2rad(y));
					}
				});

				taroEntity.on('toggle-outline', (data) => {
					const renderer = Renderer.Three.instance();
					const visibleColor = Colors.textToHexColor(data.visibleColor) ?? data.visibleColor;
					const hiddenColor = Colors.textToHexColor(data.hiddenColor) ?? data.hiddenColor;
					const key = `${visibleColor}.${hiddenColor}.${data.edgeGlow}.${data.glow}.${data.strength}`;
					if (!renderer.customOutlinePass[key]) {
						renderer.customOutlinePass[key] = new OutlinePass(
							new THREE.Vector2(window.innerWidth, window.innerHeight),
							renderer.scene,
							renderer.camera.instance
						);
						renderer.customOutlinePass[key].edgeGlow = data.glow;
						renderer.customOutlinePass[key].edgeStrength = data.strength;
						renderer.customOutlinePass[key].visibleEdgeColor = new THREE.Color(visibleColor);
						renderer.customOutlinePass[key].hiddenEdgeColor = new THREE.Color(hiddenColor);
						renderer.effectComposer.addPass(renderer.customOutlinePass[key]);
					}
					if (data.enable) {
						renderer.customOutlinePass[key].selectedObjects.push((this as any).body);
					} else {
						renderer.customOutlinePass[key].selectedObjects = renderer.customOutlinePass[key].selectedObjects.filter(
							(o) => o.uuid !== (this as any).body.uuid
						);
					}
				});
			}

			onDestroy(): void {
				for (const [key, listener] of Object.entries(this.taroEntity.eventList())) {
					this.taroEntity.off(key, listener);
				}
			}

			private setLayer(layer: number) {
				this.layer = layer;
				this.position.y = Utils.getLayerZOffset(this.layer) + this.zOffset;
			}

			private setZOffset(offset: number) {
				this.zOffset = offset;
				this.position.y = Utils.getLayerZOffset(this.layer) + this.zOffset;
			}
		}
	}
}
