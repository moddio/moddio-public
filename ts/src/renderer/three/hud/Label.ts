namespace Renderer {
	export namespace Three {
		const defaultConfig = {
			x: 0,
			y: 0,
			z: 0,
			text: '',
			color: 'white',
			bold: false,
			renderOnTop: false,
			fontSize: 16,
			letterSpacing: 0,
			strokeThickness: 4,
			scaleLabelByDistance: {
				min: 1,
				max: 1,
				// Distance in meters at which the maximum value is reached
				maxDistance: 0,
			},
		};

		export type LabelParams = Partial<typeof defaultConfig>;

		export class Label extends Element {
			text: string;
			color: string;
			bold: boolean;
			renderOnTop: boolean;
			fontSize: number;
			letterSpacing: number;
			strokeThickness: number;
			scaleLabelByDistance: {
				min: number;
				max: number;
				// Distance in meters at which the maximum value is reached
				maxDistance: number;
			};
			protected originalSize: { x: number; y: number };

			constructor(params: LabelParams) {
				const config = { ...defaultConfig, ...params };
				super(config.x, config.y, config.z);

				this.update(config);
			}

			updateSize() {
				const renderer = Renderer.Three.instance();
				const cameraPos = renderer.camera.instance.position;
				const scaleByCameraPos = Math.max(
					this.scaleLabelByDistance.min,
					Math.min(
						this.scaleLabelByDistance.max,
						(this.scaleLabelByDistance.max * Math.abs(this.parent.parent.position.distanceTo(cameraPos))) /
							this.scaleLabelByDistance.maxDistance
					)
				);
				this.sprite.scale.set(
					scaleByCameraPos * this.originalScale.x,
					scaleByCameraPos * this.originalScale.y,
					scaleByCameraPos
				);
			}

			update(params: LabelParams) {
				Object.assign(this, params);

				if (params.color && Utils.isHexColorWithAlpha(this.color)) {
					this.color = this.color.slice(0, 7);
				}

				if (this.renderOnTop) {
					this.renderOnTopOfEverything();
				}

				if (this.text.length === 0) return;
				this.ctx.font = `${this.bold ? 'bold' : 'normal'} ${this.fontSize}px Verdana`;
				const metrics = this.ctx.measureText(this.text);
				this.width = Math.ceil(metrics.width) + this.strokeThickness;
				this.height = Math.ceil(Math.max(metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent) * 2);
				this.originalScale = { x: this.sprite.scale.x, y: this.sprite.scale.y };
				if (this.width < 1 || this.height < 1) return;

				this.refreshTexture();
			}

			private refreshTexture() {
				this.setTextureImage(
					this.createUpscaledTextureImage((w: number, h: number, upscaleFactor: number) => {
						this.ctx.font = `${this.bold ? 'bold' : 'normal'} ${this.fontSize * upscaleFactor}px Verdana`;
						this.ctx.letterSpacing = `${this.letterSpacing * upscaleFactor}px`;

						const x = this.strokeThickness * 0.5 * upscaleFactor;
						const baselinePos = h * 0.75;

						const isStroke = taro.game.data.settings.addStrokeToNameAndAttributes ?? true;
						if (isStroke) {
							this.ctx.strokeStyle = '#000';
							this.ctx.lineWidth = this.strokeThickness * upscaleFactor;
							this.ctx.lineJoin = 'miter';
							this.ctx.miterLimit = 3;
							this.ctx.strokeText(this.text, x, baselinePos);
						}

						this.ctx.fillStyle = this.color;
						this.ctx.fillText(this.text, x, baselinePos);
					})
				);
			}
		}
	}
}
