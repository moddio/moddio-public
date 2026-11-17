namespace Renderer {
	export namespace Three {
		export class Model extends Node {
			root = new THREE.Object3D();
			mesh: THREE.Group;
			size = new THREE.Vector3();
			originalSize = new THREE.Vector3();
			originalScale = new THREE.Vector3();
			firstTime = true;
			taroEntity?: TaroEntityPhysics;
			useUpdatedOriginalSize?: boolean;
			aabb = new THREE.Box3();
			// OBB is something just like Box3 but with rotation
			private obb = new OBB();

			private model: GLTF;
			private mixer: THREE.AnimationMixer;
			private clips: THREE.AnimationClip[];
			private center = new THREE.Vector3();
			private meshSize = new THREE.Vector3(1, 1, 1);
			private actionsToStop: THREE.AnimationAction[] = [];

			constructor(name: string, taroEntity?: TaroEntityPhysics, useUpdatedOriginalSize?: boolean) {
				super();
				this.taroEntity = taroEntity;
				this.useUpdatedOriginalSize = useUpdatedOriginalSize;
				this.add(this.root);
				const model = gAssetManager.getModel(name);
				this.model = model;
				this.mesh = SkeletonUtils.clone(model.scene);
				(this.mesh as any).entity = this.taroEntity;
				if (this.useUpdatedOriginalSize) {
					this.originalSize.copy(this.getSize());
				} else {
					this.getSizeFromModelScene(model);
				}
				this.originalScale.copy(this.mesh.scale);
				this.aabb.setFromObject(this.mesh);

				this.mixer = new THREE.AnimationMixer(this.mesh);
				this.clips = model.animations;

				this.root.add(this.mesh); // Important to add the mesh after above setup
			}

			getSizeFromModelScene(model: GLTF) {
				this.aabb.setFromObject(model.scene, true);
				this.originalSize.copy(this.aabb.getSize(new THREE.Vector3()));
			}

			setModel(model: GLTF) {
				this.root.remove(this.mesh);
				this.mesh = SkeletonUtils.clone(model.scene);
				(this.mesh as any).entity = this.taroEntity;
				this.firstTime = true;
				if (this.useUpdatedOriginalSize) {
					this.originalSize.copy(this.getSize());
				} else {
					this.getSizeFromModelScene(model);
				}
				this.originalScale.copy(this.mesh.scale);
				this.aabb.setFromObject(this.mesh);
				this.setSize(this.meshSize.x, this.meshSize.y, this.meshSize.z);

				this.mixer = new THREE.AnimationMixer(this.mesh);
				this.clips = model.animations;

				this.mixer.addEventListener('finished', (e) => {
					if (this.actionsToStop.includes(e.action)) {
						this.actionsToStop.filter((item) => item !== e.action);
						// fadeout animation instead of stopping it, 0.3s is the fadeout time
						e.action.fadeOut(0.3);
					}
				});

				this.root.add(this.mesh); // Important to add the mesh after above setup
			}

			getSize() {
				this.aabb.setFromObject(this.model.scene, true);
				this.mesh.updateMatrix();
				this.mesh.updateMatrixWorld();
				// get its original aabb which means its original geometry
				this.obb.fromBox3(this.aabb);
				// apply the additional translation, rotation, scale
				this.obb.applyMatrix4(this.mesh.matrixWorld);
				return this.obb.getSize(this.size);
			}

			setSize(x: number, y: number, z: number) {
				this.meshSize.set(x, y, z);
				this.mesh.scale.x = this.originalScale.x * (x / this.originalSize.x);
				this.mesh.scale.y = this.originalScale.y * (y / this.originalSize.y);
				this.mesh.scale.z = this.originalScale.z * (z / this.originalSize.z);
			}

			setOpacity(opacity: number) {
				this.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						// Convert to basic material to avoid lighting
						const material = new THREE.MeshStandardMaterial();
						THREE.MeshStandardMaterial.prototype.copy.call(material, child.material);
						child.material = material;
						child.material.transparent = true;
						child.material.opacity = opacity;
					}
				});
			}

			setColor(color: number, time = 0) {
				this.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						// Convert to basic material to avoid lighting
						const material = new THREE.MeshStandardMaterial();
						THREE.MeshStandardMaterial.prototype.copy.call(material, child.material);
						child.material = material;
						const originalColor = child.material.color.getHex();
						child.material.color.setHex(color);
						if (time > 0) {
							setTimeout(() => {
								child.material.color.setHex(originalColor);
							}, time);
						}
					}
				});
			}

			getCenter() {
				return this.aabb.getCenter(this.center).multiply(this.mesh.scale);
			}

			update(dt) {
				this.mixer.update(dt);
			}

			play(name: string, loopCount = 0, duration = 0, onJoin = false) {
				const clip = THREE.AnimationClip.findByName(this.clips, name);
				if (!clip) return;
				let action = this.mixer.existingAction(clip);
				//if action already exists, reset it
				if (action) {
					action.setLoop(THREE.LoopRepeat, loopCount === 0 ? Infinity : loopCount);
					if (duration) {
						action.setEffectiveTimeScale(clip.duration / duration);
					} else {
						action.setEffectiveTimeScale(1);
					}
					action.reset().setEffectiveWeight(1).play();
					if (loopCount === 1) {
						//play last frame if onJoin
						if (onJoin) {
							action.time = clip.duration;
						}
						let fadeOut = false;
						//@ts-ignore
						this.mixer._actions.forEach((a) => {
							if (a.isRunning() && a !== action) {
								fadeOut = true;
							}
						});
						if (fadeOut) {
							this.actionsToStop.push(action);
						}
					}
					//if action doesn't exist, create it
				} else {
					action = this.mixer.clipAction(clip);
					action.setLoop(THREE.LoopRepeat, loopCount === 0 ? Infinity : loopCount);
					if (duration) {
						action.setEffectiveTimeScale(clip.duration / duration);
					}
					action.clampWhenFinished = true;
					action.play();
					if (loopCount === 1) {
						//play last frame if onJoin
						if (onJoin) {
							action.time = clip.duration;
						}
						let fadeOut = false;
						//@ts-ignore
						this.mixer._actions.forEach((a) => {
							if (a.isRunning() && a !== action) {
								fadeOut = true;
							}
						});
						if (fadeOut) {
							this.actionsToStop.push(action);
						}
					}
				}
			}

			stopAnimation(name: string, complete = false) {
				const clip = THREE.AnimationClip.findByName(this.clips, name);
				if (clip) {
					const action = this.mixer.existingAction(clip);
					if (action) {
						action.loop = THREE.LoopOnce;
						if (complete) {
							this.actionsToStop.push(action);
						} else {
							// fadeout animation instead of stopping it, 0.3s is the fadeout time
							action.fadeOut(0.3);
						}
					}
				} else {
					this.mixer.stopAllAction();
				}
			}
		}
	}
}
