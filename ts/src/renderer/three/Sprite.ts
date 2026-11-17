namespace Renderer {
	export namespace Three {
		export class Sprite extends Node {
			sprite = new THREE.Object3D();
			billboard = false;
			scaleUnflipped = new THREE.Vector2(1, 1);
			opacity = 1;

			depthOffset = 0;
			yOffset = 0;
			sizeRatio = [1, 1];
			shader?: THREE.WebGLProgramParametersWithUniforms;
			private depth = 1;
			private flipX = 1;
			private flipY = 1;
			private angleOffset = 0;

			constructor(
				public key: string,
				sizeRatio?: [number, number],
				shader?: Three.BuiltInShader,
				tex?: THREE.Texture
			) {
				super();

				if (sizeRatio) {
					this.sizeRatio = sizeRatio;
				}

				if (shader) {
					const geometry = new THREE.PlaneGeometry(1, 1);
					geometry.rotateX(-Math.PI / 2);
					const material = new THREE.MeshBasicMaterial({
						map: tex,
						transparent: true,
						alphaTest: 0.5,
						side: THREE.DoubleSide,
					});

					switch (shader) {
						case Three.BuiltInShader.WATER: {
							Utils.builtInWaterShader(material, this);
							this.sprite.raycast = function () {
								// Do nothing, effectively ignoring raycasts
							};
							this.sprite.castShadow = false;
							break;
						}
					}

					this.sprite.add(new THREE.Mesh(geometry, material));
					this.add(this.sprite);
				}
			}

			setBillboard(billboard: boolean) {
				this.billboard = billboard;
				if (this.billboard) {
					this.correctZOffsetBasedOnCameraAngle();
				} else {
					this.resetRotation();
				}
			}

			setOpacity(opacity: number) {
				this.opacity = opacity;
			}

			setScale(sx: number, sy: number) {
				this.scaleUnflipped.set(sx, sy);
				this.sprite.scale.set(this.scaleUnflipped.x * this.flipX, 1, this.scaleUnflipped.y * this.flipY);
			}

			setRotationY(rad: number) {
				this.sprite.rotation.y = rad;
			}

			setDepth(depth: number) {
				this.depth = depth;
				this.calcRenderOrder();
			}

			setTexture(key: string) {
				this.key = key;
			}

			setFlip(x: boolean, y: boolean) {
				this.flipX = x ? -1 : 1;
				this.flipY = y ? -1 : 1;
				this.setScale(this.scaleUnflipped.x, this.scaleUnflipped.y);
			}

			getSize() {
				return { width: this.scaleUnflipped.x, height: this.scaleUnflipped.y };
			}

			getSizeInPixels() {
				return { width: Utils.worldToPixel(this.scaleUnflipped.x), height: Utils.worldToPixel(this.scaleUnflipped.y) };
			}

			update(_dt: number) {
				const parent = this.parent as Unit | Item;
				const isOwnedItem = parent && parent instanceof Item && parent.ownerUnit;

				if (isOwnedItem) return;

				if (this.billboard) {
					this.faceCamera(Three.instance().camera);
					this.correctZOffsetBasedOnCameraAngle();
				}

				if (this.shader) {
					this.shader.uniforms['TIME'].value += _dt;
					if ((window as any).uniforms) {
						for (let key of Object.keys((window as any).uniforms)) {
							if (this.shader.uniforms[key]) {
								this.shader.uniforms[key].value = (window as any).uniforms[key];
							}
						}
					}
				}

				if (isOwnedItem) {
					this.yOffset = parent.ownerUnit.position.y;
				}
			}

			private calcRenderOrder() {
				this.depthOffset = Utils.getDepthZOffset(this.depth);
			}

			private faceCamera(camera: Camera) {
				this.rotation.setFromRotationMatrix(camera.instance.matrix);
				this.rotateX(Math.PI * 0.5);
			}

			private correctZOffsetBasedOnCameraAngle() {
				let angle = Math.abs(Renderer.Three.instance().camera.getElevationAngle());
				angle = Math.PI * 0.5 - angle;
				let halfHeight = this.scaleUnflipped.y * 0.5;
				const adj = Math.cos(angle) * halfHeight;
				this.angleOffset = Math.tan(angle) * adj;
				const offset = this.angleOffset;

				const parent = this.parent as Unit | Item;
				const isNotItemOrUnownedItem =
					(parent && !(parent instanceof Item)) || (parent && parent instanceof Item && !parent.ownerUnit);

				if (isNotItemOrUnownedItem) {
					this.yOffset = Utils.getDepthZOffset(this.depth) + offset;
				}
			}

			private resetRotation() {
				this.rotation.set(0, 0, 0);
				this.calcRenderOrder();
			}
		}
	}
}
