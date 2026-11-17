namespace Renderer {
	export namespace Three {
		export class InstancedSprite {
			static instances = new Map<string, InstancedSprite>();

			geometry: THREE.PlaneGeometry;
			material: THREE.MeshStandardMaterial;
			mesh: THREE.InstancedMesh;
			count = 0;

			private instanceToEntityMap = new Map<number, Entity>();
			private matrix = new THREE.Matrix4();

			constructor(texture: THREE.Texture, count: number) {
				this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

				// Instanced attributes
				const scales = new Float32Array(count * 2).fill(0);
				const quaternions = new Float32Array(count * 4).fill(0);
				const uvRepeat = new Float32Array(count * 2).fill(1);
				const uvOffset = new Float32Array(count * 2).fill(0);
				const opacity = new Float32Array(count).fill(1);
				const castShadow = new Float32Array(count).fill(0);

				this.geometry.setAttribute(
					'instanceScale',
					new THREE.InstancedBufferAttribute(scales, 2).setUsage(THREE.DynamicDrawUsage)
				);
				this.geometry.setAttribute(
					'instanceQuaternion',
					new THREE.InstancedBufferAttribute(quaternions, 4).setUsage(THREE.DynamicDrawUsage)
				);
				this.geometry.setAttribute(
					'instanceUvRepeat',
					new THREE.InstancedBufferAttribute(uvRepeat, 2).setUsage(THREE.DynamicDrawUsage)
				);
				this.geometry.setAttribute(
					'instanceUvOffset',
					new THREE.InstancedBufferAttribute(uvOffset, 2).setUsage(THREE.DynamicDrawUsage)
				);
				this.geometry.setAttribute(
					'instanceOpacity',
					new THREE.InstancedBufferAttribute(opacity, 1).setUsage(THREE.DynamicDrawUsage)
				);
				this.geometry.setAttribute(
					'instanceCastShadow',
					new THREE.InstancedBufferAttribute(castShadow, 1).setUsage(THREE.DynamicDrawUsage)
				);

				this.material = new THREE.MeshStandardMaterial({
					map: texture,
					transparent: true,
					side: THREE.DoubleSide,
					forceSinglePass: true,
				});

				this.material.onBeforeCompile = (shader) => {
					shader.vertexShader = `${[
						'attribute vec2 instanceScale;',
						'attribute vec4 instanceQuaternion;',
						'attribute vec2 instanceUvRepeat;',
						'attribute vec2 instanceUvOffset;',
						'attribute float instanceOpacity;',
						'attribute float instanceCastShadow;',
						'varying float vInstanceOpacity;',
						'varying float vInstanceCastShadow;',
					].join('\n')}\n${shader.vertexShader}`;

					shader.vertexShader = shader.vertexShader.replace(
						'#include <uv_vertex>',
						`
						#if defined( USE_UV ) || defined( USE_ANISOTROPY )

							vUv = vec3( uv * instanceUvRepeat + instanceUvOffset, 1 ).xy;

						#endif
						#ifdef USE_MAP

							vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ALPHAMAP

							vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_LIGHTMAP

							vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_AOMAP

							vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_BUMPMAP

							vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_NORMALMAP

							vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_DISPLACEMENTMAP

							vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_EMISSIVEMAP

							vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_METALNESSMAP

							vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ROUGHNESSMAP

							vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ANISOTROPYMAP

							vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOATMAP

							vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOAT_NORMALMAP

							vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOAT_ROUGHNESSMAP

							vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_IRIDESCENCEMAP

							vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_IRIDESCENCE_THICKNESSMAP

							vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SHEEN_COLORMAP

							vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SHEEN_ROUGHNESSMAP

							vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULARMAP

							vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULAR_COLORMAP

							vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULAR_INTENSITYMAP

							vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_TRANSMISSIONMAP

							vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_THICKNESSMAP

							vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
					`
					);

					shader.vertexShader = shader.vertexShader.replace(
						'#include <begin_vertex>',
						[
							'vInstanceOpacity = instanceOpacity;',
							'vInstanceCastShadow = instanceCastShadow;',

							'vec3 transformed = vec3(position).xzy;',
							'transformed.z = -transformed.z;',
							'transformed.x *= instanceScale.x;',
							'transformed.z *= instanceScale.y;',
							'vec4 q = instanceQuaternion;',
							'transformed = transformed + 2.0 * cross(q.xyz, cross(q.xyz, transformed ) + q.w * transformed);',

							'vNormal = vNormal.xzy;',
							'vNormal.z = -vNormal.z;',
							'if (instanceScale.x < 0.0) vNormal = -vNormal;',
							'vNormal = vNormal + 2.0 * cross(q.xyz, cross(q.xyz, vNormal) + q.w * vNormal );',
							'vNormal = normalize(vNormal);',
						].join('\n')
					);

					shader.fragmentShader = `${['varying float vInstanceOpacity;', 'varying float vInstanceCastShadow;'].join(
						'\n'
					)}\n${shader.fragmentShader}`;

					shader.fragmentShader = shader.fragmentShader.replace(
						'#include <map_fragment>',
						[
							'#ifdef USE_MAP',
							'diffuseColor *= texture2D(map, vMapUv);',
							'if (diffuseColor.a < 0.3) discard;',
							'diffuseColor.a *= vInstanceOpacity;',
							'if (diffuseColor.a < 0.01) discard;',
							'#endif',
						].join('\n')
					);
				};

				this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
				this.mesh.frustumCulled = false;
				this.mesh.castShadow = true;

				this.mesh.customDepthMaterial = this.material.clone();

				this.mesh.customDepthMaterial.onBeforeCompile = (shader) => {
					shader.vertexShader = `${[
						'attribute vec2 instanceScale;',
						'attribute vec4 instanceQuaternion;',
						'attribute vec2 instanceUvRepeat;',
						'attribute vec2 instanceUvOffset;',
						'attribute float instanceOpacity;',
						'attribute float instanceCastShadow;',
						'varying float vInstanceCastShadow;',
					].join('\n')}\n${shader.vertexShader}`;

					shader.vertexShader = shader.vertexShader.replace(
						'#include <uv_vertex>',
						`
						#if defined( USE_UV ) || defined( USE_ANISOTROPY )

							vUv = vec3( uv * instanceUvRepeat + instanceUvOffset, 1 ).xy;

						#endif
						#ifdef USE_MAP

							vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ALPHAMAP

							vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_LIGHTMAP

							vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_AOMAP

							vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_BUMPMAP

							vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_NORMALMAP

							vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_DISPLACEMENTMAP

							vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_EMISSIVEMAP

							vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_METALNESSMAP

							vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ROUGHNESSMAP

							vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_ANISOTROPYMAP

							vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOATMAP

							vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOAT_NORMALMAP

							vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_CLEARCOAT_ROUGHNESSMAP

							vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_IRIDESCENCEMAP

							vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_IRIDESCENCE_THICKNESSMAP

							vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SHEEN_COLORMAP

							vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SHEEN_ROUGHNESSMAP

							vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULARMAP

							vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULAR_COLORMAP

							vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_SPECULAR_INTENSITYMAP

							vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_TRANSMISSIONMAP

							vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
						#ifdef USE_THICKNESSMAP

							vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy * instanceUvRepeat + instanceUvOffset;

						#endif
					`
					);

					shader.vertexShader = shader.vertexShader.replace(
						'#include <begin_vertex>',
						[
							'vInstanceCastShadow = instanceCastShadow;',

							'vec3 transformed = vec3(position).xzy;',
							'transformed.z = -transformed.z;',
							'transformed.x *= instanceScale.x;',
							'transformed.z *= instanceScale.y;',
							'vec4 q = instanceQuaternion;',
							'transformed = transformed + 2.0 * cross(q.xyz, cross(q.xyz, transformed ) + q.w * transformed);',
						].join('\n')
					);

					shader.fragmentShader = `${['varying float vInstanceCastShadow;'].join('\n')}\n${shader.fragmentShader}`;

					shader.fragmentShader = `
						precision mediump float;

						uniform sampler2D map;
						varying vec2 vMapUv;
						varying float vInstanceCastShadow;

						void main() {
								if (vInstanceCastShadow == 0.0) return;

								gl_FragColor = texture2D(map, vMapUv);
								if (gl_FragColor.a < 0.3) discard;
								gl_FragColor.rgb = vec3(0);
						}
					`;
				};
			}

			static create(key: string, count: number) {
				const texture = gAssetManager.getTexture(key);
				const instance = new InstancedSprite(texture, count);
				this.instances.set(key, instance);
				Three.getEntitiesLayer().add(instance.mesh);
				return instance;
			}

			setPositionAt(index, position) {
				this.matrix.setPosition(position.x, position.y, position.z);
				this.mesh.setMatrixAt(index, this.matrix);
			}

			setScaleAt(index, scale: { x: number; y: number }) {
				this.geometry.attributes.instanceScale.setXY(index, scale.x, scale.y);
			}

			setQuaternionAt(index, quaternion) {
				this.geometry.attributes.instanceQuaternion.setXYZW(
					index,
					quaternion.x,
					quaternion.y,
					quaternion.z,
					quaternion.w
				);
			}

			setUVRepeatAt(index, repeat: { x: number; y: number }) {
				this.geometry.attributes.instanceUvRepeat.setXY(index, repeat.x, repeat.y);
			}

			setUVOffsetAt(index, uvOffset) {
				this.geometry.attributes.instanceUvOffset.setXY(index, uvOffset.x, uvOffset.y);
			}

			setOpacityAt(index, opacity) {
				this.geometry.attributes.instanceOpacity.setX(index, opacity);
			}

			setCastShadowAt(index, castShadow) {
				this.geometry.attributes.instanceCastShadow.setX(index, castShadow ? 1 : 0);
			}

			setEntityAt(index, entity) {
				this.instanceToEntityMap.set(index, entity);
			}

			getEntityAt(index) {
				return this.instanceToEntityMap.get(index);
			}

			update(_dt: number) {
				this.mesh.count = this.count;

				if (this.count === 0) return;

				this.mesh.instanceMatrix.needsUpdate = true;
				this.mesh.computeBoundingSphere();
				this.mesh.computeBoundingBox();

				this.geometry.attributes.instanceScale.needsUpdate = true;
				this.geometry.attributes.instanceQuaternion.needsUpdate = true;
				this.geometry.attributes.instanceUvRepeat.needsUpdate = true;
				this.geometry.attributes.instanceUvOffset.needsUpdate = true;
				this.geometry.attributes.instanceOpacity.needsUpdate = true;
				this.geometry.attributes.instanceCastShadow.needsUpdate = true;
			}
		}
	}
}
