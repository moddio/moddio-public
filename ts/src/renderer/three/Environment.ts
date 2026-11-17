const dummy = new THREE.Object3D();
const tempVec = new THREE.Vector3();

enum ShadowQuality {
	Simple,
	Low,
	Medium,
	High,
}

namespace Renderer {
	export namespace Three {
		export class Environment {
			skybox: Skybox;

			private ambientLight: THREE.AmbientLight;
			private directionalLight: THREE.DirectionalLight;
			private shadowMesh: THREE.InstancedMesh;
			private shadowQuality = ShadowQuality.Simple;

			private settings = {
				ambientLight: {
					color: '#ffffff',
					intensity: 3,
				},
				directionalLight: {
					color: '#ffffff',
					intensity: 0,
					position: {
						x: 0,
						y: 1,
						z: 0,
					},
				},
				fog: {
					enabled: false,
					color: '#ffffff',
					near: 100000,
					far: 100000,
					density: 0,
				},
			};

			constructor(private renderer) {
				const scene = renderer.scene;

				// Skybox
				this.skybox = new Skybox();
				scene.add(this.skybox);

				// Lighting
				if (taro?.game?.data?.settings?.fog?.enabled) {
					const fog = taro.game.data.settings.fog;

					this.settings.fog.enabled = true;
					this.settings.fog.color = fog.color ?? '#ffffff';
					this.settings.fog.near = fog.near ?? 100000;
					this.settings.fog.far = fog.far ?? 100000;
					this.settings.fog.density = fog.density ?? 0;

					if (taro.game.data.settings.fog.type === 'exp2') {
						scene.fog = new THREE.FogExp2(this.settings.fog.color, this.settings.fog.density);
					} else {
						scene.fog = new THREE.Fog(this.settings.fog.color, this.settings.fog.near, this.settings.fog.far);
					}
				}

				const ambientLightSettings = taro?.game?.data?.settings?.light?.ambient;
				if (ambientLightSettings) {
					this.settings.ambientLight.color = ambientLightSettings.color ?? '#ffffff';
					this.settings.ambientLight.intensity = ambientLightSettings.intensity ?? 3;
				}

				this.ambientLight = new THREE.AmbientLight(
					this.settings.ambientLight.color,
					this.settings.ambientLight.intensity
				);
				scene.add(this.ambientLight);

				const directionalLightSettings = taro?.game?.data?.settings?.light?.directional;
				if (directionalLightSettings) {
					this.settings.directionalLight.color = directionalLightSettings.color ?? '#ffffff';
					this.settings.directionalLight.intensity = directionalLightSettings.intensity ?? 0;
					this.settings.directionalLight.position.x = directionalLightSettings.position?.x ?? 0;
					this.settings.directionalLight.position.y = directionalLightSettings.position?.z ?? 1;
					this.settings.directionalLight.position.z = directionalLightSettings.position?.y ?? 0;
				}

				this.directionalLight = new THREE.DirectionalLight(
					this.settings.directionalLight.color,
					this.settings.directionalLight.intensity
				);
				this.directionalLight.position.set(
					this.settings.directionalLight.position.x,
					this.settings.directionalLight.position.y,
					this.settings.directionalLight.position.z
				);
				scene.add(this.directionalLight);

				// Shadows
				if (taro?.game?.data?.settings?.shadowQuality) {
					switch (taro.game.data.settings.shadowQuality) {
						case 'simple':
							this.shadowQuality = ShadowQuality.Simple;
							break;
						case 'low':
							this.shadowQuality = ShadowQuality.Low;
							break;
						case 'medium':
							this.shadowQuality = ShadowQuality.Medium;
							break;
						case 'high':
							this.shadowQuality = ShadowQuality.High;
							break;
					}
				}

				if (this.shadowQuality === ShadowQuality.Simple) {
					const canvas = document.createElement('canvas');
					canvas.width = 128;
					canvas.height = 128;
					const ctx = canvas.getContext('2d');
					const blur = 6;
					const scale = 1.25;
					const opacity = 0.25;
					if (ctx) {
						ctx.filter = `blur(${blur}px)`;
						ctx.fillStyle = `rgba(0,0,0,${opacity})`;
						ctx.beginPath();
						ctx.arc(64, 64, 64 - blur * 2, 0, Math.PI * 2);
						ctx.fill();
					}
					const shadowTexture = new THREE.CanvasTexture(canvas);

					const maxShadows = 2000;
					const shadowGeometry = new THREE.PlaneGeometry(scale, scale);
					shadowGeometry.rotateX(-Math.PI * 0.5);
					const shadowMaterial = new THREE.MeshBasicMaterial({
						map: shadowTexture,
						transparent: true,
						depthWrite: false,
						blending: THREE.CustomBlending,
						blendEquation: THREE.AddEquation,
						blendSrc: THREE.OneFactor,
						blendDst: THREE.OneMinusSrcAlphaFactor,
					});
					this.shadowMesh = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, maxShadows);
					this.shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
					scene.add(this.shadowMesh);
				} else {
					this.renderer.renderer.shadowMap.enabled = true;
					this.renderer.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

					const shadowMapSize =
						this.shadowQuality === ShadowQuality.Low ? 512 : this.shadowQuality === ShadowQuality.Medium ? 1024 : 2048;

					this.directionalLight.castShadow = true;
					this.directionalLight.shadow.mapSize.width = shadowMapSize;
					this.directionalLight.shadow.mapSize.height = shadowMapSize;
					this.directionalLight.shadow.camera.near = -500;
					this.directionalLight.shadow.camera.far = 500;
					this.directionalLight.shadow.camera.left = -30;
					this.directionalLight.shadow.camera.right = 30;
					this.directionalLight.shadow.camera.top = 30;
					this.directionalLight.shadow.camera.bottom = -30;
					this.directionalLight.shadow.bias = 0.000001;
					scene.add(this.directionalLight.target);

					this.renderer.voxels.children.forEach((voxel) => {
						if (voxel instanceof THREE.Mesh) {
							voxel.castShadow = true;
							voxel.receiveShadow = true;
						}
					});
				}
			}

