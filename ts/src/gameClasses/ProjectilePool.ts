class ProjectilePool {
	private _pool: Projectile[];
	private _type: string;
	get type() {
		return this._type;
	}

	constructor(type: string) {
		this._pool = new Array<Projectile>();
		this._type = type;
	}

	get(): Projectile | null {
		let entity: Projectile;
		entity = this._pool.shift();
		if (!entity) {
			return null;
		}

		entity.pooled = false;
		(entity as any).mount(taro.$('baseScene'));
		return entity;
	}

	release(entity: Projectile): void {
		this._pool.push(entity);
		entity.pooled = true;
		entity.poolTime = taro._currentTime;
		setTimeout(() => {
			(entity as any).unMount();
		}, 0);
	}

	kill(entity: Projectile): void {
		let killed = this._pool.splice(this._pool.indexOf(entity), 1);
	}
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = ProjectilePool;
}
