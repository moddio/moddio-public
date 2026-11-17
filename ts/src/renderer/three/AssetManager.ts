namespace Renderer {
	export namespace Three {
		export type AssetSource = {
			name: string;
			type: 'gltf' | 'texture';
			src: string;
			materialUniforms?: {
				metalness: number | string;
				emissive: string;
				roughness: number | string;
				emissiveIntensity: number | string;
				color: string;
			};
		};

		export type GLTF = {
			animations: THREE.AnimationClip[];
			scene: THREE.Group;
			scenes: THREE.Group[];
			cameras: THREE.Camera[];
			asset: Object;
		};

		export type Asset = THREE.Texture | GLTF;

		class AssetManager {
			filter: typeof THREE.LinearFilter | typeof THREE.NearestFilter = THREE.LinearFilter;
			textures: Map<string, THREE.Texture> = new Map();

			private assets: Map<string, Asset> = new Map();
			private loaders: Map<string, THREE.Loader> = new Map();

			constructor() {
				const dracoLoader = new DRACOLoader();
				dracoLoader.setDecoderPath('/assets/lib/draco/');

				const gltfLoader = new GLTFLoader();
				gltfLoader.setDRACOLoader(dracoLoader);

				this.loaders.set('gltf', gltfLoader);
				this.loaders.set('texture', new THREE.TextureLoader());

				this.load([{ name: 'placeholderTexture', type: 'texture', src: '/assets/images/placeholder-texture.jpg' }]);
				this.load(
					[
						{
							name: 'waterSheet',
							type: 'texture',
							src: 'https://cache.modd.io/asset/spriteImage/1726839459019_WaterTilesOffsetWithBlur.png',
						},
					],
					undefined,
					undefined,
					THREE.NearestFilter,
					undefined,
					[THREE.RepeatWrapping, THREE.RepeatWrapping]
				);
				this.load(
					[
						{
							name: 'FoamNoiseTexture',
							type: 'texture',
							src: 'https://cache.modd.io/asset/spriteImage/1726839621601_noiseTexture-6.png',
						},
					],
					undefined,
					undefined,
					THREE.NearestFilter,
					undefined,
					[THREE.RepeatWrapping, THREE.RepeatWrapping]
				);
				this.load(
					[
						{
							name: 'CausticTexture',
							type: 'texture',
							src: 'https://cache.modd.io/asset/spriteImage/1726839682257_CausticTexture.png',
						},
					],
					undefined,
					undefined,
					THREE.NearestFilter,
					undefined,
					[THREE.RepeatWrapping, THREE.RepeatWrapping]
				);
				this.load(
					[
						{
							name: 'CausticTextureHighlights',
							type: 'texture',
							src: 'https://cache.modd.io/asset/spriteImage/1726839699240_CausticTextureHighlights.png',
						},
					],
					undefined,
					undefined,
					THREE.NearestFilter,
					undefined,
					[THREE.RepeatWrapping, THREE.RepeatWrapping]
				);
				const geometry = new THREE.BoxGeometry(1, 1, 1);
				const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
				const scene = new THREE.Group();
				scene.add(new THREE.Mesh(geometry, material));
				const placeholderModel = {
					animations: [],
					scene: scene,
					scenes: [scene],
					cameras: [],
					asset: {},
				} as GLTF;
				this.assets.set('placeholderModel', placeholderModel);
			}

			setFilter(filter: typeof THREE.LinearFilter | typeof THREE.NearestFilter) {
				this.filter = filter;
			}

			load(
				sources: AssetSource[],
				loadingManager?: THREE.LoadingManager,
				cb?: (name: string) => void,
				filter?: typeof THREE.LinearFilter | typeof THREE.NearestFilter,
				format?: THREE.AnyPixelFormat,
				wrapping?: [THREE.Wrapping, THREE.Wrapping]
			) {
				for (const source of sources) {
					const loader = this.loaders.get(source.type);
					if (loader) {
						loader.manager = loadingManager ?? THREE.DefaultLoadingManager;

						loader.load(
							source.src,
							(asset: Asset) => {
								if (source.type === 'texture') {
									(asset as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
									(asset as THREE.Texture).magFilter = filter ?? this.filter;
									(asset as THREE.Texture).wrapS = wrapping ? wrapping[0] : (asset as THREE.Texture).wrapS;
									(asset as THREE.Texture).wrapT = wrapping ? wrapping[1] : (asset as THREE.Texture).wrapT;
									(asset as THREE.Texture).format = format ?? (asset as THREE.Texture).format;
									this.textures.set(source.name, asset as THREE.Texture);
								}

								if (source.type === 'gltf') {
									(asset as GLTF).scene.traverse((child) => {
										if (child instanceof THREE.Mesh) {
											const material = child.material;
											if (material.map) {
												material.map.magFilter = this.filter;
											}
											if (source.materialUniforms) {
												Utils.overwriteMaterialUniforms(source.materialUniforms, material);
											}
										}
									});
								}

								this.assets.set(source.name, asset);

								if (cb) cb(source.name);
							},
							undefined,
							(error) => {
								console.log('Error loading asset:', source.name);
							}
						);
					}
				}
			}

			hasTexture(name: string) {
				return this.textures.has(name);
			}

			getTexture(name: string) {
				const placeholderTex = this.textures.get('placeholderTexture');
				return (this.textures.get(name) as THREE.Texture) || placeholderTex;
			}

			getTextureWithoutPlaceholder(name: string) {
				return this.textures.get(name) as THREE.Texture;
			}

			getTexturesContaining(name: string) {
				const textures: THREE.Texture[] = [];
				for (const [key, value] of this.textures) {
					if (key.includes(name) && value instanceof THREE.Texture) {
						textures.push(value);
					}
				}
				return textures;
			}

			hasModel(name: string) {
				return this.assets.has(name);
			}

			getModel(name: string) {
				const placeholderModel = this.assets.get('placeholderModel') as GLTF;
				return (this.assets.get(name) as GLTF) || placeholderModel;
			}

			getModelWithoutPlaceholder(name: string) {
				return this.assets.get(name) as GLTF;
			}
		}

		export const gAssetManager = new AssetManager();
	}
}
