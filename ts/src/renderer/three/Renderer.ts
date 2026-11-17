/// <reference types="@types/google.analytics" />

namespace Renderer {
	export enum Mode {
		Play,
		Map,
		Entities,
	}

	export namespace Three {
		export function instance() {
			return Renderer.instance();
		}

		export function reset(rendererOptions) {
			return Renderer.reset(rendererOptions);
		}

		export function getPointer() {
			return Renderer.getPointer();
		}

		export function getVoxels() {
			return Renderer.getVoxels();
		}

		export function getEntitiesLayer() {
			return Renderer.getEntitiesLayer();
		}

		export function getTileSize() {
			return taro.game.data.defaultData.dontResize
				? { x: taro.game.data.map.tilewidth, y: taro.game.data.map.tileheight }
				: { x: 64, y: 64 };
		}

		class Renderer {
			private static _instance: Renderer;

			renderer: THREE.WebGLRenderer;
			effectComposer: any;
			camera: Camera;
			selectedOutlinePass: any;
			customOutlinePass: Record<string, any> = {};
			scene: THREE.Scene;
			mode = Mode.Play;
			selectionBox: SelectionBox;
			selectionHelper: SelectionHelper;
			entitiesNeedsUpdate: (Unit | Projectile | Item)[] = [];
			touchActive: boolean;

			tryFindMesh(object: THREE.Object3D) {
				const meshes: THREE.Mesh[] = [];
				object.children.forEach((child: any) => {
					if (child.isMesh) {
						meshes.push(child);
					}
					if (child.children) {
						meshes.push(...this.tryFindMesh(child));
					}
				});
				return meshes;
			}

			voxels: Voxels;
			private clock = new THREE.Clock();
			private pointer = new THREE.Vector2();
			private secondaryPointer = new THREE.Vector2().set(NaN, NaN);
			private initLoadingManager = new THREE.LoadingManager();

			public entityManager = new EntityManager();
			public animatedTilesLayer = new THREE.Group();
			public initEntityLayer = new THREE.Group();
			public waterLayer = new THREE.Group();

			private regionsLayer = new THREE.Group();
			private entitiesLayer = new THREE.Group();

			private particleSystem: ParticleSystem;
			private environment: Environment;

			private raycastIntervalSeconds = 0.1;
			private timeSinceLastRaycast = 0;

			// TODO: decouple this to the voxelEditor
			public voxelEditor: VoxelEditor;
			public entityEditor: EntityEditor;
			private showRepublishWarning: boolean;

			private regionDrawStart: { x: number; y: number } = { x: 0, y: 0 };

			// Debug
			private raycastHelpers = new Map<string, THREE.ArrowHelper>();

			// Post-processing
			private renderPass: RenderPass;

			private constructor(rendererOptions?: { canvas: HTMLCanvasElement }) {
				// For JS interop; in case someone uses new Renderer.ThreeRenderer()
				if (!Renderer._instance) {
					Renderer._instance = this;
				} else {
					return Renderer._instance;
				}
				const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = window.MeshBVHLib;

				//@ts-ignore
				THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
				//@ts-ignore
				THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
				THREE.Mesh.prototype.raycast = acceleratedRaycast;
				const renderer = new THREE.WebGLRenderer(rendererOptions);
				renderer.setSize(window.innerWidth, window.innerHeight);
				renderer.setPixelRatio(window.devicePixelRatio);
				document.querySelector('#game-div')?.appendChild(renderer.domElement);
				this.renderer = renderer;
				const composer = new EffectComposer(renderer);
				this.effectComposer = composer;
				this.scene = new THREE.Scene();
				this.scene.background = new THREE.Color(taro.game.data.defaultData.mapBackgroundColor);

				this.camera = new Camera(window.innerWidth, window.innerHeight, this.renderer.domElement);
				this.camera.setElevationAngle(taro.game.data.settings.camera.defaultPitch);
				if (!isNaN(taro.game.data.settings.camera.defaultYaw))
					this.camera.setAzimuthAngle(taro.game.data.settings.camera.defaultYaw);
				if (taro.game.data.settings.camera.projectionMode !== 'orthographic') {
					this.camera.setProjection(taro.game.data.settings.camera.projectionMode);
				}

				this.selectionBox = new SelectionBox(this.camera.instance, this.scene);
				this.selectionHelper = new SelectionHelper(this.renderer, 'selectBox');
				window.addEventListener('resize', () => {
					this.camera.resize(window.innerWidth, window.innerHeight);
					renderer.setSize(window.innerWidth, window.innerHeight);
					this.effectComposer.setSize(window.innerWidth, window.innerHeight);
					renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
					this.effectComposer.render();

					taro.client.emit('scale', { ratio: this.camera.zoom });
					taro.client.emit('update-abilities-position');
					this.entityManager.scaleGui(1 / this.camera.zoom);
				});

				this.forceLoadUnusedCSSFonts();

				this.initLoadingManager.onLoad = () => {
					this.init();
					taro.input.setupListeners(this.renderer.domElement);
					taro.client.setLoadingTime(
						'rendererLoaded',
						performance.now() - taro.client.tempLoadingTime.rendererStartTime
					);
					taro.client.rendererLoaded.resolve();

					window.lastRequestAnimationFrameId = requestAnimationFrame(this.render.bind(this));
				};

				const isPixelArt = taro.game.data.defaultData.renderingFilter === 'pixelArt';
				gAssetManager.setFilter(isPixelArt ? THREE.NearestFilter : THREE.LinearFilter);

				this.loadAssets();

				taro.client.on('set-resolution', (resolution) => {
					let breakBy = 1;
					switch (resolution) {
						case 1:
							breakBy = 1;
							break;
						case 1.33:
							breakBy = 1.5;
							break;
						case 1.66:
							breakBy = 2;
							break;
						case 2:
							breakBy = 3;
							break;
					}
					renderer.setPixelRatio(window.devicePixelRatio / breakBy);
				});

				taro.client.on('enterPlayTab', () => {
					this.mode = Mode.Play;
					this.onEnterPlayMode();
				});

				taro.client.on('leavePlayTab', () => {
					this.onExitPlayMode();
				});

				taro.client.on('enterMapTab', () => {
					this.mode = Mode.Map;
					this.onEnterMapMode();
				});

				taro.client.on('leaveMapTab', () => {
					this.onExitMapMode();
				});

				taro.client.on('enterEntitiesTab', () => {
					this.mode = Mode.Entities;
					this.onEnterEntitiesMode();
				});

				taro.client.on('leaveEntitiesTab', () => {
					this.onExitEntitiesMode();
				});

				taro.client.on('update-region-name', (data: { name: string; newName: string }) => {
					const region = this.entityManager.entities.find((e) => e instanceof Region && e.name === data.name) as Region;
					if (region) {
						region.name = data.newName;
						region.updateLabel(data.newName);
					}
				});

				this.renderPass = new RenderPass(this.scene, this.camera.instance);
				composer.addPass(this.renderPass);
				const outlinePass = new OutlinePass(
					new THREE.Vector2(window.innerWidth, window.innerHeight),
					this.scene,
					this.camera.instance
				);
				this.selectedOutlinePass = outlinePass;
				composer.addPass(outlinePass);
				composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.1, 0.4, 100));
				composer.addPass(new OutputPass());
			}

