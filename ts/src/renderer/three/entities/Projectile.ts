namespace Renderer {
	export namespace Three {
		export class Projectile extends Entity {
			body: AnimatedSprite | Model | null = null;
			instancedIdx: number | null = null;
			instancedData: { depthZOffset: number } | null = null;
			textureId: string;
			size: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

			constructor(
				public taroId: string,
				public ownerId: string,
				public taroEntity: TaroEntityPhysics
			) {
				super(taroEntity);
				this.textureId = taroEntity._stats.cellSheet.url;
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
			}

			static create(taroEntity: TaroEntityPhysics) {
				const entity = new Projectile(taroEntity._id, taroEntity._stats.ownerId, taroEntity);

				if (entity.body instanceof Sprite) {
					taroEntity.on('depth', (depth) => (entity.body as Sprite).setDepth(depth));
					taroEntity.on('flip', (flip) => (entity.body as Sprite).setFlip(flip % 2 === 1, flip > 1));
					taroEntity.on('billboard', (isBillboard) => (entity.body as Sprite).setBillboard(isBillboard));
				} else if (entity.body instanceof Model) {
					//FIXME: when the 3d physics is ready, remove this
					taroEntity.on('temp_translation_y', (positionY) => {
						entity.body.position.y = Utils.pixelToWorld(positionY);
					});
				}

				taroEntity.on(
					'transform',
					(data: { x: number; y: number; rotation: number }) => {
						entity.position.x = Utils.pixelToWorld(data.x);
						entity.position.y = Utils.getLayerZOffset(entity.layer) + entity.zOffset;
						entity.position.z = Utils.pixelToWorld(data.y);

						entity.rotation.x = entity.rotationOffset.x;
						entity.rotation.y = entity.rotationOffset.y - data.rotation;
						entity.rotation.z = entity.rotationOffset.z;

						if (entity.body instanceof Sprite) {
							entity.translateY(entity.body.depthOffset);
							entity.position.y += entity.body.yOffset;

							const flip = taroEntity._stats.flip;
							entity.body.setFlip(flip % 2 === 1, flip > 1);
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
							entity.body?.play(name, loopCount);
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

				taroEntity.on('set-opacity', (opacity) => {
					entity.body.setOpacity(opacity);
				});

				return entity;
			}

			update(dt: number) {
				this.body?.update(dt);
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
