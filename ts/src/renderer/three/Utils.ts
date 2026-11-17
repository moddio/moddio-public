namespace Renderer {
	export namespace Three {
		export namespace Utils {
			export function patchAssetUrl(url: string): string {
				// proxy all s3 requests via cloudflare, old-cache.modd.io points to same 'modd' s3 bucket
				if (url?.startsWith('https://modd.s3.amazonaws.com')) {
					url = url.replace('https://modd.s3.amazonaws.com', 'https://old-cache.modd.io');
				}

				if (url?.indexOf('.png') !== -1 || url?.indexOf('.jpg') !== -1) {
					// load images via Image tag, helps CF optimize and convert(to webp) images via Polish - https://newdocs.phaser.io/docs/3.60.0/focus/Phaser.Loader.LoaderPlugin-image
					// this.load.imageLoadType = 'HTMLImageElement';
				} else {
					// default loader type
					// this.load.imageLoadType = 'XHR';
				}

				// https://stackoverflow.com/a/37455118
				return `${url}?v=1`;
			}

			export function isFocusOnPlayPage() {
				if (document.activeElement.className !== 'play-page') {
					return false;
				}
				return true;
			}

			export function overwriteMaterialUniforms(materialUniforms: any, material: THREE.Material) {
				if (materialUniforms) {
					for (let [k, v] of Object.entries(materialUniforms)) {
						if (v === '') {
							continue
						}
						switch (k) {
							case 'color':
							case 'emissive': {
								material[k] = new THREE.Color((v as string).slice(0, (v as string).length - 2));
								break;
							}
							default: {
								material[k] = v;
								break;
							}
						}
					}
				}
			}

			export function fillRect(
				ctx: CanvasRenderingContext2D,
				x: number,
				y: number,
				width: number,
				height: number,
				color: string,
				alpha = 1
			) {
				const fillColor = new THREE.Color(color).getHex();
				const red = (fillColor & 0xff0000) >>> 16;
				const green = (fillColor & 0xff00) >>> 8;
				const blue = fillColor & 0xff;
				ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
				ctx.fillRect(x, y, width, height);
			}

			export function strokeRect(
				ctx: CanvasRenderingContext2D,
				x: number,
				y: number,
				width: number,
				height: number,
				color: string,
				lineWidth: number,
				alpha = 1
			) {
				if (lineWidth === 0) return;

				const fillColor = new THREE.Color(color).getHex();
				const red = (fillColor & 0xff0000) >>> 16;
				const green = (fillColor & 0xff00) >>> 8;
				const blue = fillColor & 0xff;
				ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
				ctx.lineWidth = lineWidth;

				// Stroke inside the rect instead of on the edge
				const lineWidthHalf = lineWidth / 2;
				const xMin = x + lineWidthHalf;
				const xMax = x + width - lineWidthHalf;
				const yMin = y + lineWidthHalf;
				const yMax = y + height - lineWidthHalf;

				ctx.beginPath();
				ctx.moveTo(xMin, yMin);
				ctx.lineTo(xMin, yMax);
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(xMax, yMin);
				ctx.lineTo(xMax, yMax);
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(xMin - lineWidthHalf, yMin);
				ctx.lineTo(xMax + lineWidthHalf, yMin);
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(xMin - lineWidthHalf, yMax);
				ctx.lineTo(xMax + lineWidthHalf, yMax);
				ctx.stroke();
			}

			export function fillRoundedRect(
				ctx: CanvasRenderingContext2D,
				x: number,
				y: number,
				width: number,
				height: number,
				radius: number,
				color: string,
				alpha = 1
			) {
				var tl = radius;
				var tr = radius;
				var bl = radius;
				var br = radius;

				const fillColor = new THREE.Color(color).getHex();
				const red = (fillColor & 0xff0000) >>> 16;
				const green = (fillColor & 0xff00) >>> 8;
				const blue = fillColor & 0xff;
				ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;

				ctx.beginPath();
				ctx.moveTo(x + tl, y);
				ctx.lineTo(x + width - tr, y);
				ctx.arc(x + width - tr, y + tr, tr, -(Math.PI * 0.5), 0);
				ctx.lineTo(x + width, y + height - br);
				ctx.arc(x + width - br, y + height - br, br, 0, Math.PI * 0.5);
				ctx.lineTo(x + bl, y + height);
				ctx.arc(x + bl, y + height - bl, bl, Math.PI * 0.5, Math.PI);
				ctx.lineTo(x, y + tl);
				ctx.arc(x + tl, y + tl, tl, -Math.PI, -(Math.PI * 0.5));
				ctx.fill();
			}

			export function strokeRoundedRect(
				ctx: CanvasRenderingContext2D,
				x: number,
				y: number,
				width: number,
				height: number,
				radius: number,
				color: string,
				strokeThickness: number,
				alpha = 1
			) {
				if (strokeThickness === 0) return;

				var tl = radius;
				var tr = radius;
				var bl = radius;
				var br = radius;

				const lineColor = new THREE.Color(color).getHex();
				const red = (lineColor & 0xff0000) >>> 16;
				const green = (lineColor & 0xff00) >>> 8;
				const blue = lineColor & 0xff;
				ctx.strokeStyle = `rgba(${red},${green},${blue},${alpha})`;
				ctx.lineWidth = strokeThickness;

				// Stroke inside the rect instead of on the edge
				const lineWidthHalf = strokeThickness / 2;
				const xMin = x + lineWidthHalf;
				const xMax = x + width - lineWidthHalf;
				const yMin = y + lineWidthHalf;
				const yMax = y + height - lineWidthHalf;

				ctx.beginPath();
				ctx.moveTo(xMin + tl, yMin);
				ctx.lineTo(xMax - tr, yMin);
				ctx.moveTo(xMax - tr, yMin);
				ctx.arc(xMax - tr, yMin + tr, tr, -(Math.PI * 0.5), 0);
				ctx.lineTo(xMax, yMax - br);
				ctx.moveTo(xMax, yMax - br);
				ctx.arc(xMax - br, yMax - br, br, 0, Math.PI * 0.5);
				ctx.lineTo(xMin + bl, yMax);
				ctx.moveTo(xMin + bl, yMax);
				ctx.arc(xMin + bl, yMax - bl, bl, Math.PI * 0.5, Math.PI);
				ctx.lineTo(xMin, yMin + tl);
				ctx.moveTo(xMin, yMin + tl);
				ctx.arc(xMin + tl, yMin + tl, tl, -Math.PI, -(Math.PI * 0.5));
				ctx.stroke();
			}

			export function fillTriangle(
				ctx: CanvasRenderingContext2D,
				x0: number,
				y0: number,
				x1: number,
				y1: number,
				x2: number,
				y2: number,
				color: string,
				alpha = 1
			) {
				const fillColor = new THREE.Color(color).getHex();
				const red = (fillColor & 0xff0000) >>> 16;
				const green = (fillColor & 0xff00) >>> 8;
				const blue = fillColor & 0xff;
				ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;

				ctx.beginPath();
				ctx.moveTo(x0, y0);
				ctx.lineTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.closePath();
				ctx.fill();
			}

			export function builtInWaterShader(material: THREE.MeshBasicMaterial, animatedTile: Renderer.Three.Sprite) {
				material.onBeforeCompile = (shader) => {
					const uniforms = taro.game.data.settings.water?.uniforms
					shader.vertexShader = `
						varying vec2 W_Pos;
						${shader.vertexShader.replace(
						'#include <uv_vertex>',
						`#include <uv_vertex>
						W_Pos = (modelMatrix * vec4(position,1.0)).xz * 32.0;
						gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
						`
					)}`;
					let defaultWaterColor = Utils.hexToRgb('#5fa0c3');
					let defaultCausticColor = Utils.hexToRgb('#b2b2e6');
					let defaultCausticHighlightColor = Utils.hexToRgb('#fff');
					if (uniforms && uniforms.waterColor) {
						defaultWaterColor = Utils.hexToRgb(uniforms.waterColor)
					}
					if (uniforms && uniforms.causticColor) {
						defaultCausticColor = Utils.hexToRgb(uniforms.causticColor)
					}
					if (uniforms && uniforms.causticHighlightColor) {
						defaultCausticHighlightColor = Utils.hexToRgb(uniforms.causticHighlightColor)
					}
					for (let uniform of [
						['WaterColor', new THREE.Vector4(defaultWaterColor.r, defaultWaterColor.g, defaultWaterColor.b, uniforms?.waterOpacity ?? 0.02)],
						['CausticTextureScale', uniforms?.causticTextureScale ?? 0.004],
						['CausticMovementScale', uniforms?.causticMovementScale ?? 25],
						['CausticMovementSpeed', uniforms?.causticMovementSpeed ?? 0.35],
						['CausticMovementStrength', uniforms?.causticMovementStrength ?? 0.035],
						['CausticColor', new THREE.Vector4(defaultCausticColor.r, defaultCausticColor.g, defaultCausticColor.b, uniforms?.causticOpacity ?? 1)],
						['CausticHighlightColour', new THREE.Vector4(defaultCausticHighlightColor.r, defaultCausticHighlightColor.g, defaultCausticHighlightColor.b, uniforms?.causticHighlightOpacity ?? 2.0)],
						['NoiseScale', uniforms?.noiseScale ?? 0.02],
						['NoiseModulateSpeed', uniforms?.noiseModulateSpeed ?? 0.5],
						['NoiseStrength', uniforms?.noiseStrength ?? 0.5],
						['SpecularNoiseMovementStrength', uniforms?.specularNoiseMovementStrength ?? 100],
						['SpecularSpeed', uniforms?.specularSpeed ?? 4.0],
						['SpecularScale1', 0.07],
						['SpecularScale1', 0.4],
						['SpecularThreshold', -0.5],
						['SpecularColour', new THREE.Vector4(1.0, 1.0, 1.0, 0.9)],
						['FoamColour', new THREE.Vector4(1.0, 1.0, 1.0, 2.0)],
						['WaveSpeed', uniforms?.waveSpeed ?? 1],
						['FoamNoiseScale', uniforms?.foamNoiseScale ?? 5],
						['FoamNoiseAmount', uniforms?.foamNoiseAmount ?? 3.0],
						['FoamFrequency', uniforms?.foamFrequency ?? 10.0],
						['FoamQuantizeAmount', uniforms?.foamQuantizeAmount ?? 8],
						['TIME', 0.0],
						['CausticTexture', gAssetManager.getTexture('CausticTexture')],
						['CausticHighlightTexture', gAssetManager.getTexture('CausticTextureHighlights')],
						['FoamNoiseTexture', gAssetManager.getTexture('FoamNoiseTexture')],
					]) {
						shader.uniforms[uniform[0] as string] = {
							value: uniform[1],
						};
					}
					animatedTile.shader = shader;
					shader.fragmentShader = `
						varying vec2 W_Pos;
						uniform vec4 WaterColor;
						uniform float TIME;
						uniform float CausticTextureScale;
						uniform float CausticMovementScale;
						uniform float CausticMovementSpeed;
						uniform float CausticMovementStrength;
						uniform sampler2D CausticTexture;
						uniform vec4 CausticColor;
						uniform sampler2D CausticHighlightTexture;
						uniform vec4 CausticHighlightColour;
						uniform float NoiseScale;
						uniform float NoiseModulateSpeed;
						uniform float NoiseStrength;
						uniform float SpecularNoiseMovementStrength;
						uniform float SpecularSpeed;
						uniform float SpecularScale1;
						uniform float SpecularScale2;
						uniform float SpecularThreshold;
						uniform vec4 SpecularColour;
						uniform vec4 FoamColour;
						uniform float WaveSpeed;
						uniform float FoamNoiseScale;
						uniform sampler2D FoamNoiseTexture;
						uniform float FoamNoiseAmount;
						uniform float FoamFrequency;
						uniform float FoamQuantizeAmount;
						// PerlinNoise3D

						vec3 mod289_3(vec3 x) {
							return x - floor(x * (1.0 / 289.0)) * 289.0;
						}

						vec4 mod289_4(vec4 x) {
							return x - floor(x * (1.0 / 289.0)) * 289.0;
						}

						vec4 permute(vec4 x) {
							return mod289_4(((x * 34.0) + 1.0) * x);
						}

						vec4 taylorInvSqrt(vec4 r) {
							return 1.79284291400159 - 0.85373472095314 * r;
						}

						vec3 fade(vec3 t) {
							return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
						}

						vec2 fma(vec2 a, vec2 b, vec2 c) {
							return a * b + c;
						}

						// Classic Perlin noise.
						float cnoise(vec3 P) {
							vec3 Pi0 = floor(P); // Integer part for indexing.
							vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1.
							Pi0 = mod289_3(Pi0);
							Pi1 = mod289_3(Pi1);
							vec3 Pf0 = fract(P); // Fractional part for interpolation.
							vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0.
							vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
							vec4 iy = vec4(Pi0.yy, Pi1.yy);
							vec4 iz0 = vec4(Pi0.z);
							vec4 iz1 = vec4(Pi1.z);

							vec4 ixy = permute(permute(ix) + iy);
							vec4 ixy0 = permute(ixy + iz0);
							vec4 ixy1 = permute(ixy + iz1);

							vec4 gx0 = ixy0 * (1.0 / 7.0);
							vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
							gx0 = fract(gx0);
							vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
							vec4 sz0 = step(gz0, vec4(0.0));
							gx0 -= sz0 * (step(0.0, gx0) - 0.5);
							gy0 -= sz0 * (step(0.0, gy0) - 0.5);

							vec4 gx1 = ixy1 * (1.0 / 7.0);
							vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
							gx1 = fract(gx1);
							vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
							vec4 sz1 = step(gz1, vec4(0.0));
							gx1 -= sz1 * (step(0.0, gx1) - 0.5);
							gy1 -= sz1 * (step(0.0, gy1) - 0.5);

							vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
							vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
							vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
							vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
							vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
							vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
							vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
							vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

							vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
							g000 *= norm0.x;
							g010 *= norm0.y;
							g100 *= norm0.z;
							g110 *= norm0.w;
							vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
							g001 *= norm1.x;
							g011 *= norm1.y;
							g101 *= norm1.z;
							g111 *= norm1.w;

							float n000 = dot(g000, Pf0);
							float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
							float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
							float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
							float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
							float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
							float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
							float n111 = dot(g111, Pf1);

							vec3 fade_xyz = fade(Pf0);
							vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
							vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
							float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
							return 2.2 * n_xyz;
						}

						${shader.fragmentShader.replace(
						`#include <dithering_fragment>`,
						`#include <dithering_fragment>

							// ColorParameter:49
							vec4 n_water = WaterColor;

							// VaryingGetter:6
								vec2 n_WorldPos= W_Pos;

							// VectorFunc:59
								vec2 nFloorWorldPos = floor(n_WorldPos);

							// FloatParameter:8
								float nCausticTextureScale = CausticTextureScale;

							// VectorOp:7
								vec2 nCaustic_uv = nFloorWorldPos * vec2(nCausticTextureScale);

							// Vector2Constant:91
								vec2 n_empty_offset = vec2(0.000000, 0.000000);

							// FloatParameter:90
								float nCausticMovementScale = CausticMovementScale;

							// Input:87
								float n_TIME = TIME;

							// FloatParameter:89
								float nCausticMovementSpeed = CausticMovementSpeed;

							// FloatOp:88
								float n_causticMovement_frame = n_TIME * nCausticMovementSpeed;

								float n_out86p0;
							// PerlinNoise3D:86
								{
									n_out86p0 = cnoise(vec3((vec3(nCaustic_uv, 0.0).xy + vec3(n_empty_offset, 0.0).xy) * nCausticMovementScale, n_causticMovement_frame)) * 0.5 + 0.5;
								}

							// FloatParameter:94
								float nCausticMovementStrength = CausticMovementStrength;

							// FloatOp:93
								float n_out93p0 = n_out86p0 * nCausticMovementStrength;

							// VectorCompose:95
								vec2 n_out95p0 = vec2(n_out93p0);

							// VectorOp:92
								vec2 n_out92p0 = nCaustic_uv + n_out95p0;

								vec4 n_out10p0;
							// Texture2D:10
								n_out10p0 = texture2D(CausticTexture, n_out92p0);

							// ColorParameter:41
								vec4 n_out41p0 = CausticColor;

							// VectorOp:32
								vec4 n_out32p0 = n_out10p0 * n_out41p0;

								vec4 n_out44p0;
							// Texture2D:44
								n_out44p0 = texture2D(CausticHighlightTexture, n_out92p0);

							// ColorParameter:45
								vec4 n_out45p0 = CausticHighlightColour;

							// VectorOp:46
								vec4 n_out46p0 = n_out44p0 * n_out45p0;

							// VectorDecompose:48
								float n_out48p0 = n_out46p0.x;
								float n_out48p1 = n_out46p0.y;
								float n_out48p2 = n_out46p0.z;
								float n_out48p3 = n_out46p0.w;

							// Mix:47
								vec4 n_out47p0 = mix(n_out32p0, n_out46p0, vec4(n_out48p3));

							// VectorDecompose:57
								float n_out57p0 = n_out47p0.x;
								float n_out57p1 = n_out47p0.y;
								float n_out57p2 = n_out47p0.z;
								float n_out57p3 = n_out47p0.w;

							// VaryingGetter:13
								vec2 n_worldPos = W_Pos;

							// Vector2Constant:40
								vec2 n_out40p0 = vec2(0.000000, 0.000000);

							// FloatParameter:17
								float n_out17p0 = NoiseScale;

							// Input:37
								float n_out37p0 = TIME;

							// FloatParameter:39
								float n_out39p0 = NoiseModulateSpeed;

							// FloatOp:38
								float n_out38p0 = n_out37p0 * n_out39p0;

								float n_out36p0;
							// PerlinNoise3D:36
								{
									n_out36p0 = cnoise(vec3((vec3(n_worldPos, 0.0).xy + vec3(n_out40p0, 0.0).xy) * n_out17p0, n_out38p0)) * 0.5 + 0.5;
								}

							// FloatParameter:18
								float n_out18p0 = NoiseStrength;

							// FloatOp:31
								float n_out31p0 = n_out36p0 * n_out18p0;

							// FloatOp:60
								float n_out60p0 = n_out31p0 * n_out57p3;

							// VectorCompose:61
								vec4 n_out61p0 = vec4(n_out57p0, n_out57p1, n_out57p2, n_out60p0);

							// VaryingGetter:96
								vec2 n_out96p0 = W_Pos;

							// VectorFunc:97
								vec2 n_out97p0 = floor(n_out96p0);

							// FloatParameter:129
								float n_out129p0 = SpecularNoiseMovementStrength;

							// FloatOp:128
								float n_out128p0 = n_out95p0.x * n_out129p0;

							// VectorOp:127
								vec2 n_out127p0 = n_out97p0 - vec2(n_out128p0);

							// FloatParameter:102
								float n_out102p0 = SpecularSpeed;

							// Input:103
								float n_out103p0 = TIME;

							// VectorOp:101
								vec2 n_out101p0 = vec2(n_out102p0) * vec2(n_out103p0);

							// VectorOp:104
								vec2 n_in104p0 = vec2(1.00000, 1.00000);
								vec2 n_out104p0 = n_in104p0 - n_out101p0;

							// FloatParameter:106
								float n_out106p0 = SpecularScale1;

							// FloatConstant:99
								float n_out99p0 = 2.000000;

								float n_out105p0;
							// PerlinNoise3D:105
								{
									n_out105p0 = cnoise(vec3((vec3(n_out127p0, 0.0).xy + vec3(n_out104p0, 0.0).xy) * n_out106p0, n_out99p0)) * 0.5 + 0.5;
								}

							// VectorOp:100
								vec2 n_in100p0 = vec2(1.00000, 1.00000);
								vec2 n_out100p0 = n_in100p0 + n_out101p0;

								float n_out98p0;
							// PerlinNoise3D:98
								{
									n_out98p0 = cnoise(vec3((vec3(n_out127p0, 0.0).xy + vec3(n_out100p0, 0.0).xy) * n_out106p0, n_out99p0)) * 0.5 + 0.5;
								}

								vec3 n_out107p0;
							// ColorOp:107
								{
									float base = vec3(n_out105p0).x;
									float blend = vec3(n_out98p0).x;
									if (base < 0.5) {
										n_out107p0.x = 2.0 * base * blend;
									} else {
										n_out107p0.x = 1.0 - 2.0 * (1.0 - blend) * (1.0 - base);
									}
								}
								{
									float base = vec3(n_out105p0).y;
									float blend = vec3(n_out98p0).y;
									if (base < 0.5) {
										n_out107p0.y = 2.0 * base * blend;
									} else {
										n_out107p0.y = 1.0 - 2.0 * (1.0 - blend) * (1.0 - base);
									}
								}
								{
									float base = vec3(n_out105p0).z;
									float blend = vec3(n_out98p0).z;
									if (base < 0.5) {
										n_out107p0.z = 2.0 * base * blend;
									} else {
										n_out107p0.z = 1.0 - 2.0 * (1.0 - blend) * (1.0 - base);
									}
								}

							// VectorDecompose:112
								float n_out112p0 = n_out107p0.x;
								float n_out112p1 = n_out107p0.y;
								float n_out112p2 = n_out107p0.z;

							// Vector2Constant:111
								vec2 n_out111p0 = vec2(0.000000, 0.000000);

							// FloatParameter:109
								float n_out109p0 = SpecularScale2;

							// FloatConstant:110
								float n_out110p0 = 1.000000;

								float n_out108p0;
							// PerlinNoise3D:108
								{
									n_out108p0 = cnoise(vec3((vec3(n_out127p0, 0.0).xy + vec3(n_out111p0, 0.0).xy) * n_out109p0, n_out110p0)) * 0.5 + 0.5;
								}

							// FloatOp:113
								float n_out113p0 = n_out112p0 - n_out108p0;

							// FloatParameter:115
								float n_out115p0 = SpecularThreshold;

							// Step:114
								float n_out114p0 = step(n_out113p0, n_out115p0);

							// ColorParameter:117
								vec4 n_out117p0 = SpecularColour;

							// VectorOp:116
								vec4 n_out116p0 = vec4(n_out114p0) * n_out117p0;

							// VectorDecompose:123
								float n_out123p0 = n_out116p0.x;
								float n_out123p1 = n_out116p0.y;
								float n_out123p2 = n_out116p0.z;
								float n_out123p3 = n_out116p0.w;

							// VectorDecompose:119
								float n_out119p0 = n_out116p0.x;
								float n_out119p1 = n_out116p0.y;
								float n_out119p2 = n_out116p0.z;
								float n_out119p3 = n_out116p0.w;

							// FloatFunc:126
								float n_out126p0 = ceil(n_out60p0);

							// FloatOp:121
								float n_out121p0 = n_out119p3 * n_out126p0;

							// VectorCompose:122
								vec4 n_out122p0 = vec4(n_out123p0, n_out123p1, n_out123p2, n_out121p0);

							// Mix:124
								vec4 n_out124p0 = mix(n_out61p0, n_out122p0, vec4(n_out121p0));

							// VectorDecompose:125
								float n_out125p0 = n_out124p0.x;
								float n_out125p1 = n_out124p0.y;
								float n_out125p2 = n_out124p0.z;
								float n_out125p3 = n_out124p0.w;

							// Mix:52
								vec4 n_out52p0 = mix(n_water, n_out124p0, vec4(n_out125p3));

							// ColorParameter:132
								vec4 n_out132p0 = FoamColour;

							// VectorDecompose:173
								float n_out173p0 = n_out132p0.x;
								float n_out173p1 = n_out132p0.y;
								float n_out173p2 = n_out132p0.z;
								float n_out173p3 = n_out132p0.w;

							// Input:130
								vec4 n_out130p0 = gl_FragColor;

							// VectorDecompose:131
								float n_out131p0 = n_out130p0.x;
								float n_out131p1 = n_out130p0.y;
								float n_out131p2 = n_out130p0.z;
								float n_out131p3 = n_out130p0.w;

							// Input:155
								float n_out155p0 = TIME;

							// FloatParameter:172
								float n_out172p0 = WaveSpeed;

							// FloatOp:156
								float n_out156p0 = n_out155p0 * n_out172p0;

							// VaryingGetter:142
								vec2 n_out142p0 = W_Pos;

							// FloatParameter:164
								float n_out164p0 = FoamNoiseScale;

							// MultiplyAdd:186
								vec2 n_in186p2 = vec2(0.00000, 0.00000);
								vec2 n_out186p0 = fma(n_out142p0, vec2(n_out164p0), n_in186p2);

								vec4 n_out177p0;
							// Texture2D:177
								n_out177p0 = texture2D(FoamNoiseTexture, n_out186p0);

							// FloatParameter:163
								float n_out163p0 = FoamNoiseAmount;

							// FloatOp:187
								float n_out187p0 = n_out177p0.x * n_out163p0;

							// FloatOp:188
								float n_out188p0 = n_out156p0 * n_out187p0;

							// FloatOp:185
								float n_in185p1 = 2.00000;
								float n_out185p0 = pow(n_out131p0, n_in185p1);

							// FloatParameter:182
								float n_out182p0 = FoamFrequency;

							// VectorOp:183
								vec2 n_out183p0 = vec2(n_out185p0) * vec2(n_out182p0);

							// FloatOp:178
								float n_out178p0 = n_out188p0 - n_out183p0.x;

							// FloatFunc:179
								float n_out179p0 = sin(n_out178p0);

								float n_out165p0;
							// Remap:165
								float n_in165p1 = -1.00000;
								float n_in165p2 = 1.00000;
								float n_in165p3 = 0.10000;
								float n_in165p4 = 0.40000;
							{
								float input_range = n_in165p2 - n_in165p1;
								float output_range = n_in165p4 - n_in165p3;
								n_out165p0 = n_in165p3 + output_range * ((n_out179p0 - n_in165p1) / input_range);
							}

							// FloatOp:181
								float n_out181p0 = n_out131p0 - n_out165p0;

							// Clamp:184
								float n_in184p1 = -0.00000;
								float n_in184p2 = 0.40000;
								float n_out184p0 = clamp(n_out181p0, n_in184p1, n_in184p2);

							// FloatParameter:180
								float n_out180p0 = FoamQuantizeAmount;

							// FloatOp:169
								float n_out169p0 = n_out184p0 * n_out180p0;

							// FloatFunc:170
								float n_out170p0 = ceil(n_out169p0);

							// FloatOp:171
								float n_out171p0 = n_out170p0 / n_out180p0;

							// FloatOp:174
								float n_out174p0 = n_out171p0 * n_out173p3;

							// VectorCompose:175
								vec4 n_out175p0 = vec4(n_out173p0, n_out173p1, n_out173p2, n_out174p0);

							// VectorDecompose:149
								float n_out149p0 = n_out175p0.x;
								float n_out149p1 = n_out175p0.y;
								float n_out149p2 = n_out175p0.z;
								float n_out149p3 = n_out175p0.w;

							// Mix:136
								vec4 n_out136p0 = mix(n_out52p0, n_out175p0, vec4(n_out149p3));

							// Input:55
								vec4 n_out55p0 = gl_FragColor;

							// VectorOp:56
								vec4 n_out56p0 = n_out136p0 * n_out55p0;

							// VectorDecompose:54
								float n_out54p0 = n_out56p0.x;
								float n_out54p1 = n_out56p0.y;
								float n_out54p2 = n_out56p0.z;
								float n_out54p3 = n_out56p0.w;
								gl_FragColor.rgb = vec3(n_out136p0.xyz);
								gl_FragColor.a = n_out54p3;
				`
					)}`;
				};
			}
			export function pixelToWorld(numPixels: number) {
				return numPixels / 64;
			}

			export function toUpperSnakeCase(str: string) {
				return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
			}
			export function worldToPixel(units: number) {
				return units * 64;
			}

			export function resizeImageToPowerOf2(image) {
				const ceil = THREE.MathUtils.ceilPowerOfTwo;

				const width = ceil(image.width);
				const height = ceil(image.height);

				const canvas = document.createElement('canvas');

				canvas.width = width;
				canvas.height = height;

				const context = canvas.getContext('2d');
				context.drawImage(image, 0, 0, width, height, 0, 0, width, height);

				return canvas;
			}

			export function lerp(a: number, b: number, t: number) {
				return a + (b - a) * t;
			}

			export function round(num: number, decimalPlaces = 0) {
				var p = Math.pow(10, decimalPlaces || 0);
				var n = num * p * (1 + Number.EPSILON);
				return Math.round(n) / p;
			}

			export function getLayerZOffset(layer: number) {
				return layer - 1;
			}

			export function getDepthZOffset(depth: number) {
				return depth * 0.001;
			}

			export function isLeftButton(buttons: number) {
				return !!(buttons & 1);
			}

			export function isRightButton(buttons: number) {
				return !!(buttons & 2);
			}

			export function isHexColor(str: string) {
				return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{8})$/.test(str);
			}

			export function isHexColorWithAlpha(str: string) {
				return /^#([A-Fa-f0-9]{8})$/.test(str);
			}

			export function getHexAlpha(hex: string) {
				return isHexColorWithAlpha(hex) ? parseInt(hex.slice(7), 16) / 255 : 1;
			}

			export function hexToRgb(hex: string) {
				const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
				return result
					? {
						r: parseInt(result[1], 16) / 255,
						g: parseInt(result[2], 16) / 255,
						b: parseInt(result[3], 16) / 255,
					}
					: { r: 1, g: 1, b: 1 };
			}

			export function deg2rad(degrees: number) {
				return degrees * (Math.PI / 180);
			}

			export function rad2deg(radians: number) {
				return radians * (180 / Math.PI);
			}

			export function toFixedWithoutZeros(num: number, precision: number) {
				return `${Number.parseFloat(num.toFixed(precision))}`;
			}

			export function formatNumber(value: number, decimalPlaces = 0, trailingZeros = false) {
				if (value === undefined || value === null) return '';
				return trailingZeros ? value.toFixed(decimalPlaces).toString() : toFixedWithoutZeros(value, decimalPlaces);
			}

			export function isDebug() {
				return location.hash === '#debug';
			}

			export function tryFindInitEntity(obj: THREE.Object3D) {
				if (typeof obj === 'object') {
					if (obj instanceof InitEntity) {
						return obj;
					} else {
						if (obj.parent) {
							return tryFindInitEntity(obj.parent);
						}
					}
				} else {
					return null;
				}
			}

			export function removeFromParentAndRecalcTransform(o: THREE.Object3D) {
				if (o.parent && (o.parent as any).tag === Three.EntityEditor.TAG) {
					const renderer = Renderer.Three.instance();
					const parent_position = o.parent.position.clone();
					const parent_scale = o.parent.scale.clone();
					o.removeFromParent();
					renderer.initEntityLayer.add(o);
					o.position.divide(parent_scale);
					o.position.add(parent_position);
				}
			}
		}
	}
}
