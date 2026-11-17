namespace Renderer {
	export namespace Three {
		export class EntityManager {
			entities: (Unit | Item | Projectile | Region)[] = [];
			units: Unit[] = [];
			items: Item[] = [];
			projectiles: Projectile[] = [];
			regions: Region[] = [];
			props: Prop[] = [];
			initEntities: InitEntity[] = [];

			private animatedSprites: AnimatedSprite[] = [];
			private unownedItems = new Map<string, Item>();

			private tempVec3 = new THREE.Vector3();
			private tempQuat = new THREE.Quaternion();

			create(taroEntity: TaroEntityPhysics, type: 'unit' | 'item' | 'projectile' | 'region' | 'prop') {
				let entity;

				switch (type) {
					case 'unit': {
						entity = Unit.create(taroEntity);
						this.units.push(entity);
						this.animatedSprites.push(entity);
						this.maybeAddUnownedItemsToUnit(entity);
						break;
					}
					case 'item': {
						entity = Item.create(taroEntity);
						this.items.push(entity);
						this.animatedSprites.push(entity);
						this.addItemToUnitOrUnownedItems(entity);
						break;
					}
					case 'projectile': {
						entity = Projectile.create(taroEntity);
						this.projectiles.push(entity);
						this.animatedSprites.push(entity);
						break;
					}
					case 'region': {
						entity = new Region(taroEntity._id, taroEntity._stats.ownerId, taroEntity);
						this.regions.push(entity);
						break;
					}
					case 'prop': {
						entity = Prop.create(taroEntity);
						setTimeout(() => {
							for (let k of [
								['x', 'width'],
								['y', 'height'],
								['z', 'depth'],
							]) {
								if (taroEntity._stats?.[k[1]]) {
									const v = Utils.pixelToWorld(taroEntity._stats[k[1]]);
									entity.size[k[0]] = v;
									entity.setScale(entity.size.x, entity.size.y, entity.size.z);
								}
							}
						}, 0);

						this.props.push(entity);
						this.animatedSprites.push(entity);
						break;
					}
				}

				if (entity.matrixWorldAutoUpdate && type !== 'region') {
					(entity as THREE.Object3D).matrixWorldAutoUpdate = true;
				}
				this.entities.push(entity);
				entity.updateMatrix?.();
				return entity;
			}

			destroyInitEntity(initEntity: InitEntity) {
				const renderer = Three.instance();
				renderer.entityEditor.selectEntity(initEntity, 'remove');
				this.initEntities = this.initEntities.filter((e) => e.action.actionId !== initEntity.action.actionId);
				initEntity.destroy();
			}

			destroy(entity: Unit | Item | Projectile | Prop | Region) {
				entity.destroy();

				const idx = this.entities.indexOf(entity, 0);
				if (idx === -1) return;

				this.entities.splice(idx, 1);
				this.animatedSprites.splice(this.animatedSprites.indexOf(entity as unknown as AnimatedSprite, 0), 1);

				if (this.units.includes(entity as Unit)) {
					this.units.splice(this.units.indexOf(entity as Unit, 0), 1);
				}

				if (this.items.includes(entity as Item)) {
					this.items.splice(this.items.indexOf(entity as Item, 0), 1);
					this.unownedItems.delete(entity.taroId);
				}

				if (this.projectiles.includes(entity as Projectile)) {
					this.projectiles.splice(this.projectiles.indexOf(entity as Projectile, 0), 1);
				}

				if (this.props.includes(entity as Prop)) {
					this.props.splice(this.props.indexOf(entity as Prop, 0), 1);
				}

				if (this.regions.includes(entity as Region)) {
					this.regions.splice(this.regions.indexOf(entity as Region, 0), 1);
				}
			}

			update(dt: number) {
				for (const [_, instancedSprite] of InstancedSprite.instances) {
					instancedSprite.count = 0;
				}

				const updateEntities = (entities) => {
					for (const entity of entities) {
						entity.update(dt);

						if (!entity.visible) continue;

						if (entity.body instanceof Sprite) {
							const instancedSprite = InstancedSprite.instances.get(entity.body.key);

							if (instancedSprite) {
								const pos = this.tempVec3.copy(Three.getEntitiesLayer().position).add(entity.position);
								const q = this.tempQuat.copy(entity.quaternion).multiply(entity.body.quaternion);

								const index = instancedSprite.count;
								instancedSprite.setPositionAt(index, pos);
								instancedSprite.setScaleAt(index, { x: entity.body.sprite.scale.x, y: entity.body.sprite.scale.z });
								instancedSprite.setQuaternionAt(index, q);
								instancedSprite.setUVRepeatAt(index, { x: entity.body.tileH, y: entity.body.tileV });
								instancedSprite.setUVOffsetAt(index, { x: entity.body.offsetX, y: entity.body.offsetY });
								instancedSprite.setOpacityAt(index, entity.body.opacity);
								instancedSprite.setCastShadowAt(index, entity.castShadow);
								instancedSprite.setEntityAt(index, entity);
								instancedSprite.count++;
							}
						}
					}
				};

				updateEntities(this.props);
				updateEntities(this.units);
				updateEntities(this.items);
				updateEntities(this.projectiles);
			}

			scaleGui(scale: number) {
				for (const unit of this.units) {
					unit.setHudScale(scale);
				}
			}

			private addItemToUnitOrUnownedItems(item: Item) {
				for (const unit of this.units) {
					if (item.ownerUnitId == unit.taroId) {
						item.ownerUnit = unit;
						return;
					}
				}

				this.unownedItems.set(item.taroId, item);

				if (item.taroEntity) {
					item.taroEntity.on('setOwnerUnit', (unitId: string) => {
						item.ownerUnitId = unitId;
						item.ownerUnit = this.units.find((unit) => unit.taroId === unitId);

						if (item.ownerUnit && this.unownedItems.has(item.taroId)) {
							this.unownedItems.delete(item.taroId);
						}
					});
				}
			}

			private maybeAddUnownedItemsToUnit(unit: Unit) {
				const itemsToDelete = [];

				for (const [taroId, item] of this.unownedItems.entries()) {
					if (unit.taroId == item.ownerUnitId) {
						item.ownerUnit = unit;
						itemsToDelete.push(taroId);
					}
				}

				for (const itemTaroId of itemsToDelete) {
					this.unownedItems.delete(itemTaroId);
				}
			}
		}
	}
}
