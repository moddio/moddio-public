class ProjectilePool {
    get type() {
        return this._type;
    }
    constructor(type) {
        this._pool = new Array(20);
        this._type = type;
        setInterval(() => {
            console.log(this._pool.length);
        }, 1000);
    }
    get() {
        let entity;
        entity = this._pool.pop();
        if (!entity) {
            return null;
        }
        entity.pooled = false;
        return entity;
    }
    release(entity) {
        this._pool.push(entity);
        entity.pooled = true;
    }
}
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = EntityPool;
}
//# sourceMappingURL=EntityPool.js.map