			private addEventListener() {
				let line: THREE.LineSegments;
				let width: number;
				let height: number;
				let rightClickPos: { x: number; y: number } = undefined;

				let lastTime = 0;
				const renderer = this.renderer;
				renderer.domElement.addEventListener('mousemove', (event: MouseEvent) => {
					if (event.button === 1) {
						return;
					}
					if (this.mode === Mode.Map) {
						if (this.entityEditor.gizmo.control.dragging) {
							this.selectionBox.enabled = false;
							return;
						}
						switch (taro.developerMode.activeButton) {
							case 'cursor': {
								if (this.selectionHelper.isDown) {
									this.selectionHelper.onPointerMove(event);
									this.selectionBox.endPoint.set(
										(event.clientX / window.innerWidth) * 2 - 1,
										-(event.clientY / window.innerHeight) * 2 + 1,
										0.5
									);

									if ((this.selectionBox.endPoint as THREE.Vector3).distanceTo(this.selectionBox.startPoint) > 0.05) {
										const allSelected = this.selectionBox.select();
										if (allSelected) {
											const filteredSelected: (THREE.Object3D & { entity?: InitEntity })[] = [];
											allSelected.forEach((e: THREE.Object3D & { entity?: InitEntity }) => {
												if (e.entity) {
													filteredSelected.push(e);
												} else if (e.parent) {
													const findObj = Utils.tryFindInitEntity(e.parent);
													if (findObj) {
														filteredSelected.push(findObj);
													}
												}
											});

											if (filteredSelected.length > 0) {
												if (filteredSelected.length > 1) {
													for (let e of filteredSelected) {
														if (e.entity instanceof InitEntity) {
															if (!this.entityEditor.selectedEntities.includes(e.entity)) {
																this.entityEditor.selectEntity(e.entity, 'add');
															}
														} else if (e instanceof InitEntity) {
															{
																if (!this.entityEditor.selectedEntities.includes(e)) {
																	this.entityEditor.selectEntity(e, 'add');
																}
															}
														}
													}
												} else {
													this.entityEditor.selectEntity(filteredSelected[0].entity, 'select');
												}
											} else {
												this.entityEditor.selectEntity(null);
											}
										}
									}
								}
								break;
							}
							case 'fill': {
							}
							case 'eraser': {
							}
							case 'brush': {
								this.voxelEditor.handleMapToolEdit();
							}
						}
					}
					this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
					if (!Utils.isLeftButton(event.buttons)) return;
					if (taro.developerMode.regionTool) {
						const worldPoint = this.camera.getWorldPoint(this.pointer);
						width = worldPoint.x - this.regionDrawStart.x;
						height = worldPoint.z - this.regionDrawStart.y;
						line?.position.set(this.regionDrawStart.x + width / 2, 2, this.regionDrawStart.y + height / 2);
						line?.scale.set(width, 1, height);
					}
				});

				renderer.domElement.addEventListener('mousedown', (event: MouseEvent) => {
					if (event.button === 1) {
						return;
					}
					if (this.mode === Mode.Map) {
						const developerMode = taro.developerMode;
						if (developerMode.activeButton !== 'cursor') {
							this.selectionBox.enabled = false;
						} else {
							this.selectionBox.enabled = true;
							this.selectionHelper.onPointerDown(event);
						}
						if (developerMode.regionTool) {
							const worldPoint = this.camera.getWorldPoint(this.pointer);
							this.regionDrawStart = {
								x: worldPoint.x,
								y: worldPoint.z,
							};

							const geometry = new THREE.BoxGeometry(1, 3, 1);
							const edges = new THREE.EdgesGeometry(geometry);
							line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x036ffc }));
							line.position.set(this.regionDrawStart.x + width / 2, 2, this.regionDrawStart.y + height / 2);
							line.scale.set(width, 1, height);
							line.visible = true;
							this.scene.add(line);
						} else if (developerMode.active && developerMode.activeTab === 'map') {
							if (Utils.isLeftButton(event.buttons)) {
								this.voxelEditor.leftButtonDown = true;
								//double click
								let clickDelay = taro._currentTime - lastTime;
								lastTime = taro._currentTime;
								switch (developerMode.activeButton) {
									case 'cursor': {
										if (this.entityEditor.gizmo.control.dragging) {
											return;
										}

										this.selectionBox.enabled = true;
										this.selectionBox.startPoint.set(
											(event.clientX / window.innerWidth) * 2 - 1,
											-(event.clientY / window.innerHeight) * 2 + 1,
											0.5
										);
										const raycaster = new THREE.Raycaster();
										raycaster.setFromCamera(this.pointer, this.camera.instance);

										let intersects = raycaster.intersectObjects(this.entityManager.initEntities);
										if (intersects?.length > 0) {
											const closest = intersects[0].object as THREE.Mesh;
											let initEntity = this.entityManager.initEntities.find(
												(initEntity) => (initEntity.body as AnimatedSprite).sprite?.children?.[0] === closest
											);
											if (!initEntity) {
												let parent = intersects[0].object.parent as any;
												while (!parent.entity) {
													parent = parent.parent;
												}
												initEntity = (parent as Renderer.Three.Model & { entity: InitEntity }).entity;
											}
											if (initEntity) {
												this.entityEditor.selectEntity(initEntity, event.ctrlKey ? 'addOrRemove' : 'select');
												taro.client.emit(
													'block-scale',
													!(initEntity.action.scale || initEntity.action.height || initEntity.action.width)
												);

												taro.client.emit('block-rotation', !!initEntity.isBillboard);
											}
											if (clickDelay < 350) {
												if (inGameEditor && inGameEditor.showScriptForEntity) {
													inGameEditor.showScriptForEntity(initEntity.action.actionId);
												}
											}
										} else {
											if (!this.entityEditor.gizmo.control.dragging) {
												this.entityEditor.selectEntity(null);
												intersects = raycaster.intersectObjects(this.entityManager.entities);
												if (intersects?.length > 0) {
													let closest: THREE.Mesh;
													let clickedList: THREE.Mesh[] = [];
													for (const intersect of intersects) {
														if ((intersect.object as THREE.Mesh).isMesh) {
															closest = intersect.object as THREE.Mesh;
															clickedList.push(closest);
														}
													}
													let regionList: RegionData[] = [];
													clickedList.forEach((clicked) => {
														const region = this.entityManager.regions.find((e) => e.mesh === clicked);
														if (region) {
															regionList.push({
																name: region.taroEntity._stats.id,
																x: region.stats.x,
																y: region.stats.y,
																z: region.stats.z,
																width: region.stats.width,
																height: region.stats.height,
																depth: region.stats.depth,
																alpha: region.stats.alpha,
																inside: region.stats.inside,
															});
														}
													});
													if (regionList.length === 1) {
														if (clickDelay < 350) {
															inGameEditor.addNewRegion && inGameEditor.addNewRegion(regionList[0]);
														}
														const clickedRegionMesh = clickedList[0] as THREE.Mesh & { region: Region };
														this.entityEditor.selectEntity(clickedRegionMesh.region);
														taro.client.emit('block-rotation', true);
													} else if (regionList.length > 1) {
														if (clickDelay < 350) {
															inGameEditor.showRegionList && inGameEditor.showRegionList(regionList);
														}
													}
												}
											} else if (clickDelay < 350) {
												const region = this.entityEditor.getLastSelectedEntity() as Region;
												const regionData = {
													name: region.taroEntity._stats.id,
													x: region.stats.x,
													y: region.stats.y,
													z: region.stats.z,
													width: region.stats.width,
													height: region.stats.height,
													depth: region.stats.depth,
													alpha: region.stats.alpha,
													inside: region.stats.inside,
												} as RegionData;

												inGameEditor.addNewRegion && inGameEditor.addNewRegion(regionData);
											}
										}

										break;
									}
									case 'eraser': {
									}
									case 'fill': {
									}
									case 'brush': {
										this.voxelEditor.handleMapToolEdit();
										break;
									}
									case 'add-entities': {
										let uuid = taro.newIdHex();
										this.entityEditor.activeEntity.forEach((entityData) => {
											if (entityData) {
												const worldPoint = this.raycastFloor(0);
												const entity =
													taro.game.data[entityData.entityType] && taro.game.data[entityData.entityType][entityData.id];
												let actionType: string;
												let height: number;
												let width: number;
												if (entityData.entityType === 'unitTypes') {
													actionType = 'createEntityForPlayerAtPositionWithDimensions';
													if (entity.bodies?.default) {
														height = entity.bodies.default.height;
														width = entity.bodies.default.width;
													} else {
														console.log('no default body for unit', entityData.id);
														return;
													}
												} else if (entityData.entityType === 'itemTypes') {
													actionType = 'createEntityAtPositionWithDimensions';
													if (entity.bodies?.dropped) {
														height = entity.bodies.dropped.height;
														width = entity.bodies.dropped.width;
													} else {
														console.log('no dropped body for item', entityData.id);
														return;
													}
												} else if (entityData.entityType === 'projectileTypes') {
													actionType = 'createEntityAtPositionWithDimensions';
													if (entity.bodies?.default) {
														height = entity.bodies.default.height;
														width = entity.bodies.default.width;
													} else {
														console.log('no default body for projectile', entityData.id);
														return;
													}
												} else if (entityData.entityType === 'propTypes') {
													actionType = 'createEntityAtPositionWithDimensions';
													if (entity.bodies?.default) {
														height = entity.bodies.default.height;
														width = entity.bodies.default.width;
													} else {
														console.log('no default body for prop', entityData.id);
														return;
													}
												}

												const action: ActionData = {
													type: actionType,
													entity: entityData.id,
													entityType: entityData.entityType,
													position: {
														function: 'xyCoordinate',
														x: Math.floor(Utils.worldToPixel(worldPoint.x)),
														y: Math.floor(Utils.worldToPixel(worldPoint.z)),
													},
													width: width,
													height: height,
													angle: 0,
													actionId: taro.newIdHex(),
													wasCreated: true,
												};
												if (entityData.offset) {
													action.position.x += Utils.worldToPixel(entityData.offset.x);
													action.position.z += Utils.worldToPixel(entityData.offset.y);
													action.position.y += Utils.worldToPixel(entityData.offset.z);
												}
												if (entityData.action) {
													if (entityData.action.rotation) {
														action.rotation = entityData.action.rotation;
													}
													if (entityData.action.scale) {
														action.scale = entityData.action.scale;
													}
												}
												if (entityData.entityType === 'unitTypes') {
													action.player = {
														variableName: entityData.player,
														function: 'getVariable',
													};
												}
												const nowAction = JSON.stringify(action);
												const nowActionId = action.actionId;
												this.voxelEditor.commandController.addCommand(
													{
														func: () => {
															const nowActionObj = JSON.parse(nowAction);
															taro.network.send<any>('editInitEntity', nowActionObj);
														},
														undo: () => {
															this.entityManager.initEntities
																.find((v) => v.action.actionId === nowActionId)
																?.delete(false);
														},
														mergedUuid: uuid,
													},
													true
												);
											}
										});
									}
								}
							} else if (
								Utils.isRightButton(event.buttons) &&
								(developerMode.activeButton === 'brush' || developerMode.activeButton === 'fill')
							) {
								const intersect = this.raycastFloor();
								if (!intersect) {
									return;
								}
								rightClickPos = { x: intersect.x, y: intersect.z };
							}
						}
					}

