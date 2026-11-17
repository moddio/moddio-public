var Prop = TaroEntityPhysics.extend({
	classId: 'Prop',
	init: function (data, entityIdFromServer) {
		var self = this;
		self.category('prop');
		TaroEntityPhysics.prototype.init.call(this, data.defaultData);
		this.id(entityIdFromServer);

		var propData = {};
		if (taro.isClient) {
			propData = taro.game.cloneAsset('propTypes', data.type);
		}

		self.entityId = this.id();
		self._stats = _.merge(propData, data);
		self._stats.rotation = data.rotation;
		self._rotate.z = Math.radians(data.rotation.y);
		//animation to play when joining the game
		let animationsToPlay = [];
		if (self._stats.animationIds) {
			animationsToPlay = self._stats.animationIds;
		} else {
			self._stats.animationIds = [];
		}
		if (taro.isServer) {
			// set prop state to default
			if (!self._stats.stateId) {
				for (var stateKey in self._stats.states) {
					var state = self._stats.states[stateKey];
					if (state && state.name === 'default') {
						self._stats.stateId = stateKey;
						break;
					}
				}
			}
			self.setState(self._stats.stateId);
			self.width(self._stats.currentBody.width);
			self.height(self._stats.currentBody.height);
			self.mount(taro.$('baseScene'));
			if (self._stats.streamMode == 1 || self._stats.streamMode == undefined) {
				this.streamMode(1);
			} else {
				this.streamMode(self._stats.streamMode);
			}
		} else if (taro.isClient) {
			taro.client.emit('create-prop', this);
			if (self._stats.states) {
				var currentState = self._stats.states[self._stats.stateId];
				if (currentState) {
					var body = (self._stats.bodies && self._stats.bodies[currentState.body]) || { type: 'none' };
					var defaultAnimation = this._stats.animations[currentState.animation];
					this.addToRenderer(defaultAnimation && defaultAnimation.frames[0] - 1, data.defaultData);

					if (body) {
						self._stats.currentBody = body;
						self.width(self._stats.currentBody.width);
						self.height(self._stats.currentBody.height);
					} else {
						// console.log('No body found for prop', this._stats.name)
						return;
					}
				}
			}
			this.transformTexture(this._translate.x, this._translate.y, 0);
		}

		self.updateBody(data.defaultData);
		self.updateLayer();
		self.updateTexture();
		if (self._stats.isHidden) {
			this.hide(true);
		}
		if (!isNaN(this._stats.opacity)) {
			this.opacity(this._stats.opacity);
		}
		animationsToPlay.forEach((animationId) => {
			this.emit('play-animation', { animationId: animationId, onJoin: true });
		});
	},

	changePropType: function (type, defaultData) {
		var self = this;

		var data = taro.game.cloneAsset('propTypes', type);
		delete data.type; // hotfix for dealing with corrupted game json that has unitData.type = "unitType". This is caused by bug in the game editor.

		if (data == undefined) {
			taro.script.errorLog('changePropType: invalid data');
			return;
		}

		self._stats.type = type;

		// adding this flag so that clients receiving entity data from onStreamCreate don't overwrite values with default data
		// when they are created by a client that has just joined.
		for (var i in data) {
			if (i === 'name' || i === 'streamMode') {
				// don't overwrite prop's name with prop type name
				continue;
			}
			//if (self._stats[i] !== data[i]) console.log(i, self._stats[i], data[i]);
			self._stats[i] = data[i];
		}

		self.setState(this._stats.stateId, defaultData);

		if (taro.isClient) {
			self.updateTexture();
		}
	},

	updateTexture: function () {
		const self = this;

		const defaultProp = taro.game.getAsset('propTypes', self._stats.type);
		let changeTextureType;
		if (self._stats.cellSheet.url !== defaultProp.cellSheet.url) {
			changeTextureType = 'using_skin';
		} else {
			changeTextureType = 'normal';
		}
		self.emit('update-texture', changeTextureType);

		// leave because it is taro not renderer
		self.updateLayer();
		// leave because it updates state for animation
		TaroEntity.prototype.updateTexture.call(this);
	},

	hide: function () {
		if (taro.isServer) {
			this.streamUpdateData([{ isHidden: true }]);
		}
		TaroEntityPhysics.prototype.destroyBody.call(this);
		TaroEntity.prototype._hide.call(this);
	},

	show: function () {
		if (taro.isServer) {
			this.streamUpdateData([{ isHidden: false }]);
		}
		TaroEntityPhysics.prototype.updateBody.call(this);
		TaroEntity.prototype._show.call(this);
	},

	_behaviour: function () {
		var self = this;

		if (!taro.gameLoopTickHasExecuted) {
			return;
		}

		// if entity (unit/item/player/projectile) has attribute, run regenerate
		if (taro.isServer) {
		} else if (taro.isClient) {
			var processedUpdates = [];
			var updateQueue = taro.client.entityUpdateQueue[this.id()];
			if (updateQueue) {
				for (var key in updateQueue) {
					var value = updateQueue[key];

					processedUpdates.push({ [key]: value });
					delete taro.client.entityUpdateQueue[this.id()][key];

					// remove queue object for this entity is there's no queue remaining in order to prevent memory leak
					if (Object.keys(taro.client.entityUpdateQueue[this.id()]).length == 0) {
						delete taro.client.entityUpdateQueue[this.id()];
					}
				}

				if (processedUpdates.length > 0) {
					this.streamUpdateData(processedUpdates);
				}
			}
		}

		this.processQueue();
	},

	tick: function (ctx) {
		TaroEntity.prototype.tick.call(this, ctx);
	},

	remove: function () {
		TaroEntityPhysics.prototype.remove.call(this);
	},

	destroy: function () {
		TaroEntityPhysics.prototype.destroy.call(this);
	},
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = Prop;
}
