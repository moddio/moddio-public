namespace Renderer {
	export namespace Three {
		export class Item extends Entity {
			ownerUnitId: string | undefined;
			ownerUnit: Unit | undefined;
			body: AnimatedSprite | Model;
			size: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

			private globalSpace = false;
			private receivedRotation = 0;
			private mountedToBone = false;

			constructor(
				public taroId: string,
				public ownerId: string,
				public taroEntity: TaroEntityPhysics
			) {
				super(taroEntity);

				if (taroEntity._stats.is3DObject) {
					const name = taroEntity._stats.cellSheet.url;
					this.body = new Model(name, taroEntity);
				} else {
					const key = taroEntity._stats.cellSheet.url;
					const cols = taroEntity._stats.cellSheet.columnCount || 1;
					const rows = taroEntity._stats.cellSheet.rowCount || 1;
					const tex = gAssetManager.getTexture(key).clone();
					const frameWidth = tex.image.width / cols;
					const frameHeight = tex.image.height / rows;
					const spriteSheet = new TextureSheet(key, tex, frameWidth, frameHeight);
					this.body = new AnimatedSprite(spriteSheet);
				}
				this.add(this.body);
				this.ownerUnitId = taroEntity._stats.ownerUnitId;
			}

			static create(taroEntity: TaroEntityPhysics) {
				const entity = new Item(taroEntity._id, taroEntity._stats.ownerId, taroEntity);

				if (entity.body instanceof Sprite) {
					taroEntity.on('depth', (depth) => (entity.body as Sprite).setDepth(depth));
					taroEntity.on('flip', (flip) => {
						(entity.body as Sprite).setFlip(flip % 2 === 1, flip > 1);
					});
					taroEntity.on('billboard', (isBillboard) => (entity.body as Sprite).setBillboard(isBillboard));
					taroEntity.on('globalSpace', (globalSpace) => (entity.globalSpace = globalSpace));
				}

				taroEntity.on(
					'transform',
					(data: { x: number; y: number; rotation: number }) => {
						if (!entity.mountedToBone) {
							entity.position.x = Utils.pixelToWorld(data.x);
							entity.position.y = 0;
							entity.position.z = Utils.pixelToWorld(data.y);

							entity.rotation.x = entity.rotationOffset.x;
							entity.rotation.y = entity.rotationOffset.y - data.rotation;
							entity.rotation.z = entity.rotationOffset.z;

							entity.receivedRotation = -data.rotation;

							if (entity.body instanceof Sprite) {
								entity.translateY(entity.body.depthOffset);
								entity.position.y += entity.body.yOffset + Utils.getLayerZOffset(entity.layer) + entity.zOffset;
								const flip = taroEntity._stats.flip;
								entity.body.setFlip(flip % 2 === 1, flip > 1);
							}
						}
					},
					this
				);

				taroEntity.on('play-animation', (data) => {
					const id = data.animationId;
					const onJoin = data.onJoin;
					if (entity.body instanceof AnimatedSprite) {
						const key = `${taroEntity._stats.cellSheet.url}/${id}/${taroEntity._stats.id}`;
						entity.body.play(key);
					} else {
						const anim = entity.taroEntity._stats.animations[id];
						if (anim) {
							const name = anim.threeAnimationKey || '';
							const loopCount = anim.loopCount || 0;
							entity.body.play(name, loopCount);
						}
					}
				});

				taroEntity.on('stop-animation', (id) => {
					if (entity.body instanceof AnimatedSprite) {
						return;
					} else {
						const anim = entity.taroEntity._stats.animations[id];
						if (anim) {
							const name = anim.threeAnimationKey || '';
							if (anim.forceCompleteAnimation) {
								entity.body?.stopAnimation(name, true);
							} else {
								entity.body?.stopAnimation(name);
							}
						} else {
							entity.body?.stopAnimation('');
						}
					}
				});

				taroEntity.on('update-texture', (data) => {
					const key = taroEntity._stats.cellSheet.url;

					if (entity.body instanceof Model) {
						const model = gAssetManager.getModelWithoutPlaceholder(key);

						if (model) {
							(entity.body as Model).setModel(model);
							if (taroEntity._stats.material) {
								(entity.body as Model).mesh.traverse((obj: any) => {
									if (obj.material) {
										Utils.overwriteMaterialUniforms(taroEntity._stats.material, obj.material);
									}
								});
							}
						} else {
							gAssetManager.load([{ name: key, type: 'gltf', src: Utils.patchAssetUrl(key) }], null, () => {
								(entity.body as Model).setModel(gAssetManager.getModel(key));
							});
						}
					} else if (entity.body instanceof Sprite) {
						const tex = gAssetManager.getTextureWithoutPlaceholder(key);
						const isLoaded = !!tex;

						if (isLoaded) {
							entity.body.setTexture(key);
						} else {
							const animationMgr = AnimationManager.instance();
							gAssetManager.load([{ name: key, type: 'texture', src: Utils.patchAssetUrl(key) }], null, () => {
								InstancedSprite.create(key, 500);
								animationMgr.createAnimationsFromTaroData(key, taroEntity._stats as unknown as EntityData);
								(entity.body as Sprite).setTexture(key);
							});
						}
					}
				});

				taroEntity.on('setOwnerUnit', (unitId: string) => {
					entity.ownerUnitId = unitId;
				});

				taroEntity.on('mountToTarget', (stateId: string) => {
					if (stateId) {
						entity.mountedToBone = true;
						const body = entity.ownerUnit?.body as Model;
						if (body) {
							let bone;
							body.mesh.traverse((child) => {
								//@ts-ignore
								if (child.isBone && child.name === entity.taroEntity._stats.bodies[stateId].mountTarget) {
									bone = child;
								}
							});
							if (bone) {
								bone.add(entity);
								// set position to item offset
								if (entity.taroEntity._stats.bodies[stateId].mountOffset) {
									entity.position.x = Utils.pixelToWorld(entity.taroEntity._stats.bodies[stateId].mountOffset.x || 0);
									entity.position.y = Utils.pixelToWorld(entity.taroEntity._stats.bodies[stateId].mountOffset.y || 0);
									entity.position.z = Utils.pixelToWorld(entity.taroEntity._stats.bodies[stateId].mountOffset.z || 0);
								}

								//set scale after mounting
								const width = Utils.pixelToWorld(entity.taroEntity._stats?.currentBody?.width || 0);
								const height = Utils.pixelToWorld(entity.taroEntity._stats?.currentBody?.height || 0);
								const depth = Utils.pixelToWorld(
									entity.taroEntity._stats?.depth || entity.taroEntity._stats?.currentBody?.depth || 0
								);
								entity.setScale(width / body.mesh.scale.x, height / body.mesh.scale.y, depth / body.mesh.scale.z);

								// add unit mount position offset if exist
								if (
									entity.ownerUnit.taroEntity._stats.mountOffsets &&
									entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name] &&
									entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].position
								) {
									entity.position.x += Utils.pixelToWorld(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].position.x
									);
									entity.position.y += Utils.pixelToWorld(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].position.y
									);
									entity.position.z += Utils.pixelToWorld(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].position.z
									);
								}
								// set rotation
								if (entity.taroEntity._stats.bodies[stateId].mountRotation) {
									entity.rotation.x = Utils.deg2rad(entity.taroEntity._stats.bodies[stateId].mountRotation.x || 0);
									entity.rotation.y = Utils.deg2rad(entity.taroEntity._stats.bodies[stateId].mountRotation.y || 0);
									entity.rotation.z = Utils.deg2rad(entity.taroEntity._stats.bodies[stateId].mountRotation.z || 0);
								}
								if (
									entity.ownerUnit.taroEntity._stats.mountOffsets &&
									entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name] &&
									entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].rotation
								) {
									entity.rotation.x += Utils.deg2rad(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].rotation.x
									);
									entity.rotation.y += Utils.deg2rad(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].rotation.y
									);
									entity.rotation.z += Utils.deg2rad(
										entity.ownerUnit.taroEntity._stats.mountOffsets[bone.name].rotation.z
									);
								}
								let target = new THREE.Vector3();
								entity.getWorldPosition(target);
							}
						}
					} else {
						entity.mountedToBone = false;
						Three.getEntitiesLayer().add(entity);
						const width = Utils.pixelToWorld(entity.taroEntity._stats?.currentBody?.width || 0);
						const height = Utils.pixelToWorld(entity.taroEntity._stats?.currentBody?.height || 0);
						const depth = Utils.pixelToWorld(
							entity.taroEntity._stats?.depth || entity.taroEntity._stats?.currentBody?.depth || 0
						);
						entity.setScale(width, height, depth);
					}
				});

				taroEntity.on('set-opacity', (opacity) => {
					entity.body.setOpacity(opacity);
				});

				return entity;
			}

			update(dt: number) {
				if (this.body instanceof AnimatedSprite) {
					this.body.update(dt);

					if (this.ownerUnit) {
						const anchoredOffset = this.taroEntity?.anchoredOffset;

						if (anchoredOffset) {
							if (!this.globalSpace) {
								this.rotation.copy(this.ownerUnit.body.rotation);
								this.rotateOnAxis(new THREE.Vector3(0, 1, 0), this.receivedRotation);
							}

							this.position.y = 0;
							if (this.body instanceof Sprite) {
								this.translateY(this.body.depthOffset);
							}
							this.position.y += this.ownerUnit.position.y + Utils.getLayerZOffset(this.layer) + this.zOffset;

							let unitOffsetX = Utils.pixelToWorld(anchoredOffset.unitAnchor.x);
							let unitOffsetY = Utils.pixelToWorld(anchoredOffset.unitAnchor.y);
							let itemOffsetX = Utils.pixelToWorld(anchoredOffset.itemAnchor.x);
							let itemOffsetY = Utils.pixelToWorld(anchoredOffset.itemAnchor.y);

							const pos1 = new THREE.Vector3();
							pos1.x = unitOffsetX;
							pos1.z = unitOffsetY;
							pos1.applyEuler(this.ownerUnit.body.rotation);

							const pos2 = new THREE.Vector3();
							pos2.x = itemOffsetX;
							pos2.z = itemOffsetY;
							if (!this.globalSpace) {
								pos2.applyEuler(this.ownerUnit.body.rotation);
							}

							this.position.x += pos1.x + pos2.x;
							this.position.y += pos1.y + pos2.y;
							this.position.z += pos1.z + pos2.z;
						}
					}
				}
			}

			setScale(sx: number, sy: number, sz: number) {
				this.size.x = sx;
				this.size.y = sy;
				this.size.z = sz;

				if (this.body instanceof AnimatedSprite) {
					this.body.setScale(sx, sy);
				} else {
					this.body.setSize(sx, sz, sy);
				}
			}
		}
	}
}