			update() {
				if (this.renderer.camera.target) {
					this.skybox.position.copy(this.renderer.camera.instance.position);

					if (!ShadowQuality.Simple) {
						const shadowMapWidth = this.directionalLight.shadow.camera.right - this.directionalLight.shadow.camera.left;
						const shadowTexelWidth = shadowMapWidth / this.directionalLight.shadow.mapSize.width;
						const minMoveDistanceBeforeMoveShadowmap = 5; // world units

						if (
							this.directionalLight.target.position.distanceTo(this.renderer.camera.instance.position) >
							minMoveDistanceBeforeMoveShadowmap
						) {
							this.directionalLight.target.position.set(
								Math.floor(this.renderer.camera.instance.position.x / shadowTexelWidth) * shadowTexelWidth,
								Math.floor(this.renderer.camera.instance.position.y / shadowTexelWidth) * shadowTexelWidth,
								Math.floor(this.renderer.camera.instance.position.z / shadowTexelWidth) * shadowTexelWidth
							);
							this.directionalLight.position.copy(this.directionalLight.target.position);
							this.directionalLight.position.x += this.settings.directionalLight.position.x;
							this.directionalLight.position.y += this.settings.directionalLight.position.y;
							this.directionalLight.position.z += this.settings.directionalLight.position.z;
						}
					}
				}

				// Shadows
				switch (this.shadowQuality) {
					case ShadowQuality.Simple: {
						let i = 0;

						const setInstancesToEntitiesTransform = (entities: Unit[] | Item[]) => {
							for (const entity of entities) {
								if (!entity.taroEntity._stats.shadow || !entity.visible) {
									continue;
								}

								const scaleX = entity.size.x;
								let scaleZ = entity.size.y;
								let posX = entity.position.x;
								let posY = entity.position.y;
								let posZ = entity.position.z;

								if (entity.body instanceof Sprite) {
									if (entity.body.billboard) {
										scaleZ = scaleX;

										if (entity instanceof Unit) {
											const bottomHudPos = entity.bottomHud.getWorldPosition(tempVec);
											posX = bottomHudPos.x;
											posY = bottomHudPos.y;
											posZ = bottomHudPos.z;
										}
									}
								}

								dummy.position.set(posX, posY, posZ);
								dummy.rotation.y = entity.body.rotation.y;
								dummy.scale.set(scaleX, 1, scaleZ);
								dummy.updateMatrix();
								this.shadowMesh.setMatrixAt(i++, dummy.matrix);
							}
						};

						setInstancesToEntitiesTransform(this.renderer.entityManager.units);
						setInstancesToEntitiesTransform(this.renderer.entityManager.items);
						setInstancesToEntitiesTransform(this.renderer.entityManager.projectiles);

						this.shadowMesh.count = i;
						this.shadowMesh.instanceMatrix.needsUpdate = true;
						this.shadowMesh.computeBoundingSphere();

						break;
					}
					case ShadowQuality.Low:
					case ShadowQuality.Medium:
					case ShadowQuality.High: {
						const setCastShadowSettingOnEntities = (entities: Unit[] | Item[] | Prop[] | Projectile[]) => {
							for (const entity of entities) {
								const shadowsEnabled = !!entity.taroEntity._stats.shadow && entity.visible;

								entity.castShadow = shadowsEnabled;

								entity.body.traverse((child) => {
									if (child instanceof THREE.Mesh) {
										child.castShadow = shadowsEnabled;
									}
								});
							}
						};

						setCastShadowSettingOnEntities(this.renderer.entityManager.units);
						setCastShadowSettingOnEntities(this.renderer.entityManager.items);
						setCastShadowSettingOnEntities(this.renderer.entityManager.projectiles);
						setCastShadowSettingOnEntities(this.renderer.entityManager.props);

						break;
					}
				}
			}

