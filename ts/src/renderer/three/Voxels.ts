namespace Renderer {
	export namespace Three {
		export class Voxels extends Node {
			voxelData: { positions: any[]; uvs: any[]; normals: any[]; topIndices: any[]; sidesIndices: any[] }[] = [];
			voxelsCellData: Map<string, VoxelCell>[] = [];
			waterCellData: Record<string, Record<string, (Three.WaterAnimations | null)[]>> = {};
			waterMeshes: Map<string, AnimatedTile[]>[] = [];
			meshes: Record<string, Record<string, THREE.Mesh>> = {};
			waterTileIds: Record<keyof typeof Renderer.Three.WaterAnimations, number[]> = {
				TOP_LEFT_CORNER: [],
				TOP_RIGHT_CORNER: [],
				DOWN_LEFT_CORNER: [],
				DOWN_RIGHT_CORNER: [],
				TOP: [],
				LEFT: [],
				RIGHT: [],
				DOWN: [],
				NORMAL: [],
				TOP_RIGHT_INVERT_CORNER: [],
				TOP_LEFT_INVERT_CORNER: [],
				DOWN_LEFT_INVERT_CORNER: [],
				DOWN_RIGHT_INVERT_CORNER: [],
			};
			preview: THREE.Mesh | undefined = undefined;
			layerPlanes: THREE.Plane[] = [];
			layerLookupTable: Record<number, number> = {};
			attrs: { positions: THREE.BufferAttribute; uvs: THREE.BufferAttribute; normals: THREE.BufferAttribute };
			previewSidesIndices: number[] = [];
			previewTopIndices: number[] = [];
			lastPreviewChunksNeedsUpdate: string[] = [];
			yOffset = -0.501;

			static CHUNK_BLOCK_COUNTS = { x: 16, y: 16 };

			constructor(
				private topTileset: TextureSheet,
				private sidesTileset: TextureSheet
			) {
				super();
				this.matrixAutoUpdate = false;
				this.matrixWorldAutoUpdate = false;
				this.loadWaterData();
			}

			loadWaterData() {
				if (taro.game.data.settings.water) {
					for (let [k, v] of Object.entries(taro.game.data.settings.water)) {
						let key = Utils.toUpperSnakeCase(k);
						switch (typeof v) {
							case 'string': {
								this.waterTileIds[key] = v.split(',').map(Number);
								break;
							}
							case 'number': {
								this.waterTileIds[key] = [v];
								break;
							}
						}
					}
				}
			}

			static create(config?: MapData['layers']) {
				const tilesetMain = taro.getTilesetFromType({ tilesets: taro.game.data.map.tilesets, type: 'top' });
				let tilesetSide = taro.getTilesetFromType({ tilesets: taro.game.data.map.tilesets, type: 'side' });
				if (!tilesetSide) tilesetSide = tilesetMain;

				const texMain = gAssetManager.getTexture(tilesetMain.image);
				const texSide = gAssetManager.getTexture(tilesetSide.image);

				const topTileset = new TextureSheet(
					tilesetMain.image,
					texMain,
					tilesetMain.tilewidth,
					tilesetMain.tileheight,
					true
				);
				const sidesTileset = new TextureSheet(
					tilesetSide.image,
					texSide,
					tilesetSide.tilewidth,
					tilesetSide.tileheight,
					true
				);

				const voxels = new Voxels(topTileset, sidesTileset);
				if (config) {
					let numTileLayers = 0;
					for (const [idx, layer] of config.entries()) {
						if (layer.type === 'tilelayer' && layer.data) {
							voxels.setLayerLookupTable(idx, numTileLayers);
							const voxelsData = voxels.generateVoxelsFromLayerData(layer, numTileLayers, false);
							voxels.updateLayer(voxelsData, idx);
							numTileLayers++;
						}
					}
				}

				return voxels;
			}

			// because it may have debris layer, so we need a lookup table to find the real floor height
			setLayerLookupTable(k: number, v: number) {
				this.layerLookupTable[k] = v;
			}

			calcHeight(layerIdx: number) {
				return this.layerLookupTable[layerIdx] ?? layerIdx;
			}

			resetWaterData(layerIdx: number, chunkKey: string) {
				if (!this.waterCellData[layerIdx]) {
					this.waterCellData[layerIdx] = {};
				}
				this.waterCellData[layerIdx][chunkKey] = [];
			}

			removeWaterMeshesFromChunk(layerIdx: number, chunkKey: string) {
				let tiles = this.waterMeshes[layerIdx]?.get(chunkKey);
				if (tiles !== undefined) {
					for (let animatedTile of tiles) {
						animatedTile.destroy();
					}
					tiles = [];
				}
			}

			calcLayerHeight(layerId?: number) {
				const renderer = Renderer.Three.instance();
				const height = this.layerLookupTable[layerId ?? renderer.voxelEditor.currentLayerIndex];
				return this.yOffset + height;
			}

			generateVoxelsFromLayerData(data: LayerData, height: number, flat = false) {
				const voxels = new Map<string, VoxelCell>();
				const allFacesVisible = [false, false, false, false, false, false];
				const onlyBottomFaceVisible = [true, true, true, false, true, true];
				const hiddenFaces = flat ? onlyBottomFaceVisible : allFacesVisible;

				for (let z = 0; z < data.height; z++) {
					for (let x = 0; x < data.width; x++) {
						const pos = { x: x + 0.5, y: this.yOffset + height, z: z + 0.5 };
						let tileId = data.data[z * data.width + x];
						if (tileId <= 0) continue;
						tileId -= 1;

						voxels.set(getKeyFromPos(pos.x, pos.y, pos.z), {
							position: [pos.x, pos.y, pos.z],
							type: tileId,
							visible: true,
							hiddenFaces: [...hiddenFaces],
							isPreview: false,
							uvs: [],
							normals: [],
							topIndices: [],
							sidesIndices: [],
							positions: [],
						});
					}
				}
				return voxels;
			}

			clearLayer(rawLayerIdx: number) {
				this.voxelsCellData[rawLayerIdx] = new Map();
				for (let mesh of Object.values(this.meshes[rawLayerIdx])) {
					this.remove(mesh);
				}
			}

			tryGetWaterAnimation(tileId?: number) {
				for (let [k, v] of Object.entries(this.waterTileIds)) {
					if (v.includes(tileId)) {
						return k;
					}
				}
				return undefined;
			}

			setWaterTileId(waterTileIds: Record<keyof typeof Renderer.Three.WaterAnimations, number[]>) {
				this.waterTileIds = waterTileIds;
				for (const [idx, layer] of taro.game.data.map.layers.entries()) {
					if (layer.type === 'tilelayer' && layer.data) {
						this.updateLayer(new Map(), idx, false, true);
					}
				}
			}

			// use greedy mesh algorithm to reduce the mesh counts
			generateGreedyWaterMeshes(
				layerIdx: number,
				chunkPos: { x: number; z: number },
				animation: Three.WaterAnimations
			) {
				const chunkKey = Three.getChunkKeyFromPos(chunkPos.x, chunkPos.z);
				const ChunkBlockCountsDiffX = (1 + chunkPos.x) * Voxels.CHUNK_BLOCK_COUNTS.x - taro.game.data.map.width;
				const ChunkBlockCountsDiffZ = (1 + chunkPos.z) * Voxels.CHUNK_BLOCK_COUNTS.y - taro.game.data.map.height;

				const animatedKey = 'waterSheet';
				const cols = 23;
				const rows = 22;
				const tex = Renderer.Three.gAssetManager.getTexture(animatedKey).clone();
				const frameWidth = tex.image.width / cols;
				const frameHeight = tex.image.height / rows;

				let xMax =
					ChunkBlockCountsDiffX <= 0
						? Voxels.CHUNK_BLOCK_COUNTS.x
						: Voxels.CHUNK_BLOCK_COUNTS.x - ChunkBlockCountsDiffX;
				let zMax =
					ChunkBlockCountsDiffZ <= 0
						? Voxels.CHUNK_BLOCK_COUNTS.y
						: Voxels.CHUNK_BLOCK_COUNTS.y - ChunkBlockCountsDiffZ;
				let visitMap = Array.from({ length: xMax }, () => Array(zMax).fill(0));
				let waterData = this.waterCellData[layerIdx][chunkKey];

				// iter the whole map, if the tileId to that position is the animation-bound tileId, set it as 1
				for (let x = 0; x < xMax; x++) {
					for (let z = 0; z < zMax; z++) {
						if (waterData[x + z * xMax] !== animation) {
							visitMap[x][z] = 1;
						}
					}
				}

				for (let x = 0; x < xMax; x++) {
					for (let z = 0; z < zMax; z++) {
						if (visitMap[x][z]) {
							continue;
						}

						let width = 1;
						let height = 1;

						while (x + width < xMax && !visitMap[x + width][z]) {
							width++;
						}

						while (z + height < zMax) {
							let isSame = true;
							for (let compareX = x; compareX < x + width; compareX++) {
								if (visitMap[compareX][z + height]) {
									isSame = false;
									break;
								}
							}
							if (!isSame) {
								break;
							}
							height++;
						}

						for (let i = x; i < x + width; i++) {
							for (let j = z; j < z + height; j++) {
								visitMap[i][j] = 1;
							}
						}

						const spriteSheet = new Renderer.Three.TextureSheet(animatedKey, tex, frameWidth, frameHeight);
						const temp = new Renderer.Three.AnimatedTile(spriteSheet);
						temp.position.set(
							x + 0.5 * width + chunkPos.x * Voxels.CHUNK_BLOCK_COUNTS.x,
							layerIdx,
							z + 0.5 * height + chunkPos.z * Voxels.CHUNK_BLOCK_COUNTS.y
						);

						temp.play(Renderer.Three.WaterAnimations[animation]);
						temp.scale.set(width, 1, height);
						if (this.waterMeshes[layerIdx] === undefined) {
							this.waterMeshes[layerIdx] = new Map();
						}
						if (!this.waterMeshes[layerIdx].has(chunkKey)) {
							this.waterMeshes[layerIdx].set(chunkKey, []);
						}
						this.waterMeshes[layerIdx].get(chunkKey).push(temp);
						Renderer.Three.instance().waterLayer.add(temp);
					}
				}
			}

			addWaterMesh(subVoxels: Map<string, VoxelCell>, height: number, pos: { x: number; y: number; z: number }) {
				const key = Renderer.Three.getKeyFromPos(pos.x, pos.y, pos.z);
				const chunkKey = Renderer.Three.getChunkKeyFromBlockPos(pos.x, pos.z);
				if (subVoxels.has(key) && subVoxels.get(key).isPreview === false) {
					let animation = this.tryGetWaterAnimation(subVoxels.get(key).type + 1);
					if (!this.waterCellData[height][chunkKey]) {
						this.waterCellData[height][chunkKey] = [];
					}
					if (animation) {
						this.waterCellData[height][chunkKey].push(animation as WaterAnimations);
					} else {
						this.waterCellData[height][chunkKey].push(null);
					}
				}
			}

			updateLayer(updatedVoxels: Map<string, VoxelCell>, layerIdx: number, isPreview = false, forceUpdateAll = false) {
				const renderOrder = (layerIdx + 1) * 100;

				if (this.layerPlanes[layerIdx] === undefined) {
					const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1 - renderOrder / 100);
					this.layerPlanes[layerIdx] = plane;
				}

				if (updatedVoxels.size === 0 && !forceUpdateAll) {
					return;
				}

				const chunkBlockCounts = Renderer.Three.Voxels.CHUNK_BLOCK_COUNTS;
				let changedKeys = [];
				const chunksNeedsUpdate = [];
				let changed = false;
				if (!this.voxelsCellData[layerIdx]) {
					this.voxelsCellData[layerIdx] = new Map();
				}

				for (let [k, v] of updatedVoxels.entries()) {
					if (isPreview || !this.voxelsCellData[layerIdx].has(k) || this.voxelsCellData[layerIdx].get(k).type !== v.type) {
						if (!isPreview) {
							if (v.type < 0) {
								this.voxelsCellData[layerIdx].delete(k);
							} else {
								this.voxelsCellData[layerIdx].set(k, rfdc()(v));
							}
						}
						changedKeys.push(k);
						chunksNeedsUpdate.push(Renderer.Three.getChunkKeyFromBlockPos(v.position[0], v.position[2]));
						changed = true;
					}
				}

				if (!changed && !forceUpdateAll) {
					return;
				}

				const mat1 = new THREE.MeshStandardMaterial({
					map: this.sidesTileset.texture,
					side: THREE.DoubleSide,
					alphaTest: 0.5,
					shadowSide: THREE.BackSide,
					forceSinglePass: true,
				});
				const mat2 = new THREE.MeshStandardMaterial({
					map: this.topTileset.texture,
					side: THREE.DoubleSide,
					alphaTest: 0.5,
					shadowSide: THREE.BackSide,
					forceSinglePass: true,
				});
				const [mat1Preview, mat2Preview] = [mat1.clone(), mat2.clone()];
				[mat1Preview, mat2Preview].forEach((mat) => {
					mat.opacity = 0.5;
					mat.transparent = true;
				});

				for (let chunkX = 0; chunkX < Math.ceil(taro.map.data.width / chunkBlockCounts.x); chunkX++) {
					for (let chunkZ = 0; chunkZ < Math.ceil(taro.map.data.height / chunkBlockCounts.y); chunkZ++) {
						const chunkKey = Renderer.Three.getChunkKeyFromPos(chunkX, chunkZ);
						if (!chunksNeedsUpdate.includes(chunkKey) || forceUpdateAll) {
							if (!this.lastPreviewChunksNeedsUpdate.includes(chunkKey)) {
								continue;
							}
						}
						const subVoxels = new Map<string, VoxelCell>();
						const height = this.calcHeight(layerIdx);
						if (!isPreview) {
							this.resetWaterData(height, chunkKey);
							this.removeWaterMeshesFromChunk(height, chunkKey);
						}
						for (let z = chunkZ * chunkBlockCounts.y; z < (1 + chunkZ) * chunkBlockCounts.y; z++) {
							for (let x = chunkX * chunkBlockCounts.x; x < (1 + chunkX) * chunkBlockCounts.x; x++) {
								const pos = { x: x + 0.5, y: this.yOffset + height, z: z + 0.5 };
								const key = Renderer.Three.getKeyFromPos(pos.x, pos.y, pos.z);
								if (updatedVoxels.get(key)?.isPreview === true) {
									subVoxels.set(key, rfdc()(updatedVoxels.get(key)));
								} else {
									if (this.voxelsCellData[layerIdx].has(key)) {
										subVoxels.set(key, rfdc()(this.voxelsCellData[layerIdx].get(key)));
									}
								}
								if (!isPreview) {
									this.addWaterMesh(subVoxels, height, pos);
								}
							}
						}
						if (!isPreview) {
							for (let animation in Three.WaterAnimations) {
								this.generateGreedyWaterMeshes(height, { x: chunkX, z: chunkZ }, animation as Three.WaterAnimations);
							}
						}

						const prunedVoxels = pruneCells(subVoxels, this.voxelsCellData[layerIdx]);
						buildMeshDataFromCells(prunedVoxels, this.topTileset);
						const voxelData = {
							positions: [],
							uvs: [],
							normals: [],
							topIndices: [],
							sidesIndices: [],
						};

						for (let voxel of subVoxels.values()) {
							Object.keys(voxelData).forEach((k) => {
								voxelData[k].push(...voxel[k]);
							});
						}
						if (!this.meshes[layerIdx]) {
							this.meshes[layerIdx] = {};
						}
						let geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes>;

						geometry = new THREE.BufferGeometry();

						const uvs = new THREE.BufferAttribute(new Float32Array(voxelData.uvs), 2).setUsage(THREE.StreamDrawUsage);
						const positions = new THREE.BufferAttribute(new Float32Array(voxelData.positions), 3).setUsage(
							THREE.StreamDrawUsage
						);
						const normals = new THREE.BufferAttribute(new Float32Array(voxelData.normals), 3).setUsage(
							THREE.StreamDrawUsage
						);

						geometry.setIndex([
							...voxelData.sidesIndices,
							...voxelData.topIndices,
							...this.previewTopIndices,
							...this.previewSidesIndices,
						]);
						geometry.setAttribute('position', positions);
						geometry.setAttribute('uv', uvs);
						geometry.setAttribute('normal', normals);
						let curLength = 0;
						geometry.addGroup(0, voxelData.sidesIndices.length, 0);
						curLength += voxelData.sidesIndices.length;
						geometry.addGroup(curLength, voxelData.topIndices.length, 1);
						curLength += voxelData.topIndices.length;
						geometry.addGroup(curLength, this.previewSidesIndices.length, 2);
						curLength += this.previewSidesIndices.length;
						geometry.addGroup(curLength, this.previewTopIndices.length, 3);

						//@ts-ignore
						geometry.computeBoundsTree();
						this.remove(this.meshes[layerIdx][chunkKey]);
						const mesh = new THREE.Mesh(geometry, [mat1, mat2, mat1Preview, mat2Preview]);
						this.meshes[layerIdx][chunkKey] = mesh;
						this.add(mesh);
					}
				}

				if (isPreview) {
					this.lastPreviewChunksNeedsUpdate = chunksNeedsUpdate.slice();
				}
			}
		}

		export function getKeyFromPos(x: number, y: number, z: number) {
			return `${x}.${y}.${z}`;
		}

		export function getChunkKeyFromBlockPos(x: number, z: number) {
			const chunkBlockCounts = Renderer.Three.Voxels.CHUNK_BLOCK_COUNTS;
			return `${Math.floor(x / chunkBlockCounts.x)}.${Math.floor(z / chunkBlockCounts.y)}`;
		}

		export function getChunkKeyFromPos(x: number, z: number) {
			return `${x}.${z}`;
		}

		function updateCellSides(curCell: VoxelCell, cells: Map<string, VoxelCell>) {
			let visible = false;
			const neighborKeys = findNeighbors(curCell.position[0], curCell.position[1], curCell.position[2]);
			for (let i = 0; i < 6; ++i) {
				const hasNeighbor = cells.has(neighborKeys[i]);

				curCell.hiddenFaces[i] = hasNeighbor;

				if (!hasNeighbor) {
					visible = true;
				}
			}
			return visible;
		}

		function findNeighbors(x: number, y: number, z: number) {
			const k1 = getKeyFromPos(x + 1, y, z);
			const k2 = getKeyFromPos(x - 1, y, z);
			const k3 = getKeyFromPos(x, y + 1, z);
			const k4 = getKeyFromPos(x, y - 1, z);
			const k5 = getKeyFromPos(x, y, z + 1);
			const k6 = getKeyFromPos(x, y, z - 1);

			const neighborKeys = [k1, k2, k3, k4, k5, k6];
			return neighborKeys;
		}

		function pruneCells(cells: Map<string, VoxelCell>, allCells: Map<string, VoxelCell>) {
			const prunedVoxels = new Map<string, VoxelCell>();
			for (let k of cells.keys()) {
				const curCell = cells.get(k);

				let visible = updateCellSides(curCell, allCells);
				if (visible) {
					prunedVoxels.set(k, curCell);
				}
			}
			return prunedVoxels;
		}

		function buildMeshDataFromCells(cells: Map<string, VoxelCell>, tileset: TextureSheet) {
			const xStep = tileset.tileWidth / tileset.width;
			const yStep = tileset.tileHeight / tileset.height;
			const resize = !taro.game.data.defaultData.dontResize;
			const tileWidth = resize ? 1 : tileset.tileWidth / 64;
			const tileHeight = resize ? 1 : tileset.tileHeight / 64;
			const halfTileWidth = tileWidth / 2;
			const halfTileHeight = tileHeight / 2;
			const voxels = Renderer.Three.getVoxels();
			if (voxels) {
				voxels.previewSidesIndices = [];
				voxels.previewTopIndices = [];
			}
			const pxGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			pxGeometry.rotateY(Math.PI / 2);
			pxGeometry.translate(halfTileWidth, 0, 0);

			const nxGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			nxGeometry.rotateY(-Math.PI / 2);
			nxGeometry.translate(-halfTileWidth, 0, 0);

			const pyGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			pyGeometry.rotateX(-Math.PI / 2);
			pyGeometry.translate(0, halfTileHeight, 0);

			const nyGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			nyGeometry.rotateX(Math.PI / 2);
			nyGeometry.translate(0, -halfTileHeight, 0);

			const pzGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			pzGeometry.translate(0, 0, halfTileHeight);

			const nzGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
			nzGeometry.rotateY(Math.PI);
			nzGeometry.translate(0, 0, -halfTileHeight);

			const invertUvs = [nyGeometry];

			const geometries = [pxGeometry, nxGeometry, pyGeometry, nyGeometry, pzGeometry, nzGeometry];
			let nowCount = 0;
			for (let c of cells.keys()) {
				const curCell = cells.get(c);
				for (let i = 0; i < geometries.length; ++i) {
					if (curCell.hiddenFaces[i]) {
						continue;
					}
					const bi = nowCount / 3;
					const localPositions = [...geometries[i].attributes.position.array];
					for (let j = 0; j < 3; ++j) {
						for (let v = 0; v < 4; ++v) {
							localPositions[v * 3 + j] += curCell.position[j] * (j === 0 ? tileWidth : tileHeight);
						}
					}
					nowCount += localPositions.length;
					curCell.positions.push(...localPositions);
					const xIdx = curCell.type % tileset.cols;
					const yIdx = Math.floor(curCell.type / tileset.cols);

					const singlePixelOffset = { x: xStep / tileset.tileWidth, y: yStep / tileset.tileHeight };
					const halfPixelOffset = { x: singlePixelOffset.x / 2, y: singlePixelOffset.y / 2 };

					const xOffset = xStep * xIdx + halfPixelOffset.x;
					const yOffset = 1 - yStep * yIdx - yStep - halfPixelOffset.y;

					if (invertUvs.includes(geometries[i])) {
						geometries[i].attributes.uv.array[4] = xOffset;
						geometries[i].attributes.uv.array[5] = yOffset + yStep;

						geometries[i].attributes.uv.array[6] = xOffset + xStep - singlePixelOffset.x;
						geometries[i].attributes.uv.array[7] = yOffset + yStep;

						geometries[i].attributes.uv.array[0] = xOffset;
						geometries[i].attributes.uv.array[1] = yOffset + singlePixelOffset.y;

						geometries[i].attributes.uv.array[2] = xOffset + xStep - singlePixelOffset.x;
						geometries[i].attributes.uv.array[3] = yOffset + singlePixelOffset.y;
					} else {
						geometries[i].attributes.uv.array[0] = xOffset;
						geometries[i].attributes.uv.array[1] = yOffset + yStep;

						geometries[i].attributes.uv.array[2] = xOffset + xStep - singlePixelOffset.x;
						geometries[i].attributes.uv.array[3] = yOffset + yStep;

						geometries[i].attributes.uv.array[4] = xOffset;
						geometries[i].attributes.uv.array[5] = yOffset + singlePixelOffset.y;

						geometries[i].attributes.uv.array[6] = xOffset + xStep - singlePixelOffset.x;
						geometries[i].attributes.uv.array[7] = yOffset + singlePixelOffset.y;
					}

					curCell.uvs.push(...geometries[i].attributes.uv.array);
					curCell.normals.push(...geometries[i].attributes.normal.array);

					const localIndices = [...geometries[i].index.array];
					for (let j = 0; j < localIndices.length; ++j) {
						localIndices[j] += bi;
					}

					// top and bottom face
					if (curCell.isPreview) {
						if (i === 2 || i === 3) {
							voxels.previewTopIndices.push(...localIndices);
						} else {
							voxels.previewSidesIndices.push(...localIndices);
						}
					} else {
						if (i === 2 || i === 3) {
							curCell.topIndices.push(...localIndices);
						} else {
							curCell.sidesIndices.push(...localIndices);
						}
					}
				}
			}
		}

		type LayerData = {
			id: number;
			name: string;
			type: 'tilelayer' | 'objectgroup';
			width: number;
			height: number;
			data: number[];
		};

		export type VoxelCell = {
			position: number[];
			type: number;
			visible: boolean;
			hiddenFaces: boolean[];
			isPreview: boolean;
			uvs: number[];
			normals: number[];
			positions: number[];
			topIndices: number[];
			sidesIndices: number[];
		};
	}
}
