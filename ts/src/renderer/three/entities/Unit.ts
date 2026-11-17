namespace Renderer {
	export namespace Three {
		export class Unit extends Entity {
			cameraConfig = {
				pointerLock: false,
				pitchRange: { min: -90, max: 90 },
				offset: { x: 0, y: 0, z: 0 },
			};
			body: AnimatedSprite | Model | null = null;
			instancedIdx: number | null = null;
			instancedData: { depthZOffset: number } | null = null;
			textureId: string;
			size: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
			bottomHud = new THREE.Group();

			private hud = new THREE.Group();
			private topHud = new THREE.Group();
			private label: Label;
			private topAttributes: Attributes;
			private bottomAttributes: Attributes;
			private chat: ChatBubble;

			private receivedPosition = new THREE.Vector3();

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

				// TODO(nick): Rework HUD into a separate class just like I did for
				// Environment.ts. All HUD related logic should be in that class like
				// the management and placement of the names, attributes, chat
				// bubbles etc. The entities only track their data like name etc.
				Three.getEntitiesLayer().add(this.hud);

				this.hud.add(this.topHud);
				this.hud.add(this.bottomHud);

				if (Utils.isDebug()) {
					const originHelper1 = new THREE.AxesHelper(0.1);
					this.topHud.add(originHelper1);

					const originHelper2 = new THREE.AxesHelper(0.1);
					this.bottomHud.add(originHelper2);

					const gridHelper1 = new THREE.GridHelper(1, 1);
					gridHelper1.rotateX(Math.PI * 0.5);
					gridHelper1.material.depthTest = false;
					gridHelper1.scale.x = Utils.pixelToWorld(96);
					this.topHud.add(gridHelper1);

					const gridHelper2 = gridHelper1.clone();
					gridHelper2.position.y = -0.5;
					this.bottomHud.add(gridHelper2);
				}

				if (this.body instanceof Sprite) {
					const size = this.body.getSize();
					if (this.body.billboard) {
						this.topHud.position.y = size.height;
						this.topHud.position.z = 0;

						this.bottomHud.position.y = 0;
						this.bottomHud.position.z = 0;
					} else {
						this.topHud.position.y = 0;
						this.topHud.position.z = -size.height * 0.5;

						this.bottomHud.position.y = 0;
						this.bottomHud.position.z = size.height * 0.5;
					}
				} else {
					const size = this.body.getSize();
					this.topHud.position.y = size.y;
				}
			}

			static create(taroEntity: TaroEntityPhysics) {
				const renderer = Three.instance();
				const entity = new Unit(taroEntity._id, taroEntity._stats.ownerId, taroEntity);
				entity.setHudScale(1 / renderer.camera.lastAuthoritativeZoom);

				if (taroEntity._stats.cameraPointerLock) {
					entity.cameraConfig.pointerLock = taroEntity._stats.cameraPointerLock;
				}

				if (taroEntity._stats.cameraPitchRange) {
					entity.cameraConfig.pitchRange = taroEntity._stats.cameraPitchRange;
				}

				if (taroEntity._stats.cameraOffset) {
					// From editor XZY to Three.js XYZ
					entity.cameraConfig.offset.x = taroEntity._stats.cameraOffset.x;
					entity.cameraConfig.offset.y = taroEntity._stats.cameraOffset.z;
					entity.cameraConfig.offset.z = taroEntity._stats.cameraOffset.y;
				}

				taroEntity.on('show-label', () => {
					if (entity.label) {
						entity.label.visible = true;
					}
				});
				taroEntity.on('hide-label', () => {
					if (entity.label) {
						entity.label.visible = false;
					}
				});
				taroEntity.on('render-attributes', (data) => (entity as Unit).updateAttributes(data));
				taroEntity.on('update-attribute', (data) => (entity as Unit).updateAttribute(data));
				taroEntity.on('render-chat-bubble', (text) => (entity as Unit).renderChat(text));
				taroEntity.on('show-attributes', () => {
					if (entity.topAttributes) {
						entity.topAttributes.visible = true;
					}
					if (entity.bottomAttributes) {
						entity.bottomAttributes.visible = true;
					}
				});
				taroEntity.on('hide-attributes', () => {
					if (entity.topAttributes) {
						entity.topAttributes.visible = false;
					}
					if (entity.bottomAttributes) {
						entity.bottomAttributes.visible = false;
					}
				});

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
						entity.receivedPosition.set(Utils.pixelToWorld(data.x), 0, Utils.pixelToWorld(data.y));

						entity.rotation.x = entity.rotationOffset.x;
						entity.rotation.y = entity.rotationOffset.y - data.rotation;
						entity.rotation.z = entity.rotationOffset.z;

						if (entity.body instanceof Sprite) {
							const flip = taroEntity._stats.flip;
							entity.body.setFlip(flip % 2 === 1, flip > 1);
						}
					},
					this
				);

				taroEntity.on('update-label', (data) => {
					if (!entity.label) {
						if (data.text) {
							entity.createLabel();
						} else {
							return;
						}
					}

					entity.label.visible = true;
					entity.label.update({ text: data.text, color: data.color, bold: data.bold });
				});

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
							const duration = anim.duration || 0;
							entity.body?.play(name, loopCount, duration, onJoin);
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

				taroEntity.on('fading-text', (data: { text: string; color?: string }) => {
					let unitHeightPx = 0;
					if (entity.body instanceof AnimatedSprite) {
						unitHeightPx = entity.body.getSizeInPixels().height;
					} else {
						unitHeightPx = Utils.worldToPixel(entity.body.getSize().y);
					}
					const offsetInPixels = -25 - unitHeightPx * 0.5;
					const text = new FloatingText(0, 0, 0, data.text || '', data.color || '#ffffff', 0, -offsetInPixels);
					entity.add(text);
				});

				taroEntity.on('set-opacity', (opacity) => {
					entity.body.setOpacity(opacity);
				});

				return entity;
			}

			onDestroy() {
				super.onDestroy();

				this.hud.removeFromParent();
			}

			update(dt: number) {
				this.body.update(dt);
				if (
					this.taroEntity._stats.scaleLabelByDistance &&
					(this.taroEntity._stats.scaleLabelByDistance?.max !== 1 ||
						this.taroEntity._stats.scaleLabelByDistance?.min !== 1)
				) {
					if (this.label && !this.label.scaleLabelByDistance) {
						this.label.scaleLabelByDistance = this.taroEntity._stats.scaleLabelByDistance;
					}
					this.label?.updateSize();
				}

				if (this.chat && this.taroEntity._stats.ownerId) {
					const playerTypeId = taro.$(this.taroEntity._stats.ownerId)?._stats?.playerTypeId;
					if (playerTypeId) {
						const playerTypeData = taro.game.getAsset('playerTypes', playerTypeId);
						const hideChatDistance = playerTypeData?.hideChatDistance;
						if (hideChatDistance) {
							const renderer = Renderer.Three.instance();
							const cameraPos = renderer.camera.instance.position;
							const unitPos = this.position;
							const distance = cameraPos.distanceTo(unitPos);
							this.chat.sprite.visible = distance < hideChatDistance;
						}
					}
				}

				this.position.copy(this.receivedPosition);
				if (this.body instanceof Sprite) {
					this.translateY(this.body.depthOffset);
					this.position.y += this.body.yOffset;
				}

				this.position.y += Utils.getLayerZOffset(this.layer) + this.zOffset;

				this.hud.position.copy(this.position);

				const camera = Three.instance().camera.instance;
				if (this.body instanceof Sprite && this.body.billboard) {
					this.hud.quaternion.copy(camera.quaternion);
					this.hud.position.add(this.body.position);
					this.topHud.position.y = this.body.getSize().height * 0.5;
					this.bottomHud.position.y = -this.body.getSize().height * 0.5;
				} else {
					this.topHud.quaternion.copy(camera.quaternion);
					this.bottomHud.quaternion.copy(camera.quaternion);
				}

				if (this.chat) {
					this.chat.position.y = this.label.sprite.scale.y * 1.5;
				}
			}

			renderChat(text: string): void {
				if (this.chat) {
					this.chat.update({ text });
				} else {
					this.chat = new ChatBubble({ text });

					if (!this.label) {
						this.createLabel();
					}

					this.chat.position.copy(this.label.position);

					this.chat.position.y += Utils.pixelToWorld(this.label.height + 24);
					this.topHud.add(this.chat);
				}
			}

			updateAttributes(data) {
				const hasAttributes = data.attrs.length > 0;
				const hasAttributesContainers = !!this.topAttributes && !!this.bottomAttributes;

				if (!hasAttributes && !hasAttributesContainers) {
					return;
				}

				if (hasAttributes && !hasAttributesContainers) {
					this.createAttributes();
				}

				this.topAttributes.clear();
				this.bottomAttributes.clear();

				for (const attr of data.attrs) {
					if (Mapper.ProgressBar(attr).anchorPosition != 'below') {
						this.topAttributes.addAttribute(attr);
					} else {
						this.bottomAttributes.addAttribute(attr);
					}
				}

				if (this.label) {
					this.label.position.y = Utils.pixelToWorld(this.topAttributes.topBarsHeight + 16);
				}
			}

			updateAttribute(data) {
				const hasAttributesContainers = this.topAttributes && this.bottomAttributes;

				if (!hasAttributesContainers) {
					if (!data.shouldRender) return;

					this.createAttributes();
				}

				// NOTE(nick): Update might add an attribute so we need to check
				// if it's above or below.
				if (Mapper.ProgressBar(data.attr).anchorPosition != 'below') {
					this.topAttributes.update(data);
				} else {
					this.bottomAttributes.update(data);
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

				if (this.body instanceof Sprite) {
					const size = this.body.getSize();
					if (this.body.billboard) {
						this.topHud.position.y = size.height;
						this.topHud.position.z = 0;

						this.bottomHud.position.y = 0;
						this.bottomHud.position.z = 0;
					} else {
						this.topHud.position.y = 0;
						this.topHud.position.z = -size.height * 0.5;

						this.bottomHud.position.y = 0;
						this.bottomHud.position.z = size.height * 0.5;
					}
				} else {
					const size = this.body.getSize();
					this.topHud.position.y = size.y;
				}
			}

			showHud(visible: boolean) {
				if (visible != this.hud.visible) {
					const fadeAnimation = (from: number, to: number, onComplete = () => {}) => {
						new TWEEN.Tween({ opacity: from })
							.to({ opacity: to }, 100)
							.onUpdate(({ opacity }) => {
								this.label?.setOpacity(opacity);
								this.topAttributes?.setOpacity(opacity);
								this.bottomAttributes?.setOpacity(opacity);
							})
							.onComplete(onComplete)
							.start();
					};

					if (visible) {
						this.hud.visible = true;
						fadeAnimation(0, 1);
					} else {
						fadeAnimation(1, 0, () => (this.hud.visible = false));
					}
				}
			}

			setHudScale(scale: number) {
				this.topHud.scale.setScalar(scale);
				this.bottomHud.scale.setScalar(scale);
			}

			private createLabel() {
				this.label = new Label({
					renderOnTop: true,
					scaleLabelByDistance: this.taroEntity._stats.scaleLabelByDistance,
				});
				this.label.visible = false;
				this.label.setCenterY(1);
				this.label.position.y = Utils.pixelToWorld(16);
				this.topHud.add(this.label);
			}

			private createAttributes() {
				this.topAttributes = new Attributes();
				this.bottomAttributes = new Attributes();

				this.topHud.add(this.topAttributes);
				this.bottomHud.add(this.bottomAttributes);

				this.topAttributes.position.y = Utils.pixelToWorld(8);
				this.bottomAttributes.position.y = -Utils.pixelToWorld(8);

				if (this.label) {
					this.label.position.y = Utils.pixelToWorld(this.topAttributes.topBarsHeight + 16);
				}
			}
		}
	}
}