			show() {
				const scene = this.renderer.scene;

				// Lighting
				this.ambientLight.color.set(this.settings.ambientLight.color);
				this.ambientLight.intensity = this.settings.ambientLight.intensity;

				this.directionalLight.color.set(this.settings.directionalLight.color);
				this.directionalLight.intensity = this.settings.directionalLight.intensity;

				// Fog
				if (!scene.fog) {
					return;
				}
				scene.fog.color.set(this.settings.fog.color);
				const enabled = this.settings.fog.enabled;
				if (scene.fog instanceof THREE.Fog) {
					scene.fog.near = enabled ? this.settings.fog.near : 100000;
					scene.fog.far = enabled ? this.settings.fog.far : 100000;
				} else if (scene.fog instanceof THREE.FogExp2) {
					scene.fog.density = enabled ? this.settings.fog.density : 0;
				}
			}

			hide() {
				const scene = this.renderer.scene;

				// Lighting
				this.ambientLight.color.set('#ffffff');
				this.ambientLight.intensity = 3;

				this.directionalLight.color.set('#ffffff');
				this.directionalLight.intensity = 0;

				// Fog
				if (scene.fog) {
					if (scene.fog instanceof THREE.Fog) {
						scene.fog.near = 100000;
						scene.fog.far = 100000;
					} else if (scene.fog instanceof THREE.FogExp2) {
						scene.fog.density = 0;
					}
				}
			}

			setAmbientLightIntensity(intensity: number) {
				this.settings.ambientLight.intensity = intensity;
				this.ambientLight.intensity = intensity;
			}

			setAmbientLightColor(color: string) {
				this.settings.ambientLight.color = color;
				this.ambientLight.color.set(color);
			}

			setDirectionalLightIntensity(intensity: number) {
				this.settings.directionalLight.intensity = intensity;
				this.directionalLight.intensity = intensity;
			}

			setDirectionalLightColor(color: string) {
				this.settings.directionalLight.color = color;
				this.directionalLight.color.set(color);
			}

			setDirectionalLightPosition(x: number, y: number, z: number) {
				this.settings.directionalLight.position.x = x;
				this.settings.directionalLight.position.y = y;
				this.settings.directionalLight.position.z = z;
				this.directionalLight.position.set(x, y, z);
			}

			setFogEnabled(enabled: boolean) {
				this.settings.fog.enabled = enabled;

				const scene = this.renderer.scene;

				if (!scene.fog) return;

				if (scene.fog instanceof THREE.Fog) {
					scene.fog.near = enabled ? this.settings.fog.near : 100000;
					scene.fog.far = enabled ? this.settings.fog.far : 100000;
				} else if (scene.fog instanceof THREE.FogExp2) {
					scene.fog.density = enabled ? this.settings.fog.density : 0;
				}
			}

			setFogColor(color: string) {
				this.settings.fog.color = color;
				this.renderer.scene.fog.color.set(color);
			}

			setFogNear(near: number) {
				this.settings.fog.near = near;

				const scene = this.renderer.scene;
				if (scene.fog instanceof THREE.Fog) {
					scene.fog.near = near;
				}
			}

			setFogFar(far: number) {
				this.settings.fog.far = far;

				const scene = this.renderer.scene;
				if (scene.fog instanceof THREE.Fog) {
					scene.fog.far = far;
				}
			}

			setFogDensity(density: number) {
				this.settings.fog.density = density;

				const scene = this.renderer.scene;
				if (scene.fog instanceof THREE.FogExp2) {
					scene.fog.density = density;
				}
			}
		}
	}
}