					if (
						Utils.isRightButton(event.buttons) &&
						taro.game.data.defaultData.contextMenuEnabled &&
						(!taro.developerMode.active || (taro.developerMode.active && taro.developerMode.activeTab === 'play'))
					) {
						const unit = this.getEntityUnderPointer(this.entityManager.units);
						if (unit) {
							const clientUnit = taro.client.selectedUnit;
							const otherUnit = taro.$(unit.taroId);

							if (clientUnit !== otherUnit) {
								const otherOwnerUnit = taro.$(unit.ownerId);
								if (otherOwnerUnit?._stats?.controlledBy === 'human') {
									if (typeof showUserDropdown !== 'undefined') {
										showUserDropdown({ ownerId: unit.ownerId, unitId: unit.taroId, pointer: { event } });
									}
								}
							}
						}
					}
				});

				renderer.domElement.addEventListener('mouseup', (event: MouseEvent) => {
					if (event.button === 1) {
						return;
					}
					const developerMode = taro.developerMode;
					this.voxelEditor.leftButtonDown = false;
					if (
						developerMode.active &&
						developerMode.activeTab === 'map' &&
						event.button === 0 &&
						developerMode.activeButton === 'cursor' &&
						!this.entityEditor.gizmo.control.dragging
					) {
						this.selectionBox.endPoint.set(
							(event.clientX / window.innerWidth) * 2 - 1,
							-(event.clientY / window.innerHeight) * 2 + 1,
							0.5
						);
						this.selectionHelper.onPointerUp(event);
						this.selectionBox.enabled = false;
					}
					if (developerMode.regionTool) {
						developerMode.regionTool = false;
						this.camera.controls.enablePan = true;
						this.camera.controls.enableRotate = true;
						this.camera.controls.enableZoom = true;
						line?.geometry.dispose();
						this.scene.remove(line);
						line = null;

						taro.mapEditorUI.highlightToolsButton('cursor');
						let x = this.regionDrawStart.x;
						let y = this.regionDrawStart.y;
						if (width < 0) {
							x = this.regionDrawStart.x + width;
							width *= -1;
						}
						if (height < 0) {
							y = this.regionDrawStart.y + height;
							height *= -1;
						}

						inGameEditor.addNewRegion &&
							inGameEditor.addNewRegion({
								name: '',
								x: Math.trunc(Utils.worldToPixel(x)),
								y: Math.trunc(Utils.worldToPixel(y)),
								width: Math.trunc(Utils.worldToPixel(width)),
								height: Math.trunc(Utils.worldToPixel(height)),
							});

						this.regionDrawStart = null;
					} else if (
						developerMode.active &&
						developerMode.activeTab === 'map' &&
						Utils.isRightButton(event.button) &&
						(developerMode.activeButton === 'brush' || developerMode.activeButton === 'fill')
					) {
						const intersect = this.raycastFloor();
						if (!intersect) {
							return;
						}
						const newRightClickPos = { x: intersect.x, y: intersect.z };
						if (
							rightClickPos &&
							Math.abs(newRightClickPos.x - rightClickPos.x) < 0.01 &&
							Math.abs(newRightClickPos.y - rightClickPos.y) < 0.01
						) {
							this.voxelEditor.handleMapToolCopy();
						}
						rightClickPos = undefined;
					}
				});

				renderer.domElement.addEventListener('touchstart', (event: TouchEvent) => {
					taro.input.emit('touchstart');
					if (event.touches.length > 0) {
						this.touchActive = true;
						this.pointer.set(
							(event.touches[0].clientX / window.innerWidth) * 2 - 1,
							-(event.touches[0].clientY / window.innerHeight) * 2 + 1
						);
						this.emitPointerPosition();
					}
					if (event.touches.length > 1) {
						const secondaryTouch = event.touches[1];
						this.secondaryPointer.set(
							(secondaryTouch.clientX / window.innerWidth) * 2 - 1,
							-(secondaryTouch.clientY / window.innerHeight) * 2 + 1
						);
					}
				});

				renderer.domElement.addEventListener('touchend', (event: TouchEvent) => {
					taro.input.emit('touchend');
					if (event.touches.length === 0) {
						this.touchActive = false;
					} else if (!event.touches[1]) {
						this.secondaryPointer.set(NaN, NaN);
						taro.input.emit('secondarytouchpointermove', [
							{
								x: NaN,
								y: NaN,
							},
						]);
					}
				});

				renderer.domElement.addEventListener('touchmove', (event: TouchEvent) => {
					if (event.touches.length > 0) {
						this.pointer.set(
							(event.touches[0].clientX / window.innerWidth) * 2 - 1,
							-(event.touches[0].clientY / window.innerHeight) * 2 + 1
						);
						const worldPos = this.camera.getWorldPoint(this.pointer);
						const x = Utils.worldToPixel(worldPos.x);
						const y = Utils.worldToPixel(worldPos.z);
						const yaw = this.camera.getAzimuthAngle();
						const pitch = this.camera.getElevationAngle();
						taro.input.emit('pointermove', [{ x, y, yaw, pitch }]);
					}
					if (event.touches.length > 1) {
						const secondaryTouch = event.touches[1];
						this.secondaryPointer.set(
							(secondaryTouch.clientX / window.innerWidth) * 2 - 1,
							-(secondaryTouch.clientY / window.innerHeight) * 2 + 1
						);
						const worldPosSecondary = this.camera.getWorldPoint(this.secondaryPointer);
						const x = Utils.worldToPixel(worldPosSecondary.x);
						const y = Utils.worldToPixel(worldPosSecondary.z);
						taro.input.emit('secondarytouchpointermove', [
							{
								x: x,
								y: y,
							},
						]);
					}
				});
			}

			static instance() {
				if (!this._instance) {
					this._instance = new Renderer();
				}

				return this._instance;
			}

			static reset(rendererOptions) {
				// event listeners are being removed in be-next while switching the game
				// https://github.com/moddio/be-next/blob/master/src/pages/index.static-export.jsx#L173-L179

				cancelAnimationFrame(window.lastRequestAnimationFrameId);
				window.lastRequestAnimationFrameId = null;

				this._instance = null; // renderer only reinitialize if instance not available.
				this._instance = new Renderer(rendererOptions);

				return this._instance;
			}

			static getPointer() {
				return this._instance.pointer.clone();
			}

			static getVoxels() {
				return this._instance.voxels;
			}

			static getEntitiesLayer() {
				return this._instance.entitiesLayer;
			}

			raycastFloor(layer?: number): THREE.Vector3 | null {
				const raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(this.pointer, this.camera.instance);
				let intersectionPoint = new THREE.Vector3();
				if (!this.voxels.layerPlanes[layer ?? this.voxelEditor.currentLayerIndex]) {
					return;
				}
				const intersect = raycaster.ray.intersectPlane(
					this.voxels.layerPlanes[layer ?? this.voxelEditor.currentLayerIndex],
					intersectionPoint
				);
				return intersect;
			}

			createInitEntity(action: ActionData): void {
				if (
					!action.disabled &&
					((action.position?.function === 'xyCoordinate' && !isNaN(action.position?.x) && !isNaN(action.position?.y)) ||
						(action.position?.function === 'vector3' &&
							!isNaN(action.position?.x) &&
							!isNaN(action.position?.y) &&
							!isNaN(action.position?.z)))
				) {
					if (
						action.type === 'createEntityForPlayerAtPositionWithDimensions' ||
						action.type === 'createEntityAtPositionWithDimensions' /*&&
							!isNaN(action.width) &&
							!isNaN(action.height) &&
							!isNaN(action.angle)*/
					) {
						if (action.actionId && !action.wasDeleted) new InitEntity(action);
						else {
							this.showRepublishWarning = true;
						}
					} else if (action.type === 'createUnitAtPosition' && !isNaN(action.angle)) {
						if (action.actionId && !action.wasDeleted) new InitEntity(action, 'unit');
						else {
							this.showRepublishWarning = true;
						}
					} else if (
						action.type === 'createUnitForPlayerAtPosition' /* &&
						!isNaN(action.angle) &&
						!isNaN(action.width) &&
						!isNaN(action.height)*/
					) {
						if (action.actionId && !action.wasDeleted) new InitEntity(action, 'unit');
						else {
							this.showRepublishWarning = true;
						}
					} else if (action.type === 'spawnItem' || action.type === 'createItemWithMaxQuantityAtPosition') {
						if (action.actionId && !action.wasDeleted) new InitEntity(action, 'item');
						else {
							this.showRepublishWarning = true;
						}
					} else if (action.type === 'createProjectileAtPosition' && !isNaN(action.angle)) {
						if (action.actionId && !action.wasDeleted) new InitEntity(action, 'projectile');
						else {
							this.showRepublishWarning = true;
						}
					}
					if (inGameEditor && inGameEditor.updateAction && !window.isStandalone) {
						this.entityEditor.debounceUpdateAction({ data: [action] });
					}
				}
			}

			getViewportBounds() {
				const halfWidth = (window.innerWidth * 0.5) / this.camera.zoom;
				const halfHeight = (window.innerHeight * 0.5) / this.camera.zoom;
				const p = this.camera.getPosition2D();
				return {
					x: Utils.worldToPixel(p.x) - halfWidth,
					y: Utils.worldToPixel(p.y) - halfHeight,
					width: halfWidth * 2,
					height: halfHeight * 2,
				};
			}

			getCameraPosition() {
				const pos = this.camera.getPosition2D();
				return {
					x: Utils.worldToPixel(pos.x),
					y: Utils.worldToPixel(pos.y),
				};
			}

			getCameraWidth(): number {
				return window.innerWidth;
			}

			getCameraHeight(): number {
				return window.innerHeight;
			}

			private getEntityUnderPointer(
				entities: (Unit | Item | Prop | Projectile)[]
			): Unit | Item | Prop | Projectile | undefined {
				const raycaster = new THREE.Raycaster();
				raycaster.setFromCamera(this.pointer, this.camera.instance);

				const textureKeys = new Set<string>();
				for (const entity of entities) {
					if (entity.body instanceof Sprite) {
						textureKeys.add(entity.body.key);
					}
				}

				const instancedSprites = [];
				for (const [key, instancedSprite] of InstancedSprite.instances) {
					if (textureKeys.has(key)) {
						instancedSprites.push(instancedSprite);
					}
				}

				const instancedIntersections = [];
				for (const instancedSprite of instancedSprites) {
					const intersection = raycaster.intersectObject(instancedSprite.mesh);
					if (intersection.length > 0) {
						instancedIntersections.push([instancedSprite, intersection[0]]);
					}
				}

				if (instancedIntersections.length > 0) {
					let closests = instancedIntersections[0];
					for (const intersection of instancedIntersections) {
						if (intersection[1].distance < closests[1].distance) {
							closests = intersection;
						}
					}

					return closests[0].getEntityAt(closests[1].instanceId);
				}

				return undefined;
			}

			private setMatrixAutoUpdateForDeveloperOnlyThings(needsUpdate: boolean) {
				this.entityManager.regions.forEach((r) => {
					r.matrixWorldAutoUpdate = needsUpdate;
				});
				this.voxels.matrixAutoUpdate = needsUpdate;
				this.regionsLayer.matrixAutoUpdate = needsUpdate;
				this.voxelEditor.voxelMarker.matrixAutoUpdate = needsUpdate;
				this.voxels.matrixAutoUpdate = needsUpdate;
				this.entityEditor.selectedGroup.matrixAutoUpdate = needsUpdate;
				this.initEntityLayer.matrixAutoUpdate = needsUpdate;
				this.entityEditor.gizmo.control.matrixAutoUpdate = needsUpdate;
			}

			private onEnterPlayMode() {
				this.setMatrixAutoUpdateForDeveloperOnlyThings(false);
				this.camera.setEditorMode(false);
				this.environment.show();
			}

			private onExitPlayMode() {
				this.setMatrixAutoUpdateForDeveloperOnlyThings(true);
				this.camera.setEditorMode(true);
				this.environment.hide();
			}

			private onEnterMapMode() {
				this.hideEntities();
				this.entityManager.regions.forEach((r) => {
					r.setMode(RegionMode.Development);
				});

				if (this.showRepublishWarning) {
					inGameEditor.showRepublishToInitEntitiesWarning();
				}

				if (this.entityManager.initEntities.length === 0) {
					// create images for entities created in initialize script
					Object.values(taro?.game?.data?.scripts ?? {}).forEach((script) => {
						if (script.triggers?.[0]?.type === 'gameStart') {
							Object.values(script?.actions ?? {}).forEach((action) => {
								this.createInitEntity(action);
							});
						}
					});

					if (this.showRepublishWarning) {
						inGameEditor.showRepublishToInitEntitiesWarning();
					}
				}

				taro.network.send<any>('updateClientInitEntities', true);
				this.selectionBox.enabled = true;
				this.entityManager.initEntities.forEach((initEntity) => {
					initEntity.body.visible = true;
				});
			}

			private onExitMapMode() {
				this.showEntities();
				this.selectionBox.enabled = false;
				this.selectionHelper.onPointerUp(null, true);
				this.entityManager.regions.forEach((r) => r.setMode(RegionMode.Normal));
				this.voxelEditor.voxels.updateLayer(new Map(), this.voxelEditor.currentLayerIndex, false, true);
				this.voxelEditor.showAllLayers();

				if (this.entityEditor.selectedEntities) {
					this.entityEditor.selectEntity(null);
				}

				this.entityManager.initEntities.forEach((initEntity) => {
					initEntity.body.visible = false;
				});
			}

			private onEnterEntitiesMode() {}

			private onExitEntitiesMode() {}

			private showEntities() {
				this.setEntitiesVisible(true);
			}

			private hideEntities() {
				this.setEntitiesVisible(false);
			}

			private setEntitiesVisible(visible: boolean) {
				this.particleSystem.visible = visible;
				this.entitiesLayer.visible = visible;
			}

			private loadAssets() {
				const sources = [];

				const data = taro.game.data;

				data.map.tilesets.forEach((tileset) => {
					const key = tileset.image;
					sources.push({ name: key, type: 'texture', src: Utils.patchAssetUrl(key) });
				});

				const taroEntities = [
					...Object.values(data?.unitTypes ?? {}),
					...Object.values(data?.projectileTypes ?? {}),
					...Object.values(data?.itemTypes ?? {}),
					...Object.values(data?.propTypes ?? {}),
				];

				for (const taroEntity of taroEntities) {
					const url = taroEntity?.cellSheet?.url;
					if (!url) continue;

					sources.push({
						name: url,
						type: taroEntity.is3DObject ? 'gltf' : 'texture',
						src: Utils.patchAssetUrl(url),
						materialUniforms: (taroEntity as any).material,
					});

					AnimationManager.instance().createAnimationsFromTaroData(url, taroEntity);
				}

				for (const taroEntity of Object.values(data?.particleTypes ?? {})) {
					const key = taroEntity.url;
					sources.push({ name: `particle/${key}`, type: 'texture', src: Utils.patchAssetUrl(key) });
				}

				const skyboxFacesUrls = taro.game.data.settings.skybox;
				for (const key in skyboxFacesUrls) {
					if (!skyboxFacesUrls[key]) continue;
					sources.push({ name: key, type: 'texture', src: skyboxFacesUrls[key] });
				}

				gAssetManager.load(sources, this.initLoadingManager);
			}

			private forceLoadUnusedCSSFonts() {
				let canvas = document.createElement('canvas');
				let ctx = canvas.getContext('2d');
				ctx.font = 'normal 4px Verdana';
				ctx.fillText('text', 0, 8);

				canvas = document.createElement('canvas');
				ctx = canvas.getContext('2d');
				ctx.font = 'bold 4px Verdana';
				ctx.fillText('text', 0, 8);

				canvas = document.createElement('canvas');
				ctx = canvas.getContext('2d');
				ctx.font = 'italic bold 4px Verdana';
				ctx.fillText('text', 0, 8);
			}

			private init() {
				//FIXME: oft
				const key = 'waterSheet';
				const cols = 23;
				const rows = 22;
				const tex = gAssetManager.getTexture(key).clone();
				const frameWidth = tex.image.width / cols;
				const frameHeight = tex.image.height / rows;
				const spriteSheet = new TextureSheet(key, tex, frameWidth, frameHeight);
				const animationMgr = AnimationManager.instance();
				animationMgr.create({
					key: Three.WaterAnimations.TOP_LEFT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => index * 2),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.TOP_RIGHT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => 1 + index * 2),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.DOWN_LEFT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => cols + index * 2),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.DOWN_RIGHT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => cols + 1 + index * 2),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.TOP,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 5 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.LEFT,
					frames: Array.from({ length: 11 }, (_, index) => 3 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.RIGHT,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 3 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.DOWN,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 6 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.NORMAL,
					frames: Array.from({ length: 1 }, (_, index) => 1 + 20 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.TOP_LEFT_INVERT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 8 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.TOP_RIGHT_INVERT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 10 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.DOWN_LEFT_INVERT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 12 * cols),
					fps: 5,
					repeat: 0,
				});
				animationMgr.create({
					key: Three.WaterAnimations.DOWN_RIGHT_INVERT_CORNER,
					frames: Array.from({ length: 11 }, (_, index) => 1 + 14 * cols),
					fps: 5,
					repeat: 0,
				});
				this.voxels = Voxels.create(taro.game.data.map.layers);
				this.voxelEditor = new VoxelEditor(this.voxels);
				this.scene.add(this.voxels);
				this.scene.add(this.voxelEditor.voxelMarker);

				this.environment = new Environment(this);

				this.entityEditor = new EntityEditor();

				this.particleSystem = new ParticleSystem();

				for (let layer of [
					this.particleSystem,
					this.entitiesLayer,
					this.regionsLayer,
					this.initEntityLayer,
					this.waterLayer,
				]) {
					this.scene.add(layer);
				}

				for (const [key, _] of gAssetManager.textures) {
					InstancedSprite.create(key, 3000);
				}

				const createEntity = (
					taroEntity: TaroEntityPhysics,
					type: 'unit' | 'item' | 'projectile' | 'region' | 'prop'
				) => {
					const entity = this.entityManager.create(taroEntity, type);

					switch (type) {
						case 'region':
							this.regionsLayer.add(entity);
							break;
						case 'projectile':
							if (!taroEntity._stats.instancedMesh) {
								this.entitiesLayer.add(entity);
							}
							break;
						default:
							this.entitiesLayer.add(entity);
					}

					taroEntity.on(
						'size',
						(data: { width: number; height: number }) => {
							if (taroEntity._category === 'region') {
								return;
							}

							const width = Utils.pixelToWorld(data.width || 0);
							const height = Utils.pixelToWorld(data.height || 0);
							const depth = Utils.pixelToWorld(taroEntity._stats?.depth || taroEntity._stats?.currentBody?.depth || 0);
							entity.setScale(width, height, depth);
						},
						this
					);

					taroEntity.on('destroy', () => {
						this.entityManager.destroy(entity);
						this.particleSystem.destroyEmittersWithTarget(entity);
					});

					taroEntity.on('follow', () => {
						this.camera.follow(entity);

						const offset = entity.cameraConfig.offset;
						this.camera.setOffset(offset.x, offset.y, offset.z);

						if (entity.cameraConfig.pointerLock) {
							const { min, max } = entity.cameraConfig.pitchRange;
							this.camera.setElevationRange(min, max);
						}

						this.camera.setPointerLock(entity.cameraConfig.pointerLock);
					});
				};

				taro.client.on('create-unit', (u: TaroEntityPhysics) => createEntity(u, 'unit'), this);
				taro.client.on('create-item', (i: TaroEntityPhysics) => createEntity(i, 'item'), this);
				taro.client.on('create-projectile', (p: TaroEntityPhysics) => createEntity(p, 'projectile'), this);
				taro.client.on('create-region', (r: TaroEntityPhysics) => createEntity(r, 'region'), this);
				taro.client.on('create-prop', (o: TaroEntityPhysics) => createEntity(o, 'prop'), this);

				taro.client.on('zoom', (height: number) => {
					if (this.camera.zoomHeight === height * 2.15) return;
					this.camera.setZoomByHeight(height * 2.15);
					taro.client.emit('scale', { ratio: this.camera.zoom });
					this.entityManager.scaleGui(1 / this.camera.zoom);
				});

				// listens to ability bar updates
				taro.client.on(
					'create-ability-bar',
					(data: { keybindings: Record<string, ControlAbility>; abilities: Record<string, UnitAbility> }) => {
						const keybindings = data.keybindings;
						const abilities = data.abilities;
						if (abilities) {
							Object.entries(abilities).forEach(([abilityId, ability]) => {
								let key;
								if (
									(keybindings && taro.isMobile && ability.visibility !== 'desktop' && ability.visibility !== 'none') ||
									(!taro.isMobile && ability.visibility !== 'mobile' && ability.visibility !== 'none')
								) {
									Object.entries(keybindings).forEach(([keybindingKey, keybinding]) => {
										if (keybinding.keyDown?.abilityId === abilityId || keybinding.keyUp?.abilityId === abilityId) {
											key = keybindingKey;
										}
									});
									this.generateHTMLButton(key, abilityId, key, ability);
								}
							});
						}
					}
				);

				taro.client.on('stop-follow', () => this.camera.unfollow());
				taro.client.on('camera-unlock', () => this.camera.setPointerLock(false));
				taro.client.on('camera-pitch', (deg: number) => this.camera.setElevationAngle(deg));
				taro.client.on('camera-yaw', (deg: number) => this.camera.setAzimuthAngle(deg));

				taro.client.on('camera-position', (x: number, y: number) => {
					if (!taro.developerMode.active || taro.developerMode.activeTab === 'play') {
						this.camera.setPosition2D(Utils.pixelToWorld(x), Utils.pixelToWorld(y), true);
					}
				});

				taro.client.on('camera-instant-move', (x: number, y: number) => {
					if (!taro.developerMode.active || taro.developerMode.activeTab === 'play') {
						this.camera.setPosition2D(Utils.pixelToWorld(x), Utils.pixelToWorld(y));
					}
				});

				taro.client.on('create-particle-emitter', (particle: Particle) => {
					const emitter = this.particleSystem.createEmitter(particle);
					if (emitter == null) return;

					emitter.position.y += this.entitiesLayer.position.y;

					if (particle.entityId) {
						const entity = this.entityManager.entities.find((entity) => entity.taroId == particle.entityId);
						if (entity) {
							emitter.target = entity;
						}
					}

					this.particleSystem.emit(emitter);
				});

				taro.client.on('start-emitting-particles', (data: { particleTypeId: string; entityId: string }) => {
					const emitter = this.particleSystem.emitters.find(({ particleTypeId, target }) => {
						return particleTypeId === data.particleTypeId && target.taroId === data.entityId;
					});

					this.particleSystem.startEmitter(emitter);
				});

				taro.client.on('stop-emitting-particles', (data: { particleTypeId: string; entityId: string }) => {
					const emitter = this.particleSystem.emitters.find(({ particleTypeId, target }) => {
						return particleTypeId === data.particleTypeId && target.taroId === data.entityId;
					});

					this.particleSystem.stopEmitter(emitter);
				});

				taro.client.on('floating-text', (config: FloatingTextConfig) => {
					const zOffset = this.camera.target ? this.camera.target.position.y : 0;
					this.entitiesLayer.add(FloatingText.create(config, zOffset));
				});

				taro.client.on('dynamic-floating-text', (config: DynamicFloatingTextConfig) => {
					const zOffset = this.camera.target ? this.camera.target.position.y : 0;
					const dynamicText = DynamicFloatingText.create(config, zOffset);
					this.entitiesLayer.add(dynamicText);
				});

				taro.client.on('setSkyboxOpacity', (opacity: number) => {
					this.environment.skybox.setOpacity(opacity);
				});

				taro.client.on('setAmbientLightIntensity', (intensity: number) => {
					this.environment.setAmbientLightIntensity(intensity);
				});

				taro.client.on('setAmbientLightColor', (color: string) => {
					this.environment.setAmbientLightColor(color);
				});

				taro.client.on('setDirectionalLightIntensity', (intensity: number) => {
					this.environment.setDirectionalLightIntensity(intensity);
				});

				taro.client.on('setDirectionalLightColor', (color: string) => {
					this.environment.setDirectionalLightColor(color);
				});

				taro.client.on('setDirectionalLightPosition', (position: { x: number; y: number; z: number }) => {
					this.environment.setDirectionalLightPosition(position.x, position.z, position.y);
				});

				taro.client.on('setFogEnabled', (enabled: boolean) => {
					this.environment.setFogEnabled(enabled);
				});

				taro.client.on('setFogColor', (color: string) => {
					this.environment.setFogColor(color);
				});

				taro.client.on('setFogNear', (density: number) => {
					this.environment.setFogNear(density);
				});

				taro.client.on('setFogFar', (density: number) => {
					this.environment.setFogFar(density);
				});

				taro.client.on('setFogDensity', (density: number) => {
					this.environment.setFogDensity(density);
				});

				if (taro?.game?.data?.settings?.camera?.useBounds) {
					const resize = !taro.game.data.defaultData.dontResize;
					const tileWidth = resize ? 64 : taro.game.data.map.tilewidth;
					const tileHeight = resize ? 64 : taro.game.data.map.tileheight;
					const width = Utils.pixelToWorld(taro.game.data.map.width * tileWidth);
					const height = Utils.pixelToWorld(taro.game.data.map.height * tileHeight);
					this.camera.setBounds(0, 0, width, height);
					this.camera.useBounds = true;
				}

				this.addEventListener();
			}

			private emitPointerPosition() {
				const worldPos = this.camera.getWorldPoint(this.pointer);
				const x = Utils.worldToPixel(worldPos.x);
				const y = Utils.worldToPixel(worldPos.z);
				const yaw = this.camera.getAzimuthAngle();
				const pitch = this.camera.getElevationAngle();
				taro.input.emit('pointermove', [{ x, y, yaw, pitch }]);
			}

			private render() {
				window.lastRequestAnimationFrameId = requestAnimationFrame(this.render.bind(this));

				taro.client.emit('tick');

				// Call this function before rendering
				if (this.camera) {
					if (!taro.isMobile) {
						this.emitPointerPosition();
					}
				}

				if (this.entityEditor) this.entityEditor.update();
				// TODO: Is this the proper way to get deltaTime or should I get it from the
				// engine somewhere? Also it feels a little weird that the renderer triggers
				// the engine update. It should be the other way around.

				let dt = this.clock.getDelta();
				const time = this.clock.elapsedTime;
				if (dt <= 0) dt = 1 / 60;
				else if (dt >= 0.25) dt = 0.25;

				this.camera.update(dt);

				this.entityManager.update(dt);

				for (const [_, instancedSprite] of InstancedSprite.instances) {
					instancedSprite.update(dt);
				}

				this.particleSystem.update(dt, time, this.camera.instance);

				this.voxelEditor.update();

				this.initEntityLayer.children.forEach((child) => {
					if (child instanceof InitEntity && child) {
						child.update();
					}
				});
				for (let child of this.waterLayer.children) {
					(child as Sprite).update(dt);
				}

				this.environment.update();

				TWEEN.update();

				this.renderPass.camera = this.camera.instance;
				this.selectedOutlinePass.renderCamera = this.camera.instance;
				this.effectComposer.render();

				this.timeSinceLastRaycast += dt;
				if (this.timeSinceLastRaycast > this.raycastIntervalSeconds) {
					this.timeSinceLastRaycast = 0;
					// this.checkForHiddenEntities();
				}

				// this.timeSinceLastRaycast += dt;
				// if (this.timeSinceLastRaycast > this.raycastIntervalSeconds) {
				// 	this.timeSinceLastRaycast = 0;
				// this.checkForHiddenEntities();
				// }
			}

			private checkForHiddenEntities() {
				if (Utils.isDebug()) {
					for (const taroIds of this.raycastHelpers.keys()) {
						if (!this.entityManager.units.find((unit) => unit.taroId === taroIds)) {
							const helper = this.raycastHelpers.get(taroIds);
							this.scene.remove(helper);
							this.raycastHelpers.delete(taroIds);
						}
					}
				}

				for (const unit of this.entityManager.units) {
					const tempVec3 = new THREE.Vector3();
					const tempVec2 = new THREE.Vector2();

					unit.getWorldPosition(tempVec3);

					const entityScreenPosition = tempVec3.clone().project(this.camera.instance);
					tempVec2.x = entityScreenPosition.x;
					tempVec2.y = entityScreenPosition.y;

					let dist = 0;
					if (this.camera.isPerspective) {
						dist = tempVec3.distanceTo(this.camera.instance.position);
					} else {
						const direction = this.camera.instance.getWorldDirection(new THREE.Vector3());
						const constant = -direction.dot(this.camera.instance.position);
						const plane = new THREE.Plane(direction, constant);
						dist = plane.distanceToPoint(tempVec3);
					}

					const raycaster = new THREE.Raycaster();
					raycaster.setFromCamera(tempVec2, this.camera.instance);
					raycaster.far = dist;
					raycaster.near = this.camera.instance.near * 2; // double to improve results when using camera collisions

					const intersects = raycaster.intersectObject(this.voxels);

					if (Utils.isDebug()) {
						if (!this.raycastHelpers.has(unit.taroId)) {
							const helper = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, dist, 0xff0000);
							this.raycastHelpers.set(unit.taroId, helper);
							this.scene.add(helper);
						}

						const helper = this.raycastHelpers.get(unit.taroId);
						helper.setColor(intersects.length > 0 ? 0xff0000 : 0x00ff00);
						helper.position.copy(raycaster.ray.origin);
						helper.setDirection(raycaster.ray.direction);
						helper.setLength(dist);
					}

					unit.showHud(intersects.length === 0);
				}
			}

			private generateHTMLButton(type: string, abilityId: String, keybinding: any, ability: any): void {
				if (document.getElementById(type + '_button')) {
					return;
				}

				// buttons position
				// create a new button using html
				const htmlButton = document.createElement('button');
				htmlButton.id = type + '_button';
				// setting style for button
				Object.assign(htmlButton.style, {
					width: '60px',
					height: '60px',
					fontSize: '16px',
					color: '#fff',
					backgroundColor: '#33333366',
					border: '2px solid #555',
					backdropFilter: 'blur(4px)',
					borderRadius: '8px',
					zIndex: '1000',
					cursor: 'pointer',
				});

				let cooldownInterval: any;

				if (ability && ability.iconUrl) {
					htmlButton.innerHTML = `<img src="${ability.iconUrl}" style="width: 100%; height: 100%; object-fit: cover;"/>`;
				} else {
					htmlButton.textContent = type;
				}

				let abilitiesDiv = document.getElementById('abilities-buttons');

				if (!abilitiesDiv) {
					console.error('unable to add abilities button bcoz there is no div with id abilities-button');
					return;
				}

				abilitiesDiv.appendChild(htmlButton);
				htmlButton.addEventListener('mousedown', function () {
					if (taro.isClient) {
						let timerElement = document.getElementById(type + '_button_timer');
						let button = document.getElementById(type + '_button');
						if (timerElement) return;
						taro.client.emit('key-down', {
							device: 'key',
							key: type.toLowerCase(),
						});
						if (ability && ability.cooldown && !timerElement) {
							let cooldown = ability.cooldown;
							// cooldown logic
							let cooldownCount = 0;
							if (!timerElement) {
								timerElement = document.createElement('h5');
								timerElement.id = type + '_button_timer';
								Object.assign(timerElement.style, {
									right: 0,
									position: 'absolute',
									fontSize: '0.8rem',
								});
								timerElement.innerHTML = (cooldown - cooldownCount).toString();
								button.append(timerElement);
							}
							cooldownInterval = setInterval(() => {
								if (cooldownCount >= cooldown) {
									//ts-ignore
									// button.disabled =  false;
									timerElement.parentNode.removeChild(timerElement);
									clearInterval(cooldownInterval);
								} else {
									console.log(cooldown, cooldownCount);
									// button.disabled = true;
									cooldownCount++;
									timerElement.innerHTML = (cooldown - cooldownCount).toString();
								}
							}, 1000);
						}
					}
				});
				htmlButton.addEventListener('mouseup', function () {
					if (taro.isClient) {
						taro.client.emit('key-up', {
							device: 'key',
							key: type.toLowerCase(),
						});
					}
				});
			}
		}
	}
}
